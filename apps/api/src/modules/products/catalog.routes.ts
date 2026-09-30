import {
  productCardsQuerySchema,
  productListQuerySchema,
  slugParamSchema,
  suggestionQuerySchema,
  type ProductCardsQuery,
  type ProductListQuery,
} from '@zyventa/shared';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { publicCache } from '../../utils/http-cache.js';
import type { BrandService } from '../brands/brand.service.js';
import type { CategoryService } from '../categories/category.service.js';
import type { CatalogService } from './catalog.service.js';

const facetQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    category: slugParamSchema.shape.slug.optional(),
  })
  .strict();

/** GET /categories, /categories/:slug */
export function createCategoryRouter(categories: CategoryService): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    publicCache(res, 300);
    sendSuccess(res, { data: await categories.tree() });
  });
  router.get('/:slug', validate({ params: slugParamSchema }), async (req, res) => {
    const { slug } = req.validated.params as { slug: string };
    publicCache(res, 300);
    sendSuccess(res, { data: await categories.bySlug(slug) });
  });
  return router;
}

/** GET /brands */
export function createBrandRouter(brands: BrandService): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    publicCache(res, 300);
    sendSuccess(res, { data: await brands.list() });
  });
  return router;
}

/** GET /products, /products/facets, /products/cards, /products/suggestions, /products/:slug, /products/:slug/related */
export function createProductRouter(catalog: CatalogService): Router {
  const router = Router();

  router.get('/', validate({ query: productListQuerySchema }), async (req, res) => {
    const result = await catalog.list(req.validated.query as ProductListQuery);
    publicCache(res, 60);
    res.setHeader('X-Search-Mode', result.searchMode);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });

  router.get('/facets', validate({ query: facetQuerySchema }), async (req, res) => {
    publicCache(res, 120);
    sendSuccess(res, {
      data: await catalog.facets(req.validated.query as z.infer<typeof facetQuerySchema>),
    });
  });

  router.get('/cards', validate({ query: productCardsQuerySchema }), async (req, res) => {
    const { slugs } = req.validated.query as ProductCardsQuery;
    publicCache(res, 60);
    sendSuccess(res, { data: await catalog.cards(slugs) });
  });

  router.get('/suggestions', validate({ query: suggestionQuerySchema }), async (req, res) => {
    const { q } = req.validated.query as { q: string };
    publicCache(res, 60);
    sendSuccess(res, { data: await catalog.suggestions(q) });
  });

  router.get('/:slug', validate({ params: slugParamSchema }), async (req, res) => {
    const { slug } = req.validated.params as { slug: string };
    publicCache(res, 60);
    sendSuccess(res, { data: await catalog.detail(slug) });
  });

  router.get('/:slug/related', validate({ params: slugParamSchema }), async (req, res) => {
    const { slug } = req.validated.params as { slug: string };
    publicCache(res, 300);
    sendSuccess(res, { data: await catalog.related(slug) });
  });

  return router;
}
