import { Router } from 'express';
import type { ReadinessReport } from '@zyventa/shared';
import { sendSuccess } from '../../utils/apiResponse.js';

export interface HealthDependencies {
  version: string;
  isDatabaseUp: () => boolean;
}

/**
 * - `GET /health/live`  — liveness: the process is running (container restarts if this fails).
 * - `GET /health/ready` — readiness: MongoDB reachable (load balancer stops routing on 503).
 */
export function createHealthRouter(deps: HealthDependencies): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, { message: 'Alive', data: { status: 'ok' as const } });
  });

  router.get('/ready', (_req, res) => {
    const mongodb = deps.isDatabaseUp();
    const report: ReadinessReport = {
      status: mongodb ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      version: deps.version,
      checks: { mongodb: mongodb ? 'up' : 'down' },
    };
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, {
      statusCode: report.status === 'ok' ? 200 : 503,
      message: report.status === 'ok' ? 'Ready' : 'Dependencies unavailable',
      data: report,
    });
  });

  return router;
}
