import { test, expect } from '@playwright/test';

test.describe('Landing Page - Public Tests', () => {
  test('loads landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
  });

  test('has navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });

  test('has CTA buttons', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const ctaButtons = page.locator('a[href*="auth"], a[href*="demo"], button:has-text("Começar"), button:has-text("Testar"), button:has-text("Demo"), button:has-text("Experimentar"), button:has-text("Criar"), a:has-text("Começar"), a:has-text("Cadastr")');
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('pricing section exists', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.locator('#planos').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);
    const hasPricing = await page.getByText('Starter').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasPricing).toBeTruthy();
  });

  test('auth page loads', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/termos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Termos de Uso' })).toBeVisible({ timeout: 10000 });
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacidade', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible({ timeout: 10000 });
  });
});
