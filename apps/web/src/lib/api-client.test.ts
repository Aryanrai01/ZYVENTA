import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiClient, buildUrl } from './api-client';

function mockFetch(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUrl', () => {
  it('joins the base URL and drops empty query values', () => {
    expect(buildUrl('/products', { page: 2, q: '', brand: undefined, tags: ['a', 'b'] })).toBe(
      'http://localhost:4000/api/v1/products?page=2&tags=a%2Cb',
    );
  });
});

describe('apiClient', () => {
  it('unwraps the success envelope and sends credentials', async () => {
    const fetchMock = mockFetch(200, {
      success: true,
      message: 'OK',
      data: { id: 1 },
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const result = await apiClient.get<{ id: number }>('/things');
    expect(result.data).toEqual({ id: 1 });
    expect(result.pagination?.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/things',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('throws ApiClientError with code and field errors on failure', async () => {
    mockFetch(400, {
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: [{ path: 'body.qty', message: 'Too small' }],
      requestId: 'req-12345678',
    });

    const error = await apiClient.post('/cart/items', { qty: 0 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'req-12345678',
      isClientError: true,
    });
  });

  it('serialises JSON bodies', async () => {
    const fetchMock = mockFetch(201, { success: true, message: 'Created', data: null });
    await apiClient.post('/things', { name: 'x' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"name":"x"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('rejects non-envelope responses', async () => {
    mockFetch(502, { hello: 'proxy page' });
    await expect(apiClient.get('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
