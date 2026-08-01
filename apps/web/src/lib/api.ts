import type {
  ConnectionPublic,
  CreateConnectionInput,
  HealthResponse,
  MetaResponse,
  TestConnectionResult,
  UpdateConnectionInput,
} from '@vast/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });

  if (!res.ok) {
    let code = 'INTERNAL';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  meta: () => request<MetaResponse>('/api/v1/meta'),
  login: (password: string) =>
    request<{ data: { ok: boolean } }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ data: { ok: boolean } }>('/api/v1/auth/logout', { method: 'POST' }),
  me: () =>
    request<{ data: { authMode: string; authenticated: boolean } }>('/api/v1/auth/me'),

  listConnections: () => request<{ data: ConnectionPublic[] }>('/api/v1/connections'),
  createConnection: (input: CreateConnectionInput) =>
    request<{ data: ConnectionPublic }>('/api/v1/connections', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateConnection: (id: string, input: UpdateConnectionInput) =>
    request<{ data: ConnectionPublic }>(`/api/v1/connections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteConnection: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/connections/${id}`, { method: 'DELETE' }),
  testUri: (uri: string, ssh?: CreateConnectionInput['ssh']) =>
    request<{ data: TestConnectionResult & { viaSsh?: boolean } }>('/api/v1/connections/test', {
      method: 'POST',
      body: JSON.stringify({ uri, ssh }),
    }),
  testConnection: (id: string) =>
    request<{ data: TestConnectionResult }>(`/api/v1/connections/${id}/test`, {
      method: 'POST',
    }),
  connect: (id: string) =>
    request<{ data: ConnectionPublic }>(`/api/v1/connections/${id}/connect`, {
      method: 'POST',
    }),
  disconnect: (id: string) =>
    request<{ data: ConnectionPublic }>(`/api/v1/connections/${id}/disconnect`, {
      method: 'POST',
    }),

  listDatabases: (cid: string) =>
    request<{ data: { name: string; sizeOnDisk?: number; empty?: boolean }[] }>(
      `/api/v1/c/${cid}/databases`,
    ),
  createDatabase: (cid: string, name: string) =>
    request<{ ok: boolean }>(`/api/v1/c/${cid}/databases`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  dropDatabase: (cid: string, name: string) =>
    request<{ ok: boolean }>(`/api/v1/c/${cid}/databases/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmName: name }),
    }),

  listCollections: (cid: string, db: string) =>
    request<{
      data: { name: string; type: string; estimatedCount?: number }[];
    }>(`/api/v1/c/${cid}/db/${encodeURIComponent(db)}/collections`),
  createCollection: (cid: string, db: string, name: string) =>
    request<{ ok: boolean }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/collections`,
      { method: 'POST', body: JSON.stringify({ name }) },
    ),
  dropCollection: (cid: string, db: string, name: string) =>
    request<{ ok: boolean }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/collections/${encodeURIComponent(name)}`,
      { method: 'DELETE', body: JSON.stringify({ confirmName: name }) },
    ),

  find: (
    cid: string,
    db: string,
    col: string,
    body: {
      filter?: unknown;
      sort?: Record<string, 1 | -1>;
      skip?: number;
      limit?: number;
      projection?: Record<string, 0 | 1>;
    },
  ) =>
    request<{
      data: Record<string, unknown>[];
      page: {
        limit: number;
        skip: number;
        returned: number;
        hasMore: boolean;
        executionMs: number;
      };
    }>(`/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/find`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  count: (cid: string, db: string, col: string, filter?: unknown) =>
    request<{ data: { count: number } }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/count`,
      { method: 'POST', body: JSON.stringify({ filter }) },
    ),

  insertDocument: (cid: string, db: string, col: string, document: unknown) =>
    request<{ data: Record<string, unknown> }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents`,
      { method: 'POST', body: JSON.stringify({ document }) },
    ),

  replaceDocument: (cid: string, db: string, col: string, id: string, document: unknown) =>
    request<{ data: Record<string, unknown> }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents/${id}`,
      { method: 'PUT', body: JSON.stringify({ document }) },
    ),

  patchDocument: (
    cid: string,
    db: string,
    col: string,
    id: string,
    ops: { set?: Record<string, unknown>; unset?: string[] },
  ) =>
    request<{ data: Record<string, unknown> }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents/${id}`,
      { method: 'PATCH', body: JSON.stringify(ops) },
    ),

  convertField: (
    cid: string,
    db: string,
    col: string,
    id: string,
    path: string,
    toType: string,
  ) =>
    request<{ data: Record<string, unknown> }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents/${id}/convert-field`,
      { method: 'POST', body: JSON.stringify({ path, toType }) },
    ),

  setField: (
    cid: string,
    db: string,
    col: string,
    id: string,
    body: { path: string; type: string; value: unknown },
  ) =>
    request<{ data: Record<string, unknown> }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents/${id}/set-field`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  deleteDocument: (cid: string, db: string, col: string, id: string) =>
    request<{ data: { deleted: boolean } }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/documents/${id}`,
      { method: 'DELETE' },
    ),

  aggregate: (cid: string, db: string, col: string, pipeline: unknown[], opts?: object) =>
    request<{ data: unknown[]; executionMs: number; returned: number }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/aggregate`,
      { method: 'POST', body: JSON.stringify({ pipeline, ...opts }) },
    ),

  listIndexes: (cid: string, db: string, col: string) =>
    request<{ data: { name: string; key: Record<string, unknown> }[] }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/indexes`,
    ),

  createIndex: (
    cid: string,
    db: string,
    col: string,
    keys: Record<string, number | string>,
    opts?: { name?: string; unique?: boolean },
  ) =>
    request<{ data: { name: string } }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/indexes`,
      { method: 'POST', body: JSON.stringify({ keys, ...opts }) },
    ),

  dropIndex: (cid: string, db: string, col: string, name: string) =>
    request<{ ok: boolean }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/indexes/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),

  analyzeSchema: (cid: string, db: string, col: string, sampleSize = 1000) =>
    request<{
      data: {
        sampleSize: number;
        fields: {
          path: string;
          presence: number;
          types: { type: string; count: number; samples: unknown[] }[];
          children?: unknown[];
        }[];
      };
    }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/schema/analyze`,
      { method: 'POST', body: JSON.stringify({ sampleSize }) },
    ),

  importData: (cid: string, db: string, col: string, format: 'json' | 'jsonl', content: string) =>
    request<{ data: { insertedCount: number; errorCount: number } }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/import`,
      { method: 'POST', body: JSON.stringify({ format, content }) },
    ),

  exportData: (
    cid: string,
    db: string,
    col: string,
    format: 'json' | 'jsonl' | 'csv',
    filter?: unknown,
  ) =>
    request<{ data: { text: string; count: number } }>(
      `/api/v1/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col)}/export`,
      { method: 'POST', body: JSON.stringify({ format, filter, limit: 50_000 }) },
    ),

  dump: (cid: string, database: string, collections?: string[]) =>
    request<{ data: { jobId: string; directory: string; collections: { name: string; count: number }[] } }>(
      `/api/v1/c/${cid}/dump`,
      { method: 'POST', body: JSON.stringify({ database, collections }) },
    ),

  restore: (cid: string, targetDatabase: string, dumpDir: string, drop?: boolean) =>
    request<{ data: { jobId: string; collections: { name: string; inserted: number }[] } }>(
      `/api/v1/c/${cid}/restore`,
      { method: 'POST', body: JSON.stringify({ targetDatabase, dumpDir, drop }) },
    ),

  serverInfo: (cid: string) => request<{ data: unknown }>(`/api/v1/c/${cid}/server-info`),
  serverStatus: (cid: string) => request<{ data: unknown }>(`/api/v1/c/${cid}/server-status`),
};

/** Extract display id string from EJSON _id */
export function idToPath(id: unknown): string {
  if (id && typeof id === 'object' && '$oid' in (id as object)) {
    return String((id as { $oid: string }).$oid);
  }
  if (typeof id === 'string' || typeof id === 'number') return String(id);
  try {
    return encodeURIComponent(JSON.stringify(id));
  } catch {
    return String(id);
  }
}

/** Normalize EJSON date forms (string, epoch ms, or { $numberLong }). */
export function formatEjsonDate(dateVal: unknown): string {
  if (typeof dateVal === 'string') return dateVal;
  if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
    const d = new Date(dateVal);
    return Number.isNaN(d.getTime()) ? String(dateVal) : d.toISOString();
  }
  if (dateVal && typeof dateVal === 'object') {
    if ('$numberLong' in dateVal) {
      const ms = Number((dateVal as { $numberLong: string }).$numberLong);
      const d = new Date(ms);
      return Number.isNaN(d.getTime())
        ? String((dateVal as { $numberLong: string }).$numberLong)
        : d.toISOString();
    }
    if ('$numberInt' in dateVal) {
      const ms = Number((dateVal as { $numberInt: string }).$numberInt);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? String(ms) : d.toISOString();
    }
  }
  try {
    return JSON.stringify(dateVal);
  } catch {
    return String(dateVal);
  }
}

/**
 * Display string for a cell value. Must never throw — grid rendering depends on it.
 * Handles canonical EJSON (ObjectId, Date with $numberLong, Long, Decimal, Int).
 */
export function formatCell(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'object') {
    if (value && '$oid' in (value as object)) return String((value as { $oid: string }).$oid);
    if (value && '$date' in (value as object)) {
      return formatEjsonDate((value as { $date: unknown }).$date);
    }
    if (value && '$numberDecimal' in (value as object))
      return String((value as { $numberDecimal: string }).$numberDecimal);
    if (value && '$numberLong' in (value as object))
      return String((value as { $numberLong: string }).$numberLong);
    if (value && '$numberInt' in (value as object))
      return String((value as { $numberInt: string }).$numberInt);
    if (value && '$numberDouble' in (value as object))
      return String((value as { $numberDouble: string }).$numberDouble);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function bsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    if ('$oid' in (value as object)) return 'objectId';
    if ('$date' in (value as object)) return 'date';
    if ('$numberDecimal' in (value as object)) return 'decimal';
    if ('$numberLong' in (value as object)) return 'long';
    if ('$numberInt' in (value as object)) return 'int';
    if ('$numberDouble' in (value as object)) return 'double';
    if ('$binary' in (value as object)) return 'binary';
    return 'object';
  }
  return typeof value;
}
