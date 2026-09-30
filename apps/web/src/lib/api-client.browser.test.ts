// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, onSessionExpired } from './api-client';

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ok = (data: unknown = null) => ({
  status: 200,
  body: { success: true, message: 'OK', data },
});
const fail = (status: number, code: string) => ({
  status,
  body: { success: false, message: code, code },
});

function setCookie(value: string) {
  document.cookie = value;
}

function clearCookies() {
  for (const name of ['zv_csrf', 'zv_session']) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function mockApi(handler: Handler) {
  const calls: { path: string; method: string; csrf: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit) => {
      const path = new URL(input).pathname.replace('/api/v1', '');
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({ path, method: init.method ?? 'GET', csrf: headers['X-CSRF-Token'] ?? null });
      const { status, body } = handler(path, init);
      return Promise.resolve(json(status, body));
    }),
  );
  return calls;
}

beforeEach(() => {
  clearCookies();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api-client in the browser', () => {
  it('bootstraps the CSRF cookie before the first write and sends it as a header', async () => {
    const calls = mockApi((path) => {
      if (path === '/auth/csrf') {
        setCookie('zv_csrf=token-123; path=/');
        return ok({ csrfToken: 'token-123' });
      }
      return ok();
    });

    await apiClient.post('/cart/items', { qty: 1 });
    expect(calls.map((c) => c.path)).toEqual(['/auth/csrf', '/cart/items']);
    expect(calls[1]?.csrf).toBe('token-123');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    setCookie('zv_csrf=t; path=/');
    setCookie('zv_session=1; path=/');
    let refreshed = false;
    const calls = mockApi((path) => {
      if (path === '/auth/refresh') {
        refreshed = true;
        return ok({ accessTokenExpiresIn: 900 });
      }
      return refreshed ? ok({ id: 'u1' }) : fail(401, 'TOKEN_EXPIRED');
    });

    const { data } = await apiClient.get<{ id: string }>('/auth/me');
    expect(data.id).toBe('u1');
    expect(calls.map((c) => c.path)).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
  });

  it('shares one refresh between concurrent 401s (single-flight)', async () => {
    setCookie('zv_csrf=t; path=/');
    setCookie('zv_session=1; path=/');
    let refreshed = false;
    const calls = mockApi((path) => {
      if (path === '/auth/refresh') {
        refreshed = true;
        return ok();
      }
      return refreshed ? ok(path) : fail(401, 'UNAUTHENTICATED');
    });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('notifies listeners and surfaces the error when refresh fails', async () => {
    setCookie('zv_csrf=t; path=/');
    setCookie('zv_session=1; path=/');
    mockApi((path) =>
      path === '/auth/refresh' ? fail(401, 'TOKEN_INVALID') : fail(401, 'TOKEN_EXPIRED'),
    );
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('does not attempt a refresh for anonymous visitors', async () => {
    const calls = mockApi(() => fail(401, 'UNAUTHENTICATED'));
    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(calls.map((c) => c.path)).toEqual(['/auth/me']);
  });

  it('never refreshes for requests that opt out (login)', async () => {
    setCookie('zv_csrf=t; path=/');
    setCookie('zv_session=1; path=/');
    const calls = mockApi(() => fail(401, 'INVALID_CREDENTIALS'));
    await expect(
      apiClient.post('/auth/login', { email: 'a@b.co', password: 'x' }, { skipAuthRefresh: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(calls).toHaveLength(1);
  });

  it('re-fetches the CSRF token and retries once when it was rejected', async () => {
    setCookie('zv_csrf=stale; path=/');
    let attempts = 0;
    const calls = mockApi((path) => {
      if (path === '/auth/csrf') {
        setCookie('zv_csrf=fresh; path=/');
        return ok({ csrfToken: 'fresh' });
      }
      attempts += 1;
      return attempts === 1 ? fail(403, 'CSRF_INVALID') : ok();
    });

    await apiClient.post('/wishlist', { productId: 'p' });
    expect(calls.map((c) => [c.path, c.csrf])).toEqual([
      ['/wishlist', 'stale'],
      ['/auth/csrf', null],
      ['/wishlist', 'fresh'],
    ]);
  });
});
