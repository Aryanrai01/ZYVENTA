import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, paginationQuerySchema } from './pagination.js';

describe('paginationQuerySchema', () => {
  it('applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query strings', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '40' })).toEqual({ page: 3, limit: 40 });
  });

  it('rejects limits above the maximum', () => {
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('rejects non-positive pages', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('buildPaginationMeta', () => {
  it('computes navigation flags', () => {
    expect(buildPaginationMeta(1, 20, 100)).toEqual({
      page: 1,
      limit: 20,
      total: 100,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('handles empty results', () => {
    expect(buildPaginationMeta(1, 20, 0)).toMatchObject({ totalPages: 0, hasNextPage: false });
  });
});
