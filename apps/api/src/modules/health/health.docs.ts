import { z } from 'zod';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { successEnvelope } from '../../docs/schemas.js';

const liveSchema = successEnvelope(z.object({ status: z.literal('ok') }));

const readySchema = successEnvelope(
  z.object({
    status: z.enum(['ok', 'degraded']),
    uptimeSeconds: z.number().int(),
    version: z.string(),
    checks: z.object({
      mongodb: z.enum(['up', 'down']),
    }),
  }),
);

export function registerHealthDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/health/live',
    tags: ['Health'],
    summary: 'Liveness probe',
    responses: {
      200: {
        description: 'Process is running',
        content: { 'application/json': { schema: liveSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    tags: ['Health'],
    summary: 'Readiness probe (MongoDB)',
    responses: {
      200: {
        description: 'All dependencies reachable',
        content: { 'application/json': { schema: readySchema } },
      },
      503: {
        description: 'A dependency is down',
        content: { 'application/json': { schema: readySchema } },
      },
    },
  });
}
