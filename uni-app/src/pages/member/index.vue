<template>
  <view class="member-page">
    <AppTopbar class="app-nav-root" title="会员中心" back transparent />

    <view class="member-hero">
      <view class="hero-glow glow-one"></view>
      <view class="hero-glow glow-two"></view>
      <view class="hero-content">
        <view class="hero-badge">
          <view class="badge-crown">
            <view class="crown-point left"></view>
            <view class="crown-point middle"></view>
            <view class="crown-point right"></view>
          </view>
          <text>{{ heroVersionLabel }}</text>
        </view>
        <view class="hero-title">解锁高级创作体验</view>
        <view class="hero-subtitle">2K画质 · AI视频 · AI漫画 · 去水印</view>
        <view class="hero-benefits">
          <view v-for="item in heroBenefits" :key="item.label" class="hero-benefit">
            <image class="hero-benefit-icon" :src="item.icon || DEFAULT_BENEFIT_ICON" mode="aspectFit" />
            <text>{{ item.label }}</text>
          </view>
        </view>
      </view>
      <image class="hero-crown" src="/static/visuals/member/member_crown_3d.png" mode="aspectFit" />
    </view>

    <view class="version-switch" :style="versionSwitchStyle">
      <view
        v-for="item in versionTabs"
        :key="item.key"
        class="version-item"
        :class="{ active: activeVersionTab === item.key }"
        @tap="selectVersionTab(item.key)"
      >
        {{ item.label }}
      </view>
    </view>

    <view v-if="displayPackages.length" class="package-row">
      <view
        v-for="item in displayPackages"
        :key="item.id"
        class="package-card"
        :class="{ selected: selectedPackageId === item.id }"
        @tap="selectPackage(item)"
      >
        <view v-if="item.tag" class="package-tag">{{ item.tag }}</view>
        <view class="package-name">{{ item.shortName }}</view>
        <view class="package-price">
          <text class="currency">¥</text>{{ item.price }}<text v-if="item.unit" class="unit">{{ item.unit }}</text>
        </view>
        <view class="daily-price-slot">
          <view v-if="item.dailyText" class="daily-price">{{ item.dailyText }}</view>
        </view>
        <view class="package-origin" :class="{ plain: !item.originalPrice }">{{ item.origin }}</view>
        <view class="package-points-slot">
          <view v-if="item.pointsText" class="package-points-pill">{{ item.pointsText }}</view>
        </view>
        <button class="package-action" @tap.stop="choosePackage(item)">
          立即开通
        </button>
      </view>
    </view>
    <view v-else class="empty-card">{{ loading ? '套餐加载中' : '暂无可购买套餐' }}</view>

    <view v-if="yearPromoText" class="year-promo">
      <view class="promo-gift">
        <view class="gift-lid"></view>
        <view class="gift-body"></view>
      </view>
      <text class="promo-copy">{{ yearPromoText }}</text>
      <text class="promo-arrow">›</text>
    </view>

    <view v-if="rightsRows.length" class="rights-section">
      <view class="rights-title">会员权益对比<text class="spark">✨</text></view>
      <view class="rights-table">
        <view class="rights-row rights-header" :style="rightsGridStyle">
          <view class="rights-cell rights-name-cell">
            <view class="header-dot"></view>
            <text>权益</text>
          </view>
          <view
            v-for="item in displayPackages"
            :key="`${item.id}-head`"
            class="rights-cell plan-head"
            :class="[`plan-${item.period}`, { selected: selectedPackageId === item.id }]"
          >
            <view v-if="item.tag" class="head-tag">{{ item.tag }}</view>
            <text>{{ item.shortName }}</text>
          </view>
        </view>

        <view v-for="(row, index) in rightsRows" :key="row.key" class="rights-row" :style="rightsGridStyle">
          <view class="rights-cell right-name">
            <text class="right-index">{{ index + 1 }}</text>
            <image class="benefit-icon" :src="row.icon" mode="aspectFit" @error="onBenefitIconError(row.key)" />
            <text class="right-label">{{ row.name }}</text>
          </view>
          <view
            v-for="cell in row.cells"
            :key="`${row.key}-${cell.planId}`"
            class="rights-cell right-value"
            :class="[`plan-${cell.period}`, { selected: selectedPackageId === cell.planId }]"
          >
            {{ cell.value }}
          </view>
        </view>
      </view>
    </view>
    <view v-else class="empty-card compact">{{ loading ? '权益加载中' : '暂无权益配置' }}</view>

    <view class="payment-note">
      <text>安全支付</text>
      <text>随时可取消</text>
      <text>虚拟权益商品，购买后按平台规则处理</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMembershipMe, getPlanDetail, getPlans, getPublicMemberPlans } from '@/api/member';
import { createOrder, payOrder } from '@/api/payment';
import AppTopbar from '@/components/common/AppTopbar.vue';
import { appEnv } from '@/env/index';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { PAGE_ROUTES } from '@/utils/constants';
import { memberPackages, memberRights } from '@/utils/mock';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';

type RawRecord = Record<string, any>;
type VersionTabKey = string;
type PlanPeriod = 'month' | 'quarter' | 'year' | 'forever' | 'other';

