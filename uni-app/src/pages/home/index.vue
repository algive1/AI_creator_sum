<template>
  <view class="screen home-page">
    <AppTopbar class="app-nav-root">
      <template #left>
        <view class="home-nav-title">{{ appName }}</view>
      </template>
    </AppTopbar>

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
            <text>AI</text>
          </view>
          <view class="entry-fallback-title">{{ item.title }}</view>
          <view class="entry-fallback-sub">{{ item.sub }}</view>
        </view>
        <image class="entry-card-image" :src="item.image" mode="aspectFill" lazy-load />
      </button>
    </view>

    <view class="section-head">
      <view class="section-title">灵感推荐<text>✨</text></view>
      <button class="section-refresh" @tap="refreshInspirations">换一换 <text class="refresh-icon"></text></button>
    </view>

    <scroll-view scroll-x class="inspiration-tabs">
      <view class="inspiration-tab-row">
        <button
          v-for="item in inspirationTabs"
          :key="item"
          class="inspiration-tab"
          :class="{ active: activeInspirationTab === item }"
          @tap="activeInspirationTab = item"
        >
          {{ item }}
        </button>
      </view>
    </scroll-view>

    <view v-if="filteredInspirations.length" class="inspiration-grid">
      <view class="inspiration-column">
        <button
          v-for="item in leftInspirations"
          :key="item.id"
          class="inspiration-card"
          @tap="useInspiration(item)"
        >
          <view class="inspiration-art" :class="`theme-${item.theme}`">
            <image v-if="item.cover" class="inspiration-cover" :src="item.cover" mode="aspectFill" lazy-load />
            <view v-else class="inspiration-scene"></view>
            <view class="inspiration-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="inspiration-play"></view>
          </view>
          <view class="inspiration-title">{{ item.title }}</view>
          <view class="inspiration-meta">
            <text>{{ item.author }}</text>
            <text class="inspiration-like"><text class="flame"></text>{{ item.likes }}</text>
          </view>
        </button>
      </view>
      <view class="inspiration-column">
        <button
          v-for="item in rightInspirations"
          :key="item.id"
          class="inspiration-card"
          @tap="useInspiration(item)"
        >
          <view class="inspiration-art" :class="`theme-${item.theme}`">
            <image v-if="item.cover" class="inspiration-cover" :src="item.cover" mode="aspectFill" lazy-load />
            <view v-else class="inspiration-scene"></view>
            <view class="inspiration-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="inspiration-play"></view>
          </view>
          <view class="inspiration-title">{{ item.title }}</view>
          <view class="inspiration-meta">
            <text>{{ item.author }}</text>
            <text class="inspiration-like"><text class="flame"></text>{{ item.likes }}</text>
          </view>
        </button>
      </view>
    </view>

    <view v-else class="inspiration-empty">
      <view>{{ loadingInspirations ? '正在加载灵感...' : '暂无灵感内容' }}</view>
      <button @tap="refreshInspirations">重新加载</button>
    </view>

    <view v-if="filteredInspirations.length" class="load-state">
      <text v-if="loadingInspirations">加载中...</text>
      <text v-else-if="!hasMore">没有更多了</text>
      <text v-else>继续下滑查看更多</text>
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
      @use="usePreviewTemplate"
    />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onReachBottom, onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import { getInspirations } from '@/api/template';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES } from '@/utils/constants';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import type { CreativeTemplate } from '@/utils/mock';

type EntryKey = 'image' | 'video' | 'comic';

interface EntryCard {
  key: EntryKey;
  image: string;
  title: string;
  sub: string;
}

interface InspirationItem {
  id: string | number;
  title: string;
  author: string;
  likes: string;
  category: string;
  tag: string;
  theme: string;
  kind: 'image' | 'video';
  cover?: string;
  prompt?: string;
}

interface HomeAnnouncement {
  id: number;
  title: string;
  content: string;
  type: string;
  readAt: string | null;
  startAt?: string | null;
  createdAt?: string | null;
}

const LOCAL_HOME_BANNER = '/static/home/home_banner.jpg';
const LOCAL_HOME_MEMBER_UPSELL = '/static/home/home_member_upsell.jpg';
const devPreviewAnnouncement: HomeAnnouncement = {
  id: 0,
  title: 'AI漫剧功能全新上线，快来体验吧！🎉',
  content: '首页公告开发预览',
  type: 'home',
  readAt: null,
  createdAt: '2026-05-20T12:30:00+08:00'
};
const entryCards: EntryCard[] = [
  { key: 'image', image: '/static/home/home_entry_image.jpg', title: 'AI生图', sub: '智能生成图片' },
  { key: 'video', image: '/static/home/home_entry_video.jpg', title: 'AI视频', sub: '一键生成视频' },
  { key: 'comic', image: '/static/home/home_entry_comic.jpg', title: 'AI漫剧', sub: '漫画与故事创作' }
];

