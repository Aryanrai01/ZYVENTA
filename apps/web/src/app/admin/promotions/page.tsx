'use client';

import { PageHeader } from '@/components/layout/dashboard-shell';
import { PromotionManager } from '@/features/promotions/promotion-manager';
import { adminService } from '@/services/admin.service';

const api = {
  coupons: adminService.coupons,
  createCoupon: adminService.createCoupon,
  updateCoupon: adminService.updateCoupon,
  offers: adminService.offers,
  createOffer: adminService.createOffer,
  updateOffer: adminService.updateOffer,
};

export default function Page() {
  return (
    <>
      <PageHeader
        title="Offers & coupons"
        description="Platform-funded promotions. Seller-funded ones are listed here too."
      />
      <PromotionManager
        api={api}
        scopeNote="Platform promotions can target the whole catalogue, a category or a seller."
      />
    </>
  );
}
