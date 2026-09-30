import type { Role, UserStatus } from '@zyventa/shared';
import { Seller } from '../sellers/seller.model.js';
import { User } from '../users/user.model.js';
import { Session } from './session.model.js';

/** The authenticated caller, attached to `req.auth`. */
export interface AuthPrincipal {
  userId: string;
  /** Session family id (from the access token `sid`). */
  sessionId: string;
  roles: Role[];
  status: UserStatus;
  emailVerified: boolean;
  /** Present for users with an ACTIVE or SUSPENDED seller profile. */
  sellerId: string | null;
  sellerActive: boolean;
}

/**
 * Resolves an access token's subject into a fresh principal.
 *
 * User roles, account state, seller status, and session revocation are read directly from MongoDB
 * so changes take effect on the next authenticated request.
 */
export interface PrincipalStore {
  resolve(userId: string, sessionId: string): Promise<AuthPrincipal | null>;
}

async function loadUser(userId: string): Promise<Omit<AuthPrincipal, 'sessionId'> | null> {
  const user = await User.findById(userId).select('roles status emailVerifiedAt').lean();
  if (!user) return null;
  const seller = user.roles.includes('SELLER')
    ? await Seller.findOne({ user: user._id }).select('status').lean()
    : null;
  return {
    userId,
    roles: user.roles,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    sellerId: seller ? seller._id.toString() : null,
    sellerActive: seller?.status === 'ACTIVE',
  };
}

export function createPrincipalStore(): PrincipalStore {
  async function isSessionRevoked(familyId: string): Promise<boolean> {
    const live = await Session.exists({
      familyId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    return live === null;
  }

  return {
    async resolve(userId, sessionId) {
      const [user, revoked] = await Promise.all([loadUser(userId), isSessionRevoked(sessionId)]);
      if (!user || revoked) return null;
      return { ...user, sessionId };
    },
  };
}
