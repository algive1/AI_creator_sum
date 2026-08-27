<template>
  <view class="screen home-page" :class="{ 'home-page--booting': bootingHomeRedirect }">
    <AppTopbar class="app-nav-root" transparent>
      <template #left>
        <view class="home-nav-title">{{ appName }}</view>
      </template>
    </AppTopbar>

    <view class="pull-refresh-indicator" :class="{ visible: pullRefreshing }">
      <text class="pull-refresh-spinner"></text>
      <text>正在刷新</text>
    </view>

    <button class="home-hero" @tap="goCreate">
      <view class="hero-copy">
        <view class="hero-title">AI一键创作</view>
        <view class="hero-subtitle">图像 · 视频 · 漫剧 · 故事</view>
        <view class="hero-action">立即体验 <text>→</text></view>
      </view>
      <view class="hero-art">
        <view class="hero-card card-back"></view>
        <view class="hero-card card-front">
          <view class="hero-play"></view>
        </view>
        <view class="hero-bot">
          <view class="bot-head">
            <view class="bot-eye left"></view>
            <view class="bot-eye right"></view>
          </view>
          <view class="bot-body"></view>
        </view>
        <view class="hero-coin one"></view>
        <view class="hero-coin two"></view>
        <view class="hero-star one"></view>
        <view class="hero-star two"></view>
      </view>
      <image v-if="homeBannerSource" class="home-banner-image" :src="homeBannerSource" mode="aspectFill" @error="onVisualAssetError('homeBanner')" />
    </button>

    <button v-if="homeAnnouncement" class="home-announcement" @tap="goAnnouncements">
      <image class="announcement-visual" src="/static/home/notice_megaphone.png" mode="aspectFit" />
      <view class="announcement-copy">
        <view class="announcement-main">
          <view class="announcement-badge">公告</view>
          <view class="announcement-title">{{ homeAnnouncement.title }}</view>
        </view>
        <view class="announcement-meta">
          <text>{{ formatAnnouncementTime(homeAnnouncement.startAt || homeAnnouncement.createdAt) }}</text>
          <text v-if="!homeAnnouncement.readAt" class="announcement-new">新</text>
        </view>
      </view>
      <view class="announcement-action">
        <text>查看全部</text>
        <text class="announcement-arrow">›</text>
      </view>
    </button>

    <view class="entry-grid">
      <button
        v-for="item in entryCards"
        :key="item.key"
        class="entry-card"
        @tap="goEntry(item.key)"
      >
        <view class="entry-card-fallback" :class="`entry-${item.key}`">
          <view class="entry-fallback-icon">
            <image class="entry-fallback-icon-image" :src="item.icon" mode="aspectFit" />
          </view>
          <view class="entry-fallback-title">{{ item.title }}</view>
          <view class="entry-fallback-sub">{{ item.sub }}</view>
        </view>
        <image
          v-if="!entryImageErrors[item.key]"
          class="entry-card-image"
          :src="item.image"
          mode="aspectFill"
          @error="onEntryImageError(item.key)"
        />
      </button>
    </view>

    <view class="section-head">
      <view class="section-title">灵感推荐<text>✨</text></view>
      <button
        class="section-refresh"
        :class="{ loading: loadingInspirations, cycling: cyclingInspirations }"
        :disabled="loadingInspirations"
        @tap="refreshInspirations"
      >
        <text>{{ loadingInspirations ? '刷新中' : '换一换' }}</text>
        <text class="refresh-icon"></text>
      </button>
    </view>

    <scroll-view scroll-x class="inspiration-tabs">
      <view class="inspiration-tab-row">
        <button
          v-for="item in inspirationTabs"
          :key="item"
          class="inspiration-tab"
          :class="{ active: activeInspirationTab === item }"
          @tap="setActiveInspirationTab(item)"
        >
          {{ item }}
        </button>
      </view>
    </scroll-view>

    <view v-if="filteredInspirations.length" class="inspiration-grid">
      <view v-for="(column, columnIndex) in inspirationColumns" :key="columnIndex" class="inspiration-column">
        <button
          v-for="item in column"
          :key="item.id"
          class="inspiration-card"
          @tap="useInspiration(item)"
        >
          <view class="inspiration-art" :class="`theme-${item.theme}`">
            <image v-if="item.cover" class="inspiration-cover" :src="item.cover" mode="aspectFill" lazy-load :fade-show="false" />
            <view v-else class="inspiration-scene"></view>
            <view class="inspiration-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="inspiration-play"></view>
            <view class="inspiration-overlay">
              <view class="inspiration-title">{{ item.title }}</view>
              <view class="inspiration-bottom">
                <view class="inspiration-source">
                  <image v-if="item.avatar" class="inspiration-source-avatar" :src="item.avatar" mode="aspectFill" lazy-load />
                  <text>{{ item.author }}</text>
                </view>
                <button class="inspiration-favorite" :class="{ active: item.isFavorited }" hover-class="none" @tap.stop="toggleFavorite(item)">
                  <image :src="item.isFavorited ? '/static/icons/icon_favorite_filled.svg' : '/static/icons/icon_favorite_line.svg'" mode="aspectFit" />
                  <text v-if="hasFavoriteCount(item.favoriteCount)">{{ item.favoriteText }}</text>
                </button>
              </view>
            </view>
          </view>
        </button>
      </view>
    </view>

    <view v-else class="inspiration-empty">
      <text v-if="loadingInspirations" class="inline-spinner empty-spinner"></text>
      <view>{{ loadingInspirations ? '正在加载灵感...' : '暂无灵感内容' }}</view>
      <button @tap="refreshInspirations">重新加载</button>
    </view>

    <button v-if="showMemberFloat" class="member-float" @tap="goMember">
      <view class="member-float-fallback">
        <view class="member-crown">
          <view class="crown-point left"></view>
          <view class="crown-point middle"></view>
          <view class="crown-point right"></view>
        </view>
        <view class="member-float-copy">
          <view class="member-float-title">解锁全部创作特权</view>
          <view class="member-float-sub">高清画质 · 无限创作 · 优先处理 · 去水印</view>
        </view>
        <view class="member-float-action">去升级</view>
      </view>
      <image v-if="memberUpsellSource" class="member-float-image" :src="memberUpsellSource" mode="aspectFill" @error="onVisualAssetError('homeMemberUpsell')" />
    </button>

    <TemplatePreviewSheet
      :template="previewTemplate"
      @close="previewTemplate = null"
      @favorite="togglePreviewFavorite"
      @use="usePreviewTemplate"
    />
    <AppDialogHost class="app-dialog-host-root" />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import { favoriteTemplate, getHomeInspirations, getTemplateCategories, unfavoriteTemplate, useTemplate as useContentTemplate } from '@/api/template';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { normalizeBackendMediaUrl } from '@/utils/media-url';
import { acceptLegalDocuments, getLegalDocuments } from '@/api/config';
import { closeCurrentAppDialog, showAppDialog, showMemberRequiredDialog } from '@/utils/app-dialog';
import type { CreativeTemplate } from '@/utils/mock';
import { markAnnouncementRead, closeAnnouncement } from '@/api/announcements';
import { homeEntryDisabledMessage, isHomeEntryMaintenanceMode, type HomeEntryKey } from '@/utils/home-entry';
import { isPurchaseEnabled, showPurchaseUnavailable } from '@/utils/purchase-guard';
import { createShareMessage, createShareTimeline, enableShareMenu } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';

type EntryKey = HomeEntryKey;

interface EntryCard {
  key: EntryKey;
  image: string;
  icon: string;
  title: string;
  sub: string;
}

interface InspirationItem {
  id: string | number;
  title: string;
  author: string;
  likes: string;
  favoriteCount?: number;
  favoriteText?: string;
  isFavorited?: boolean;
  category: string;
  tag: string;
  theme: string;
  kind: 'image' | 'video';
  avatar?: string;
  cover?: string;
  mediaUrl?: string;
  prompt?: string;
  canUse?: boolean;
  canSave?: boolean;
  lockReason?: string;
}