type MemberVersion = {
  versionKey: string;
  name: string;
  description: string;
  __fallback?: boolean;
};

type PointRule = {
  totalPoints: number;
  immediatePoints: number;
  monthlyPoints: number;
  giftPoints: number;
  grantMode: string;
  pointsExpireType: string;
  pointsDiscountRate: number;
};

type FeatureDiscount = {
  featureKey: string;
  featureName: string;
  discountPercent: number;
};

type MemberRight = {
  key: string;
  name: string;
  value: string;
  category: string;
  iconUrl: string;
};

type MemberPlan = {
  id: string;
  planId: number;
  name: string;
  shortName: string;
  versionKey: string;
  durationType: string;
  durationDays: number;
  period: PlanPeriod;
  price: string;
  priceYuan: number;
  originalPrice: string;
  unit: string;
  origin: string;
  tag: string;
  dailyText: string;
  pointsText: string;
  highlightFeatures: string[];
  pointRule: PointRule | null;
  featureDiscounts: FeatureDiscount[];
  rights: MemberRight[];
  __fallback?: boolean;
};

type BenefitDefinition = {
  key: string;
  name: string;
  icon: string;
  match: RegExp;
};

const heroBenefits = [
  { icon: '/static/icons/benefit_hd_quality.svg', label: '高清画质' },
  { icon: '/static/icons/benefit_default.svg', label: '无限创作' },
  { icon: '/static/icons/benefit_ai_video.svg', label: 'AI特效' },
  { icon: '/static/icons/benefit_materials.svg', label: '专属素材' },
  { icon: '/static/icons/benefit_priority.svg', label: '优先处理' },
  { icon: '/static/icons/benefit_remove_watermark.svg', label: '去水印' },
];

const DEFAULT_BENEFIT_ICON = '/static/icons/benefit_default.svg';

const benefitDefinitions: BenefitDefinition[] = [
  { key: 'hd_quality', name: '高清画质', icon: '/static/icons/benefit_hd_quality.svg', match: /max_quality|quality|画质|清晰|导出/i },
  { key: 'ai_video', name: 'AI视频', icon: '/static/icons/benefit_ai_video.svg', match: /video|视频/i },
  { key: 'ai_comic', name: 'AI漫画', icon: '/static/icons/benefit_ai_comic.svg', match: /manga|comic|漫画|漫剧/i },
  { key: 'remove_watermark', name: '去水印', icon: '/static/icons/benefit_remove_watermark.svg', match: /watermark|水印/i },
  { key: 'materials', name: '专属素材', icon: '/static/icons/benefit_materials.svg', match: /material|素材|library|model|模型/i },
  { key: 'priority', name: '优先处理', icon: '/static/icons/benefit_priority.svg', match: /priority|queue|优先|队列|生成/i },
  { key: 'commercial', name: '商用授权', icon: '/static/icons/benefit_commercial.svg', match: /commercial|business|商用|授权/i },
  { key: 'customer_service', name: '会员专属客服', icon: '/static/icons/benefit_customer_service.svg', match: /service|customer|客服/i },
];

const fallbackVersions: MemberVersion[] = [
  { versionKey: 'standard', name: '标准版', description: '开发兜底版本', __fallback: true },
  { versionKey: 'pro', name: '专业版', description: '开发兜底版本', __fallback: true },
];

const versions = ref<MemberVersion[]>([]);
const activeVersionTab = ref<VersionTabKey>('pro');
const membership = ref<RawRecord>({});
const allPlanRecords = ref<RawRecord[]>([]);
const packages = ref<MemberPlan[]>([]);
const selectedPackageId = ref('');
const loading = ref(false);
const authStore = useAuthStore();
const configStore = useConfigStore();
const failedBenefitIcons = ref<Record<string, boolean>>({});

const membershipEnabled = computed(() => configStore.publicConfig?.membershipEnabled !== false);
const versionTabs = computed(() => versions.value.map((item) => ({ key: item.versionKey, label: item.name })));
const versionSwitchStyle = computed(() => `grid-template-columns: repeat(${Math.max(versionTabs.value.length, 1)}, minmax(0, 1fr));`);
const activeVersion = computed(() => versions.value.find((item) => item.versionKey === activeVersionTab.value));
const activeVersionName = computed(() => activeVersion.value?.name || versionTabs.value[0]?.label || '会员');
const heroVersionLabel = computed(() => /会员$/.test(activeVersionName.value) ? activeVersionName.value : `${activeVersionName.value}会员`);
const displayPackages = computed(() => packages.value.slice(0, 3));
const rightsGridStyle = computed(() => `grid-template-columns: 1.12fr repeat(${Math.max(displayPackages.value.length, 1)}, minmax(0, 1fr));`);
const yearPromoText = computed(() => {
  const yearPlan = displayPackages.value.find((item) => item.period === 'year');
  if (!yearPlan?.dailyText) return '';
  const monthPlan = displayPackages.value.find((item) => item.period === 'month');
  const saving = monthPlan?.priceYuan && yearPlan.priceYuan ? Math.max(0, monthPlan.priceYuan * 12 - yearPlan.priceYuan) : 0;
  return saving > 0
    ? `${yearPlan.shortName}${yearPlan.dailyText}，比月度省 ¥${formatNumber(saving)}`
    : `${yearPlan.shortName}${yearPlan.dailyText}`;
});

