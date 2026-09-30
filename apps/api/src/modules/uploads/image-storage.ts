import { randomBytes } from 'node:crypto';
import type { UploadedImage } from '@zyventa/shared';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env.js';

/** Storage port — Cloudinary in production, a fake in tests. */
export interface ImageStorage {
  /** Public URL prefix every asset from this storage starts with (used to validate inputs). */
  readonly urlPrefix: string;
  upload(buffer: Buffer, folder: string): Promise<UploadedImage>;
  destroy(publicId: string): Promise<void>;
}

/** Folder that owns a seller's product images: `<root>/products/<sellerId>`. */
export function sellerImageFolder(sellerId: string): string {
  return `${env.CLOUDINARY_FOLDER}/products/${sellerId}`;
}

export function adminImageFolder(kind: 'categories' | 'brands'): string {
  return `${env.CLOUDINARY_FOLDER}/${kind}`;
}

export function createCloudinaryStorage(): ImageStorage | null {
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = env;
  if (!cloudName || !apiKey || !apiSecret) return null;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return {
    urlPrefix: `https://res.cloudinary.com/${cloudName}/image/upload/`,

    upload(buffer, folder) {
      return new Promise<UploadedImage>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            // Random, unguessable id — never the client's filename.
            public_id: randomBytes(12).toString('hex'),
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
            overwrite: false,
            // Normalise on ingest: strip metadata (EXIF/GPS), cap dimensions.
            transformation: [{ width: 2400, height: 2400, crop: 'limit' }],
          },
          (error, result?: UploadApiResponse) => {
            if (error || !result) {
              reject(new Error(`Image upload failed: ${error?.message ?? 'no result'}`));
              return;
            }
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
            });
          },
        );
        stream.end(buffer);
      });
    },

    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    },
  };
}
