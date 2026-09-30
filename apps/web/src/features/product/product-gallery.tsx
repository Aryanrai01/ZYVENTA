'use client';

import type { ImageView } from '@zyventa/shared';
import Image from 'next/image';
import { useState } from 'react';
import { ProductImage } from '@/components/catalog/product-image';
import { cn } from '@/lib/utils';

/** Main image with thumbnails (a scrollable strip on phones, a column on desktop). */
export function ProductGallery({ images, name }: { images: ImageView[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)] ?? null;

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 ? (
        <ul
          aria-label="Product images"
          className="scrollbar-none flex gap-2 overflow-x-auto md:max-h-[32rem] md:flex-col md:overflow-y-auto"
        >
          {images.map((image, i) => (
            <li key={`${image.url}-${String(i)}`} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIndex(i);
                }}
                aria-label={`Show image ${String(i + 1)} of ${String(images.length)}`}
                aria-current={i === index}
                className={cn(
                  'relative block size-16 overflow-hidden rounded-lg border-2 bg-muted',
                  i === index ? 'border-primary' : 'border-transparent hover:border-border',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="64px"
                  unoptimized={image.url.endsWith('.svg')}
                  className="object-contain"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex-1">
        <ProductImage
          image={current}
          alt={current?.alt || name}
          sizes="(min-width: 1024px) 560px, 100vw"
          priority
          className="rounded-2xl border"
        />
      </div>
    </div>
  );
}
