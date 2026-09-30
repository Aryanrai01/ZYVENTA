import type { RequestHandler } from 'express';

/** Personal data must never be stored by browsers' shared caches or CDNs. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
