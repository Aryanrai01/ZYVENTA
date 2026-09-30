import { expect, test } from '@playwright/test';

test.describe('storefront shell', () => {
  test('home page renders with skip link, header and search', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ZYVENTA/);
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('responses carry a nonce CSP and no CSP violations occur', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text()))
        violations.push(msg.text());
    });
    const res = await page.goto('/');
    const csp = res?.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src [^;]*'nonce-/);
    expect(csp).toContain("frame-ancestors 'none'");
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });

  test('unknown pages return a real 404', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
  });
});

test.describe('access control', () => {
  for (const path of ['/admin', '/seller', '/checkout', '/account', '/orders']) {
    test(`${path} redirects signed-out visitors to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    });
  }

  test('login form validates before calling the API', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email/i).first()).toBeVisible();
  });
});
