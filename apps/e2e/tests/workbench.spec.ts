import { test, expect } from '@playwright/test';

/**
 * Full workbench journey against real Mongo when MONGO_URI is available to the server.
 */
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27027';

test.describe('Workbench journey', () => {
  test('connect → create db/col → insert → edit', async ({ page, request }) => {
    test.setTimeout(90_000);

    const probe = await request.post('/api/v1/connections/test', {
      data: { uri: MONGO_URI },
    });
    const probeBody = await probe.json();
    test.skip(!probeBody?.data?.ok, `Mongo not available at ${MONGO_URI}`);

    const suffix = Date.now();
    const connName = `E2E ${suffix}`;
    const dbName = `vast_e2e_${suffix}`;
    const colName = 'docs';

    // Clean previous e2e connections via API
    const existing = await request.get('/api/v1/connections');
    const list = ((await existing.json()).data ?? []) as { id: string; name: string }[];
    for (const c of list) {
      if (c.name.startsWith('E2E')) {
        await request.delete(`/api/v1/connections/${c.id}`);
      }
    }

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Add (your first )?connection/i }).first().click();
    await page.getByPlaceholder('Production').fill(connName);
    await page.getByPlaceholder(/mongodb:\/\//i).fill(MONGO_URI);
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(page.getByRole('heading', { name: connName })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page).toHaveURL(/\/c\/[a-f0-9-]+/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: connName, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New database', exact: true })).toBeEnabled({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'New database', exact: true }).click();
    await page.getByPlaceholder('my_app').fill(dbName);
    await page.getByRole('dialog', { name: 'Create database' }).getByRole('button', { name: 'Create' }).click();
    // Accessible name includes size suffix e.g. "mydb40.0 KB"
    await expect(page.getByRole('button', { name: new RegExp(`^${dbName}`) })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: new RegExp(`^${dbName}`) }).click();
    await expect(page.getByRole('heading', { name: dbName, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'New collection' }).click();
    await page.getByPlaceholder('users').fill(colName);
    await page.getByRole('dialog', { name: 'Create collection' }).getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${colName}`) })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: new RegExp(`^${colName}`) }).click();
    await expect(page.getByRole('heading', { name: colName, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Insert' }).click();
    // Dialog textarea for insert
    const dialog = page.getByRole('dialog', { name: 'Insert document' });
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea').fill(
      JSON.stringify({ name: 'e2e-user', age: 42, active: true }, null, 2),
    );
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(page.getByText('e2e-user').first()).toBeVisible({ timeout: 15_000 });

    await page.getByText('e2e-user').first().click();
    const editor = page.getByLabel('Document JSON');
    await expect(editor).toBeVisible();
    const raw = await editor.inputValue();
    const doc = JSON.parse(raw) as { age: number };
    doc.age = 43;
    await editor.fill(JSON.stringify(doc, null, 2));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Document saved').or(page.getByText('43').first())).toBeVisible({
      timeout: 15_000,
    });

    // Cleanup DB via API
    const connections = await request.get('/api/v1/connections');
    const after = ((await connections.json()).data ?? []) as { id: string; name: string }[];
    const conn = after.find((c) => c.name === connName);
    if (conn) {
      await request.post(`/api/v1/connections/${conn.id}/connect`);
      await request.delete(`/api/v1/c/${conn.id}/databases/${dbName}`, {
        data: { confirmName: dbName },
      });
      await request.delete(`/api/v1/connections/${conn.id}`);
    }
  });
});
