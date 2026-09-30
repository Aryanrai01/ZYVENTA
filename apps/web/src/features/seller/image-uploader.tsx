'use client';

import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/features/cart/use-cart';
import { sellerService } from '@/services/seller.service';

export interface EditableImage {
  url: string;
  publicId?: string;
  alt?: string;
  width?: number;
  height?: number;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/** Upload to the API (validated + stored on Cloudinary); reorder by removing and re-adding. */
export function ImageUploader({
  images,
  onChange,
  max = 10,
}: {
  images: EditableImage[];
  onChange: (images: EditableImage[]) => void;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files).slice(0, Math.max(0, max - images.length));
    const tooBig = chosen.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      toast.error(`${tooBig.name} is larger than 5 MB`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await sellerService.uploadImages(chosen);
      onChange([
        ...images,
        ...uploaded.map((u) => ({
          url: u.url,
          publicId: u.publicId,
          width: u.width,
          height: u.height,
        })),
      ]);
    } catch (error) {
      toast.error(errorMessage(error, 'Upload failed'));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <ul className="flex flex-wrap gap-3">
        {images.map((img, i) => (
          <li
            key={`${img.url}-${String(i)}`}
            className="relative size-24 overflow-hidden rounded-lg border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- previews of freshly uploaded images */}
            <img
              src={img.url}
              alt={img.alt ?? `Image ${String(i + 1)}`}
              className="size-full object-contain"
            />
            {i === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-card/90 px-1 text-[10px] font-medium">
                Main
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`Remove image ${String(i + 1)}`}
              onClick={() => {
                onChange(images.filter((_, j) => j !== i));
              }}
              className="absolute top-1 right-1 rounded-full bg-card/90 p-1 shadow-card hover:text-destructive"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
        {images.length < max ? (
          <li>
            <Button
              type="button"
              variant="outline"
              className="size-24 flex-col gap-1 text-xs"
              loading={uploading}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-5" aria-hidden="true" /> Add
            </Button>
          </li>
        ) : null}
      </ul>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        JPEG, PNG, WebP or AVIF · up to 5 MB each · first image is the main one.
      </p>
    </div>
  );
}
