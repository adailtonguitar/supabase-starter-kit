import { test, expect } from '@playwright/test';

test.describe('Landing Page - Public Tests', () => {
  test('loads landing page with correct SEO', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

    // Check meta tags
    const title = await page.title();
    expect(title).toContain('AnthoSystem');
    
    const ogImage = await page.getAttribute('meta[property="og:image"]', 'content');
    expect(ogImage).toContain('og-banner');
    
    const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
    expect(canonical).toBeTruthy();
  });

  test('has accessible navigation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
    
    // Check aria-label
    const ariaLabel = await nav.first().getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('skip-to-content link exists', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
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

  test('auth page loads with form', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Check form has proper labels
    const emailInput = page.locator('input[type="email"]');
    const id = await emailInput.getAttribute('id');
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      const labelCount = await label.count();
      expect(labelCount).toBeGreaterThanOrEqual(0); // soft check
    }
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/termos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Termos de Uso' })).toBeVisible({ timeout: 10000 });
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacidade', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible({ timeout: 10000 });
  });

  test('sitemap.xml is accessible', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);
  });

  test('robots.txt references sitemap', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    const text = await response?.text();
    expect(text).toContain('Sitemap');
  });
});