const fallbackInspirations: InspirationItem[] = [
  { id: 'home_demo_comic', title: '治愈系少女日常', author: '糯米团子', likes: '12.3w', category: '漫画', tag: '漫画', theme: 'flower', kind: 'image', prompt: '治愈系少女日常，春日花园，国漫精致画风。' },
  { id: 'home_demo_city', title: '未来城市科幻风', author: 'AI创作者', likes: '8.7w', category: '视频', tag: '视频', theme: 'neon', kind: 'video', prompt: '未来城市霓虹街道，跑车穿过雨夜，高级科幻短片。' },
  { id: 'home_demo_cat', title: '可爱猫咪系列', author: '猫咪画室', likes: '6.4w', category: '漫画', tag: '漫画', theme: 'cat', kind: 'image', prompt: '可爱猫咪漫画角色，软萌表情，粉紫渐变背景。' },
  { id: 'home_demo_landscape', title: '国风山水意境', author: '山河工作室', likes: '5.1w', category: '图片', tag: '图片', theme: 'landscape', kind: 'image', prompt: '国风山水意境，云雾山峰，淡雅高级插画。' },
  { id: 'home_demo_wallpaper', title: '梦幻星空壁纸', author: '星屿小助手', likes: '4.8w', category: '壁纸', tag: '壁纸', theme: 'sky', kind: 'image', prompt: '梦幻星空壁纸，紫粉星云，柔和光感。' },
  { id: 'home_demo_story', title: '异世界冒险开篇', author: '故事盒子', likes: '3.9w', category: '小说', tag: '小说', theme: 'story', kind: 'image', prompt: '异世界冒险开篇，少年打开发光古书，奇幻氛围。' }
];

const inspirationTabs = ['推荐', '漫画', '视频', '图片', '小说', '壁纸'];
const authStore = useAuthStore();
const configStore = useConfigStore();
const userStore = useUserStore();
const activeInspirationTab = ref('推荐');
const inspirations = ref<InspirationItem[]>([]);
const previewTemplate = ref<CreativeTemplate | null>(null);
const loadingInspirations = ref(false);
const hasMore = ref(true);
const page = ref(1);
const pageSize = 12;
const failedVisualAssets = ref<Record<string, boolean>>({});

const appName = computed(() => {
  const source = configStore.publicConfig || {};
  return String(source.appName || source.siteName || 'AIGC生成艺术工坊');
});
const showMemberFloat = computed(() => !userStore.isMember);
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
  return isDevFallbackEnabled ? devPreviewAnnouncement : null;
});
const filteredInspirations = computed(() => {
  return inspirations.value.filter((item) => tabMatches(item, activeInspirationTab.value));
});
const leftInspirations = computed(() => filteredInspirations.value.filter((_, index) => index % 2 === 0));
const rightInspirations = computed(() => filteredInspirations.value.filter((_, index) => index % 2 === 1));

onShow(() => {
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  configStore.loadHomeData().catch(() => undefined);
  authStore.hydrate();
  userStore.hydrate();
  if (authStore.isLoggedIn) {
    userStore.loadFullProfile().catch(() => undefined);
  }
  if (!inspirations.value.length) {
    loadInspirations(true);
  }
});

onReachBottom(() => {
  loadInspirations(false);
});

function goCreate() {
  uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?type=${encodeURIComponent('文生图')}` });
}

function goEntry(key: EntryKey) {
  if (key === 'image') {
    uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?type=${encodeURIComponent('文生图')}` });
    return;
  }
  if (key === 'video') {
    uni.navigateTo({ url: PAGE_ROUTES.aiVideo });
    return;
  }
  uni.reLaunch({ url: PAGE_ROUTES.comic });
}

function goMember() {
  uni.navigateTo({ url: PAGE_ROUTES.member });
}

function goAnnouncements() {
  uni.navigateTo({ url: PAGE_ROUTES.announcements });
}

