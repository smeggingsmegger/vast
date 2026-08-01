import { resolve, relative, isAbsolute } from 'node:path';
import { ErrorCode, VastError } from '@vast/shared';

/**
 * Resolve dumpDir so it must lie under jobsDir (prevents path traversal restore).
 */
export function resolveUnderJobsDir(jobsDir: string, dumpDir: string): string {
  const base = resolve(jobsDir);
  const candidate = isAbsolute(dumpDir) ? resolve(dumpDir) : resolve(base, dumpDir);
  const rel = relative(base, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new VastError(
      ErrorCode.VALIDATION,
      'dumpDir must be under the server jobs directory (use a path returned by dump)',
    );
  }
  return candidate;
}
