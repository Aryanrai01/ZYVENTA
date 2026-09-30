import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps internal paths with query and hash', () => {
    expect(safeRedirectPath('/account/orders?page=2#top')).toBe('/account/orders?page=2#top');
  });

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    'account',
    '/\u0000evil',
  ])('rejects %s', (target) => {
    expect(safeRedirectPath(target, '/fallback')).toBe('/fallback');
  });

  it('falls back when empty', () => {
    expect(safeRedirectPath(null)).toBe('/');
  });
});