interface HomeAnnouncement {
  id: number;
  title: string;
  content: string;
  type: string;
  showFrequency: string;
  readAt: string | null;
  closedAt?: string | null;
  lastPopupAt?: string | null;
  popupCount?: number;
  startAt?: string | null;
  createdAt?: string | null;
}

interface LocalAnnouncementPopupRecord {
  lastPopupAt?: string;
  closedAt?: string;
  readAt?: string;
  popupCount?: number;
}

interface LegalDocument {
  docType: string;
  title: string;
  version: string;
  content: string;
}

const LOCAL_HOME_BANNER = '/static/home/home_banner.jpg';
const LOCAL_HOME_MEMBER_UPSELL = '/static/home/home_member_upsell.jpg';
const allEntryCards: EntryCard[] = [
  { key: 'image', image: '/static/home/home_entry_image.jpg', icon: '/static/icons/workbench_image.svg', title: 'AI生图', sub: '智能生成图片' },
  { key: 'video', image: '/static/home/home_entry_video.jpg', icon: '/static/icons/workbench_video.svg', title: 'AI视频', sub: '一键生成视频' },
  { key: 'comic', image: '/static/home/home_entry_comic.jpg', icon: '/static/icons/workbench_comic.svg', title: 'AI漫剧', sub: '漫画与故事创作' }
];

const fallbackInspirations: InspirationItem[] = [
  { id: 'home_demo_comic', title: '治愈系少女日常', author: '@官方灵感', likes: '12.3w', category: '漫画', tag: '漫画', theme: 'flower', kind: 'image', prompt: '治愈系少女日常，春日花园，国漫精致画风。' },
  { id: 'home_demo_city', title: '未来城市科幻风', author: '@官方灵感', likes: '8.7w', category: '视频', tag: '视频', theme: 'neon', kind: 'video', prompt: '未来城市霓虹街道，跑车穿过雨夜，高级科幻短片。' },
  { id: 'home_demo_cat', title: '可爱猫咪系列', author: '@官方灵感', likes: '6.4w', category: '漫画', tag: '漫画', theme: 'cat', kind: 'image', prompt: '可爱猫咪漫画角色，软萌表情，粉紫渐变背景。' },
  { id: 'home_demo_landscape', title: '国风山水意境', author: '@官方灵感', likes: '5.1w', category: '图片', tag: '图片', theme: 'landscape', kind: 'image', prompt: '国风山水意境，云雾山峰，淡雅高级插画。' },
  { id: 'home_demo_wallpaper', title: '梦幻星空壁纸', author: '@官方灵感', likes: '4.8w', category: '壁纸', tag: '壁纸', theme: 'sky', kind: 'image', prompt: '梦幻星空壁纸，紫粉星云，柔和光感。' },
  { id: 'home_demo_story', title: '异世界冒险开篇', author: '@官方灵感', likes: '3.9w', category: '小说', tag: '小说', theme: 'story', kind: 'image', prompt: '异世界冒险开篇，少年打开发光古书，奇幻氛围。' }
];

const fallbackInspirationTabs = ['漫画', '视频', '图片', '小说', '壁纸'];
const authStore = useAuthStore();
const configStore = useConfigStore();
const userStore = useUserStore();
const activeInspirationTab = ref('推荐');
const inspirationCategoryTabs = ref<string[]>([]);

const inspirations = ref<InspirationItem[]>([]);
const previewTemplate = ref<CreativeTemplate | null>(null);
const loadingInspirations = ref(false);
const cyclingInspirations = ref(false);
const pullRefreshing = ref(false);
const favoritePending = ref<Record<string, boolean>>({});
const pendingFavoriteId = ref('');
const phoneBinding = ref(false);
const hasMore = ref(true);
const page = ref(1);
const pageSize = 12;
const failedVisualAssets = ref<Record<string, boolean>>({});
const entryImageErrors = ref<Record<string, boolean>>({});
const popupDismissed = ref(false);
const phonePromptDismissed = ref(false);
const dialogFlowRunning = ref(false);
const bootingHomeRedirect = ref(true);
const shouldCheckLaunchRedirect = ref(true);

