import type { AuthUser } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { Seller } from '../sellers/seller.model.js';
import type { UserAttrs } from './user.model.js';

type UserLike = Pick<
  UserAttrs,
  'name' | 'email' | 'phone' | 'roles' | 'status' | 'emailVerifiedAt' | 'avatar' | 'createdAt'
> & { _id: Types.ObjectId };

/**
 * The ONLY shape in which a user leaves the API. Explicit field-by-field mapping means a new
 * schema field can never leak by accident.
 */
export async function toAuthUser(user: UserLike): Promise<AuthUser> {
  const seller = user.roles.includes('SELLER')
    ? await Seller.findOne({ user: user._id }).select('storeName status').lean()
    : null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    roles: user.roles,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    avatarUrl: user.avatar?.url ?? null,
    seller: seller
      ? { id: seller._id.toString(), storeName: seller.storeName, status: seller.status }
      : null,
    createdAt: user.createdAt.toISOString(),
  };
}
