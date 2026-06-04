import { query } from '../utils/db';
import { SettingsService } from './settings.service';

export interface MemberBenefitIcon {
  id: number;
  iconKey: string;
  name: string;
  iconUrl: string;
  iconFileId: number | null;
  source: string;
  status: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

const ICON_TITLES: Record<string, string> = {
  benefit_hd_quality: '高清画质',
  benefit_ai_video: 'AI 视频',
  benefit_ai_comic: 'AI 漫画',
  benefit_remove_watermark: '去水印',
  benefit_materials: '专属素材',
  benefit_priority: '优先处理',
  benefit_commercial: '商用授权',
  benefit_customer_service: '专属客服',
  benefit_points_bonus: '积分赠送',
  benefit_fast_queue: '极速队列',
  benefit_batch_create: '批量创作',
  benefit_cloud_storage: '云端存储',
  benefit_private_model: '私有模型',
  benefit_team_seats: '团队席位',
  benefit_invoice: '企业发票',
  benefit_api_access: 'API 接入',
  benefit_brand_assets: '品牌素材',
  benefit_prompt_library: '提示词库',
  benefit_template_vip: '会员模板',
  benefit_privacy: '隐私保护',
  benefit_copyright: '版权保障',
  benefit_training: '教程培训',
  benefit_analytics: '数据看板',
  benefit_early_access: '新品抢先',
  benefit_export_pack: '导出包',
  benefit_collaboration: '协作权限',
  benefit_dedicated_support: '专属顾问',
  benefit_quality_boost: '画质增强',
};

const ICON_ACCENTS: Record<string, string> = {
  benefit_hd_quality: '#6C4BFF',
  benefit_ai_video: '#FF5CB8',
  benefit_ai_comic: '#8B5CF6',
  benefit_remove_watermark: '#20B486',
  benefit_materials: '#F59E0B',
  benefit_priority: '#FF7A45',
  benefit_commercial: '#2563EB',
  benefit_customer_service: '#14B8A6',
  benefit_points_bonus: '#F6B73C',
  benefit_fast_queue: '#EF4444',
  benefit_batch_create: '#7C3AED',
  benefit_cloud_storage: '#0EA5E9',
  benefit_private_model: '#111827',
  benefit_team_seats: '#10B981',
  benefit_invoice: '#64748B',
  benefit_api_access: '#06B6D4',
  benefit_brand_assets: '#EC4899',
  benefit_prompt_library: '#A855F7',
  benefit_template_vip: '#F97316',
  benefit_privacy: '#475569',
  benefit_copyright: '#3B82F6',
  benefit_training: '#22C55E',
  benefit_analytics: '#6366F1',
  benefit_early_access: '#EAB308',
  benefit_export_pack: '#0891B2',
  benefit_collaboration: '#84CC16',
  benefit_dedicated_support: '#D946EF',
  benefit_quality_boost: '#FB7185',
};

export function buildMemberBenefitIconSvg(slug: string): string | null {
  const normalized = String(slug || '').replace(/\.svg$/i, '');
  if (!ICON_TITLES[normalized]) return null;

  const accent = ICON_ACCENTS[normalized] || '#6C4BFF';
  const title = ICON_TITLES[normalized];
  const glyph = iconGlyph(normalized, accent);

  return `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <linearGradient id="bg" x1="48" y1="32" x2="208" y2="224" gradientUnits="userSpaceOnUse">
      <stop stop-color="${accent}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="mark" x1="74" y1="66" x2="182" y2="190" gradientUnits="userSpaceOnUse">
      <stop stop-color="${accent}"/>
      <stop offset="1" stop-color="${softenColor(accent)}"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="208" height="208" rx="56" fill="url(#bg)"/>
  <circle cx="196" cy="60" r="15" fill="${accent}" opacity="0.18"/>
  <circle cx="61" cy="196" r="18" fill="${accent}" opacity="0.12"/>
  ${glyph}
</svg>`;
}

export async function normalizePublicIconUrl(iconUrl: string): Promise<string> {
  const value = String(iconUrl || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/')) return value;
  const apiDomain = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '')
    || String(await SettingsService.getString('site.api_domain', '')).trim().replace(/\/+$/, '');
  return apiDomain ? `${apiDomain}${value}` : value;
}

export async function listMemberBenefitIcons(): Promise<MemberBenefitIcon[]> {
  const rows = await query<any>(
    `SELECT id, icon_key, name, icon_url, icon_file_id, source, status, sort_order, created_at, updated_at
       FROM member_benefit_icons
      WHERE status = 'active'
      ORDER BY sort_order, id`,
  );
  return Promise.all(rows.map(toMemberBenefitIcon));
}

export async function createLinkedMemberBenefitIcon(input: {
  name: string;
  iconUrl: string;
  iconFileId?: number | null;
  source?: string;
}): Promise<number> {
  const name = String(input.name || '').trim().slice(0, 64);
  const iconUrl = String(input.iconUrl || '').trim().slice(0, 512);
  if (!name || !iconUrl) throw new Error('缺少图标名称或链接');
  if (!isAllowedIconUrl(iconUrl)) throw new Error('图标链接只支持 http(s)、/assets 或 /static');
  const iconKey = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const source = input.source === 'upload' ? 'upload' : 'link';
  const sort = await nextCustomSortOrder();
  const [result] = await query<any>(
    `INSERT INTO member_benefit_icons (icon_key, name, icon_url, icon_file_id, source, status, sort_order)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [iconKey, name, iconUrl, input.iconFileId || null, source, sort],
  );
  return Number((result as any)?.insertId || 0);
}

function isAllowedIconUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^\/(assets|static)\//.test(value);
}

async function toMemberBenefitIcon(row: any): Promise<MemberBenefitIcon> {
  return {
    id: Number(row.id || 0),
    iconKey: row.icon_key || '',
    name: row.name || '',
    iconUrl: await normalizePublicIconUrl(row.icon_url || ''),
    iconFileId: row.icon_file_id ? Number(row.icon_file_id) : null,
    source: row.source || '',
    status: row.status || '',
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function nextCustomSortOrder(): Promise<number> {
  const rows = await query<any>('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM member_benefit_icons');
  return Number(rows?.[0]?.max_sort || 0) + 10;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function softenColor(hex: string): string {
  const color = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(color)) return '#FF5CB8';
  const r = Math.min(255, parseInt(color.slice(0, 2), 16) + 34);
  const g = Math.min(255, parseInt(color.slice(2, 4), 16) + 42);
  const b = Math.min(255, parseInt(color.slice(4, 6), 16) + 52);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function iconGlyph(slug: string, accent: string): string {
  switch (slug) {
    case 'benefit_hd_quality':
    case 'benefit_quality_boost':
      return `<rect x="69" y="76" width="118" height="96" rx="22" fill="white"/>
  <path d="M86 151L113 122L135 145L149 130L172 151V155H86V151Z" fill="url(#mark)"/>
  <circle cx="155" cy="98" r="11" fill="${accent}" opacity="0.55"/>
  <path d="M80 188H176" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
    case 'benefit_ai_video':
      return `<rect x="70" y="82" width="96" height="92" rx="24" fill="white"/>
  <path d="M166 111L194 94V162L166 145V111Z" fill="url(#mark)"/>
  <path d="M111 109L145 128L111 147V109Z" fill="${accent}"/>`;
    case 'benefit_ai_comic':
      return `<path d="M78 84H178C190 84 198 92 198 104V155C198 167 190 175 178 175H125L98 198V175H78C66 175 58 167 58 155V104C58 92 66 84 78 84Z" fill="white"/>
  <circle cx="96" cy="127" r="10" fill="${accent}"/>
  <circle cx="128" cy="127" r="10" fill="${accent}" opacity="0.75"/>
  <circle cx="160" cy="127" r="10" fill="${accent}" opacity="0.5"/>`;
    case 'benefit_remove_watermark':
      return `<rect x="69" y="75" width="118" height="102" rx="24" fill="white"/>
  <path d="M92 154L164 82" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
  <path d="M94 103H125M94 129H142M94 155H121" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.35"/>`;
    case 'benefit_materials':
    case 'benefit_brand_assets':
      return `<path d="M76 86H121L135 104H180C191 104 198 111 198 122V171C198 182 191 189 180 189H76C65 189 58 182 58 171V104C58 93 65 86 76 86Z" fill="white"/>
  <path d="M88 146H168M88 168H140" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
  <circle cx="100" cy="119" r="10" fill="${accent}" opacity="0.6"/>`;
    case 'benefit_priority':
    case 'benefit_fast_queue':
    case 'benefit_early_access':
      return `<path d="M136 56L76 139H120L108 200L181 105H137L136 56Z" fill="url(#mark)"/>
  <path d="M82 184H160" stroke="white" stroke-width="14" stroke-linecap="round" opacity="0.9"/>`;
    case 'benefit_commercial':
    case 'benefit_copyright':
      return `<path d="M128 57L188 83V124C188 158 164 187 128 200C92 187 68 158 68 124V83L128 57Z" fill="white"/>
  <path d="M103 129L121 147L156 111" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'benefit_customer_service':
    case 'benefit_dedicated_support':
      return `<path d="M70 136C70 99 94 74 128 74C162 74 186 99 186 136" stroke="white" stroke-width="22" stroke-linecap="round"/>
  <rect x="54" y="124" width="36" height="52" rx="15" fill="url(#mark)"/>
  <rect x="166" y="124" width="36" height="52" rx="15" fill="url(#mark)"/>
  <path d="M128 190C154 190 169 178 176 162" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;
    case 'benefit_points_bonus':
      return `<circle cx="110" cy="124" r="48" fill="white"/>
  <circle cx="150" cy="140" r="48" fill="${accent}" opacity="0.28"/>
  <path d="M110 96V152M91 118H129" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
    case 'benefit_batch_create':
    case 'benefit_template_vip':
    case 'benefit_export_pack':
      return `<rect x="63" y="78" width="72" height="72" rx="18" fill="white"/>
  <rect x="121" y="104" width="72" height="72" rx="18" fill="${accent}" opacity="0.28"/>
  <path d="M85 114H113M85 137H105" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;
    case 'benefit_cloud_storage':
      return `<path d="M87 167C66 167 52 153 52 134C52 117 64 104 82 101C91 79 109 68 131 72C151 76 164 90 169 110C190 113 204 126 204 145C204 160 192 174 173 174H88" fill="white"/>
  <path d="M101 142H157" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
    case 'benefit_private_model':
    case 'benefit_privacy':
      return `<rect x="72" y="112" width="112" height="78" rx="20" fill="white"/>
  <path d="M92 112V93C92 72 107 58 128 58C149 58 164 72 164 93V112" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
  <circle cx="128" cy="149" r="12" fill="${accent}"/>`;
    case 'benefit_team_seats':
    case 'benefit_collaboration':
      return `<circle cx="128" cy="91" r="28" fill="white"/>
  <circle cx="80" cy="116" r="22" fill="white" opacity="0.92"/>
  <circle cx="176" cy="116" r="22" fill="white" opacity="0.92"/>
  <path d="M68 184C73 152 95 137 128 137C161 137 183 152 188 184" fill="url(#mark)" opacity="0.9"/>`;
    case 'benefit_invoice':
      return `<path d="M76 64H180V194L158 181L137 194L116 181L95 194L76 181V64Z" fill="white"/>
  <path d="M99 102H157M99 130H157M99 158H138" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;
    case 'benefit_api_access':
      return `<path d="M99 91L62 128L99 165M157 91L194 128L157 165" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M138 78L118 178" stroke="white" stroke-width="16" stroke-linecap="round"/>`;
    case 'benefit_prompt_library':
    case 'benefit_training':
      return `<path d="M74 70H165C176 70 184 78 184 89V184H90C79 184 70 175 70 164V74C70 72 72 70 74 70Z" fill="white"/>
  <path d="M100 105H154M100 131H154M100 157H132" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;
    case 'benefit_analytics':
      return `<rect x="67" y="72" width="122" height="112" rx="22" fill="white"/>
  <path d="M96 151V126M128 151V98M160 151V116" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
  <path d="M90 170H169" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.35"/>`;
    default:
      return `<circle cx="128" cy="128" r="58" fill="white"/>
  <path d="M101 129L121 149L158 108" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}
