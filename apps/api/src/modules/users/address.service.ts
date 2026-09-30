import {
  ERROR_CODES,
  MAX_ADDRESSES,
  type AddressInput,
  type AddressUpdateInput,
  type AddressView,
} from '@zyventa/shared';
import type { ClientSession, Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { Address, type AddressAttrs } from './address.model.js';

type AddressLean = AddressAttrs & { _id: Types.ObjectId };

export function toAddressView(a: AddressLean): AddressView {
  return {
    id: a._id.toString(),
    label: a.label,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: 'IN',
    isDefault: a.isDefault,
  };
}

const LIST_SORT = { isDefault: -1, updatedAt: -1 } as const;

/**
 * Address book. Every query is scoped by `user` taken from the session, so another user's
 * address id behaves exactly like a missing one (404). The single-default rule is enforced
 * by a partial unique index; default switches run in a transaction so it never trips.
 */
export function createAddressService() {
  async function clearDefault(userId: string, session: ClientSession): Promise<void> {
    await Address.updateMany(
      { user: userId, isDefault: true },
      { $set: { isDefault: false } },
      { session },
    );
  }

  async function findOwned(userId: string, id: string, session?: ClientSession) {
    const address = await Address.findOne({ _id: id, user: userId }, null, { session });
    if (!address) throw ApiError.notFound('Address not found');
    return address;
  }

  return {
    async list(userId: string): Promise<AddressView[]> {
      const docs = await Address.find({ user: userId }).sort(LIST_SORT).lean<AddressLean[]>();
      return docs.map(toAddressView);
    },

    async create(userId: string, input: AddressInput): Promise<AddressView> {
      const created = await mongoose.connection.transaction(async (session) => {
        const count = await Address.countDocuments({ user: userId }).session(session);
        if (count >= MAX_ADDRESSES) {
          throw ApiError.unprocessable(
            `You can save up to ${String(MAX_ADDRESSES)} addresses`,
            ERROR_CODES.ADDRESS_LIMIT_REACHED,
          );
        }
        // The first address is always the default.
        const isDefault = input.isDefault || count === 0;
        if (isDefault) await clearDefault(userId, session);
        const [doc] = await Address.create([{ ...input, user: userId, isDefault }], { session });
        return doc;
      });
      if (!created) throw new Error('Address was not created');
      return toAddressView(created.toObject());
    },

    async update(userId: string, id: string, input: AddressUpdateInput): Promise<AddressView> {
      const updated = await mongoose.connection.transaction(async (session) => {
        const address = await findOwned(userId, id, session);
        const { isDefault, ...fields } = input;
        // Unsetting the default directly would leave none; choose another address instead.
        if (isDefault === true && !address.isDefault) {
          await clearDefault(userId, session);
          address.isDefault = true;
        }
        address.set(fields);
        await address.save({ session });
        return address;
      });
      return toAddressView(updated.toObject());
    },

    async setDefault(userId: string, id: string): Promise<AddressView[]> {
      await mongoose.connection.transaction(async (session) => {
        const address = await findOwned(userId, id, session);
        if (address.isDefault) return;
        await clearDefault(userId, session);
        address.isDefault = true;
        await address.save({ session });
      });
      return this.list(userId);
    },

    async remove(userId: string, id: string): Promise<AddressView[]> {
      await mongoose.connection.transaction(async (session) => {
        const address = await findOwned(userId, id, session);
        await Address.deleteOne({ _id: address._id, user: userId }, { session });
        if (address.isDefault) {
          // Promote the most recently edited remaining address.
          await Address.findOneAndUpdate(
            { user: userId },
            { $set: { isDefault: true } },
            { sort: { updatedAt: -1 }, session },
          );
        }
      });
      return this.list(userId);
    },
  };
}

export type AddressService = ReturnType<typeof createAddressService>;
