export function formatPoints(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  return String(num);
}

export function formatMoneyFromCents(value: unknown) {
  const cents = Number(value || 0);
  if (!Number.isFinite(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

export function formatDateTime(value?: string | null) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function clampText(value: string, fallback = '未命名') {
  const text = String(value || '').trim();
  return text || fallback;
}
