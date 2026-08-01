import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('loadConfig', () => {
  it('forces localhost bind for desktop runtime', () => {
    process.env.VAST_RUNTIME = 'desktop';
    process.env.VAST_BIND = '0.0.0.0';
    process.env.VAST_SECRET_KEY = 'test';
    process.env.VAST_DATA_DIR = '/tmp/vast-test-data';
    const cfg = loadConfig();
    expect(cfg.bind).toBe('127.0.0.1');
    expect(cfg.runtime).toBe('desktop');
  });

  it('allows 0.0.0.0 for web runtime', () => {
    process.env.VAST_RUNTIME = 'web';
    process.env.VAST_BIND = '0.0.0.0';
    process.env.VAST_SECRET_KEY = 'test';
    process.env.VAST_DATA_DIR = '/tmp/vast-test-data-web';
    const cfg = loadConfig();
    expect(cfg.bind).toBe('0.0.0.0');
  });
});
