import type { ImageView } from '@zyventa/shared';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  image: ImageView | null;
  alt?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/**
 * Square product image. Cloudinary images go through next/image optimisation; bundled SVG
 * placeholders are served as-is (SVGs are not rasterised by the optimiser).
 */
export function ProductImage({
  image,
  alt,
  sizes,
  priority = false,
  className,
}: ProductImageProps) {
  if (!image) {
    return (
      <div
        className={cn(
          'flex aspect-square items-center justify-center bg-muted text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-8" aria-hidden="true" />
        <span className="sr-only">{alt ?? 'No image available'}</span>
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-square overflow-hidden bg-muted', className)}>
      <Image
        src={image.url}
        alt={alt ?? image.alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={image.url.endsWith('.svg')}
        className="object-contain"
      />
    </div>
  );
}
