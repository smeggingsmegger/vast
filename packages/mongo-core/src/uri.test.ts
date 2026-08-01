import { describe, expect, it } from 'vitest';
import { isLikelyMongoUri, maskMongoUri } from './uri.js';

describe('maskMongoUri', () => {
  it('masks password in standard URI', () => {
    expect(maskMongoUri('mongodb://alice:s3cret@localhost:27017/db')).toBe(
      'mongodb://alice:***@localhost:27017/db',
    );
  });

  it('masks password in srv URI', () => {
    expect(maskMongoUri('mongodb+srv://user:p%40ss@cluster.example.net/app')).toBe(
      'mongodb+srv://user:***@cluster.example.net/app',
    );
  });

  it('leaves URI without credentials unchanged', () => {
    expect(maskMongoUri('mongodb://localhost:27017')).toBe('mongodb://localhost:27017');
  });
});

describe('isLikelyMongoUri', () => {
  it('accepts mongodb schemes', () => {
    expect(isLikelyMongoUri('mongodb://localhost')).toBe(true);
    expect(isLikelyMongoUri('mongodb+srv://cluster.net')).toBe(true);
  });

  it('rejects other schemes', () => {
    expect(isLikelyMongoUri('https://example.com')).toBe(false);
  });
});