const rightsRows = computed(() => {
  const plans = displayPackages.value;
  if (!plans.length) return [];
  const definitions = collectBenefitDefinitions(plans);
  return definitions.map((definition) => ({
    key: definition.key,
    name: definition.name,
    icon: failedBenefitIcons.value[definition.key] ? DEFAULT_BENEFIT_ICON : definition.icon,
    cells: plans.map((plan) => {
      const right = plan.rights.find((item) => rightMatches(item, definition));
      return {
        planId: plan.id,
        period: plan.period,
        value: formatRightValue(right?.value),
      };
    }),
  }));
});

onShow(() => {
  refreshMemberEntry();
});

async function refreshMemberEntry() {
  configStore.hydrate();
  try {
    await configStore.loadPublicConfig();
  } catch {
    // 使用本地缓存决定是否继续加载会员中心。
  }
  if (!membershipEnabled.value) {
    handleMembershipDisabled();
    return;
  }
  loadMemberPage();
}

function handleMembershipDisabled() {
  loading.value = false;
  versions.value = [];
  packages.value = [];
  selectedPackageId.value = '';
  uni.showToast({ title: '会员功能已关闭', icon: 'none' });
  setTimeout(() => {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      uni.navigateBack();
      return;
    }
    uni.reLaunch({ url: PAGE_ROUTES.profile });
  }, 300);
}

async function loadMemberPage() {
  loading.value = true;
  try {
    authStore.hydrate();
    const [memberResult, plansResult] = await Promise.allSettled([
      authStore.isLoggedIn ? getMembershipMe<RawRecord>() : Promise.resolve({}),
      authStore.isLoggedIn ? getPlans<{ list?: RawRecord[] }>() : getPublicMemberPlans<{ list?: RawRecord[] }>(),
    ]);

    membership.value = authStore.isLoggedIn && memberResult.status === 'fulfilled' ? (memberResult.value || {}) : {};
    allPlanRecords.value = plansResult.status === 'fulfilled' && Array.isArray(plansResult.value.list) ? plansResult.value.list : [];
    setVersionsFromPlans(
      allPlanRecords.value,
      plansResult.status === 'fulfilled' ? 'empty membership plan list' : 'membership plan api failed',
    );

    activeVersionTab.value = tabForVersionKey(String(membership.value.versionKey || membership.value.membershipLevel || ''))
      || versionTabs.value[0]?.key
      || '';
    await loadPlansForTab(activeVersionTab.value);
  } finally {
    loading.value = false;
  }
}

function setVersionsFromPlans(list: RawRecord[], fallbackReason: string) {
  const versionMap = new Map<string, MemberVersion>();
  list.forEach((item) => {
    const versionKey = String(item.versionKey || item.version_key || '');
    if (!versionKey || versionMap.has(versionKey)) return;
    versionMap.set(versionKey, normalizeVersion({
      versionKey,
      name: item.versionName || item.version_name || versionKey,
      description: item.versionDescription || item.version_description || '',
    }));
  });
  const normalized = Array.from(versionMap.values()).filter((item) => item.versionKey && item.name);
  if (normalized.length) {
    versions.value = normalized;
    return;
  }
  if (isDevFallbackEnabled) {
    warnDevFallback('membership-version', fallbackReason);
    versions.value = fallbackVersions;
    return;
  }
  versions.value = [];
}

function normalizeVersion(item: RawRecord): MemberVersion {
  return {
    versionKey: String(item.versionKey || item.version_key || item.key || ''),
    name: String(item.name || item.versionName || item.version_name || '会员版本'),
    description: String(item.description || ''),
  };
}

async function selectVersionTab(tabKey: VersionTabKey) {
  if (activeVersionTab.value === tabKey) return;
  activeVersionTab.value = tabKey;
  await loadPlansForTab(tabKey);
}

function resolveBackendVersionKey(tabKey: VersionTabKey) {
  return versions.value.find((item) => item.versionKey === tabKey)?.versionKey || '';
}

function tabForVersionKey(versionKey: string): VersionTabKey | '' {
  return versions.value.find((item) => item.versionKey === versionKey)?.versionKey || '';
}

async function loadPlansForTab(tabKey: VersionTabKey) {
  const versionKey = resolveBackendVersionKey(tabKey);
  if (!versionKey) {
    packages.value = [];
    selectedPackageId.value = '';
    return;
  }

  loading.value = true;
  try {
    const list = allPlanRecords.value.filter((item) => String(item.versionKey || item.version_key || '') === versionKey);
    await setPackages(list, 'empty membership plan list');
  } catch {
    await setPackages([], 'membership plan api failed');
  } finally {
    loading.value = false;
  }
}

async function setPackages(list: RawRecord[], fallbackReason: string) {
  const arranged = arrangePlans(list).slice(0, 3);
  if (arranged.length) {
    const basePlans = arranged.map((item, index) => normalizePlan(item, index));
    packages.value = await enrichPlanRights(basePlans);
    setDefaultSelectedPackage();
    return;
  }

  if (isDevFallbackEnabled && activeVersionTab.value === 'pro') {
    warnDevFallback('membership-package', fallbackReason);
    packages.value = buildFallbackPackages();
    setDefaultSelectedPackage();
    return;
  }
  packages.value = [];
  selectedPackageId.value = '';
}

