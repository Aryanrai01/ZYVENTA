import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { Router, type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { registerAuthDocs } from '../modules/auth/auth.docs.js';
import { registerHealthDocs } from '../modules/health/health.docs.js';
import { registerCatalogDocs } from '../modules/products/catalog.docs.js';
import { registerShopperDocs } from '../modules/users/shopper.docs.js';
import { registerCommerceDocs } from './commerce.docs.js';
import { errorEnvelope } from './schemas.js';

/**
 * OpenAPI 3.1 document generated from the same zod schemas the routes validate with, so the
 * docs cannot drift from the implementation. Each module contributes a `register*Docs` fn.
 */
export function buildOpenApiDocument(version: string) {
  const registry = new OpenAPIRegistry();
  registry.register('ErrorResponse', errorEnvelope);

  registerHealthDocs(registry);
  registerAuthDocs(registry);
  registerCatalogDocs(registry);
  registerShopperDocs(registry);
  registerCommerceDocs(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ZYVENTA API',
      version,
      description:
        'REST API for the ZYVENTA multi-vendor marketplace. Authentication uses HttpOnly cookies; ' +
        'state-changing requests require the X-CSRF-Token header (from Phase 4).',
    },
    servers: [{ url: '/api/v1' }],
  });
}

/** Swagger UI needs inline styles/images; relax the API's `default-src 'none'` for docs only. */
const docsCsp: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'",
  );
  next();
};

export function createDocsRouter(version: string): Router {
  const document = buildOpenApiDocument(version);
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/',
    docsCsp,
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'ZYVENTA API' }),
  );
  return router;
}
