export function formatDateTime(value?: string | null) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}