function arrangePlans(list: RawRecord[]) {
  const withPeriod = list.map((item) => ({ item, period: detectPeriod(String(item.durationType || item.duration_type || item.planKey || item.plan_key || ''), Number(item.durationDays || item.duration_days || 0), String(item.name || '')) }));
  const month = withPeriod.find((entry) => entry.period === 'month');
  const year = withPeriod.find((entry) => entry.period === 'year');
  const forever = withPeriod.find((entry) => entry.period === 'forever');
  const used = new Set<RawRecord>();
  const result: RawRecord[] = [];
  [month, year, forever].forEach((entry) => {
    if (entry && !used.has(entry.item)) {
      used.add(entry.item);
      result.push(entry.item);
    }
  });
  withPeriod.forEach((entry) => {
    if (!used.has(entry.item)) result.push(entry.item);
  });
  return result;
}

async function enrichPlanRights(plans: MemberPlan[]) {
  const result = await Promise.all(plans.map(async (plan) => {
    if (!authStore.isLoggedIn || !plan.planId) return plan;
    try {
      const detail = await getPlanDetail<RawRecord>(plan.planId);
      const pointRule = normalizePointRule(detail.pointRule || detail.pointRules || plan.pointRule);
      const featureDiscounts = normalizeFeatureDiscounts(detail.featureDiscounts || plan.featureDiscounts);
      return {
        ...plan,
        rights: normalizeRights(detail.rights),
        pointRule,
        featureDiscounts,
        pointsText: pointsTextOf(pointRule) || plan.pointsText,
        dailyText: marketingTextOf(plan.period, plan.durationDays, plan.priceYuan, featureDiscounts),
      };
    } catch {
      return plan;
    }
  }));
  return result;
}

function normalizePlan(item: RawRecord, index: number): MemberPlan {
  const planId = Number(item.planId || item.id || 0);
  const durationType = String(item.durationType || item.duration_type || item.planKey || item.plan_key || '');
  const durationDays = Number(item.durationDays || item.duration_days || 0);
  const name = String(item.name || '会员套餐');
  const period = detectPeriod(durationType, durationDays, name);
  const pointRule = normalizePointRule(item.pointRule || item.pointRules);
  const featureDiscounts = normalizeFeatureDiscounts(item.featureDiscounts || item.feature_discounts);
  const priceYuan = centsToYuan(Number(item.price ?? item.priceCents ?? item.price_cents ?? 0));
  const originalYuan = centsToYuan(Number(item.originalPrice ?? item.originalPriceCents ?? item.original_price ?? 0));
  const originalPrice = originalYuan > priceYuan ? formatNumber(originalYuan) : '';
  const tag = normalizeTag(String(item.tag || ''), period, index);

  return {
    id: String(planId || item.planKey || item.plan_key || index),
    planId,
    name,
    shortName: shortPlanName(name, period),
    versionKey: String(item.versionKey || item.version_key || resolveBackendVersionKey(activeVersionTab.value)),
    durationType,
    durationDays,
    period,
    price: formatNumber(priceYuan),
    priceYuan,
    originalPrice,
    unit: unitText(period, durationDays),
    origin: originalPrice ? `原价 ¥${originalPrice}` : originText(period),
    tag,
    dailyText: marketingTextOf(period, durationDays, priceYuan, featureDiscounts),
    pointsText: pointsTextOf(pointRule) || devPreviewPointsText(priceYuan),
    highlightFeatures: normalizeFeatures(item.highlightFeatures || item.highlight_features),
    pointRule,
    featureDiscounts,
    rights: normalizeRights(item.rights || item.planRights || item.plan_rights),
    __fallback: false,
  };
}

function buildFallbackPackages(): MemberPlan[] {
  return memberPackages.slice(0, 3).map((item, index) => {
    const raw = item as RawRecord;
    const packageId = String(raw.id || index);
    const durationDays = packageId === 'year' ? 365 : packageId === 'forever' ? 3650 : 30;
    const period = detectPeriod(packageId, durationDays, String(raw.name || ''));
    const priceYuan = Number(raw.price || 0);
    const featureDiscounts = period === 'forever'
      ? [{ featureKey: 'image_create', featureName: 'AI生图', discountPercent: 60 }]
      : [];
    return {
      id: packageId,
      planId: 0,
      name: String(raw.name || '会员套餐'),
      shortName: shortPlanName(String(raw.name || '会员套餐'), period),
      versionKey: activeVersionTab.value || 'pro',
      durationType: packageId,
      durationDays,
      period,
      price: String(raw.price || '0'),
      priceYuan,
      originalPrice: raw.origin ? String(raw.origin).replace(/[^\d.]/g, '') : '',
      unit: String(raw.unit || ''),
      origin: period === 'forever' ? originText(period) : String(raw.origin || originText(period)),
      tag: period === 'year' ? '超值推荐' : period === 'forever' ? '限时特惠' : normalizeTag(String(raw.tag || ''), period, index),
      dailyText: marketingTextOf(period, durationDays, priceYuan, featureDiscounts),
      pointsText: fallbackPointsTextOf(priceYuan),
      highlightFeatures: [],
      pointRule: null,
      featureDiscounts,
      rights: fallbackRightsFor(packageId),
      __fallback: true,
    };
  });
}

