import type { Types } from 'mongoose';
import { Coupon } from '../../modules/coupons/coupon.model.js';
import { Offer } from '../../modules/offers/offer.model.js';
import { PlatformSetting } from '../../modules/settings/platform-setting.model.js';
import type { SellerKey } from './catalog-data.js';

const DAY = 24 * 60 * 60 * 1000;

export async function seedPromotions(input: {
  adminId: Types.ObjectId;
  sellerIds: Record<SellerKey, Types.ObjectId>;
  electronicsCategoryId: Types.ObjectId | undefined;
}): Promise<{ coupons: number; offers: number }> {
  const now = Date.now();
  const startsAt = new Date(now - DAY);

  await PlatformSetting.create({ key: 'platform', support: { email: 'support@zyventa.test' } });

  const coupons = await Coupon.insertMany([
    {
      code: 'WELCOME10',
      title: '10% off your first order',
      description: 'Up to ₹200 off on orders above ₹499.',
      type: 'PERCENTAGE',
      value: 10,
      maxDiscount: 20_000,
      minOrderAmount: 49_900,
      startsAt,
      endsAt: new Date(now + 365 * DAY),
      perUserLimit: 1,
      firstOrderOnly: true,
      createdBy: input.adminId,
    },
    {
      code: 'FLAT150',
      title: '₹150 off',
      description: 'Flat ₹150 off on orders above ₹1,499.',
      type: 'FIXED',
      value: 15_000,
      minOrderAmount: 1_49_900,
      startsAt,
      endsAt: new Date(now + 90 * DAY),
      usageLimit: 1000,
      perUserLimit: 3,
      createdBy: input.adminId,
    },
    {
      code: 'LOOM20',
      title: '20% off at Loom & Thread Co.',
      description: 'Seller-funded. Up to ₹500 off on Loom & Thread items.',
      type: 'PERCENTAGE',
      value: 20,
      maxDiscount: 50_000,
      minOrderAmount: 99_900,
      startsAt,
      endsAt: new Date(now + 60 * DAY),
      perUserLimit: 2,
      fundedBy: 'SELLER',
      ownerSeller: input.sellerIds.loom,
      scope: { sellers: [input.sellerIds.loom] },
      createdBy: input.adminId,
    },
    {
      code: 'EXPIRED5',
      title: 'Expired test coupon',
      type: 'PERCENTAGE',
      value: 5,
      startsAt: new Date(now - 30 * DAY),
      endsAt: new Date(now - DAY),
      visibility: 'PRIVATE',
      createdBy: input.adminId,
    },
  ]);

  const offers = input.electronicsCategoryId
    ? await Offer.insertMany([
        {
          title: 'Electronics Week',
          description: 'Extra 5% off electronics, up to ₹2,000 per item.',
          owner: 'PLATFORM',
          type: 'PERCENTAGE',
          value: 5,
          maxDiscount: 2_00_000,
          scope: { categories: [input.electronicsCategoryId] },
          startsAt,
          endsAt: new Date(now + 14 * DAY),
          priority: 10,
          createdBy: input.adminId,
        },
      ])
    : [];

  return { coupons: coupons.length, offers: offers.length };
}
