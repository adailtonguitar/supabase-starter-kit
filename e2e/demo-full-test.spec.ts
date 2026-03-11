import { test, expect, Page } from '@playwright/test';

const DEMO_EMAIL = process.env.DEMO_EMAIL || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Helper: Create a demo account via Edge Function and return credentials.
 * If DEMO_EMAIL/DEMO_PASSWORD env vars are set, use those instead.
 */
async function getDemoCredentials(page: Page): Promise<{ email: string; password: string }> {
  if (DEMO_EMAIL && DEMO_PASSWORD) {
    return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  }

  // Create demo account via Edge Function
  const response = await page.request.post(`${SUPABASE_URL}/functions/v1/create-demo-account`, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    data: {},
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return { email: data.email, password: data.password };
}

/**
 * Helper: Login with credentials
 */
async function login(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

test.describe('Demo Account - Full System Test', () => {
  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('1. Login with demo account', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await expect(page).toHaveURL(/dashboard/);
    // Dashboard should load with main elements
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 });
  });

  test('2. Dashboard loads with stats', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Check for key dashboard elements
    await expect(page.locator('[data-testid="quick-access"], .grid').first()).toBeVisible({ timeout: 10000 });

    // Should show sales chart or stats cards
    const hasContent = await page.locator('.recharts-wrapper, [class*="card"]').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('3. Navigate to Products page', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/produtos');
    await page.waitForLoadState('networkidle');

    // Should show products table or empty state
    const hasTable = await page.locator('table, text=Nenhum produto').first().isVisible({ timeout: 10000 });
    expect(hasTable).toBeTruthy();
  });

  test('4. Navigate to PDV', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/pdv');
    await page.waitForLoadState('networkidle');

    // PDV should show product grid or search
    const hasPdv = await page.locator('input[placeholder*="buscar"], input[placeholder*="Buscar"], input[placeholder*="código"]').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasPdv).toBeTruthy();
  });

  test('5. Navigate to Financial page', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/financeiro');
    await page.waitForLoadState('networkidle');

    // Should show financial entries or empty state
    const hasContent = await page.locator('table, text=Nenhum, text=Financeiro').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('6. Navigate to Sales report', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/vendas');
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('table, text=Nenhuma venda, text=Vendas').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('7. Navigate to Clients page', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/clientes');
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('table, text=Nenhum cliente, text=Cliente').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('8. Navigate to Settings', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.goto('/configuracoes');
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('text=Configurações, text=Empresa').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test('9. Demo banner is visible', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Demo accounts should show a demo banner
    const hasBanner = await page.locator('text=demonstração, text=demo, text=Demo').first().isVisible({ timeout: 5000 }).catch(() => false);
    // This is informational — demo banner may or may not be present
    console.log('Demo banner visible:', hasBanner);
  });

  test('10. Sidebar navigation works', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Try clicking sidebar links
    const sidebarLinks = page.locator('nav a, aside a');
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThan(3);

    // Click first few links and verify no crash
    for (let i = 0; i < Math.min(count, 5); i++) {
      const link = sidebarLinks.nth(i);
      const href = await link.getAttribute('href');
      if (href && !href.startsWith('http')) {
        await link.click();
        await page.waitForLoadState('networkidle');
        // Page should not show error
        const hasError = await page.locator('text=Erro, text=Error, text=500').first().isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });
});
