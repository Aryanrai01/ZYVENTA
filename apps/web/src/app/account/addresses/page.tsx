import type { Metadata } from 'next';
import { AddressBook } from '@/features/account/components/address-book';

export const metadata: Metadata = { title: 'Addresses' };

export default function Page() {
  return <AddressBook />;
}
