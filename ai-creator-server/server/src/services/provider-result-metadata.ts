/**
 * Keep the upstream result URL for operator diagnostics and retry analysis.
 * Inline data and local paths are intentionally excluded from task metadata.
 */
export function persistableProviderResultUrl(value: unknown): string | undefined {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}
