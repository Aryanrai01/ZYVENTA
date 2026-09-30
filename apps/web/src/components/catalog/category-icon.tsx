import {
  Baby,
  BookOpen,
  Dumbbell,
  LayoutGrid,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Admin-chosen category icons (lucide names). An explicit allowlist keeps the bundle small
 * and ignores unknown values instead of failing.
 */
const ICONS: Record<string, LucideIcon> = {
  baby: Baby,
  'book-open': BookOpen,
  dumbbell: Dumbbell,
  shirt: Shirt,
  'shopping-basket': ShoppingBasket,
  smartphone: Smartphone,
  sofa: Sofa,
  sparkles: Sparkles,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name ? ICONS[name] : undefined) ?? LayoutGrid;
  return <Icon className={className} aria-hidden="true" />;
}
