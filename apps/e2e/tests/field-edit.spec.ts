import { test, expect } from '@playwright/test';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27027';

test.describe('Field edit', () => {
  test('edit a single field via Fields panel', async ({ page, request }) => {
    test.setTimeout(90_000);
    const probe = await request.post('/api/v1/connections/test', {
      data: { uri: MONGO_URI },
    });
    test.skip(!(await probe.json())?.data?.ok, `Mongo not available at ${MONGO_URI}`);

    const suffix = Date.now();
    const connName = `FieldEdit ${suffix}`;
    const dbName = `vast_fe_${suffix}`;
    const colName = 'items';

    // API seed
    const created = await request.post('/api/v1/connections', {
      data: { name: connName, uri: MONGO_URI, color: 'teal', readOnly: false },
    });
    const cid = (await created.json()).data.id as string;
    await request.post(`/api/v1/connections/${cid}/connect`);
    await request.post(`/api/v1/c/${cid}/databases`, { data: { name: dbName } });
    await request.post(`/api/v1/c/${cid}/db/${dbName}/collections`, {
      data: { name: colName },
    });
    await request.post(`/api/v1/c/${cid}/db/${dbName}/col/${colName}/documents`, {
      data: { document: { title: 'before', n: 1 } },
    });

    await page.goto(`/c/${cid}/db/${encodeURIComponent(dbName)}/col/${encodeURIComponent(colName)}`);
    await expect(page.getByRole('heading', { name: colName, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Select document
    await page.getByText('before').first().click();
    await expect(page.getByRole('button', { name: /Edit title/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Edit title/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit field' });
    await expect(dialog).toBeVisible();
    await dialog.locator('input').last().fill('after-edit');
    await dialog.getByRole('button', { name: 'Save field' }).click();
    await expect(page.getByText('after-edit').first()).toBeVisible({ timeout: 15_000 });

    // Cleanup
    await request.delete(`/api/v1/c/${cid}/databases/${dbName}`, {
      data: { confirmName: dbName },
    });
    await request.delete(`/api/v1/connections/${cid}`);
  });
});
