import {
  ERROR_CODES,
  buildPaginationMeta,
  slugify,
  type ApplicationDecisionInput,
  type ApplicationListQuery,
  type SellerApplicationInput,
  type SellerApplicationView,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { recordAudit } from '../audit/audit.service.js';
import { orderUpdateEmail } from '../email/commerce-templates.js';
import { notify } from '../notifications/notification.service.js';
import { PlatformSetting } from '../settings/platform-setting.model.js';
import { User } from '../users/user.model.js';
import { SellerApplication, type SellerApplicationAttrs } from './seller-application.model.js';
import { Seller } from './seller.model.js';

type ApplicationLean = SellerApplicationAttrs & { _id: Types.ObjectId };

function toView(
  a: ApplicationLean,
  applicant?: { _id: Types.ObjectId; name: string; email: string },
): SellerApplicationView {
  const p = a.pickupAddress;
  return {
    id: a._id.toString(),
    storeName: a.storeName,
    businessType: a.businessType,
    legalName: a.legalName,
    gstin: a.gstin ?? null,
    contactPhone: a.contactPhone,
    pickupAddress: {
      fullName: p.fullName,
      phone: p.phone,
      line1: p.line1,
      line2: p.line2,
      landmark: p.landmark,
      city: p.city,
      state: p.state,
      pincode: p.pincode,
    },
    status: a.status,
    rejectionReason: a.rejectionReason ?? null,
    createdAt: a.createdAt.toISOString(),
    reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
    ...(applicant
      ? {
          applicant: { id: applicant._id.toString(), name: applicant.name, email: applicant.email },
        }
      : {}),
  };
}

async function uniqueSellerSlug(storeName: string): Promise<string> {
  const root = slugify(storeName) || 'store';
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? root : `${root}-${String(n)}`;
    if (!(await Seller.exists({ slug: candidate }))) return candidate;
  }
  throw ApiError.conflict('Could not generate a unique store URL');
}

/**
 * Seller onboarding. A signed-in, email-verified user applies once (one PENDING application
 * at a time, enforced by a partial unique index). Admin approval creates the Seller profile
 * and grants the SELLER role in one transaction. The principal reads the role directly from
 * MongoDB on each request, so the change applies immediately.
 */
