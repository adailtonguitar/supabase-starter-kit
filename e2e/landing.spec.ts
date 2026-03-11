import { test, expect } from '@playwright/test';

test.describe('Landing Page - Public Tests', () => {
  test('loads landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    await page.waitForLoadState('networkidle');

    // Should have hero section
    const hasHero = await page.locator('h1').first().isVisible({ timeout: 10000 });
    expect(hasHero).toBeTruthy();
  });

  test('has navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });

  test('has CTA buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const ctaButtons = page.locator('a[href*="auth"], a[href*="demo"], button:has-text("Começar"), button:has-text("Testar"), button:has-text("Demo"), button:has-text("Experimentar"), button:has-text("Criar"), a:has-text("Começar"), a:has-text("Cadastr")');
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('pricing section exists', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Scroll to pricing section to trigger lazy loading
    await page.locator('#planos').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);
    const hasPricing = await page.getByText('Starter').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasPricing).toBeTruthy();
  });

  test('auth page loads', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/termos');
    await page.waitForLoadState('networkidle');
    const hasContent = await page.getByRole('heading', { name: 'Termos de Uso' }).isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacidade');
    await page.waitForLoadState('networkidle');
    const hasContent = await page.getByRole('heading', { name: 'Política de Privacidade' }).isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('404 page for invalid route', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('404')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Página não encontrada')).toBeVisible();
  });
});