const appName = computed(() => {
  const source = configStore.publicConfig || {};
  return String(source.appName || source.siteName || 'AI艺术生成工坊');
});
const membershipEnabled = computed(() => configStore.publicConfig?.membershipEnabled !== false);
const purchaseEnabled = computed(() => isPurchaseEnabled(configStore.publicConfig));
const storyboardGenerateEnabled = computed(() => configStore.features.storyboardGenerate !== false);
const entryCards = computed(() => allEntryCards);
const showMemberFloat = computed(() => configStore.publicConfigReady && purchaseEnabled.value && membershipEnabled.value && !userStore.isMember);
const phoneBound = computed(() => Boolean(
  userStore.user?.phoneBound
  || userStore.user?.phone
  || authStore.user?.phoneBound
  || authStore.user?.phone
));
const visualAssets = computed(() => {
  const value = configStore.publicConfig?.visualAssets;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const homeBannerSource = computed(() => visualAssetSource('homeBanner', 'homeBannerUrl', LOCAL_HOME_BANNER));
const memberUpsellSource = computed(() => visualAssetSource('homeMemberUpsell', 'homeMemberUpsellUrl', LOCAL_HOME_MEMBER_UPSELL));
const homeAnnouncement = computed(() => {
  const homeData = configStore.homeData || {};
  const list = Array.isArray(homeData.homeAnnouncements) ? homeData.homeAnnouncements : [];
  const first = list[0];
  if (first && typeof first === 'object') return normalizeHomeAnnouncement(first as Record<string, unknown>);
  const popup = homeData.popupAnnouncement;
  if (popup && typeof popup === 'object') return normalizeHomeAnnouncement(popup as Record<string, unknown>);
  return null;
});
const inspirationTabs = computed(() => ['推荐', ...uniqueTexts(inspirationCategoryTabs.value.length ? inspirationCategoryTabs.value : fallbackInspirationTabs)]);
const filteredInspirations = computed(() => {
  return inspirations.value.filter((item) => tabMatches(item, activeInspirationTab.value));
});
const inspirationColumns = computed(() => {
  const columns: InspirationItem[][] = [[], []];
  filteredInspirations.value.forEach((item, index) => {
    columns[index % 2].push(item);
  });
  return columns;
});

onLoad((query) => {
  pendingFavoriteId.value = String(query?.favoriteId || '');
});

onShow(() => {
  enableShareMenu();
  bootingHomeRedirect.value = false;
  refreshHomePage(!inspirations.value.length).catch(() => undefined);
});

onShareAppMessage(() => createShareMessage({
  title: 'AI艺术生成工坊，一键生成图片和视频',
  path: PAGE_ROUTES.home
}));

onShareTimeline(() => createShareTimeline({
  title: 'AI艺术生成工坊，一键生成图片和视频',
  path: PAGE_ROUTES.home
}));

onPullDownRefresh(() => {
  pullRefreshing.value = true;
  refreshHomePage(true, true).finally(() => {
    pullRefreshing.value = false;
    uni.stopPullDownRefresh();
  });
});

onReachBottom(() => {
  loadInspirations(false);
});

async function refreshHomePage(reloadInspirations: boolean, force = false) {
  configStore.hydrate();
  const authHydrated = authStore.hydrate().catch(() => undefined);
  const userHydrated = userStore.hydrate().catch(() => undefined);

  const configPromise = configStore.loadPublicConfig({ force: true }).catch(() => undefined);
  const configLoaded = await Promise.race([configPromise.then(() => true), delay(1200).then(() => false)]);
  if (configLoaded && shouldCheckLaunchRedirect.value) {
    shouldCheckLaunchRedirect.value = false;
    if (redirectToConfiguredLaunchTab()) return;
  }
  await Promise.all([authHydrated, userHydrated]);
  await configPromise;
  if (!configLoaded && shouldCheckLaunchRedirect.value) {
    shouldCheckLaunchRedirect.value = false;
    if (redirectToConfiguredLaunchTab()) return;
  }
  bootingHomeRedirect.value = false;

  const homePromise = configStore.loadHomeData({ force });

  await Promise.all([
    homePromise.catch(() => undefined),
    authStore.isLoggedIn ? userStore.loadFullProfile().catch(() => undefined) : Promise.resolve(),
    loadInspirationCategories(force).catch(() => undefined),
    reloadInspirations ? loadInspirations(true).catch(() => undefined) : Promise.resolve()
  ]);

  runHomeDialogFlow().catch(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redirectToConfiguredLaunchTab() {
  const launchPath = firstConfiguredTabPath(configStore.publicConfig);
  if (!launchPath || launchPath === PAGE_ROUTES.home) return false;
  if (!isKnownTabPage(launchPath)) return false;
  uni.reLaunch({ url: launchPath });
  return true;
}

function firstConfiguredTabPath(sourceConfig: unknown) {
  const root = asRecord(sourceConfig);
  const navigation = asRecord(root.navigation);
  const candidates = [root.tabBar, root.bottomNav, root.navTabs, navigation.tabBar, navigation.bottom, navigation.tabs];
  const source = candidates.find(Array.isArray);
  if (!Array.isArray(source)) return '';
  for (const item of source) {
    const path = normalizeRoute(asRecord(item).path || asRecord(item).pagePath || asRecord(item).url || asRecord(item).route);
    if (path) return path;
  }
  return '';
}

function normalizeRoute(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const aliasMap: Record<string, string> = {
    home: PAGE_ROUTES.home,
    index: PAGE_ROUTES.home,
    inspiration: PAGE_ROUTES.inspiration,
    spark: PAGE_ROUTES.inspiration,
    comic: PAGE_ROUTES.comic,
    manga: PAGE_ROUTES.comic,
    history: PAGE_ROUTES.history,
    records: PAGE_ROUTES.history,
    profile: PAGE_ROUTES.profile,
    mine: PAGE_ROUTES.profile
  };
  if (aliasMap[raw]) return aliasMap[raw];
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function isKnownTabPage(path: string) {
  const knownTabPages: string[] = [
    PAGE_ROUTES.home,
    PAGE_ROUTES.inspiration,
    PAGE_ROUTES.comic,
    PAGE_ROUTES.history,
    PAGE_ROUTES.profile
  ];
  return knownTabPages.includes(path);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function runHomeDialogFlow() {
  if (dialogFlowRunning.value) return;
  dialogFlowRunning.value = true;
  try {
    await maybeShowAgreementDialog();
    await maybeShowPhoneDialog();
    await maybeShowAnnouncementDialog();
  } finally {
    dialogFlowRunning.value = false;
  }
}

async function maybeShowAgreementDialog() {
  const legalRequired = (configStore.homeData?.legalRequired || {}) as Record<string, any>;
  const serverCheckedAgreement = authStore.isLoggedIn && typeof legalRequired.required === 'boolean';
  const serverRequiresAgreement = authStore.isLoggedIn && Boolean(legalRequired.required);
  const docs = await loadLegalDocumentsForDialog();
  const signature = legalSignature(docs, legalRequired);
  if (hasStoredLegalConsent(signature)) {
    if (serverRequiresAgreement) syncLegalConsentToServer(docs, 'first_open').catch(() => undefined);
    markHomeLegalAccepted();
    return;
  }
  if (serverCheckedAgreement && !serverRequiresAgreement) {
    rememberLegalConsent(signature);
    return;
  }

  await showAppDialog({
    variant: 'agreement',
    image: '/static/icons/icon_security_shield.svg',
    title: '请先阅读并同意协议',
    subtitle: '继续使用前，请确认已阅读用户协议、隐私政策和 AI 内容规则。',
    richContent: agreementSummary(docs, legalRequired),
    primaryLabel: '同意并继续',
    secondaryLabel: '查看完整协议',
    closable: false,
    maskClosable: false,
    onPrimary: async () => {
      if (authStore.isLoggedIn && docs.length) {
        await syncLegalConsentToServer(docs, 'first_open');
      }
      rememberLegalConsent(signature);
    },
    onSecondary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.agreement });
    }
  });
}

function hasStoredLegalConsent(signature: string) {
  return Boolean(signature && String(uni.getStorageSync(STORAGE_KEYS.legalConsent) || '') === signature);
}

function rememberLegalConsent(signature: string) {
  if (signature) uni.setStorageSync(STORAGE_KEYS.legalConsent, signature);
  markHomeLegalAccepted();
}

function markHomeLegalAccepted() {
  if (!configStore.homeData) return;
  configStore.homeData = {
    ...configStore.homeData,
    complianceRequired: false,
    legalRequired: { required: false, missing: [] },
  };
}

function syncLegalConsentToServer(docs: LegalDocument[], scene: string) {
  if (!authStore.isLoggedIn || !docs.length) return Promise.resolve();
  return acceptLegalDocuments(
    docs.map((item) => ({ docType: item.docType, version: item.version })),
    scene
  );
}

async function maybeShowPhoneDialog() {
  if (!authStore.isLoggedIn || phoneBound.value || phonePromptDismissed.value) return;
  await showAppDialog({
    variant: 'phone',
    hideVisual: true,
    title: '绑定手机号',
    subtitle: '用于订单通知、生成结果提醒、售后联系和账号安全验证。',
    primaryLabel: phoneBinding.value ? '绑定中' : '授权手机号',
    secondaryLabel: '暂不绑定',
    primaryOpenType: 'getPhoneNumber',
    onGetPhoneNumber: async (event) => {
      const ok = await handleGetPhoneNumber(event);
      if (ok) {
        phonePromptDismissed.value = true;
        closeCurrentAppDialog('phone');
      }
      return false;
    },
    onSecondary: () => {
      phonePromptDismissed.value = true;
    }
  });
}

async function maybeShowAnnouncementDialog() {
  if (popupDismissed.value) return;
  const homeData = configStore.homeData || {};
  const popup = homeData.popupAnnouncement;
  if (!popup || typeof popup !== 'object' || Object.keys(popup).length === 0) return;
  const announcement = normalizeHomeAnnouncement(popup as Record<string, unknown>);
  if (!announcement.id && !announcement.title && !announcement.content) return;
  if (!shouldShowLocalAnnouncementPopup(announcement)) return;
  markLocalAnnouncementPopupSeen(announcement);
  await showAppDialog({
    variant: 'announcement',
    hideVisual: true,
    title: announcement.title || '公告',
    richContent: announcement.content || '暂无公告内容',
    primaryLabel: '我知道了',
    secondaryLabel: '查看全部公告',
    onSecondary: () => {
      uni.navigateTo({ url: PAGE_ROUTES.announcements });
    },
    onClose: () => {
      closeHomeAnnouncement(announcement);
    }
  });
}

async function loadLegalDocumentsForDialog(): Promise<LegalDocument[]> {
  try {
    const res = await getLegalDocuments<Record<string, unknown>>();
    const docs = (res.documents || res.list || []) as Record<string, unknown>[];
    return docs.map(normalizeLegalDocument).filter((item) => item.docType && item.version);
  } catch {
    return [];
  }
}

function normalizeLegalDocument(row: Record<string, unknown>): LegalDocument {
  return {
    docType: String(row.docType || row.doc_type || ''),
    title: String(row.title || '用户协议'),
    version: String(row.version || ''),
    content: String(row.content || '')
  };
}

function legalSignature(docs: LegalDocument[], legalRequired: Record<string, any>) {
  if (docs.length) return docs.map((item) => `${item.docType}:${item.version}`).join('|');
  const missing = Array.isArray(legalRequired.missing) ? legalRequired.missing : [];
  if (missing.length) return missing.map((item: any) => `${item.docType || item.doc_type}:${item.version || ''}`).join('|');
  return 'local-legal-v1';
}

function agreementSummary(docs: LegalDocument[], legalRequired: Record<string, any>) {
  const names = docs.length
    ? docs.map((item) => `${item.title} v${item.version}`)
    : Array.isArray(legalRequired.missing)
      ? legalRequired.missing.map((item: any) => `${item.title || '协议'} v${item.version || ''}`)
      : [];
  const list = names.length ? names : ['用户协议', '隐私政策', 'AI 内容规则'];
  const items = list
    .map((item) => `<p style="margin:6px 0;text-align:center;color:#263348;font-weight:700;">${escapeRichText(item)}</p>`)
    .join('');
  return `<div style="text-align:center;"><p style="margin:0 0 10px;color:#1f2b3d;font-weight:800;">继续使用前请先同意以下协议</p>${items}<p style="margin:12px 0 0;color:#4f5d72;line-height:1.65;">同意后即可进入小程序，完整内容可随时在“我的-用户协议”查看。</p></div>`;
}

function escapeRichText(value: string) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[char] || char;
  });
}

