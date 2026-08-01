import { describe, expect, it } from 'vitest';
import { resolve, join } from 'node:path';
import { VastError } from '@vast/shared';
import { resolveUnderJobsDir } from './path-safety.js';

describe('resolveUnderJobsDir', () => {
  const jobsDir = resolve('/tmp/vast-jobs-test');

  it('allows absolute paths under jobsDir', () => {
    const dump = join(jobsDir, 'abc', 'dump');
    expect(resolveUnderJobsDir(jobsDir, dump)).toBe(resolve(dump));
  });

  it('allows relative paths under jobsDir', () => {
    expect(resolveUnderJobsDir(jobsDir, 'abc/dump')).toBe(resolve(jobsDir, 'abc/dump'));
  });

  it('rejects path traversal with ..', () => {
    expect(() => resolveUnderJobsDir(jobsDir, '../etc/passwd')).toThrow(VastError);
    expect(() => resolveUnderJobsDir(jobsDir, join(jobsDir, '..', 'escape'))).toThrow(VastError);
  });

  it('rejects absolute paths outside jobsDir', () => {
    expect(() => resolveUnderJobsDir(jobsDir, '/etc/passwd')).toThrow(VastError);
  });
});
