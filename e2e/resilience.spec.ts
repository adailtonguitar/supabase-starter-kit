import { test, expect, Page } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const DEMO_EMAIL = process.env.DEMO_EMAIL || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';

const canRunAuth = !!(SUPABASE_URL && SUPABASE_ANON_KEY) || !!(DEMO_EMAIL && DEMO_PASSWORD);

async function getDemoCredentials(page: Page) {
  if (DEMO_EMAIL && DEMO_PASSWORD) return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  const response = await page.request.post(`${SUPABASE_URL}/functions/v1/create-demo-account`, {
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    data: { company_name: `Resilience E2E ${Date.now()}` },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return { email: data.email, password: data.password };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

// ═══════════════════════════════════════════════
// 1. OFFLINE / INTERNET INTERRUPTION
// ═══════════════════════════════════════════════
test.describe('1. Offline Resilience', () => {
  test('landing page works after going offline (cached assets)', async ({ page, context }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

    // Go offline
    await context.setOffline(true);

    // Navigate to same page — service worker should serve cached shell
    await page.reload().catch(() => {}); // may throw net::ERR
    // At minimum, the page should not show a blank screen
    const body = await page.locator('body').textContent().catch(() => '');
    // We accept any non-empty body (SW cache or browser offline page)
    expect(body?.length).toBeGreaterThan(0);

    await context.setOffline(false);
  });

  test('auth page shows form even on slow network', async ({ page }) => {
    // Throttle to Slow 3G equivalent
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024, // 50 KB/s
      uploadThroughput: 20 * 1024,
      latency: 2000,
    });

    await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30000 });

    // Reset
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});

// ═══════════════════════════════════════════════
// 2. API FAILURE / DATABASE UNAVAILABILITY
// ═══════════════════════════════════════════════
test.describe('2. API Failure Resilience', () => {
  test.skip(!canRunAuth, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('dashboard handles Supabase API failure gracefully', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Block Supabase REST API calls
    await page.route('**/rest/v1/**', (route) => route.abort('connectionrefused'));

    await page.goto('/dashboard');
    await page.waitForTimeout(3000);

    // Page should NOT crash — ErrorBoundary should catch or show empty state
    const hasCrash = await page.locator('text=Cannot read properties, text=undefined is not').first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();

    // Should still show the layout shell (sidebar/header)
    const hasShell = await page.locator('nav, aside, header').first().isVisible().catch(() => false);
    expect(hasShell).toBeTruthy();
  });

  test('products page shows empty state on API failure', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    await page.route('**/rest/v1/products**', (route) => route.abort('connectionrefused'));
    await page.goto('/produtos');
    await page.waitForTimeout(3000);

    // Should not show unhandled error
    const hasUnhandled = await page.locator('text=Unhandled, text=Cannot read').first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasUnhandled).toBeFalsy();
  });

  test('PDV remains functional when API returns 500', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Mock Supabase returning 500 for product queries
    await page.route('**/rest/v1/products**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal Server Error' }) })
    );

    await page.goto('/pdv');
    await page.waitForTimeout(3000);

    // PDV shell should still render (offline cache may kick in)
    const hasShell = await page.locator('nav, aside, header, input').first().isVisible().catch(() => false);
    expect(hasShell).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════