function closeHomeAnnouncement(announcement: HomeAnnouncement) {
  popupDismissed.value = true;
  markLocalAnnouncementClosed(announcement);
  if (!authStore.isLoggedIn || !announcement.id) return;
  markAnnouncementRead(Number(announcement.id)).catch(() => undefined);
  closeAnnouncement(Number(announcement.id)).catch(() => undefined);
}

function goCreate() {
  goEntry('image');
}

function goEntry(key: EntryKey) {
  if (isHomeEntryMaintenanceMode(configStore.publicConfig, key)) {
    showHomeEntryMaintenanceMessage(key);
    return;
  }
  if (key === 'image') {
    uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?type=${encodeURIComponent('文生图')}` });
    return;
  }
  if (key === 'video') {
    uni.navigateTo({ url: PAGE_ROUTES.aiVideo });
    return;
  }
  if (!storyboardGenerateEnabled.value) {
    uni.showToast({ title: 'AI漫剧功能已关闭', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: PAGE_ROUTES.comic });
}

function showHomeEntryMaintenanceMessage(key: EntryKey) {
  uni.showModal({
    title: '温馨提示',
    content: homeEntryDisabledMessage(configStore.publicConfig, key),
    showCancel: false,
    confirmText: '知道了'
  });
}

function goMember() {
  if (!purchaseEnabled.value) {
    showPurchaseUnavailable(configStore.publicConfig);
    return;
  }
  if (!membershipEnabled.value) {
    uni.showToast({ title: '会员功能已关闭', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: PAGE_ROUTES.member });
}

function goAnnouncements() {
  if (homeAnnouncement.value?.id) {
    markLocalAnnouncementRead(homeAnnouncement.value);
    if (authStore.isLoggedIn) markAnnouncementRead(Number(homeAnnouncement.value.id)).catch(() => undefined);
  }
  uni.navigateTo({ url: PAGE_ROUTES.announcements });
}

async function handleGetPhoneNumber(event: any) {
  if (phoneBinding.value) return false;
  const code = String(event?.detail?.code || '').trim();
  if (!code) {
    uni.showToast({ title: '未获得手机号授权', icon: 'none' });
    return false;
  }
  phoneBinding.value = true;
  try {
    await userStore.bindPhoneByCode(code);
    uni.showToast({ title: '手机号已绑定', icon: 'none' });
    return true;
  } catch (error) {
    uni.showToast({ title: requestErrorText(error, '绑定手机号失败'), icon: 'none' });
    return false;
  } finally {
    phoneBinding.value = false;
  }
}

function requestErrorText(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? message.slice(0, 60) : fallback;
}

async function refreshInspirations() {
  if (loadingInspirations.value) return;
  playInspirationRefreshMotion();
  await loadInspirations(true);
}

function visualAssetSource(localKey: string, configKey: string, fallback: string) {
  const remote = String(visualAssets.value[configKey] || '').trim();
  if (remote && !failedVisualAssets.value[`${localKey}:${remote}`]) return remote;
  if (!failedVisualAssets.value[`${localKey}:${fallback}`]) return fallback;
  return '';
}

function onVisualAssetError(localKey: string) {
  const source = localKey === 'homeBanner' ? homeBannerSource.value : memberUpsellSource.value;
  const fallback = localKey === 'homeBanner' ? LOCAL_HOME_BANNER : LOCAL_HOME_MEMBER_UPSELL;
  failedVisualAssets.value = {
    ...failedVisualAssets.value,
    [`${localKey}:${source || fallback}`]: true
  };
}

function onEntryImageError(key: EntryKey) {
  entryImageErrors.value = {
    ...entryImageErrors.value,
    [key]: true
  };
}

async function loadInspirations(reset: boolean) {
  if (loadingInspirations.value) return;
  if (!reset && !hasMore.value) return;
  if (reset) {
    page.value = 1;
    hasMore.value = true;
  }
  loadingInspirations.value = true;
  try {
    const res = await getHomeInspirations<{ list?: Record<string, unknown>[]; total?: number; hasMore?: boolean; fallback?: boolean }>({
      page: page.value,
      pageSize
    });
    const list = Array.isArray(res.list) ? res.list : [];
    if (!list.length && isDevFallbackEnabled && reset) {
      warnDevFallback('home-inspirations', 'GET /templates/home-inspirations returned empty list');
      inspirations.value = fallbackInspirations;
      hasMore.value = false;
      return;
    }
    if (!list.length) {
      if (reset) inspirations.value = [];
      hasMore.value = false;
      return;
    }
    const next = list.map((item, index) => normalizeInspiration(item, (page.value - 1) * pageSize + index));
    const merged = reset ? next : mergeInspirations(inspirations.value, next);
    inspirations.value = merged;
    consumePendingFavorite();
    page.value += 1;
    const total = Number(res.total || 0);
    hasMore.value = typeof res.hasMore === 'boolean'
      ? res.hasMore
      : total > 0
        ? merged.length < total
        : next.length >= pageSize && (!reset || merged.length > next.length);
  } catch {
    if (isDevFallbackEnabled && reset) {
      warnDevFallback('home-inspirations', 'GET /templates/home-inspirations failed');
      inspirations.value = fallbackInspirations;
      hasMore.value = false;
      return;
    }
    if (reset) inspirations.value = [];
    hasMore.value = false;
  } finally {
    loadingInspirations.value = false;
  }
}

async function loadInspirationCategories(force = false) {
  if (!force && inspirationCategoryTabs.value.length) return;
  try {
    const res = await getTemplateCategories<{ list?: Record<string, unknown>[] }>();
    const list = Array.isArray(res.list) ? res.list : [];
    const names = uniqueTexts(list.map((item) => String(item.name || item.category || item.categoryName || '').trim()).filter(Boolean));
    inspirationCategoryTabs.value = names.length ? names : fallbackInspirationTabs;
  } catch {
    inspirationCategoryTabs.value = fallbackInspirationTabs;
  }
  if (!inspirationTabs.value.includes(activeInspirationTab.value)) {
    setActiveInspirationTab('推荐');
  }
}

function setActiveInspirationTab(tab: string) {
  activeInspirationTab.value = tab;
}

function playInspirationRefreshMotion() {
  cyclingInspirations.value = true;
  setTimeout(() => {
    cyclingInspirations.value = false;
  }, 420);
}

function mergeInspirations(current: InspirationItem[], next: InspirationItem[]) {
  const seen = new Set(current.map((item) => String(item.id)));
  const additions = next.filter((item) => {
    const id = String(item.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!additions.length) {
    hasMore.value = false;
    return current;
  }
  return [...current, ...additions];
}

function useInspiration(item: InspirationItem) {
  previewTemplate.value = {
    id: String(item.id),
    title: item.title,
    tags: [item.kind === 'video' ? '视频' : '图片', item.category, '灵感'],
    prompt: item.prompt || item.title,
    mediaType: item.kind,
    coverUrl: item.cover || '',
    mediaUrl: item.mediaUrl || '',
    mode: item.kind === 'video' ? 'text2video' : 'text2img',
    category: item.category,
    duration: item.kind === 'video' ? '10s' : undefined,
    favoriteCount: item.favoriteCount,
    isFavorited: item.isFavorited,
    canUse: item.canUse !== false,
    canSave: item.canSave !== false && item.canUse !== false,
    lockReason: item.lockReason || ''
  };
}

function togglePreviewFavorite(template: CreativeTemplate) {
  const target = inspirations.value.find((item) => String(item.id) === String(template.id));
  if (!target) {
    uni.showToast({ title: '该内容暂不支持收藏', icon: 'none' });
    return;
  }
  toggleFavorite(target);
}

async function toggleFavorite(item: InspirationItem) {
  const templateId = numericTemplateId(item.id);
  if (!templateId) {
    uni.showToast({ title: '该内容暂不支持收藏', icon: 'none' });
    return;
  }
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后收藏灵感',
      subtitle: '登录并授权手机号后，可同步收藏到你的账号。'
    });
    if (!loggedIn) return;
  }
  const id = String(item.id);
  if (favoritePending.value[id]) return;

  const before = {
    isFavorited: item.isFavorited === true,
    favoriteCount: Math.max(0, Math.floor(Number(item.favoriteCount || 0) || 0))
  };
  const nextFavorited = !before.isFavorited;
  const nextCount = before.favoriteCount + (nextFavorited ? 1 : -1);
  favoritePending.value = { ...favoritePending.value, [id]: true };
  applyFavoriteState(id, nextFavorited, nextCount);
  try {
    const res = before.isFavorited
      ? await unfavoriteTemplate<{ isFavorited?: boolean; favoriteCount?: number }>(templateId)
      : await favoriteTemplate<{ isFavorited?: boolean; favoriteCount?: number }>(templateId);
    applyFavoriteState(id, res.isFavorited === true, Number(res.favoriteCount || 0));
    userStore.loadFullProfile().catch(() => undefined);
  } catch (error) {
    applyFavoriteState(id, before.isFavorited, before.favoriteCount);
    const message = error instanceof Error ? error.message : '';
    uni.showToast({ title: message || '收藏失败，请稍后重试', icon: 'none' });
  } finally {
    const next = { ...favoritePending.value };
    delete next[id];
    favoritePending.value = next;
  }
}

function consumePendingFavorite() {
  if (!pendingFavoriteId.value || !authStore.isLoggedIn) return;
  const target = inspirations.value.find((item) => String(item.id) === pendingFavoriteId.value);
  if (!target) return;
  pendingFavoriteId.value = '';
  if (target.isFavorited) return;
  toggleFavorite(target);
}

function applyFavoriteState(id: string, isFavorited: boolean, count: number) {
  const favoriteCount = Math.max(0, Math.floor(Number(count) || 0));
  const update = (item: InspirationItem) => {
    if (String(item.id) !== id) return item;
    return { ...item, isFavorited, favoriteCount, favoriteText: formatCount(favoriteCount), likes: formatCount(favoriteCount) };
  };
  inspirations.value = inspirations.value.map(update);
  if (previewTemplate.value && String(previewTemplate.value.id) === id) {
    previewTemplate.value = {
      ...previewTemplate.value,
      isFavorited,
      favoriteCount
    };
  }
}

async function usePreviewTemplate(item: CreativeTemplate) {
  if (item.canUse === false) {
    showMemberRequiredDialog({
      title: '开通会员使用模板',
      message: item.lockReason || '该模板需开通会员后使用。'
    });
    return;
  }
  const backendTemplateId = numericTemplateId(item.id);
  if (backendTemplateId) {
    try {
      await useContentTemplate(backendTemplateId);
    } catch {
      return;
    }
  }
  previewTemplate.value = null;
  const prompt = encodeURIComponent(item.prompt);
  const target = item.mediaType === 'video' ? PAGE_ROUTES.aiVideo : PAGE_ROUTES.aiImage;
  uni.navigateTo({ url: `${target}?prompt=${prompt}` });
}

function normalizeHomeAnnouncement(row: Record<string, unknown>): HomeAnnouncement {
  return {
    id: Number(row.id || 0),
    title: String(row.title || '公告'),
    content: String(row.content || ''),
    type: String(row.type || 'home'),
    showFrequency: String(row.showFrequency || row.show_frequency || 'once_per_day'),
    readAt: String(row.readAt || row.read_at || '') || null,
    closedAt: String(row.closedAt || row.closed_at || '') || null,
    lastPopupAt: String(row.lastPopupAt || row.last_popup_at || '') || null,
    popupCount: Number(row.popupCount || row.popup_count || 0),
    startAt: String(row.startAt || row.start_at || '') || null,
    createdAt: String(row.createdAt || row.created_at || '') || null
  };
}

function shouldShowLocalAnnouncementPopup(announcement: HomeAnnouncement) {
  const frequency = announcement.showFrequency || 'once_per_day';
  if (frequency === 'list_only') return false;
  if (frequency === 'every_open') return true;
  const record = getLocalAnnouncementRecord(announcement);
  if (!record) return true;
  if (frequency === 'once') return !record.closedAt && !record.readAt && !Number(record.popupCount || 0);
  if (frequency === 'once_per_day') {
    return !isSameLocalDate(record.closedAt)
      && !isSameLocalDate(record.readAt)
      && !isSameLocalDate(record.lastPopupAt);
  }
  return true;
}

function markLocalAnnouncementPopupSeen(announcement: HomeAnnouncement) {
  updateLocalAnnouncementRecord(announcement, (record) => ({
    ...record,
    lastPopupAt: new Date().toISOString(),
    popupCount: Number(record.popupCount || 0) + 1
  }));
}

function markLocalAnnouncementClosed(announcement: HomeAnnouncement) {
  updateLocalAnnouncementRecord(announcement, (record) => ({
    ...record,
    closedAt: new Date().toISOString()
  }));
}

function markLocalAnnouncementRead(announcement: HomeAnnouncement) {
  updateLocalAnnouncementRecord(announcement, (record) => ({
    ...record,
    readAt: new Date().toISOString()
  }));
}

function getLocalAnnouncementRecord(announcement: HomeAnnouncement) {
  return readLocalAnnouncementState()[localAnnouncementKey(announcement)];
}

function updateLocalAnnouncementRecord(
  announcement: HomeAnnouncement,
  updater: (record: LocalAnnouncementPopupRecord) => LocalAnnouncementPopupRecord
) {
  const key = localAnnouncementKey(announcement);
  if (!key) return;
  const state = readLocalAnnouncementState();
  state[key] = updater(state[key] || {});
  const trimmed: Record<string, LocalAnnouncementPopupRecord> = {};
  Object.entries(state).slice(-50).forEach(([itemKey, itemValue]) => {
    trimmed[itemKey] = itemValue;
  });
  uni.setStorageSync(STORAGE_KEYS.announcementPopupState, trimmed);
}

function readLocalAnnouncementState(): Record<string, LocalAnnouncementPopupRecord> {
  const value = uni.getStorageSync(STORAGE_KEYS.announcementPopupState);
  return value && typeof value === 'object' ? value as Record<string, LocalAnnouncementPopupRecord> : {};
}

function localAnnouncementKey(announcement: HomeAnnouncement) {
  return announcement.id ? String(announcement.id) : `${announcement.type}:${announcement.title}`;
}

function isSameLocalDate(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function normalizeInspiration(item: Record<string, unknown>, index: number): InspirationItem {
  const templateType = String(item.templateType || item.template_type || item.mediaType || item.type || 'image');
  const title = String(item.title || '灵感模板');
  const category = categoryOf(item, templateType, title);
  const kind = isVideoType(templateType) || category === '视频' ? 'video' : 'image';
  const originalCover = item.coverUrl || item.cover_url || item.cover;
  const thumbnail = item.thumbnailUrl || item.thumbnail_url || item.thumbUrl || item.thumb_url || item.thumbnail || item.thumb || originalCover;
  const mediaSource = item.previewUrl || item.preview_url || item.mediaUrl || item.media_url || originalCover || thumbnail;
  const favoriteCount = Math.max(0, Math.floor(Number(item.favoriteCount || item.favorite_count || 0) || 0));
  const author = templateAuthorOf(item);
  return {
    id: item.id as string | number || `inspiration_${index}`,
    title,
    author,
    likes: formatCount(favoriteCount),
    favoriteCount,
    favoriteText: formatCount(favoriteCount),
    isFavorited: item.isFavorited === true || item.is_favorited === true,
    category,
    tag: tagOf(kind, category),
    theme: ['flower', 'neon', 'cat', 'landscape', 'sky', 'story'][index % 6],
    kind,
    avatar: normalizeBackendMediaUrl(item.avatarUrl || item.avatar_url || item.authorAvatar || item.author_avatar),
    cover: normalizeBackendMediaUrl(thumbnail),
    mediaUrl: normalizeBackendMediaUrl(mediaSource),
    prompt: String(item.prompt || item.description || title),
    canUse: item.canUse !== false,
    canSave: item.canSave !== false && item.canUse !== false,
    lockReason: String(item.lockReason || '')
  };
}

function templateAuthorOf(item: Record<string, unknown>) {
  const raw = String(item.author || item.nickname || item.creatorName || item.creator_name || item.userNickname || '').trim();
  if (raw) return raw.startsWith('@') ? raw : `@${raw}`;
  const source = String(item.source || '').trim();
  const userId = String(item.userId || item.user_id || '').trim();
  if (source === 'user' && userId) return `@用户${userId}`;
  return '@官方灵感';
}

function numericTemplateId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function categoryOf(item: Record<string, unknown>, templateType: string, title: string) {
  const raw = String(item.categoryName || item.category || item.scene || '').trim();
  if (raw) return raw;
  const text = `${templateType}${title}`;
  if (/视频|video/i.test(text)) return '视频';
  if (/漫画|漫剧|comic|manga/i.test(text)) return '漫画';
  if (/壁纸|wallpaper/i.test(text)) return '壁纸';
  if (/小说|故事|剧本|story|novel/i.test(text)) return '小说';
  if (/图片|绘画|摄影|image|photo/i.test(text)) return '图片';
  return raw || '图片';
}

function isVideoType(value: string) {
  return /video|视频|动态/i.test(value);
}

function tagOf(kind: 'image' | 'video', category: string) {
  if (kind === 'video') return '视频';
  if (category === '漫画') return '漫画';
  if (category === '壁纸') return '壁纸';
  if (category === '小说') return '小说';
  return '图片';
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const text = value.trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function tabMatches(item: InspirationItem, tab: string) {
  if (tab === '推荐') return true;
  return item.category === tab || item.tag === tab;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value || 0);
}

function hasFavoriteCount(value?: number) {
  return Math.max(0, Math.floor(Number(value || 0) || 0)) > 0;
}

function formatAnnouncementTime(value?: string | null) {
  if (!value) return '';
  const raw = String(value).trim().replace(/\//g, '-');
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?/);
  if (match && !hasTimeZone) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    return `${year}-${padDateTime(month)}-${padDateTime(day)} ${padDateTime(hour)}:${padDateTime(minute)}:${padDateTime(second)}`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return `${date.getFullYear()}-${padDateTime(date.getMonth() + 1)}-${padDateTime(date.getDate())} ${padDateTime(date.getHours())}:${padDateTime(date.getMinutes())}:${padDateTime(date.getSeconds())}`;
}

function padDateTime(value: string | number) {
  return String(value).padStart(2, '0');
}
</script>

<style scoped lang="scss">
.home-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 0 24rpx calc(250rpx + env(safe-area-inset-bottom));
  background: #f8f6ff;
  color: #1f2437;
}

.home-page--booting > view:not(.app-nav-root):not(.pull-refresh-indicator):not(.app-dialog-host-root):not(.app-dialog-host),
.home-page--booting > scroll-view,
.home-page--booting > button {
  visibility: hidden;
}

.home-page--booting .home-nav-title {
  visibility: hidden;
}

.home-page::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 16% 4%, rgba(123, 92, 255, 0.12), transparent 28%),
    radial-gradient(circle at 86% 8%, rgba(255, 92, 184, 0.12), transparent 26%),
    linear-gradient(180deg, #fffaff 0%, #f8f6ff 46%, #f7f8ff 100%);
  content: "";
  pointer-events: none;
}

.home-page > view:not(.app-nav-root):not(.pull-refresh-indicator):not(.app-dialog-host-root):not(.app-dialog-host),
.home-page > scroll-view {
  position: relative;
  z-index: 1;
}

.home-page button::after {
  border: 0;
}

.home-nav-title {
  overflow: hidden;
  max-width: 360rpx;
  color: #1f2437;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pull-refresh-indicator {
  position: fixed;
  left: 50%;
  top: calc(env(safe-area-inset-top) + 92rpx);
  z-index: 32;
  display: flex;
  align-items: center;
  gap: 10rpx;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.96);
  color: #6c4bff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 56rpx;
  box-shadow: 0 10rpx 18rpx rgba(122, 92, 255, 0.16);
  opacity: 0;
  transform: translate(-50%, -16rpx);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: none;
}

.pull-refresh-indicator.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

.pull-refresh-spinner {
  flex-shrink: 0;
  width: 24rpx;
  height: 24rpx;
  border: 4rpx solid rgba(108, 75, 255, 0.22);
  border-top-color: #6c4bff;
  border-radius: 50%;
  animation: pull-refresh-spin 760ms linear infinite;
}

@keyframes pull-refresh-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .pull-refresh-indicator {
    transition: opacity 120ms ease;
    transform: translate(-50%, 0);
  }

  .pull-refresh-spinner {
    animation: none;
    border-color: rgba(108, 75, 255, 0.22);
    border-top-color: #6c4bff;
  }
}

.home-hero {
  position: relative;
  overflow: hidden;
  display: block;
  width: 100%;
  height: 258rpx;
  margin-bottom: 28rpx;
  padding: 38rpx 34rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 88% 78%, rgba(255, 209, 92, 0.44), transparent 18%),
    radial-gradient(circle at 70% 18%, rgba(255, 255, 255, 0.24), transparent 26%),
    linear-gradient(135deg, #6c4bff 0%, #8d5cff 52%, #ff76c8 100%);
  box-shadow: 0 12rpx 12rpx rgba(122, 92, 255, 0.16);
  box-sizing: border-box;
}

.home-hero::after {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 48% 34%, rgba(255, 255, 255, 0.82) 0 4rpx, transparent 5rpx),
    radial-gradient(circle at 64% 68%, rgba(255, 255, 255, 0.58) 0 5rpx, transparent 6rpx),
    linear-gradient(90deg, rgba(255, 255, 255, 0.18), transparent 58%);
  content: "";
  pointer-events: none;
}

.home-banner-image {
  position: absolute;
  inset: 0;
  z-index: 8;
  width: 100%;
  height: 100%;
}

.home-announcement {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 132rpx;
  margin-bottom: 28rpx;
  padding: 18rpx 24rpx 18rpx 16rpx;
  border: 2rpx solid rgba(131, 94, 255, 0.18);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 12% 50%, rgba(122, 92, 255, 0.2), transparent 33%),
    radial-gradient(circle at 92% 46%, rgba(255, 118, 200, 0.17), transparent 30%),
    linear-gradient(100deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 245, 255, 0.96) 58%, rgba(255, 244, 251, 0.96) 100%);
  box-shadow: 0 12rpx 18rpx rgba(122, 92, 255, 0.1);
  box-sizing: border-box;
  text-align: left;
}

.home-announcement::before {
  position: absolute;
  left: -20rpx;
  top: -26rpx;
  width: 170rpx;
  height: 170rpx;
  border-radius: 50%;
  background: rgba(122, 92, 255, 0.12);
  filter: blur(10rpx);
  content: "";
}

.home-announcement::after {
  position: absolute;
  right: -10rpx;
  bottom: -20rpx;
  width: 170rpx;
  height: 120rpx;
  border-radius: 50%;
  background: rgba(255, 118, 200, 0.1);
  filter: blur(12rpx);
  content: "";
}

.announcement-visual {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 112rpx;
  height: 112rpx;
  margin-right: 14rpx;
}

.announcement-copy {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
}

.announcement-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 16rpx;
}

.announcement-badge {
  flex-shrink: 0;
  height: 48rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff 0%, #6f42f4 62%, #9b70ff 100%);
  color: #ffffff;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 48rpx;
  box-shadow: 0 8rpx 12rpx rgba(111, 66, 244, 0.18);
}

.announcement-title {
  overflow: hidden;
  min-width: 0;
  color: #151a3b;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-meta {
  display: flex;
  align-items: center;
  min-height: 40rpx;
  margin-top: 14rpx;
  color: #9094bc;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.2;
}

.announcement-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42rpx;
  height: 42rpx;
  margin-left: 18rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff5cb8, #ff7acb);
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 42rpx;
}

.announcement-action {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-left: 18rpx;
  color: #6f42f4;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.2;
}

.announcement-arrow {
  margin-left: 10rpx;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1;
}

.hero-copy {
  position: relative;
  z-index: 3;
  width: 360rpx;
}

.hero-title {
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1.12;
  text-shadow: 0 6rpx 18rpx rgba(64, 34, 186, 0.24);
}

.hero-subtitle {
  margin-top: 20rpx;
  color: rgba(255, 255, 255, 0.9);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1.35;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 60rpx;
  margin-top: 28rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #6c4bff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 60rpx;
}

.hero-action text {
  margin-left: 8rpx;
  font-size: 26rpx;
}

.hero-art {
  position: absolute;
  right: 22rpx;
  bottom: 8rpx;
  z-index: 2;
  width: 284rpx;
  height: 234rpx;
}

.hero-card {
  position: absolute;
  width: 142rpx;
  height: 92rpx;
  border: 5rpx solid rgba(255, 255, 255, 0.9);
  border-radius: 18rpx;
  background: linear-gradient(135deg, #ffd6eb 0%, #7b5cff 100%);
  box-shadow: 0 10rpx 12rpx rgba(70, 47, 196, 0.16);
}

.card-back {
  left: 14rpx;
  top: 48rpx;
  transform: rotate(-14deg);
}

.card-front {
  left: 72rpx;
  top: 70rpx;
  background: linear-gradient(135deg, #b6d8ff 0%, #7b5cff 58%, #ff5cb8 100%);
  transform: rotate(8deg);
}

.hero-play {
  position: absolute;
  left: 56rpx;
  top: 30rpx;
  width: 0;
  height: 0;
  border-top: 17rpx solid transparent;
  border-bottom: 17rpx solid transparent;
  border-left: 26rpx solid #ffffff;
}

.hero-bot {
  position: absolute;
  right: 14rpx;
  top: 18rpx;
  width: 108rpx;
  height: 150rpx;
}

.bot-head {
  position: absolute;
  left: 8rpx;
  top: 0;
  width: 92rpx;
  height: 80rpx;
  border-radius: 42rpx;
  background: linear-gradient(180deg, #ffffff, #e9e4ff);
}

.bot-head::after {
  position: absolute;
  left: 18rpx;
  top: 24rpx;
  width: 56rpx;
  height: 32rpx;
  border-radius: 18rpx;
  background: #12193c;
  content: "";
}

.bot-eye {
  position: absolute;
  top: 34rpx;
  z-index: 2;
  width: 10rpx;
  height: 16rpx;
  border-radius: 999rpx;
  background: #64f3ff;
}

.bot-eye.left { left: 36rpx; }
.bot-eye.right { right: 36rpx; }

.bot-body {
  position: absolute;
  left: 26rpx;
  bottom: 0;
  width: 58rpx;
  height: 68rpx;
  border-radius: 26rpx 26rpx 18rpx 18rpx;
  background: linear-gradient(180deg, #ffffff, #d9d1ff);
}

.hero-coin,
.hero-star {
  position: absolute;
  border-radius: 50%;
}

.hero-coin {
  width: 36rpx;
  height: 36rpx;
  background: radial-gradient(circle at 34% 30%, #fff7c4, #ffd15c 62%, #ff9e3d);
}

.hero-coin.one { right: 0; bottom: 44rpx; }
.hero-coin.two { right: 34rpx; bottom: 4rpx; }

.hero-star {
  width: 18rpx;
  height: 18rpx;
  background: #ffd15c;
  transform: rotate(45deg);
}

.hero-star.one { left: 34rpx; bottom: 36rpx; }
.hero-star.two { right: 8rpx; top: 30rpx; }

.entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
  margin-bottom: 36rpx;
}

.entry-card {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 286rpx;
  padding: 0;
  border-radius: 22rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.1);
}

.entry-card:active {
  transform: translateY(2rpx);
}

.entry-card-image {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
}

.entry-card-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 26rpx 12rpx 22rpx;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.72), transparent 24%),
    linear-gradient(145deg, #f4f0ff 0%, #ffffff 100%);
  text-align: center;
}

.entry-image {
  background: linear-gradient(145deg, #f4f0ff, #fff2fb);
}

.entry-video {
  background: linear-gradient(145deg, #eef3ff, #f8efff);
}

.entry-comic {
  background: linear-gradient(145deg, #fff0f8, #f4f0ff);
}

.entry-fallback-icon {
  position: relative;
  width: 106rpx;
  height: 106rpx;
  border-radius: 34rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  box-shadow: 0 14rpx 22rpx rgba(122, 92, 255, 0.18);
}

.entry-video .entry-fallback-icon {
  background: linear-gradient(135deg, #6c7bff, #a76bff 58%, #ff70c8);
}

.entry-comic .entry-fallback-icon {
  background: linear-gradient(135deg, #ff76c9, #8b5cff);
}

.entry-fallback-icon::before {
  position: absolute;
  inset: 24rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.74);
  content: "";
}

.entry-fallback-icon-image {
  position: relative;
  z-index: 1;
  display: block;
  width: 64rpx;
  height: 64rpx;
  margin: 21rpx auto 0;
}

.entry-fallback-title {
  margin-top: 22rpx;
  color: #1f2437;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.2;
}

.entry-fallback-sub {
  margin-top: 8rpx;
  color: #8b8fa3;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.2;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.section-title {
  color: #1f2437;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 1.2;
}

.section-title text {
  margin-left: 6rpx;
  color: #ffd15c;
}

.section-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 48rpx;
  padding: 0;
  background: transparent;
  color: #6f7190;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 48rpx;
}

.section-refresh.loading {
  color: #7a5cff;
  opacity: 0.86;
}

.refresh-icon {
  position: relative;
  width: 24rpx;
  height: 24rpx;
  box-sizing: border-box;
  border: 4rpx solid #6f7190;
  border-left-color: transparent;
  border-radius: 50%;
}

.refresh-icon::after {
  position: absolute;
  right: -5rpx;
  top: 0;
  width: 0;
  height: 0;
  border-top: 7rpx solid #6f7190;
  border-left: 7rpx solid transparent;
  content: "";
  transform: rotate(28deg);
}

.section-refresh.loading .refresh-icon {
  border-color: #7a5cff;
  border-left-color: transparent;
  animation: pull-refresh-spin 0.82s linear infinite;
}

.section-refresh.loading .refresh-icon::after {
  border-top-color: #7a5cff;
}

.section-refresh.cycling .refresh-icon {
  animation: pull-refresh-spin 0.42s ease-out;
}

.inspiration-tabs {
  width: 100%;
  overflow: hidden;
  margin-bottom: 16rpx;
  white-space: nowrap;
}

.inspiration-tab-row {
  display: inline-flex;
  align-items: center;
  gap: 14rpx;
  padding-right: 20rpx;
}

.inspiration-tab {
  flex-shrink: 0;
  height: 48rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: #f0ecff;
  color: #766f9c;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 48rpx;
}

.inspiration-tab.active {
  background: linear-gradient(135deg, #7b5cff, #6c4bff);
  color: #ffffff;
}

.inspiration-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 18rpx;
  width: 100%;
}

.inspiration-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.inspiration-card {
  overflow: hidden;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border-radius: 20rpx;
  background: #f2f0fb;
  text-align: left;
  box-shadow: 0 10rpx 24rpx rgba(122, 92, 255, 0.1);
}

.inspiration-art {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 342rpx;
  border-radius: inherit;
  background: #e8f0ff;
}

.inspiration-cover,
.inspiration-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.theme-flower {
  background: radial-gradient(circle at 72% 24%, rgba(255, 255, 255, 0.76), transparent 19%), linear-gradient(135deg, #a78bff, #ffd6e8 52%, #fff7e9);
}

.theme-neon {
  background: radial-gradient(circle at 70% 28%, rgba(255, 92, 184, 0.52), transparent 26%), linear-gradient(145deg, #151b4f, #6c4bff 48%, #ff5cb8);
}

.theme-cat {
  background: radial-gradient(circle at 58% 30%, rgba(255, 255, 255, 0.84), transparent 20%), linear-gradient(145deg, #ffe6f1, #ff8bcf 50%, #8d70ff);
}

.theme-landscape {
  background: radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.84), transparent 20%), linear-gradient(145deg, #dff2ff, #cfe1ff 52%, #7b5cff);
}

.theme-sky {
  background: radial-gradient(circle at 24% 24%, rgba(255, 255, 255, 0.86), transparent 20%), linear-gradient(145deg, #615cff, #ff9bd2 55%, #ffd15c);
}

.theme-story {
  background: radial-gradient(circle at 66% 28%, rgba(255, 209, 92, 0.48), transparent 22%), linear-gradient(145deg, #38206f, #7b5cff 50%, #ff5cb8);
}

.inspiration-scene::before,
.inspiration-scene::after {
  position: absolute;
  content: "";
}

.inspiration-scene::before {
  left: 34rpx;
  top: 44rpx;
  width: 118rpx;
  height: 118rpx;
  border-radius: 40rpx;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: 82rpx 38rpx 0 -22rpx rgba(255, 255, 255, 0.34);
}

.inspiration-scene::after {
  right: 24rpx;
  bottom: 24rpx;
  width: 112rpx;
  height: 60rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(-12deg);
}

.inspiration-badge {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  z-index: 3;
  max-width: 140rpx;
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 17rpx;
  background: rgba(18, 22, 38, 0.48);
  color: #ffffff;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 34rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  backdrop-filter: blur(8rpx);
}

.inspiration-play {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  z-index: 3;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: rgba(23, 32, 51, 0.58);
  backdrop-filter: blur(8rpx);
}

.inspiration-play::after {
  position: absolute;
  top: 14rpx;
  left: 20rpx;
  width: 0;
  height: 0;
  border-top: 10rpx solid transparent;
  border-bottom: 10rpx solid transparent;
  border-left: 15rpx solid #ffffff;
  content: "";
}

.inspiration-title {
  overflow: hidden;
  height: 38rpx;
  max-width: 100%;
  margin: 0;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 38rpx;
  text-overflow: ellipsis;
  text-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.74),
    0 0 12rpx rgba(0, 0, 0, 0.48),
    0 1rpx 1rpx rgba(0, 0, 0, 0.66);
  white-space: nowrap;
}

.inspiration-overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  padding: 0 16rpx 16rpx;
}

.inspiration-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  margin-top: 8rpx;
}

.inspiration-source {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
  max-width: 132rpx;
  min-height: 34rpx;
  color: rgba(255, 255, 255, 0.92);
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.2;
  text-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.68),
    0 0 9rpx rgba(0, 0, 0, 0.44);
}

.inspiration-source-avatar {
  flex-shrink: 0;
  width: 30rpx;
  height: 30rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.44);
  border-radius: 50%;
}

.inspiration-source text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspiration-favorite {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5rpx;
  min-width: 34rpx;
  height: 34rpx;
  margin: 0;
  padding: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 20rpx;
  font-weight: 900;
  line-height: 34rpx;
  text-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.68),
    0 0 9rpx rgba(0, 0, 0, 0.44);
}

.inspiration-favorite.active {
  color: #ff7aa3;
}

.inspiration-favorite image {
  flex-shrink: 0;
  width: 32rpx;
  height: 32rpx;
  filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.46));
}

.inspiration-empty {
  padding: 50rpx 24rpx;
  border-radius: 22rpx;
  background: #ffffff;
  color: #8b8fa3;
  font-size: 25rpx;
  font-weight: 800;
  text-align: center;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.inline-spinner {
  display: inline-block;
  width: 28rpx;
  height: 28rpx;
  box-sizing: border-box;
  border: 4rpx solid rgba(122, 92, 255, 0.18);
  border-top-color: #7a5cff;
  border-radius: 50%;
  vertical-align: middle;
  animation: pull-refresh-spin 0.82s linear infinite;
}

.empty-spinner {
  margin-bottom: 14rpx;
}

.inspiration-empty button {
  width: 190rpx;
  height: 56rpx;
  margin: 22rpx auto 0;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 56rpx;
}

.load-state {
  padding: 28rpx 0 6rpx;
  color: #a0a4ba;
  font-size: 22rpx;
  font-weight: 800;
  text-align: center;
}

.inline-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
}

.inline-spinner.small {
  width: 22rpx;
  height: 22rpx;
  border-width: 3rpx;
}

.member-float {
  position: fixed;
  right: 24rpx;
  bottom: calc(158rpx + env(safe-area-inset-bottom));
  left: 24rpx;
  z-index: 60;
  overflow: hidden;
  display: block;
  height: 104rpx;
  padding: 0;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 12rpx rgba(122, 92, 255, 0.12);
}

.member-float-image {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
}

.member-float-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 16rpx 18rpx 16rpx 20rpx;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 18% 26%, rgba(255, 209, 92, 0.2), transparent 24%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 255, 0.98));
}

.member-float-copy {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.member-float-title {
  overflow: hidden;
  color: #1f2437;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-float-sub {
  overflow: hidden;
  margin-top: 8rpx;
  color: #8b8fa3;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-float-action {
  flex: 0 0 auto;
  min-width: 120rpx;
  height: 58rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 58rpx;
}

.member-crown {
  position: relative;
  flex: 0 0 auto;
  width: 80rpx;
  height: 62rpx;
  border-radius: 0 0 18rpx 18rpx;
  background: linear-gradient(135deg, #ffd15c, #ff9e3d);
}

.crown-point {
  position: absolute;
  bottom: 42rpx;
  width: 30rpx;
  height: 42rpx;
  border-radius: 6rpx;
  background: linear-gradient(135deg, #ffd15c, #ff9e3d);
  transform: rotate(45deg);
}

.crown-point.left { left: 0; }
.crown-point.middle { left: 25rpx; bottom: 50rpx; }
.crown-point.right { right: 0; }

.member-copy {
  flex: 1;
  min-width: 0;
}

.member-title {
  color: #1f2437;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.25;
}

.member-desc {
  overflow: hidden;
  margin-top: 8rpx;
  color: #8b8fa3;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-action {
  flex: 0 0 auto;
  width: 128rpx;
  height: 60rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 60rpx;
}

</style>
