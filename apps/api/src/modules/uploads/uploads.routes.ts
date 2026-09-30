import { ERROR_CODES, imageDeleteSchema, type UploadedImage } from '@zyventa/shared';
import { ipKeyGenerator } from 'express-rate-limit';
import { Router, type Request } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { authOf, type AuthMiddleware } from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { adminImageFolder, sellerImageFolder, type ImageStorage } from './image-storage.js';

export const UPLOAD_LIMITS = { maxBytes: 5 * 1024 * 1024, maxFiles: 8 } as const;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const upload = multer({
  storage: multer.memoryStorage(), // never touches disk; streamed to storage after checks
  limits: { fileSize: UPLOAD_LIMITS.maxBytes, files: UPLOAD_LIMITS.maxFiles, fields: 5, parts: 15 },
});

/**
 * Checks the real file type from magic bytes. The client-declared Content-Type and filename
 * extension are ignored — both are attacker-controlled.
 */
export async function assertAllowedImage(buffer: Buffer): Promise<string> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw ApiError.badRequest('Only JPEG, PNG, WebP or AVIF images are allowed');
  }
  return detected.mime;
}

function folderFor(req: Request, purpose: string | undefined): string {
  const auth = authOf(req);
  if (purpose === 'category' || purpose === 'brand') {
    if (!auth.roles.includes('ADMIN')) throw ApiError.forbidden();
    return adminImageFolder(purpose === 'category' ? 'categories' : 'brands');
  }
  if (!auth.sellerId || !auth.sellerActive) {
    throw ApiError.forbidden('An active seller account is required to upload product images');
  }
  return sellerImageFolder(auth.sellerId);
}

export function createUploadRouter(deps: {
  auth: AuthMiddleware;
  storage: ImageStorage | null;
}): Router {
  const router = Router();
  const limiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 120,
    key: (req) => `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown')}`,
  });

  const requireStorage = (): ImageStorage => {
    if (!deps.storage) {
      throw new ApiError(503, ERROR_CODES.SERVICE_UNAVAILABLE, 'Image storage is not configured');
    }
    return deps.storage;
  };

  /** POST /uploads/images  (multipart, field `images`, optional `purpose`=product|category|brand) */
  router.post(
    '/images',
    deps.auth.required,
    limiter,
    upload.array('images', UPLOAD_LIMITS.maxFiles),
    async (req, res) => {
      const storage = requireStorage();
      const rawPurpose: unknown = (req.body as Record<string, unknown> | undefined)?.purpose;
      const purpose = typeof rawPurpose === 'string' ? rawPurpose : undefined;
      const folder = folderFor(req, purpose);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0)
        throw ApiError.badRequest('Attach at least one image in the "images" field');

      // Validate every file before uploading any, so a bad file doesn't leave partial uploads.
      for (const file of files) await assertAllowedImage(file.buffer);
      const uploaded: UploadedImage[] = [];
      for (const file of files) uploaded.push(await storage.upload(file.buffer, folder));

      sendSuccess(res, { statusCode: 201, message: 'Uploaded', data: uploaded });
    },
  );

  /** DELETE /uploads/images  { publicId } — only inside the caller's own folder. */
  router.delete(
    '/images',
    deps.auth.required,
    validate({ body: imageDeleteSchema }),
    async (req, res) => {
      const storage = requireStorage();
      const { publicId } = req.validated.body as { publicId: string };
      const auth = authOf(req);
      const allowed = [
        ...(auth.sellerId ? [`${sellerImageFolder(auth.sellerId)}/`] : []),
        ...(auth.roles.includes('ADMIN')
          ? [`${adminImageFolder('categories')}/`, `${adminImageFolder('brands')}/`]
          : []),
      ];
      if (!allowed.some((prefix) => publicId.startsWith(prefix)) || publicId.includes('..')) {
        throw ApiError.forbidden('You can only delete your own images');
      }
      await storage.destroy(publicId);
      sendSuccess(res, { message: 'Deleted', data: null });
    },
  );

  return router;
}
