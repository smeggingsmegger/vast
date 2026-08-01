/**
 * Mask credentials in a MongoDB connection URI for safe display/logging.
 */
export function maskMongoUri(uri: string): string {
  try {
    // mongodb+srv and mongodb URIs — replace user:pass@ with user:***@
    return uri.replace(/\/\/([^:/@]+):([^@]+)@/g, '//$1:***@');
  } catch {
    return '***';
  }
}

/**
 * Basic structural validation — full connect is the real check.
 */
export function isLikelyMongoUri(uri: string): boolean {
  const trimmed = uri.trim();
  return trimmed.startsWith('mongodb://') || trimmed.startsWith('mongodb+srv://');
}
