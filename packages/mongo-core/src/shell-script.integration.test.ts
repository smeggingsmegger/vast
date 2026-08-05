import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { runShellScript } from './shell-script.js';

const URI = process.env.VAST_TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27027';

describe('runShellScript integration', () => {
  let client: MongoClient;
  let db: Db;
  let available = false;

  beforeAll(async () => {
    client = new MongoClient(URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
      db = client.db('vast_shell_it');
      await db.dropDatabase();
      await db.collection('accounts').insertMany([
        { name: 'Parlor Production', env: 'prod' },
        { name: 'other', env: 'dev' },
      ]);
      await db.collection('invoices').createIndex({ creation_idempotency_key: 1 });
      const parlor = await db.collection('accounts').findOne({ name: /parlor/i });
      await db.collection('quickbooks_connections').insertOne({
        account_id: parlor!._id,
        company_name: 'Parlor LLC',
        realm_id: '123',
      });
      available = true;
    } catch {
      available = false;
    }
  }, 15_000);

  afterAll(async () => {
    if (available) {
      await db.dropDatabase().catch(() => undefined);
      await client.close().catch(() => undefined);
    }
  });

  it('runs multi-statement mongosh-style script with regex + chained filter', async ({ skip }) => {
    if (!available) skip();

    const script = `
// Phase 0
db.invoices.getIndexes().filter(ix => JSON.stringify(ix.key).includes("creation_idempotency_key"))

// Phase 1 — native /regex/ must work (vm cross-realm)
const accts = db.accounts.find({ name: /parlor/i }, { name: 1 }).toArray();
accts

// Phase 2 — EJSON _id from prior result usable in $in
db.quickbooks_connections.find(
  { account_id: { $in: accts.map(a => a._id) } },
  { company_name: 1, realm_id: 1, account_id: 1 }
).toArray()
`;

    const { results, executionMs } = await runShellScript(db, script, { maxDocs: 100 });
    expect(executionMs).toBeGreaterThanOrEqual(0);
    expect(results.some((r) => r.error)).toBe(false);

    const indexes = results[0]!.value as unknown[];
    expect(indexes.length).toBe(1);
    expect(JSON.stringify(indexes[0])).toContain('creation_idempotency_key');

    const accts = results[1]!.value as { name: string }[];
    expect(accts).toHaveLength(1);
    expect(accts[0]!.name).toMatch(/parlor/i);

    const qbo = results[3]!.value as { company_name: string }[];
    expect(qbo).toHaveLength(1);
    expect(qbo[0]!.company_name).toBe('Parlor LLC');
  });
});
