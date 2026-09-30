'use client';

import { PageHeader } from '@/components/layout/dashboard-shell';
import { PromotionManager } from '@/features/promotions/promotion-manager';
import { sellerService } from '@/services/seller.service';

const api = {
  coupons: sellerService.coupons,
  createCoupon: sellerService.createCoupon,
  updateCoupon: sellerService.updateCoupon,
  offers: sellerService.offers,
  createOffer: sellerService.createOffer,
  updateOffer: sellerService.updateOffer,
};

export default function Page() {
  return (
    <>
      <PageHeader
        title="Offers & coupons"
        description="You fund these discounts; they apply to your products only."
      />
      <PromotionManager
        api={api}
        scopeNote="Promotions you create apply only to your own catalogue."
      />
    </>
  );
}