export function createSellerApplicationService() {
  return {
    async mine(userId: string): Promise<SellerApplicationView | null> {
      const latest = await SellerApplication.findOne({ user: userId })
        .sort({ createdAt: -1 })
        .lean<ApplicationLean>();
      return latest ? toView(latest) : null;
    },

    async apply(userId: string, input: SellerApplicationInput): Promise<SellerApplicationView> {
      if (await Seller.exists({ user: userId })) {
        throw ApiError.conflict('You already have a seller account');
      }
      try {
        const doc = await SellerApplication.create({
          user: userId,
          storeName: input.storeName,
          businessType: input.businessType,
          legalName: input.legalName,
          ...(input.gstin ? { gstin: input.gstin } : {}),
          contactPhone: input.contactPhone,
          pickupAddress: input.pickupAddress,
          intendedCategories: input.intendedCategories,
        });
        return toView(doc.toObject());
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          throw ApiError.conflict(
            'You already have an application under review',
            ERROR_CODES.CONFLICT,
          );
        }
        throw error;
      }
    },

    async withdraw(userId: string): Promise<void> {
      const result = await SellerApplication.updateOne(
        { user: userId, status: 'PENDING' },
        { $set: { status: 'WITHDRAWN' } },
      );
      if (result.matchedCount === 0) throw ApiError.notFound('No pending application');
    },

    async list(query: ApplicationListQuery) {
      const filter = query.status ? { status: query.status } : {};
      const [total, docs] = await Promise.all([
        SellerApplication.countDocuments(filter),
        SellerApplication.find(filter)
          .sort({ createdAt: query.status === 'PENDING' ? 1 : -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<ApplicationLean[]>(),
      ]);
      const users = await User.find({ _id: { $in: docs.map((d) => d.user) } })
        .select('name email')
        .lean();
      const byId = new Map(users.map((u) => [u._id.toString(), u]));
      return {
        items: docs.map((d) => toView(d, byId.get(d.user.toString()))),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async decide(
      req: Request,
      id: string,
      decision: ApplicationDecisionInput,
    ): Promise<SellerApplicationView> {
      const adminId = req.auth?.userId;
      if (!adminId) throw ApiError.unauthenticated();

      const result = await mongoose.connection.transaction(async (session) => {
        const application = await SellerApplication.findOne({ _id: id, status: 'PENDING' }).session(
          session,
        );
        if (!application) throw ApiError.notFound('Pending application not found');
        application.reviewedBy = new mongoose.Types.ObjectId(adminId);
        application.reviewedAt = new Date();

        if (decision.decision === 'REJECT') {
          application.status = 'REJECTED';
          application.rejectionReason = decision.reason;
          await application.save({ session });
          await recordAudit(
            req,
            {
              action: 'seller_application.rejected',
              resource: 'SELLER_APPLICATION',
              resourceId: id,
              metadata: { reason: decision.reason },
              actorRole: 'ADMIN',
            },
            session,
          );
          return { application, approved: false };
        }

        if (await Seller.exists({ user: application.user }).session(session)) {
          throw ApiError.conflict('This user already has a seller account');
        }
        const settings = await PlatformSetting.findOne({ key: 'platform' })
          .select('commission')
          .session(session)
          .lean();
        const [seller] = await Seller.create(
          [
            {
              user: application.user,
              storeName: application.storeName,
              slug: await uniqueSellerSlug(application.storeName),
              businessType: application.businessType,
              legalName: application.legalName,
              ...(application.gstin ? { gstin: application.gstin } : {}),
              pickupAddress: application.pickupAddress,
              supportPhone: application.contactPhone,
              status: 'ACTIVE',
              commissionBps: decision.commissionBps ?? settings?.commission?.defaultBps ?? 1000,
              approvedAt: new Date(),
              approvedBy: adminId,
            },
          ],
          { session },
        );
        await User.updateOne(
          { _id: application.user },
          { $addToSet: { roles: 'SELLER' } },
          { session },
        );
        application.status = 'APPROVED';
        await application.save({ session });
        await recordAudit(
          req,
          {
            action: 'seller_application.approved',
            resource: 'SELLER_APPLICATION',
            resourceId: id,
            metadata: { sellerId: seller?._id.toString() },
            actorRole: 'ADMIN',
          },
          session,
        );
        return { application, approved: true };
      });

      const userId = result.application.user.toString();
      const storeName = result.application.storeName;
      await notify({
        user: userId,
        type: result.approved ? 'SELLER_APPROVED' : 'SELLER_REJECTED',
        title: result.approved
          ? 'Your seller account is approved'
          : 'Your seller application was not approved',
        body: result.approved
          ? `${storeName} is live. Add your first products in Seller Center.`
          : (result.application.rejectionReason ?? ''),
        link: result.approved ? '/seller' : '/sell',
        email: {
          preference: 'securityAlerts',
          build: (to) =>
            orderUpdateEmail({
              to: to.email,
              name: to.name,
              subject: result.approved
                ? 'Welcome to ZYVENTA Seller Center'
                : 'Update on your seller application',
              headline: result.approved ? 'You’re approved!' : 'Application not approved',
              message: result.approved
                ? `${storeName} is approved. You can now list products and start selling.`
                : `We couldn’t approve ${storeName}: ${result.application.rejectionReason ?? ''}. You can update your details and apply again.`,
              path: result.approved ? '/seller' : '/sell',
              cta: result.approved ? 'Open Seller Center' : 'Review application',
            }),
        },
      });
      return toView(result.application.toObject());
    },
  };
}

export type SellerApplicationService = ReturnType<typeof createSellerApplicationService>;
