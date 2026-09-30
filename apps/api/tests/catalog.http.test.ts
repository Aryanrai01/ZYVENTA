import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthPrincipal, PrincipalStore } from '../src/modules/auth/principal.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';
import type { ImageStorage } from '../src/modules/uploads/image-storage.js';

/*
 * HTTP-level authorization and upload validation without a database: principals come from
 * a fake store and images go to a fake storage. Requests use bearer tokens and no cookies
 * (CSRF-exempt by design), exactly like a non-browser client.
 */
const SELLER_ID = '65f0000000000000000000aa';
const OTHER_SELLER = '65f0000000000000000000bb';

const principal = (overrides: Partial<AuthPrincipal> = {}): AuthPrincipal => ({
  userId: '65f000000000000000000001',
  sessionId: 'family',
  roles: ['USER'],
  status: 'ACTIVE',
  emailVerified: true,
  sellerId: null,
  sellerActive: false,
  ...overrides,
});

const activeSeller = principal({
  roles: ['USER', 'SELLER'],
  sellerId: SELLER_ID,
  sellerActive: true,
});

function appFor(p: AuthPrincipal | null, storage: ImageStorage | null = null) {
  const principals: PrincipalStore = {
    resolve: () => Promise.resolve(p),
  };
  return createApp({ isDatabaseUp: () => true, principals, storage });
}

const bearer = async () =>
  `Bearer ${await signAccessToken({ sub: '65f000000000000000000001', sid: 'family' })}`;

function fakeStorage() {
  const uploads: { folder: string; bytes: number }[] = [];
  const destroyed: string[] = [];
  const storage: ImageStorage = {
    urlPrefix: 'https://res.cloudinary.com/test/image/upload/',
    upload: (buffer, folder) => {
      uploads.push({ folder, bytes: buffer.length });
      return Promise.resolve({
        url: `https://res.cloudinary.com/test/image/upload/${folder}/abc.png`,
        publicId: `${folder}/abc`,
        width: 1,
        height: 1,
      });
    },
    destroy: (publicId) => {
      destroyed.push(publicId);
      return Promise.resolve();
    },
  };
  return { storage, uploads, destroyed };
}

// Smallest valid PNG (1×1 transparent pixel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('seller routes authorization', () => {
  it('requires authentication', async () => {
    const res = await request(appFor(null)).get('/api/v1/seller/products');
    expect(res.status).toBe(401);
  });

  it('forbids customers', async () => {
    const res = await request(appFor(principal()))
      .get('/api/v1/seller/products')
      .set('Authorization', await bearer());
    expect(res.status).toBe(403);
  });

  it('forbids sellers whose profile is not active', async () => {
    const pending = principal({
      roles: ['USER', 'SELLER'],
      sellerId: SELLER_ID,
      sellerActive: false,
    });
    const res = await request(appFor(pending))
      .get('/api/v1/seller/products')
      .set('Authorization', await bearer());
    expect(res.status).toBe(403);
  });

  it('validates bodies before touching the database (mass-assignment of seller id)', async () => {
    const res = await request(appFor(activeSeller))
      .post('/api/v1/seller/products')
      .set('Authorization', await bearer())
      .send({ name: 'x', seller: OTHER_SELLER });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed ids with 400', async () => {
    const res = await request(appFor(activeSeller))
      .get('/api/v1/seller/products/not-an-id')
      .set('Authorization', await bearer());
    expect(res.status).toBe(400);
  });
});

describe('admin routes authorization', () => {
  it('forbids sellers and customers', async () => {
    for (const p of [principal(), activeSeller]) {
      const res = await request(appFor(p))
        .post('/api/v1/admin/categories')
        .set('Authorization', await bearer())
        .send({ name: 'Hack' });
      expect(res.status).toBe(403);
    }
  });
});

describe('public catalogue validation', () => {
  it('rejects unknown filters and bad sort values', async () => {
    const app = appFor(null);
    expect((await request(app).get('/api/v1/products?drop=1')).status).toBe(400);
    expect((await request(app).get('/api/v1/products?sort=hack')).status).toBe(400);
    expect((await request(app).get('/api/v1/products?limit=500')).status).toBe(400);
    expect((await request(app).get('/api/v1/products/Bad_Slug!')).status).toBe(400);
  });
});

describe('image uploads', () => {
  it('returns 503 until storage is configured', async () => {
    const res = await request(appFor(activeSeller, null))
      .post('/api/v1/uploads/images')
      .set('Authorization', await bearer())
      .attach('images', PNG, 'a.png');
    expect(res.status).toBe(503);
  });

  it('stores real images in the seller’s own folder', async () => {
    const { storage, uploads } = fakeStorage();
    const res = await request(appFor(activeSeller, storage))
      .post('/api/v1/uploads/images')
      .set('Authorization', await bearer())
      .attach('images', PNG, 'photo.png');
    expect(res.status).toBe(201);
    expect(uploads[0]?.folder).toBe(`zyventa/products/${SELLER_ID}`);
    expect(res.body.data[0].publicId).toMatch(new RegExp(`^zyventa/products/${SELLER_ID}/`));
  });

  it('detects the real type from bytes, ignoring the declared type and name', async () => {
    const { storage, uploads } = fakeStorage();
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await request(appFor(activeSeller, storage))
      .post('/api/v1/uploads/images')
      .set('Authorization', await bearer())
      .attach('images', html, { filename: 'innocent.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(uploads).toHaveLength(0);
  });

  it('rejects files over 5 MB', async () => {
    const { storage } = fakeStorage();
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await request(appFor(activeSeller, storage))
      .post('/api/v1/uploads/images')
      .set('Authorization', await bearer())
      .attach('images', big, 'big.png');
    expect(res.status).toBe(413);
  });

  it('only lets customers upload when they are admins/sellers', async () => {
    const { storage } = fakeStorage();
    const res = await request(appFor(principal(), storage))
      .post('/api/v1/uploads/images')
      .set('Authorization', await bearer())
      .attach('images', PNG, 'a.png');
    expect(res.status).toBe(403);
  });

  it('refuses to delete another seller’s image', async () => {
    const { storage, destroyed } = fakeStorage();
    const app = appFor(activeSeller, storage);
    const auth = await bearer();
    const foreign = await request(app)
      .delete('/api/v1/uploads/images')
      .set('Authorization', auth)
      .send({ publicId: `zyventa/products/${OTHER_SELLER}/abc` });
    expect(foreign.status).toBe(403);
    const traversal = await request(app)
      .delete('/api/v1/uploads/images')
      .set('Authorization', auth)
      .send({ publicId: `zyventa/products/${SELLER_ID}/../${OTHER_SELLER}/abc` });
    expect(traversal.status).toBe(403);
    const own = await request(app)
      .delete('/api/v1/uploads/images')
      .set('Authorization', auth)
      .send({ publicId: `zyventa/products/${SELLER_ID}/abc` });
    expect(own.status).toBe(200);
    expect(destroyed).toEqual([`zyventa/products/${SELLER_ID}/abc`]);
  });
});
