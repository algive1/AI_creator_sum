import { reactive } from 'vue';
import { PAGE_ROUTES } from './constants';

const DIALOG_VISUAL_BASE = '/static/visuals/dialog';

export type AppDialogVariant = 'agreement' | 'phone' | 'announcement' | 'points' | 'member' | 'success' | 'saveHd' | 'generic';
export type AppDialogResult = 'primary' | 'secondary' | 'minor' | 'close' | 'mask' | 'phone';

export interface AppDialogBenefit {
  label: string;
  sub?: string;
  icon?: string;
  image?: string;
}

export interface AppDialogOptions {
  id?: string;
  variant?: AppDialogVariant;
  title: string;
  subtitle?: string;
  content?: string;
  richContent?: string;
  image?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  minorLabel?: string;
  primaryOpenType?: 'getPhoneNumber';
  benefits?: AppDialogBenefit[];
  closable?: boolean;
  maskClosable?: boolean;
  closeOnPrimary?: boolean;
  closeOnSecondary?: boolean;
  closeOnMinor?: boolean;
  onPrimary?: () => void | boolean | Promise<void | boolean>;
  onSecondary?: () => void | boolean | Promise<void | boolean>;
  onMinor?: () => void | boolean | Promise<void | boolean>;
  onClose?: (result: AppDialogResult) => void | Promise<void>;
  onGetPhoneNumber?: (event: unknown) => void | boolean | Promise<void | boolean>;
}

export interface AppDialogItem extends AppDialogOptions {
  id: string;
  resolve: (result: AppDialogResult) => void;
}

export const appDialogState = reactive<{
  current: AppDialogItem | null;
  queue: AppDialogItem[];
}>({
  current: null,
  queue: []
});

let nextDialogId = 1;

export function showAppDialog(options: AppDialogOptions): Promise<AppDialogResult> {
  return new Promise((resolve) => {
    appDialogState.queue.push({
      ...options,
      id: options.id || `dialog_${nextDialogId++}`,
      resolve
    });
    pumpDialogQueue();
  });
}

export function closeCurrentAppDialog(result: AppDialogResult = 'close') {
  const current = appDialogState.current;
  if (!current) return;
  appDialogState.current = null;
  current.onClose?.(result);
  current.resolve(result);
  setTimeout(pumpDialogQueue, 80);
}

export function clearAppDialogs() {
  appDialogState.queue.splice(0);
  if (appDialogState.current) closeCurrentAppDialog('close');
}

export function showMemberRequiredDialog(options: {
  title?: string;
  message?: string;
  source?: string;
} = {}) {
  return showAppDialog({
    variant: 'member',
    image: '/static/visuals/member/member_crown_3d.png',
    title: options.title || '开通会员解锁',
    subtitle: options.message || '当前内容需要会员权益，开通后可使用更多模板、高清保存和批量创作能力。',
    primaryLabel: '去开通会员',
    secondaryLabel: '稍后再说',
    benefits: [
      { label: '高清创作', sub: '更高画质', image: `${DIALOG_VISUAL_BASE}/benefit-hd-create.png` },
      { label: '模板特权', sub: '保存和套用', image: `${DIALOG_VISUAL_BASE}/benefit-template.png` },
      { label: '优先处理', sub: '减少等待', image: `${DIALOG_VISUAL_BASE}/benefit-priority.png` }
    ],
    onPrimary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.member });
    }
  });
}

export function showInsufficientPointsDialog(options: {
  neededPoints?: number;
  currentPoints?: number;
  message?: string;
} = {}) {
  const lines: string[] = [];
  if (options.neededPoints) lines.push(`本次需要 ${options.neededPoints} 积分`);
  if (typeof options.currentPoints === 'number') lines.push(`当前还有 ${Math.max(0, options.currentPoints)} 积分`);
  const subtitle = lines.length ? lines.join('，') : (options.message || '积分不足，购买积分或看广告赚积分后可继续创作。');
  return showAppDialog({
    variant: 'points',
    image: '/static/visuals/points/points_buy_3d.png',
    title: '积分不够啦',
    subtitle,
    primaryLabel: '购买积分继续',
    secondaryLabel: '看广告赚积分',
    minorLabel: '暂不处理',
    benefits: [
      { label: '购买积分', sub: '立即到账', image: `${DIALOG_VISUAL_BASE}/benefit-points-buy.png` },
      { label: '广告奖励', sub: '免费补充', image: `${DIALOG_VISUAL_BASE}/benefit-points-ad.png` },
      { label: '会员更划算', sub: '长期创作', image: `${DIALOG_VISUAL_BASE}/benefit-member-value.png` }
    ],
    onPrimary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.points });
    },
    onSecondary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.pointsAd });
    }
  });
}

export function showHdSaveDialog(options: {
  costPoints?: number;
  isMember?: boolean;
} = {}) {
  return showAppDialog({
    variant: 'saveHd',
    image: `${DIALOG_VISUAL_BASE}/benefit-hd-save.png`,
    title: '保存高清作品',
    subtitle: options.isMember
      ? '会员可优先保存高清版本，适合发布、商用和二次编辑。'
      : '普通保存不受影响，开通会员可解锁更高清晰度和更多保存权益。',
    primaryLabel: options.isMember ? '保存高清版本' : '开通会员保存高清',
    secondaryLabel: '普通保存',
    minorLabel: '取消',
    benefits: [
      { label: '高清画质', sub: options.costPoints ? `消耗 ${options.costPoints} 积分` : '更清晰', image: `${DIALOG_VISUAL_BASE}/benefit-hd-save.png` },
      { label: '去水印', sub: '适合发布', image: `${DIALOG_VISUAL_BASE}/benefit-watermark-free.png` },
      { label: '原图保存', sub: '便于编辑', image: `${DIALOG_VISUAL_BASE}/benefit-original-file.png` }
    ],
    onPrimary: () => {
      if (!options.isMember) uni.navigateTo({ url: PAGE_ROUTES.member });
    }
  });
}

function pumpDialogQueue() {
  if (appDialogState.current || appDialogState.queue.length === 0) return;
  appDialogState.current = appDialogState.queue.shift() || null;
}