function fallbackRightsFor(packageId: string): MemberRight[] {
  return memberRights.map((item) => {
    const raw = item as RawRecord;
    return {
      key: String(raw.id || raw.name),
      name: String(raw.name || '会员权益'),
      value: String(raw[packageId] || '-'),
      category: String(raw.id || ''),
      iconUrl: '',
    };
  });
}

function normalizeRights(list: unknown): MemberRight[] {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    const raw = item as RawRecord;
    const name = String(raw.rightName || raw.right_name || raw.name || '会员权益');
    const category = String(raw.rightCategory || raw.right_category || raw.category || '');
    return {
      key: String(raw.rightKey || raw.right_key || raw.key || `${category}-${name}-${index}`),
      name,
      value: formatRightValue(raw.rightValue || raw.right_value || raw.value || '支持'),
      category,
      iconUrl: normalizeBackendIconUrl(String(raw.iconUrl || raw.icon_url || raw.icon || '')),
    };
  });
}

function normalizePointRule(rawRule: unknown): PointRule | null {
  if (!rawRule || typeof rawRule !== 'object') return null;
  const raw = rawRule as RawRecord;
  return {
    totalPoints: Number(raw.totalPoints ?? raw.total_points ?? 0),
    immediatePoints: Number(raw.immediatePoints ?? raw.immediate_points ?? 0),
    monthlyPoints: Number(raw.monthlyPoints ?? raw.monthly_points ?? 0),
    giftPoints: Number(raw.giftPoints ?? raw.gift_points ?? 0),
    grantMode: String(raw.grantMode ?? raw.grant_mode ?? 'immediate'),
    pointsExpireType: String(raw.pointsExpireType ?? raw.points_expire_type ?? 'none'),
    pointsDiscountRate: Number(raw.pointsDiscountRate ?? raw.points_discount_rate ?? 1),
  };
}

function normalizeFeatureDiscounts(value: unknown): FeatureDiscount[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = item as RawRecord;
    return {
      featureKey: String(raw.featureKey || raw.feature_key || ''),
      featureName: String(raw.featureName || raw.feature_name || raw.featureKey || raw.feature_key || ''),
      discountPercent: Number(raw.discountPercent ?? raw.discount_percent ?? 100),
    };
  }).filter((item) => item.featureKey);
}