function refreshInspirations() {
  loadInspirations(true);
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

async function loadInspirations(reset: boolean) {
  if (loadingInspirations.value) return;
  if (!reset && !hasMore.value) return;
  if (reset) {
    page.value = 1;
    hasMore.value = true;
  }
  loadingInspirations.value = true;
  try {
    const res = await getInspirations<{ list?: Record<string, unknown>[]; total?: number; hasMore?: boolean }>({
      page: page.value,
      pageSize
    });
    const list = Array.isArray(res.list) ? res.list : [];
    if (!list.length && isDevFallbackEnabled && reset) {
      warnDevFallback('home-inspirations', 'GET /templates/inspirations returned empty list');
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
    page.value += 1;
    const total = Number(res.total || 0);
    hasMore.value = typeof res.hasMore === 'boolean'
      ? res.hasMore
      : total > 0
        ? merged.length < total
        : next.length >= pageSize && (!reset || merged.length > next.length);
  } catch {
    if (isDevFallbackEnabled && reset) {
      warnDevFallback('home-inspirations', 'GET /templates/inspirations failed');
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
    mode: item.kind === 'video' ? 'text2video' : 'text2img',
    category: item.category,
    duration: item.kind === 'video' ? '10s' : undefined
  };
}

function usePreviewTemplate(item: CreativeTemplate) {
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
    readAt: String(row.readAt || row.read_at || '') || null,
    startAt: String(row.startAt || row.start_at || '') || null,
    createdAt: String(row.createdAt || row.created_at || '') || null
  };
}

function normalizeInspiration(item: Record<string, unknown>, index: number): InspirationItem {
  const templateType = String(item.templateType || item.template_type || item.mediaType || item.type || 'image');
  const title = String(item.title || '灵感模板');
  const category = categoryOf(item, templateType, title);
  const kind = isVideoType(templateType) || category === '视频' ? 'video' : 'image';
  return {
    id: item.id as string | number || `inspiration_${index}`,
    title,
    author: String(item.author || item.nickname || item.creatorName || '@官方灵感'),
    likes: formatCount(Number(item.favoriteCount || item.favorite_count || item.usageCount || item.usage_count || item.likes || 0)),
    category,
    tag: tagOf(kind, category),
    theme: ['flower', 'neon', 'cat', 'landscape', 'sky', 'story'][index % 6],
    kind,
    cover: String(item.coverUrl || item.cover_url || item.thumbnail || item.cover || ''),
    prompt: String(item.prompt || item.description || title)
  };
}

function categoryOf(item: Record<string, unknown>, templateType: string, title: string) {
  const raw = String(item.categoryName || item.category || item.scene || '');
  const text = `${raw}${templateType}${title}`;
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

function tabMatches(item: InspirationItem, tab: string) {
  if (tab === '推荐') return true;
  return item.category === tab || item.tag === tab;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value || 0);
}

function formatAnnouncementTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}  ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

.home-page > view:not(.app-nav-root),
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

.entry-fallback-icon text {
  position: absolute;
  right: -12rpx;
  top: -14rpx;
  height: 34rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff, #a76bff);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 34rpx;
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

.refresh-icon {
  width: 24rpx;
  height: 24rpx;
  border: 4rpx solid #6f7190;
  border-left-color: transparent;
  border-radius: 50%;
}

.inspiration-tabs {
  width: 100%;
  overflow: hidden;
  margin-bottom: 18rpx;
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
  height: 52rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: #f0ecff;
  color: #766f9c;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 52rpx;
}

.inspiration-tab.active {
  background: linear-gradient(135deg, #7b5cff, #6c4bff);
  color: #ffffff;
}

.inspiration-grid {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  width: 100%;
}

.inspiration-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.inspiration-card {
  overflow: hidden;
  display: block;
  width: 100%;
  padding: 0 0 16rpx;
  border-radius: 18rpx;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.inspiration-art {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 214rpx;
  border-radius: 18rpx 18rpx 8rpx 8rpx;
  background: #e8f0ff;
}

.inspiration-art::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 60%, rgba(31, 36, 55, 0.08));
  content: "";
  pointer-events: none;
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
  top: 12rpx;
  left: 12rpx;
  z-index: 2;
  height: 38rpx;
  padding: 0 16rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #7b5cff, #a76bff);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 38rpx;
}

.inspiration-play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: 62rpx;
  height: 62rpx;
  border-radius: 50%;
  background: rgba(31, 36, 55, 0.34);
  transform: translate(-50%, -50%);
}

.inspiration-play::after {
  position: absolute;
  top: 18rpx;
  left: 25rpx;
  width: 0;
  height: 0;
  border-top: 13rpx solid transparent;
  border-bottom: 13rpx solid transparent;
  border-left: 18rpx solid #ffffff;
  content: "";
}

.inspiration-title {
  overflow: hidden;
  margin: 16rpx 14rpx 0;
  color: #1f2437;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspiration-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  margin: 10rpx 14rpx 0;
  color: #8b8fa3;
  font-size: 20rpx;
  font-weight: 800;
}

.inspiration-meta text:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspiration-like {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5rpx;
}

.flame {
  width: 13rpx;
  height: 17rpx;
  border-radius: 12rpx 12rpx 12rpx 3rpx;
  background: linear-gradient(180deg, #ff5cb8, #ff9e3d);
  transform: rotate(36deg);
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
