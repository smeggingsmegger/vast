import { test, expect } from '@playwright/test';

test.describe('Vast smoke', () => {
  test('health endpoint is ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('meta endpoint returns vast identity', async ({ request }) => {
    const res = await request.get('/api/v1/meta');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.name).toBe('vast');
    expect(body.runtime).toBeTruthy();
  });

  test('home page shows connections UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add connection/i }).first()).toBeVisible();
  });

  test('can open add connection form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Add (your first )?connection/i }).first().click();
    await expect(page.getByText('New connection')).toBeVisible();
    await expect(page.getByPlaceholder(/mongodb:\/\//i)).toBeVisible();
  });

  test('settings page shows runtime info', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Runtime', exact: true })).toBeVisible();
  });
});
