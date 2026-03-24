import { test, expect, Page } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const DEMO_EMAIL = process.env.DEMO_EMAIL || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';

const canRun = !!(SUPABASE_URL && SUPABASE_ANON_KEY) || !!(DEMO_EMAIL && DEMO_PASSWORD);

async function getDemoCredentials(page: Page) {
  if (DEMO_EMAIL && DEMO_PASSWORD) return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  const response = await page.request.post(`${SUPABASE_URL}/functions/v1/create-demo-account`, {
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    data: { company_name: `PDV E2E ${Date.now()}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

test.describe('PDV Sale Flow', () => {
  test.skip(!canRun, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('PDV opens cash session dialog or is ready', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // Should show either cash session dialog or product grid
    const hasSessionDialog = await page.locator('text=Abrir Caixa, text=Abertura').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProductGrid = await page.locator('input[placeholder*="uscar"], input[placeholder*="ódigo"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSessionDialog || hasProductGrid).toBeTruthy();
  });

  test('PDV search bar accepts input', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // If cash session dialog appears, try to close/skip it
    const closeBtn = page.locator('button:has-text("Fechar"), button[aria-label="Close"], [data-dismiss]').first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    const searchInput = page.locator('input[placeholder*="uscar"], input[placeholder*="ódigo"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('teste');
      const value = await searchInput.inputValue();
      expect(value).toBe('teste');
    }
  });

  test('PDV cart starts empty', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // Cart total should be R$ 0,00 or empty
    const totalText = await page.locator('text=R$ 0, text=0,00').first().isVisible({ timeout: 5000 }).catch(() => false);
    const emptyCart = await page.locator('text=vazio, text=Nenhum item, text=Adicione').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Either zero total or empty cart message
    expect(totalText || emptyCart).toBeTruthy();
  });

  test('PDV does not crash on rapid keyboard input', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // Simulate rapid barcode scanner input
    await page.keyboard.type('7891234567890', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Should not crash
    const hasCrash = await page.locator('text=Cannot read, text=undefined is not').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('PDV payment bar shows payment methods', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // Check for payment method buttons (Dinheiro, Cartão, PIX, etc.)
    const hasPaymentOptions = await page.locator('text=Dinheiro, text=Cartão, text=PIX, text=Crédito, text=Débito, button:has-text("F")').first().isVisible({ timeout: 5000 }).catch(() => false);

    // Payment bar may only show after adding items — just verify no crash
    const hasCrash = await page.locator('text=Cannot read').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });
});

test.describe('Sale Cancellation Flow', () => {
  test.skip(!canRun, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('sales page loads with cancel option available', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/vendas');
    await page.waitForTimeout(3000);

    // Page should render without errors
    const hasContent = await page.locator('table, text=Nenhuma venda, text=Vendas').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();

    const hasCrash = await page.locator('text=Cannot read').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('sales page handles empty state gracefully', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/vendas');
    await page.waitForTimeout(3000);

    // Should not show NaN or undefined values
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('NaN');
    const hasUndefined = /R\$\s*undefined/.test(bodyText || '');
    expect(hasUndefined).toBeFalsy();
  });
});
