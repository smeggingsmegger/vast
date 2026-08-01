import { describe, expect, it } from 'vitest';
import { CreateConnectionSchema, MetaResponseSchema } from './index.js';

describe('CreateConnectionSchema', () => {
  it('accepts a minimal connection', () => {
    const result = CreateConnectionSchema.parse({
      name: 'local',
      uri: 'mongodb://localhost:27017',
    });
    expect(result.color).toBe('teal');
    expect(result.readOnly).toBe(false);
  });

  it('rejects empty name', () => {
    expect(() =>
      CreateConnectionSchema.parse({
        name: '',
        uri: 'mongodb://localhost:27017',
      }),
    ).toThrow();
  });
});

describe('MetaResponseSchema', () => {
  it('validates meta payload shape', () => {
    const meta = MetaResponseSchema.parse({
      name: 'vast',
      version: '0.1.0',
      runtime: 'web',
      authMode: 'none',
      features: { dumpTools: false, oidc: false },
    });
    expect(meta.name).toBe('vast');
  });
});
