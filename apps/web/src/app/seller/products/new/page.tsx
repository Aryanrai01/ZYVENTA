import type { Metadata } from 'next';
import { ProductEditor } from '@/features/seller/product-editor';

export const metadata: Metadata = { title: 'New product' };

export default function Page() {
  return <ProductEditor />;
}
