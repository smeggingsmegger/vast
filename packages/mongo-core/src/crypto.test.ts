import { describe, expect, it } from 'vitest';
import { decryptString, encryptString } from './crypto.js';

describe('encryptString / decryptString', () => {
  it('round-trips plaintext', () => {
    const secret = 'test-secret-key';
    const plain = 'mongodb://user:pass@localhost:27017';
    const encrypted = encryptString(plain, secret);
    expect(encrypted).not.toContain('pass');
    expect(decryptString(encrypted, secret)).toBe(plain);
  });

  it('fails with wrong secret', () => {
    const encrypted = encryptString('hello', 'secret-a');
    expect(() => decryptString(encrypted, 'secret-b')).toThrow();
  });
});