function normalizeFeatures(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function detectPeriod(durationType: string, durationDays: number, name: string): PlanPeriod {
  const text = `${durationType}${name}`;
  if (/forever|permanent|永久/i.test(text) || durationDays >= 3650) return 'forever';
  if (/year|annual|年/i.test(text) || durationDays >= 365) return 'year';
  if (/quarter|季/i.test(text) || durationDays >= 80) return 'quarter';
  if (/month|月/i.test(text) || durationDays <= 31) return 'month';
  return 'other';
}

function normalizeTag(tag: string, period: PlanPeriod, index: number) {
  if (tag) return tag;
  if (period === 'year') return '超值推荐';
  if (period === 'forever') return '限时特惠';
  return index === 1 ? '超值推荐' : '';
}

function setDefaultSelectedPackage() {
  const current = packages.value.find((item) => item.id === selectedPackageId.value);
  if (current) return;
  const yearPlan = packages.value.find((item) => item.period === 'year');
  selectedPackageId.value = yearPlan?.id || packages.value[1]?.id || packages.value[0]?.id || '';
}

function selectPackage(item: MemberPlan) {
  selectedPackageId.value = item.id;
}

function centsToYuan(cents: number) {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return cents / 100;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatFloorNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  const floored = Math.floor(value * 100) / 100;
  return Number.isInteger(floored) ? String(floored) : floored.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatInteger(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Math.trunc(value).toLocaleString('en-US');
}

function marketingTextOf(period: PlanPeriod, durationDays: number, priceYuan: number, featureDiscounts: FeatureDiscount[] = []) {
  if (period === 'forever') return imageDiscountText(featureDiscounts);
  if (durationDays > 0 && priceYuan > 0) return `低至${formatFloorNumber(priceYuan / durationDays)}元/天`;
  return '';
}

function imageDiscountText(featureDiscounts: FeatureDiscount[]) {
  const discount = featureDiscounts.find((item) => item.featureKey === 'image_create')
    || featureDiscounts.find((item) => /生图|图片|image/i.test(`${item.featureKey}${item.featureName}`));
  const percent = Number(discount?.discountPercent || 100);
  if (!Number.isFinite(percent) || percent >= 100) return '';
  const fold = percent / 10;
  const text = Number.isInteger(fold) ? String(fold) : fold.toFixed(1).replace(/0$/, '');
  return `每图低至${text}折`;
}

function pointsTextOf(rule: PointRule | null) {
  const points = Number(rule?.totalPoints || 0);
  return points > 0 ? `含 ${formatInteger(points)} 积分` : '';
}

function fallbackPointsTextOf(priceYuan: number) {
  const points = Math.round(Math.max(0, priceYuan) * 10);
  return points > 0 ? `含 ${formatInteger(points)} 积分` : '';
}

function devPreviewPointsText(priceYuan: number) {
  return isDevFallbackEnabled ? fallbackPointsTextOf(priceYuan) : '';
}

function unitText(period: PlanPeriod, durationDays: number) {
  if (period === 'forever') return '';
  if (period === 'year') return '/年';
  if (period === 'quarter') return '/季';
  if (period === 'month') return '/月';
  return durationDays ? `/${durationDays}天` : '';
}

function originText(period: PlanPeriod) {
  if (period === 'forever') return '一次开通 · 永久使用';
  return '';
}

function shortPlanName(name: string, period: PlanPeriod) {
  if (period === 'forever') return '永久会员';
  if (period === 'year') return '年度会员';
  if (period === 'quarter') return '季度会员';
  if (period === 'month') return '月度会员';
  return name;
}

function rightMatches(right: MemberRight, definition: BenefitDefinition) {
  if (right.key === definition.key) return true;
  return definition.match.test(`${right.key}${right.category}${right.name}`);
}

function collectBenefitDefinitions(plans: MemberPlan[]): BenefitDefinition[] {
  const byKey = new Map<string, BenefitDefinition>();
  benefitDefinitions.forEach((definition) => byKey.set(definition.key, { ...definition }));
  plans.forEach((plan) => {
    plan.rights.forEach((right) => {
      const matched = benefitDefinitions.find((definition) => rightMatches(right, definition));
      const key = matched?.key || right.key || `${right.category}-${right.name}`;
      const icon = right.iconUrl || matched?.icon || DEFAULT_BENEFIT_ICON;
      if (byKey.has(key)) {
        const existing = byKey.get(key)!;
        if (right.iconUrl) existing.icon = right.iconUrl;
        return;
      }
      byKey.set(key, {
        key,
        name: right.name || matched?.name || '会员权益',
        icon,
        match: new RegExp(escapeRegExp(key), 'i'),
      });
    });
  });
  const actualKeys = new Set(plans.flatMap((plan) => plan.rights.map((right) => {
    const matched = benefitDefinitions.find((definition) => rightMatches(right, definition));
    return matched?.key || right.key || `${right.category}-${right.name}`;
  })));
  return Array.from(byKey.values()).filter((definition) => actualKeys.has(definition.key));
}

function onBenefitIconError(key: string) {
  if (!key || failedBenefitIcons.value[key]) return;
  failedBenefitIcons.value = { ...failedBenefitIcons.value, [key]: true };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeBackendIconUrl(url: string) {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (!/^\/(assets|static)\//.test(value)) return value;
  const base = String(appEnv.baseURL || '').replace(/\/api\/v\d+\/?$/i, '').replace(/\/+$/, '');
  return base ? `${base}${value}` : value;
}

function formatRightValue(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  if (/^(true|1|yes)$/i.test(text)) return '支持';
  if (/^(false|0|no|-|null)$/i.test(text)) return '不支持';
  return text.replace(/\s+/g, '');
}

async function choosePackage(item: MemberPlan) {
  if (!membershipEnabled.value) {
    uni.showToast({ title: '会员功能已关闭', icon: 'none' });
    return;
  }
  selectedPackageId.value = item.id;
  if (item.__fallback) {
    uni.showToast({ title: '演示套餐，后台配置后可购买', icon: 'none' });
    return;
  }
  if (!item.planId) {
    uni.showToast({ title: '套餐数据联调后可购买', icon: 'none' });
    return;
  }
  if (!authStore.isLoggedIn) {
    uni.navigateTo({ url: `${PAGE_ROUTES.login}?redirect=${encodeURIComponent(PAGE_ROUTES.member)}` });
    return;
  }
  const order = await createOrder<RawRecord>('membership', item.planId);
  const orderNo = String(order.orderNo || '');
  if (orderNo) await payOrder(orderNo);
}
</script>

<style scoped lang="scss">
.member-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 0 24rpx calc(34rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 12% 4%, rgba(108, 75, 255, 0.1), transparent 26%),
    radial-gradient(circle at 88% 14%, rgba(255, 92, 184, 0.1), transparent 24%),
    linear-gradient(180deg, #ffffff 0%, #f8f6ff 36%, #ffffff 100%);
  color: #1f2437;
}

.member-page > view:not(.app-nav-root) {
  position: relative;
  z-index: 1;
}

.member-hero {
  position: relative;
  overflow: hidden;
  height: 292rpx;
  margin-bottom: 24rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 78% 48%, rgba(255, 209, 92, 0.3), transparent 24%),
    radial-gradient(circle at 56% 22%, rgba(255, 255, 255, 0.22), transparent 20%),
    linear-gradient(135deg, #3f22c9 0%, #704bff 48%, #ff69b4 100%);
  box-shadow: 0 22rpx 44rpx rgba(108, 75, 255, 0.18);
}

.member-hero::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(105deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.5) 0 7rpx, transparent 8rpx),
    radial-gradient(circle at 62% 32%, rgba(255, 209, 92, 0.8) 0 9rpx, transparent 10rpx);
  content: "";
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.glow-one {
  right: 10rpx;
  bottom: -60rpx;
  width: 270rpx;
  height: 190rpx;
  background: rgba(255, 209, 92, 0.18);
  filter: blur(8rpx);
}

.glow-two {
  left: 230rpx;
  top: 64rpx;
  width: 260rpx;
  height: 120rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.18);
  transform: rotate(-12deg);
}

.hero-content {
  position: relative;
  z-index: 3;
  width: 432rpx;
  padding: 30rpx 0 0 28rpx;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 34rpx;
  margin-bottom: 20rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, rgba(255, 209, 92, 0.72), rgba(255, 92, 184, 0.58));
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
}

.badge-crown {
  position: relative;
  width: 22rpx;
  height: 18rpx;
  border-radius: 3rpx 3rpx 6rpx 6rpx;
  background: #ffd15c;
}

.crown-point {
  position: absolute;
  bottom: 10rpx;
  width: 12rpx;
  height: 12rpx;
  background: #ffd15c;
  transform: rotate(45deg);
}

.crown-point.left { left: -2rpx; }
.crown-point.middle { left: 5rpx; bottom: 13rpx; }
.crown-point.right { right: -2rpx; }

.hero-title {
  color: #ffffff;
  font-size: 44rpx;
  font-weight: 900;
  line-height: 1.12;
  text-shadow: 0 8rpx 20rpx rgba(63, 34, 201, 0.28);
}

.hero-subtitle {
  margin-top: 16rpx;
  color: rgba(255, 255, 255, 0.92);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 34rpx;
}

.hero-benefits {
  display: grid;
  grid-template-columns: repeat(6, 56rpx);
  gap: 14rpx;
  margin-top: 24rpx;
}

.hero-benefit {
  min-width: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 17rpx;
  font-weight: 700;
  line-height: 22rpx;
  text-align: center;
}

.hero-benefit-icon {
  display: block;
  width: 42rpx;
  height: 42rpx;
  margin: 0 auto 6rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.17);
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.18);
}

