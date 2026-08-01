import { describe, expect, it } from 'vitest';
import {
  parseMongoHostPort,
  redactSshConfig,
  rewriteUriToLocalTunnel,
} from './ssh-tunnel.js';

describe('rewriteUriToLocalTunnel', () => {
  it('rewrites host:port keeping credentials and path', () => {
    const out = rewriteUriToLocalTunnel(
      'mongodb://alice:s3cret@db.internal:27017/app?authSource=admin',
      '127.0.0.1',
      54321,
    );
    expect(out).toBe('mongodb://alice:s3cret@127.0.0.1:54321/app?authSource=admin');
    expect(out).not.toContain('db.internal');
  });

  it('rewrites URI without auth', () => {
    expect(rewriteUriToLocalTunnel('mongodb://mongo:27017', '127.0.0.1', 9)).toBe(
      'mongodb://127.0.0.1:9/',
    );
  });

  it('rejects srv URIs', () => {
    expect(() =>
      rewriteUriToLocalTunnel('mongodb+srv://user:p@cluster.example.net/db', '127.0.0.1', 1),
    ).toThrow(/standard mongodb:\/\//);
  });
});

describe('parseMongoHostPort', () => {
  it('parses host and port', () => {
    expect(parseMongoHostPort('mongodb://u:p@host.example:27018/db')).toEqual({
      host: 'host.example',
      port: 27018,
    });
  });

  it('defaults port 27017', () => {
    expect(parseMongoHostPort('mongodb://localhost/app')).toEqual({
      host: 'localhost',
      port: 27017,
    });
  });
});

describe('redactSshConfig', () => {
  it('never includes secret values', () => {
    const redacted = redactSshConfig({
      enabled: true,
      host: 'bastion',
      port: 22,
      username: 'ubuntu',
      authMethod: 'password',
      password: 'super-secret-ssh-password',
      privateKey: '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----',
      passphrase: 'key-pass',
      destinationHost: '127.0.0.1',
      destinationPort: 27017,
    });
    const json = JSON.stringify(redacted);
    expect(json).not.toContain('super-secret');
    expect(json).not.toContain('BEGIN PRIVATE');
    expect(json).not.toContain('key-pass');
    expect(redacted.hasPassword).toBe(true);
    expect(redacted.hasPrivateKey).toBe(true);
    expect(redacted.hasPassphrase).toBe(true);
    expect(redacted.host).toBe('bastion');
  });
});
