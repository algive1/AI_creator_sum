import { reactive } from 'vue';
import { PAGE_ROUTES } from './constants';
import { useConfigStore } from '@/stores/config';
import { shouldBlockPurchase } from './purchase-guard';

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
  hideVisual?: boolean;
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

export async function showMemberRequiredDialog(options: {
  title?: string;
  message?: string;
  source?: string;
} = {}) {
  const guard = await readPurchaseGuard();
  if (guard.blocked) {
    uni.showToast({ title: guard.message, icon: 'none' });
    return Promise.resolve('close' as AppDialogResult);
  }
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

export async function showInsufficientPointsDialog(options: {
  neededPoints?: number;
  currentPoints?: number;
  message?: string;
} = {}) {
  const guard = await readPurchaseGuard();
  if (guard.blocked) {
    return showAppDialog({
      variant: 'generic',
      title: '积分不足',
      subtitle: guard.message,
      primaryLabel: '知道了',
      closable: true
    });
  }
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

export async function showFreeQuotaInsufficientDialog(options: {
  message?: string;
  requestedImages?: number;
  dailyRemaining?: number;
  totalRemaining?: number;
  estimatedPointsCost?: number;
  pointsCost?: number;
  canUsePoints?: boolean;
  allowPointRetry?: boolean;
  membershipEnabled?: boolean;
  purchaseEnabled?: boolean;
} = {}) {
  const guard = await readPurchaseGuard();
  const purchaseAllowed = !guard.blocked && options.purchaseEnabled !== false;
  const lines: string[] = [];
  if (options.requestedImages) lines.push(`本次需要 ${options.requestedImages} 张`);
  if (typeof options.dailyRemaining === 'number') lines.push(`今日剩余 ${Math.max(0, options.dailyRemaining)} 张`);
  if (typeof options.totalRemaining === 'number') lines.push(`总剩余 ${Math.max(0, options.totalRemaining)} 张`);
  const estimatedPointsCost = options.estimatedPointsCost ?? options.pointsCost;
  if (estimatedPointsCost) lines.push(`使用积分预计消耗 ${estimatedPointsCost} 点`);
  const subtitle = options.message || lines.join('，') || '免费生图额度不足，可以减少张数，或使用积分继续生成。';

  if (options.canUsePoints && options.allowPointRetry !== false) {
    return showAppDialog({
      variant: 'points',
      image: '/static/visuals/points/points_buy_3d.png',
      title: '免费额度不足',
      subtitle,
      primaryLabel: '使用积分继续',
      secondaryLabel: '减少张数',
      closable: true,
      closeOnPrimary: true,
      closeOnSecondary: true
    });
  }

  if (!purchaseAllowed) {
    return showAppDialog({
      variant: 'generic',
      title: '免费额度不足',
      subtitle: guard.blocked ? guard.message : subtitle,
      primaryLabel: '知道了',
      closable: true
    });
  }

  return showAppDialog({
    variant: 'member',
    image: options.membershipEnabled !== false ? '/static/visuals/member/member_crown_3d.png' : '/static/visuals/points/points_buy_3d.png',
    title: '免费额度不足',
    subtitle,
    primaryLabel: options.membershipEnabled !== false ? '开通会员领积分' : '购买积分继续',
    secondaryLabel: '做任务赚积分',
    minorLabel: '减少张数',
    benefits: [
      { label: '会员积分', sub: '开通后发放', image: `${DIALOG_VISUAL_BASE}/benefit-member-value.png` },
      { label: '积分购买', sub: '立即到账', image: `${DIALOG_VISUAL_BASE}/benefit-points-buy.png` },
      { label: '任务奖励', sub: '免费补充', image: `${DIALOG_VISUAL_BASE}/benefit-points-ad.png` }
    ],
    onPrimary: () => {
      uni.navigateTo({ url: options.membershipEnabled !== false ? PAGE_ROUTES.member : PAGE_ROUTES.points });
    },
    onSecondary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.pointsAd });
    }
  });
}

export async function showHdSaveDialog(options: {
  costPoints?: number;
  isMember?: boolean;
} = {}) {
  const guard = await readPurchaseGuard();
  if (guard.blocked && !options.isMember) {
    uni.showToast({ title: guard.message, icon: 'none' });
    return Promise.resolve('close');
  }
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
      if (guard.blocked) return;
      if (!options.isMember) uni.navigateTo({ url: PAGE_ROUTES.member });
    }
  });
}

async function readPurchaseGuard() {
  const configStore = useConfigStore();
  if (!configStore.publicConfigReady) {
    configStore.hydrate();
    await configStore.loadPublicConfig({ force: true }).catch(() => undefined);
  }
  return shouldBlockPurchase(configStore.publicConfig);
}

function pumpDialogQueue() {
  if (appDialogState.current || appDialogState.queue.length === 0) return;
  appDialogState.current = appDialogState.queue.shift() || null;
}
