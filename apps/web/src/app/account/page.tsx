import { Suspense } from 'react';
import { AccountOverview } from '@/features/account/components/account-overview';

export default function AccountPage() {
  return (
    <Suspense>
      <AccountOverview />
    </Suspense>
  );
}