.hero-crown {
  position: absolute;
  right: -12rpx;
  bottom: -18rpx;
  z-index: 2;
  width: 306rpx;
  height: 242rpx;
}

.version-switch {
  display: grid;
  width: calc(100% - 96rpx);
  max-width: 620rpx;
  height: 72rpx;
  margin: 0 auto 24rpx;
  padding: 8rpx;
  border-radius: 999rpx;
  background: #ffffff;
  box-shadow: 0 14rpx 30rpx rgba(31, 36, 55, 0.08);
}

.version-item {
  height: 56rpx;
  border-radius: 999rpx;
  color: #8b8fa3;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 56rpx;
  text-align: center;
}

.version-item.active {
  background: linear-gradient(135deg, #111827, #151827);
  color: #ffffff;
}

.package-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18rpx;
  align-items: stretch;
  margin-bottom: 18rpx;
  padding: 12rpx 0 14rpx;
}

.package-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 334rpx;
  padding: 32rpx 10rpx 16rpx;
  box-sizing: border-box;
  border: 2rpx solid rgba(229, 233, 244, 0.92);
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 34rpx rgba(31, 36, 55, 0.08);
  text-align: center;
  transform: translateY(0) scale(1);
  transform-origin: center center;
  transition: transform 0.24s ease, border-color 0.24s ease, background 0.24s ease, box-shadow 0.24s ease;
  will-change: transform;
}

.package-card.selected {
  z-index: 2;
  border-color: #ffb84d;
  background: linear-gradient(180deg, #fff9ed 0%, #ffffff 62%);
  box-shadow: 0 18rpx 40rpx rgba(255, 184, 77, 0.15);
  transform: translateY(-8rpx) scale(1.045);
}

.package-tag {
  position: absolute;
  top: -10rpx;
  right: 8rpx;
  max-width: 124rpx;
  height: 38rpx;
  padding: 0 12rpx;
  overflow: hidden;
  border-radius: 12rpx 12rpx 4rpx 12rpx;
  background: linear-gradient(135deg, #ff5cb8, #ff4d92);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 38rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-name {
  width: 100%;
  overflow: hidden;
  color: #1f2437;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 38rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-price {
  width: 100%;
  margin-top: 14rpx;
  color: #1f2437;
  font-size: 48rpx;
  font-weight: 900;
  line-height: 56rpx;
}

.currency,
.unit {
  font-size: 22rpx;
  font-weight: 900;
}

.currency {
  margin-right: 4rpx;
}

.unit {
  margin-left: 4rpx;
}

.daily-price-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 38rpx;
  margin-top: 4rpx;
}

.daily-price {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 176rpx;
  height: 34rpx;
  padding: 0 8rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: #ffdfb8;
  color: #f06c1d;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 34rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-origin {
  width: 100%;
  min-height: 32rpx;
  margin-top: 2rpx;
  overflow: hidden;
  color: #8b8fa3;
  font-size: 21rpx;
  line-height: 32rpx;
  text-decoration: line-through;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-origin.plain {
  text-decoration: none;
}

.package-points-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 42rpx;
  margin-top: 8rpx;
}

.package-points-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 178rpx;
  height: 36rpx;
  padding: 0 12rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: rgba(108, 75, 255, 0.08);
  color: #6c4bff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 36rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-card.selected .package-points-pill {
  background: #fff1cc;
  color: #d97706;
}

