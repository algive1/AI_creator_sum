export function formatDateTime(value?: string | null) {
  if (!value) return '';
  const raw = String(value).trim().replace(/\//g, '-');
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?/);
  if (match && !hasTimeZone) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(value: string | number) {
  return String(value).padStart(2, '0');
}