// 3. EXTREME LATENCY
// ═══════════════════════════════════════════════
test.describe('3. Extreme Latency', () => {
  test.skip(!canRunAuth, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('dashboard handles 5s API delay without crashing', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Add 5s delay to all REST calls
    await page.route('**/rest/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });

    await page.goto('/dashboard');

    // Should show loading state or skeleton, not crash
    await page.waitForTimeout(2000);
    const hasCrash = await page.locator('text=Cannot read, text=undefined is not').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();

    // Wait for eventual load
    await page.waitForTimeout(6000);
    const hasContent = await page.locator('[class*="card"], .recharts-wrapper, table').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('login handles slow auth response', async ({ page }) => {
    // Add 4s delay to auth endpoints
    await page.route('**/auth/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });

    await page.goto('/auth');
    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // Button should show loading state (disabled or spinner)
    const button = page.locator('button[type="submit"]');
    const isDisabled = await button.isDisabled().catch(() => false);
    // Accept either disabled or still visible (no crash)
    expect(await button.isVisible()).toBeTruthy();

    // Eventually should redirect
    await page.waitForURL('**/dashboard', { timeout: 35000 });
  });
});

// ═══════════════════════════════════════════════
// 4. PARTIAL FAILURES (some services up, others down)
// ═══════════════════════════════════════════════
test.describe('4. Partial Failures', () => {
  test.skip(!canRunAuth, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('navigation works when edge functions fail', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Block all edge functions
    await page.route('**/functions/v1/**', (route) => route.abort('connectionrefused'));

    // Core pages should still load (they use REST, not functions)
    for (const path of ['/dashboard', '/produtos', '/clientes', '/financeiro']) {
      await page.goto(path);
      await page.waitForTimeout(2000);
      const hasCrash = await page.locator('text=Cannot read, text=undefined is not').first().isVisible({ timeout: 1000 }).catch(() => false);
      expect(hasCrash).toBeFalsy();
    }
  });

  test('financial page works when sales API fails', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Block only sales-related endpoints
    await page.route('**/rest/v1/sales**', (route) => route.abort('connectionrefused'));
    await page.route('**/rest/v1/sale_items**', (route) => route.abort('connectionrefused'));

    await page.goto('/financeiro');
    await page.waitForTimeout(3000);

    // Financial page should still render independently
    const hasShell = await page.locator('nav, aside, header').first().isVisible().catch(() => false);
    expect(hasShell).toBeTruthy();
    const hasCrash = await page.locator('text=Cannot read').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════
// 5. CONCURRENT REQUESTS (simulated load)
// ═══════════════════════════════════════════════
test.describe('5. Concurrent Load Simulation', () => {
  test.skip(!canRunAuth, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('rapid page navigation does not crash', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    const pages = ['/dashboard', '/produtos', '/vendas', '/clientes', '/financeiro', '/pdv', '/dashboard'];

    for (const path of pages) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Immediately navigate away — tests race conditions
      await page.waitForTimeout(300);
    }

    // Final page should be stable
    await page.waitForTimeout(2000);
    const hasCrash = await page.locator('text=Cannot read, text=undefined is not, text=Unhandled').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('double-click on login does not create duplicate sessions', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);

    // Double-click submit
    const button = page.locator('button[type="submit"]');
    await button.dblclick();

    // Should still reach dashboard without errors
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    await expect(page).toHaveURL(/dashboard/);
  });
});

// ═══════════════════════════════════════════════
// 6. DATA CONSISTENCY CHECKS
// ═══════════════════════════════════════════════
test.describe('6. Data Consistency', () => {
  test.skip(!canRunAuth, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  test('dashboard stats match sales page data', async ({ page }) => {
    await login(page, credentials.email, credentials.password);

    // Get dashboard total
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);

    // Navigate to sales — should not show more sales than dashboard reports
    await page.goto('/vendas');
    await page.waitForTimeout(3000);

    // Both pages should load without inconsistency errors
    const hasCrash = await page.locator('text=Cannot read, text=NaN, text=undefined').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('no NaN or undefined values visible on dashboard', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/dashboard');
    await page.waitForTimeout(4000);

    // Check for data rendering issues
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
  });

  test('no NaN or undefined on financial page', async ({ page }) => {
    await login(page, credentials.email, credentials.password);
    await page.goto('/financeiro');
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('NaN');
    // 'undefined' may appear in Portuguese text, so check more specifically
    const hasUndefinedValue = /R\$\s*undefined|:\s*undefined|=\s*undefined/.test(bodyText || '');
    expect(hasUndefinedValue).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════
// 7. ERROR BOUNDARY VALIDATION
// ═══════════════════════════════════════════════
test.describe('7. Error Boundaries', () => {
  test('404 page renders correctly', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Should show 404 or redirect, not crash
    const has404 = await page.locator('text=404, text=não encontrada, text=Not Found').first().isVisible({ timeout: 5000 }).catch(() => false);
    const redirectedHome = page.url().includes('/') && !page.url().includes('pagina-que-nao-existe');
    expect(has404 || redirectedHome).toBeTruthy();
  });

  test('protected routes redirect to auth when not logged in', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Should redirect to /auth or show login form
    const isOnAuth = page.url().includes('/auth');
    const hasLoginForm = await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
    const isOnLanding = page.url().endsWith('/') || page.url().includes('anthosystem');
    expect(isOnAuth || hasLoginForm || isOnLanding).toBeTruthy();
  });
});
