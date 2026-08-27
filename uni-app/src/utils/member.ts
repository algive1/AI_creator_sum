export type MemberPeriod = 'none' | 'month' | 'year' | 'forever';
export type MemberKind = 'free' | 'standard' | 'pro' | 'unknown';

export interface MemberView {
  isMember: boolean;
  kind: MemberKind;
  period: MemberPeriod;
  versionName: string;
  planName: string;
  title: string;
  badgeText: string;
  periodText: string;
  expireText: string;
  startedText: string;
  remainingText: string;
  icon: string;
  theme: 'free' | 'standard' | 'pro' | 'forever';
}

const iconMap: Record<MemberView['theme'], string> = {
  free: '/static/icons/member_level_free.svg',
  standard: '/static/icons/member_level_standard.svg',
  pro: '/static/icons/member_level_pro.svg',
  forever: '/static/icons/member_level_forever.svg'
};

export function getMemberView(raw?: Record<string, unknown> | null): MemberView {
  const membership = raw || {};
  const isMember = Boolean(membership.isMember || membership.active) && Boolean(membership.expireAt || membership.expire_at);
  const versionKey = String(membership.versionKey || membership.version_key || membership.membershipLevel || membership.level || '').trim();
  const versionName = String(membership.versionName || membership.version_name || '').trim();
  const planName = String(membership.planName || membership.plan_name || '').trim();
  const durationType = String(membership.durationType || membership.duration_type || '').trim();
  const durationDays = Number(membership.durationDays || membership.duration_days || 0);
  const expireAt = membership.expireAt || membership.expire_at || null;
  const startedAt = membership.startedAt || membership.started_at || null;
  const period = isMember ? detectMemberPeriod(durationType, durationDays, planName) : 'none';
  const kind = isMember ? detectMemberKind(versionKey, versionName, planName) : 'free';
  const theme = period === 'forever' && kind === 'pro' ? 'forever' : kind === 'pro' ? 'pro' : kind === 'standard' || kind === 'unknown' ? 'standard' : 'free';
  const baseTitle = isMember ? memberKindName(kind, versionName) : '普通用户';
  const periodText = isMember ? memberPeriodText(period) : '未开通';
  const remainingDays = Number(membership.remainingDays || membership.remaining_days || daysUntil(expireAt));
  return {
    isMember,
    kind,
    period,
    versionName,
    planName,
    title: isMember && periodText ? `${baseTitle} · ${periodText}` : baseTitle,
    badgeText: isMember && periodText ? `${baseTitle} · ${periodText}` : baseTitle,
    periodText,
    expireText: isMember ? (period === 'forever' ? '永久有效' : formatDate(expireAt) || '未设置') : '未开通',
    startedText: formatDateTime(startedAt),
    remainingText: isMember && period !== 'forever' && remainingDays >= 0 ? `剩余 ${remainingDays} 天` : '',
    icon: iconMap[theme],
    theme
  };
}

export function detectMemberPeriod(durationType: string, durationDays: number, planName: string): MemberPeriod {
  const text = `${durationType}${planName}`;
  if (/forever|permanent|永久/i.test(text) || durationDays >= 3650) return 'forever';
  if (/year|annual|年/i.test(text) || durationDays >= 365) return 'year';
  if (/month|月/i.test(text) || durationDays <= 31) return 'month';
  return 'month';
}

function detectMemberKind(versionKey: string, versionName: string, planName: string): MemberKind {
  const text = `${versionKey}${versionName}${planName}`;
  if (/standard|标准/i.test(text)) return 'standard';
  if (/pro|professional|专业|business|商业/i.test(text)) return 'pro';
  return versionKey || versionName || planName ? 'unknown' : 'free';
}

function memberKindName(kind: MemberKind, versionName: string) {
  if (kind === 'standard') return '标准会员';
  if (kind === 'pro') return /会员$/.test(versionName) ? versionName : '专业会员';
  if (kind === 'unknown' && versionName) return /会员$/.test(versionName) ? versionName : `${versionName}会员`;
  return '普通用户';
}

function memberPeriodText(period: MemberPeriod) {
  if (period === 'month') return '月度';
  if (period === 'year') return '年度';
  if (period === 'forever') return '永久';
  return '';
}

function daysUntil(value: unknown) {
  if (!value) return -1;
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return -1;
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000));
}

export function formatDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * 会员折扣标签文本。例如 percent=85 → "会员8.5折"，percent>=100 → ""
 */
export function discountLabel(percent: number): string {
  const value = Number(percent || 100);
  if (!Number.isFinite(value) || value >= 100) return '';
  const fold = value / 10;
  const text = Number.isInteger(fold) ? String(fold) : fold.toFixed(1).replace(/0$/, '');
  return `会员${text}折`;
}
