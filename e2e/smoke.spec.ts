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
    data: { company_name: `Smoke E2E ${Date.now()}` },
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

/**
 * Smoke tests: fast checks that every critical page renders without JS errors.
 */
test.describe('Smoke - All Critical Pages', () => {
  test.skip(!canRun, 'Skipping: no credentials');

  let credentials: { email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    credentials = await getDemoCredentials(page);
    await page.close();
  });

  const criticalPages = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/pdv', label: 'PDV' },
    { path: '/produtos', label: 'Produtos' },
    { path: '/vendas', label: 'Vendas' },
    { path: '/clientes', label: 'Clientes' },
    { path: '/financeiro', label: 'Financeiro' },
    { path: '/caixa', label: 'Caixa' },
    { path: '/relatorios', label: 'Relatórios' },
    { path: '/configuracoes', label: 'Configurações' },
    { path: '/fornecedores', label: 'Fornecedores' },
    { path: '/categorias', label: 'Categorias' },
    { path: '/funcionarios', label: 'Funcionários' },
    { path: '/movimentacoes', label: 'Movimentações' },
    { path: '/etiquetas', label: 'Etiquetas' },
    { path: '/orcamentos', label: 'Orçamentos' },
  ];

  for (const { path, label } of criticalPages) {
    test(`${label} (${path}) renders without JS errors`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await login(page, credentials.email, credentials.password);
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      // No unhandled JS errors
      const criticalErrors = jsErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection')
      );
      expect(criticalErrors).toHaveLength(0);

      // Page shell renders
      const hasShell = await page.locator('nav, aside, header, main').first().isVisible().catch(() => false);
      expect(hasShell).toBeTruthy();
    });
  }
});

/**
 * Smoke tests for public pages (no auth required).
 */
test.describe('Smoke - Public Pages', () => {
  const publicPages = [
    { path: '/', label: 'Landing' },
    { path: '/auth', label: 'Auth' },
    { path: '/termos', label: 'Termos' },
    { path: '/privacidade', label: 'Privacidade' },
    { path: '/contrato-saas', label: 'Contrato SaaS' },
    { path: '/instalar', label: 'Instalar' },
    { path: '/emissor-fiscal', label: 'Emissor Landing' },
  ];

  for (const { path, label } of publicPages) {
    test(`${label} (${path}) loads without errors`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const criticalErrors = jsErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
