import { test, expect, Page } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const canRun = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Cross-tenant isolation tests.
 *
 * Creates two demo accounts (each in its own company), then verifies that
 * User A cannot access Company B's data through Edge Functions.
 */
test.describe('Cross-Tenant Isolation', () => {
  test.skip(!canRun, 'Skipping: no SUPABASE_URL / ANON_KEY');

  let userA: { email: string; password: string; company_id?: string };
  let userB: { email: string; password: string; company_id?: string };
  let tokenA: string;

  async function createDemoAccount(page: Page, suffix: string) {
    const response = await page.request.post(`${SUPABASE_URL}/functions/v1/create-demo-account`, {
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      data: { company_name: `Tenant-${suffix}-${Date.now()}` },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async function getAuthToken(page: Page, email: string, password: string): Promise<{ token: string; companyId: string }> {
    // Login via Supabase REST API
    const response = await page.request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      data: { email, password },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const token = data.access_token;
    expect(token).toBeTruthy();

    // Get user's company_id
    const companyRes = await page.request.get(
      `${SUPABASE_URL}/rest/v1/company_users?user_id=eq.${data.user.id}&select=company_id&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    expect(companyRes.ok()).toBeTruthy();
    const companies = await companyRes.json();
    expect(companies.length).toBeGreaterThan(0);

    return { token, companyId: companies[0].company_id };
  }

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // Create two separate demo accounts
    userA = await createDemoAccount(page, 'A');
    userB = await createDemoAccount(page, 'B');

    // Get auth token and company_id for User A
    const authA = await getAuthToken(page, userA.email, userA.password);
    tokenA = authA.token;
    userA.company_id = authA.companyId;

    // Get company_id for User B
    const authB = await getAuthToken(page, userB.email, userB.password);
    userB.company_id = authB.companyId;

    await page.close();
  });

  async function callFunction(page: Page, fnName: string, body: Record<string, unknown>) {
    return page.request.post(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${tokenA}`,
      },
      data: body,
    });
  }

  test('User A cannot access Company B data via generate-ai-report', async ({ page }) => {
    const res = await callFunction(page, 'generate-ai-report', {
      company_id: userB.company_id,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('negado');
  });

  test('User A cannot access Company B data via diagnostico-financeiro', async ({ page }) => {
    const res = await callFunction(page, 'diagnostico-financeiro', {
      mes_referencia: '2025-06',
      company_id: userB.company_id,
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('negado');
  });

  test('User A cannot export Company B backup', async ({ page }) => {
    const res = await callFunction(page, 'export-backup', {
      company_id: userB.company_id,
    });
    // Should be 403 (forbidden) - not super_admin
    expect([403, 401]).toContain(res.status());
    await res.text(); // consume body
  });

  test('User A cannot create users in Company B', async ({ page }) => {
    const res = await callFunction(page, 'create-company-user', {
      email: `fake-${Date.now()}@test.com`,
      password: 'Test123456',
      full_name: 'Hacker',
      role: 'admin',
      company_id: userB.company_id,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('administradores');
  });

  test('RLS blocks direct table access to Company B products', async ({ page }) => {
    // Try to read products from Company B via REST API (RLS should block)
    const res = await page.request.get(
      `${SUPABASE_URL}/rest/v1/products?company_id=eq.${userB.company_id}&select=id,name&limit=5`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const products = await res.json();
    // RLS should return empty array — User A has no access to Company B
    expect(products).toHaveLength(0);
  });

  test('RLS blocks direct table access to Company B sales', async ({ page }) => {
    const res = await page.request.get(
      `${SUPABASE_URL}/rest/v1/sales?company_id=eq.${userB.company_id}&select=id,total&limit=5`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const sales = await res.json();
    expect(sales).toHaveLength(0);
  });

  test('RLS blocks direct table access to Company B clients', async ({ page }) => {
    const res = await page.request.get(
      `${SUPABASE_URL}/rest/v1/clients?company_id=eq.${userB.company_id}&select=id,name&limit=5`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const clients = await res.json();
    expect(clients).toHaveLength(0);
  });

  test('RLS blocks direct table access to Company B financial_entries', async ({ page }) => {
    const res = await page.request.get(
      `${SUPABASE_URL}/rest/v1/financial_entries?company_id=eq.${userB.company_id}&select=id,amount&limit=5`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${tokenA}`,
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const entries = await res.json();
    expect(entries).toHaveLength(0);
  });
});