.package-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 148rpx;
  height: 50rpx;
  margin: 12rpx auto 0;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #111827, #151827);
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 50rpx;
}

.package-card.selected .package-action {
  background: linear-gradient(135deg, #6c4bff 0%, #ff5cb8 100%);
}

.year-promo {
  display: flex;
  align-items: center;
  min-height: 64rpx;
  margin-bottom: 22rpx;
  padding: 0 24rpx;
  border: 1rpx solid rgba(255, 184, 77, 0.24);
  border-radius: 999rpx;
  background: linear-gradient(90deg, rgba(255, 249, 237, 0.96), #ffffff 62%, rgba(255, 249, 237, 0.88));
  box-shadow: 0 10rpx 24rpx rgba(255, 184, 77, 0.08);
}

.promo-gift {
  position: relative;
  flex: 0 0 auto;
  width: 40rpx;
  height: 40rpx;
  margin-right: 14rpx;
}

.gift-lid,
.gift-body {
  position: absolute;
  left: 50%;
  background: linear-gradient(135deg, #ffd15c, #ff8c45);
  transform: translateX(-50%);
}

.gift-lid {
  top: 5rpx;
  width: 34rpx;
  height: 10rpx;
  border-radius: 5rpx;
}

.gift-body {
  bottom: 4rpx;
  width: 30rpx;
  height: 24rpx;
  border-radius: 5rpx;
}

.promo-gift::after {
  position: absolute;
  top: 5rpx;
  bottom: 4rpx;
  left: 18rpx;
  width: 5rpx;
  border-radius: 3rpx;
  background: rgba(255, 92, 184, 0.72);
  content: "";
}

.promo-copy {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #ef6a2e;
  font-size: 24rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.promo-arrow {
  flex: 0 0 auto;
  margin-left: 12rpx;
  color: #ffb84d;
  font-size: 38rpx;
  line-height: 1;
}

.rights-section {
  margin-top: 4rpx;
}

.rights-title {
  margin: 0 4rpx 14rpx;
  color: #1f2437;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 42rpx;
}

.spark {
  margin-left: 4rpx;
  color: #ffd15c;
  font-size: 24rpx;
}

.rights-table {
  overflow: hidden;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 34rpx rgba(31, 36, 55, 0.08);
}

.rights-row {
  display: grid;
  min-height: 74rpx;
  border-top: 1rpx solid rgba(229, 233, 244, 0.8);
}

.rights-row:first-child {
  border-top: 0;
}

.rights-header {
  min-height: 78rpx;
  background: #fbfbff;
}

.rights-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 10rpx 8rpx;
  border-left: 1rpx solid rgba(229, 233, 244, 0.8);
  color: #1f2437;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 30rpx;
  text-align: center;
}

.rights-cell:first-child {
  border-left: 0;
}

.rights-name-cell {
  justify-content: flex-start;
  gap: 10rpx;
  padding-left: 18rpx;
}

.header-dot {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  background: #ece8ff;
}

.plan-head {
  color: #535b70;
  font-size: 22rpx;
  font-weight: 900;
}

.plan-head.plan-year {
  background: linear-gradient(135deg, rgba(108, 75, 255, 0.13), rgba(255, 209, 92, 0.24));
  color: #c65d16;
}

.plan-head.plan-forever {
  background: linear-gradient(135deg, rgba(255, 92, 184, 0.12), rgba(255, 209, 92, 0.16));
  color: #cf4f75;
}

.head-tag {
  position: absolute;
  top: -1rpx;
  right: 8rpx;
  max-width: 96rpx;
  height: 30rpx;
  padding: 0 8rpx;
  overflow: hidden;
  border-radius: 0 0 10rpx 10rpx;
  background: linear-gradient(135deg, #ff5cb8, #ff4d92);
  color: #ffffff;
  font-size: 17rpx;
  font-weight: 900;
  line-height: 30rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-name {
  justify-content: flex-start;
  gap: 7rpx;
  padding-left: 12rpx;
  text-align: left;
}

.right-index {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: #ece8ff;
  color: #6c4bff;
  font-size: 18rpx;
  font-weight: 900;
}

.benefit-icon {
  flex: 0 0 auto;
  width: 31rpx;
  height: 31rpx;
}

.right-label {
  min-width: 0;
  max-width: 120rpx;
  overflow: hidden;
  color: #1f2437;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-value {
  display: -webkit-box;
  overflow: hidden;
  color: #1f2437;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.right-value.plan-year {
  background: rgba(255, 249, 237, 0.9);
}

.right-value.plan-forever {
  background: rgba(255, 250, 253, 0.72);
}

.empty-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180rpx;
  margin-bottom: 22rpx;
  border-radius: 28rpx;
  background: #ffffff;
  color: #8b8fa3;
  font-size: 25rpx;
  font-weight: 800;
  box-shadow: 0 14rpx 30rpx rgba(31, 36, 55, 0.08);
}

.empty-card.compact {
  min-height: 120rpx;
  margin-top: 16rpx;
}

.payment-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  margin-top: 22rpx;
  color: #a3a8b8;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 30rpx;
  text-align: center;
}
</style>
