import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('apiBaseUrl', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com/api/v1'],
    ['https://api.example.com/api/v1', 'https://api.example.com/api/v1'],
    ['https://api.example.com/api/v1/', 'https://api.example.com/api/v1'],
  ])('normalizes %s to %s', async (configuredUrl, expectedUrl) => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', configuredUrl);
    vi.stubEnv('API_INTERNAL_URL', '');
    vi.resetModules();

    const { apiBaseUrl } = await import('./env');

    expect(apiBaseUrl()).toBe(expectedUrl);
  });
});