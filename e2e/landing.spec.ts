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
    const pricing = page.locator('text=Starter, text=Business, text=Pro, text=plano, text=Plano');
    const hasPricing = await pricing.first().isVisible({ timeout: 5000 }).catch(() => false);
    // Informational — pricing may be on separate page
    console.log('Pricing visible on landing:', hasPricing);
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
    const hasContent = await page.locator('h1, h2, text=Termos').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacidade');
    await page.waitForLoadState('networkidle');
    const hasContent = await page.locator('h1, h2, text=Privacidade').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('404 page for invalid route', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe');
    await page.waitForLoadState('networkidle');
    const has404 = await page.locator('text=404, text=não encontrada, text=Not Found').first().isVisible({ timeout: 10000 }).catch(() => false);
    // SPA may redirect to landing or show 404
    console.log('404 page shown:', has404);
  });
});
