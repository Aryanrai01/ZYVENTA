import express from 'express';
import { mongoose } from '../src/database/mongoose.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { requestLogger } from '../src/middleware/requestLogger.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { validate } from '../src/middleware/validate.js';
import { ApiError } from '../src/utils/ApiError.js';

function appThrowing(error: unknown) {
  const app = express();
  app.use(requestLogger);
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('passes ApiError status, code and message through', async () => {
    const res = await request(appThrowing(ApiError.conflict('Already exists'))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'CONFLICT', message: 'Already exists' });
  });

  it('maps Mongoose CastError to 400 INVALID_ID', async () => {
    const castError = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    const res = await request(appThrowing(castError)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });

  it('maps duplicate-key errors to 409 without leaking the value', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key: a@b.com'), {
      code: 11000,
      keyPattern: { email: 1 },
      keyValue: { email: 'a@b.com' },
    });
    const res = await request(appThrowing(duplicate)).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_KEY');
    expect(JSON.stringify(res.body)).not.toContain('a@b.com');
  });

  it('hides unexpected error details behind a generic 500', async () => {
    const res = await request(appThrowing(new Error('db password is hunter2'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).not.toContain('hunter2');
  });
});

describe('validate middleware', () => {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }),
      query: z.object({ dryRun: z.enum(['true', 'false']).default('false') }),
      body: z.object({ qty: z.number().int().min(1) }).strict(),
    }),
    (req, res) => {
      res.json({ validated: req.validated });
    },
  );
  app.use(errorHandler);

  const validId = 'a'.repeat(24);

  it('stores parsed values on req.validated', async () => {
    const res = await request(app).post(`/items/${validId}`).send({ qty: 2 });
    expect(res.status).toBe(200);
    expect(res.body.validated).toEqual({
      params: { id: validId },
      query: { dryRun: 'false' },
      body: { qty: 2 },
    });
  });

  it('collects every failing field with a dotted path', async () => {
    const res = await request(app).post('/items/nope').send({ qty: 0 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['params.id', 'body.qty']));
  });

  it('rejects unknown body keys (mass-assignment guard)', async () => {
    const res = await request(app).post(`/items/${validId}`).send({ qty: 1, role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('rejects operator-injection payloads through type checks', async () => {
    const res = await request(app)
      .post(`/items/${validId}`)
      .send({ qty: { $gt: 0 } });
    expect(res.status).toBe(400);
  });
});
