import type { IndianStateCode } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { Seller } from '../../modules/sellers/seller.model.js';
import { Address } from '../../modules/users/address.model.js';
import { User } from '../../modules/users/user.model.js';
import type { SellerKey } from './catalog-data.js';

export const SEED_EMAIL_DOMAIN = 'zyventa.test'; // RFC 2606 reserved TLD — never deliverable

interface PersonSeed {
  name: string;
  email: string;
  phone: string;
  city: string;
  state: IndianStateCode;
  pincode: string;
  line1: string;
}

const CUSTOMERS: PersonSeed[] = [
  {
    name: 'Aarav Sharma',
    email: 'aarav',
    phone: '9876500001',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560103',
    line1: '42, 5th Cross, Bellandur',
  },
  {
    name: 'Diya Patel',
    email: 'diya',
    phone: '9876500002',
    city: 'Ahmedabad',
    state: 'GJ',
    pincode: '380015',
    line1: '12, Satellite Road',
  },
  {
    name: 'Kabir Rao',
    email: 'kabir',
    phone: '9876500003',
    city: 'Hyderabad',
    state: 'TS',
    pincode: '500081',
    line1: 'Flat 704, Madhapur',
  },
];

const SELLERS: (PersonSeed & {
  key: SellerKey;
  storeName: string;
  legalName: string;
  gstin: string;
  description: string;
})[] = [
  {
    key: 'techverse',
    name: 'Rohan Mehta',
    email: 'techverse',
    phone: '9876510001',
    storeName: 'Techverse Retail',
    legalName: 'Techverse Retail Private Limited',
    gstin: '29AABCT1234A1Z5',
    description: 'Phones, laptops and audio from trusted brands.',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560068',
    line1: 'Unit 3, HSR Industrial Layout',
  },
  {
    key: 'loom',
    name: 'Ananya Iyer',
    email: 'loom',
    phone: '9876510002',
    storeName: 'Loom & Thread Co.',
    legalName: 'Loom and Thread LLP',
    gstin: '27AAFFL5678B1Z2',
    description: 'Everyday fashion, footwear and beauty essentials.',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400013',
    line1: 'Gala 14, Lower Parel',
  },
  {
    key: 'hearth',
    name: 'Vikram Singh',
    email: 'hearth',
    phone: '9876510003',
    storeName: 'Hearth Home Store',
    legalName: 'Hearth Home Store',
    gstin: '07ABCPS9012C1Z8',
    description: 'Cookware, furniture and fitness gear for every home.',
    city: 'New Delhi',
    state: 'DL',
    pincode: '110020',
    line1: 'B-21, Okhla Phase II',
  },
  {
    key: 'everyday',
    name: 'Meera Krishnan',
    email: 'everyday',
    phone: '9876510004',
    storeName: 'Everyday Essentials Mart',
    legalName: 'Everyday Essentials Mart',
    gstin: '33AAGCE3456D1Z4',
    description: 'Books, groceries and toys delivered fast.',
    city: 'Chennai',
    state: 'TN',
    pincode: '600032',
    line1: 'Plot 9, Guindy Industrial Estate',
  },
];

export interface PeopleSeedResult {
  adminId: Types.ObjectId;
  customerIds: Types.ObjectId[];
  sellerIds: Record<SellerKey, Types.ObjectId>;
  logins: { role: string; email: string }[];
}

/** `passwordHash` is computed once by the caller and shared by every demo account. */
export async function seedPeople(passwordHash: string): Promise<PeopleSeedResult> {
  const now = new Date();
  const email = (local: string) => `${local}@${SEED_EMAIL_DOMAIN}`;
  const logins: PeopleSeedResult['logins'] = [];

  const admin = await User.create({
    name: 'Platform Admin',
    email: email('admin'),
    passwordHash,
    roles: ['USER', 'ADMIN'],
    emailVerifiedAt: now,
  });
  logins.push({ role: 'ADMIN', email: admin.email });

  const customerIds: Types.ObjectId[] = [];
  for (const person of CUSTOMERS) {
    const user = await User.create({
      name: person.name,
      email: email(person.email),
      phone: person.phone,
      passwordHash,
      emailVerifiedAt: now,
    });
    await Address.create({
      user: user._id,
      label: 'HOME',
      fullName: person.name,
      phone: person.phone,
      line1: person.line1,
      city: person.city,
      state: person.state,
      pincode: person.pincode,
      isDefault: true,
    });
    customerIds.push(user._id);
    logins.push({ role: 'CUSTOMER', email: user.email });
  }

  const sellerIds = {} as Record<SellerKey, Types.ObjectId>;
  for (const s of SELLERS) {
    const user = await User.create({
      name: s.name,
      email: email(s.email),
      phone: s.phone,
      passwordHash,
      roles: ['USER', 'SELLER'],
      emailVerifiedAt: now,
    });
    const seller = await Seller.create({
      user: user._id,
      storeName: s.storeName,
      slug:
        s.key === 'loom'
          ? 'loom-and-thread'
          : s.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: s.description,
      businessType: s.legalName.includes('Private Limited')
        ? 'PRIVATE_LIMITED'
        : s.legalName.includes('LLP')
          ? 'LLP'
          : 'PROPRIETORSHIP',
      legalName: s.legalName,
      gstin: s.gstin,
      pickupAddress: {
        fullName: s.name,
        phone: s.phone,
        line1: s.line1,
        city: s.city,
        state: s.state,
        pincode: s.pincode,
      },
      supportEmail: email(`support.${s.email}`),
      supportPhone: s.phone,
      status: 'ACTIVE',
      approvedAt: now,
      approvedBy: admin._id,
    });
    sellerIds[s.key] = seller._id;
    logins.push({ role: `SELLER (${s.storeName})`, email: user.email });
  }

  return { adminId: admin._id, customerIds, sellerIds, logins };
}
