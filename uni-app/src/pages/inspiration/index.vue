<template>
  <view class="screen inspiration-page">
    <AppTopbar class="app-nav-root" title="发现灵感">
      <template #left>
        <view class="nav-left-space"></view>
      </template>
    </AppTopbar>

    <view class="inspiration-hero">
      <view class="hero-copy">
        <view class="hero-title">激发创作灵感 ✨</view>
        <view class="hero-subtitle">探索热门创意，发现更多可能</view>
        <button class="hero-action" @tap="goCreate">去创作 <text>→</text></button>
      </view>
      <view class="hero-bulb" aria-hidden="true">
        <view class="bulb-glass">
          <view class="bulb-heart"></view>
        </view>
        <view class="bulb-base"></view>
        <view class="bulb-ring"></view>
        <view class="hero-spark one"></view>
        <view class="hero-spark two"></view>
        <view class="hero-spark three"></view>
      </view>
      <image v-if="inspirationBannerSource" class="inspiration-hero-image" :src="inspirationBannerSource" mode="aspectFill" @error="onBannerError" />
    </view>

    <view class="category-shell">
      <scroll-view scroll-x class="create-tabs">
        <view class="create-tab-row">
          <view
            v-for="item in tabs"
            :key="item"
            class="create-tab"
            :class="{ active: activeTab === item }"
            @tap="activeTab = item"
          >
            {{ item }}
          </view>
        </view>
      </scroll-view>
      <button class="filter-button" hover-class="none" :class="{ active: activeFilterCount > 0, expanded: showFilterPanel }" @tap="toggleFilter" aria-label="筛选">
        <view class="filter-arrow" aria-hidden="true"></view>
        <text v-if="activeFilterCount > 0" class="filter-count">{{ activeFilterCount }}</text>
      </button>
    </view>

    <view v-if="showFilterPanel" class="filter-panel">
        <view class="filter-sheet-head">
          <view>
            <view class="filter-sheet-title">筛选灵感</view>
            <view class="filter-sheet-subtitle">{{ filteredWorks.length }} 个作品</view>
          </view>
          <button class="filter-close" hover-class="none" @tap="resetFilter">重置</button>
        </view>
        <view class="filter-block">
          <view class="filter-label">内容类型</view>
          <view class="filter-option-row">
          <button
            v-for="item in mediaFilters"
            :key="item.value"
            class="filter-chip"
            hover-class="none"
            :class="{ active: mediaFilter === item.value }"
            @tap="mediaFilter = item.value"
          >
              {{ item.label }}
            </button>
          </view>
        </view>
        <view class="filter-block">
          <view class="filter-label">排序</view>
          <view class="filter-option-row">
          <button
            v-for="item in sortFilters"
            :key="item.value"
            class="filter-chip"
            hover-class="none"
            :class="{ active: sortMode === item.value }"
            @tap="sortMode = item.value"
          >
              {{ item.label }}
            </button>
          </view>
        </view>
        <view class="filter-block">
          <view class="filter-label">标签</view>
          <view class="filter-option-row filter-tag-row">
            <button
              v-for="item in tagFilters"
              :key="item"
              class="filter-chip"
              hover-class="none"
              :class="{ active: tagFilter === item }"
              @tap="tagFilter = item"
            >
              {{ item }}
            </button>
          </view>
        </view>
        <view class="filter-actions">
          <button class="filter-confirm" hover-class="none" @tap="closeFilter">完成</button>
        </view>
    </view>

    <view v-if="filteredWorks.length" class="create-waterfall">
      <view class="waterfall-column">
        <button v-for="item in leftWorks" :key="item.id" class="feed-card" :class="item.size" @tap="openWork(item)">
          <view class="feed-art" :class="`theme-${item.theme}`">
            <image v-if="item.cover" class="feed-cover" :src="item.cover" mode="aspectFill" lazy-load />
            <view v-else class="feed-scene"></view>
            <view class="feed-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="feed-play"></view>
          </view>
          <view class="feed-title">{{ item.title }}</view>
          <view class="feed-meta">
            <view class="feed-author">
              <image v-if="item.avatar" class="feed-avatar" :src="item.avatar" mode="aspectFill" lazy-load />
              <view v-else class="feed-avatar fallback"></view>
              <text>{{ item.author }}</text>
            </view>
            <view class="feed-like"><text class="heart-icon"></text>{{ item.likes }}</view>
          </view>
        </button>
      </view>
      <view class="waterfall-column">
        <button v-for="item in rightWorks" :key="item.id" class="feed-card" :class="item.size" @tap="openWork(item)">
          <view class="feed-art" :class="`theme-${item.theme}`">
            <image v-if="item.cover" class="feed-cover" :src="item.cover" mode="aspectFill" lazy-load />
            <view v-else class="feed-scene"></view>
            <view class="feed-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="feed-play"></view>
          </view>
          <view class="feed-title">{{ item.title }}</view>
          <view class="feed-meta">
            <view class="feed-author">
              <image v-if="item.avatar" class="feed-avatar" :src="item.avatar" mode="aspectFill" lazy-load />
              <view v-else class="feed-avatar fallback"></view>
              <text>{{ item.author }}</text>
            </view>
            <view class="feed-like"><text class="heart-icon"></text>{{ item.likes }}</view>
          </view>
        </button>
      </view>
    </view>

    <view v-else class="create-empty">
      <view>没有找到相关内容</view>
      <view class="create-empty-action" @tap="showHot">查看热门</view>
    </view>

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
import { onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import { getInspirations } from '@/api/template';
import { useConfigStore } from '@/stores/config';
import { PAGE_ROUTES } from '@/utils/constants';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import type { CreativeTemplate } from '@/utils/mock';

interface WorkItem {
  id: string;
  title: string;
  author: string;
  likes: string;
  category: string;
  tag: string;
  tags?: string[];
  kind: 'image' | 'video';
  size: 'short' | 'tall';
  theme: string;
  avatar?: string;
  cover?: string;
  prompt?: string;
  createdAt?: string;
  sourceIndex?: number;
}

const tabs = ['推荐', 'AI绘画', 'AI视频', 'AI漫剧', '摄影', '壁纸'];
const fallbackWorks: WorkItem[] = [
  { id: 'work_cloud_video', title: '云端之上 · 梦幻城堡', author: '星辰大海', likes: '1.2w', category: 'AI视频', tag: '视频', kind: 'video', size: 'short', theme: 'sky' },
  { id: 'work_comic_girl', title: '治愈系少女日常', author: '糯米团子', likes: '8563', category: 'AI漫剧', tag: '漫画', kind: 'image', size: 'short', theme: 'flower' },
  { id: 'work_pink_illustration', title: '粉色少女心', author: '桃子味汽水', likes: '6234', category: 'AI绘画', tag: '绘画', kind: 'image', size: 'short', theme: 'pink' },
  { id: 'work_future_city', title: '未来城市科幻风', author: 'AI创作者', likes: '1.8w', category: 'AI视频', tag: '视频', kind: 'video', size: 'short', theme: 'neon' },
  { id: 'work_wallpaper_sakura', title: '春日樱花壁纸', author: '小鹿森林', likes: '4210', category: '壁纸', tag: '壁纸', kind: 'image', size: 'short', theme: 'sakura' },
  { id: 'work_photo_light', title: '柔光人像摄影', author: '光影实验室', likes: '3892', category: '摄影', tag: '摄影', kind: 'image', size: 'short', theme: 'photo' }
];
const MAX_WORK_TAGS = 8;
const MAX_FILTER_TAGS = 24;

const activeTab = ref('推荐');
const mediaFilter = ref<'all' | 'image' | 'video'>('all');
const sortMode = ref<'default' | 'hot' | 'new'>('default');
const tagFilter = ref('全部');
const showFilterPanel = ref(false);
const works = ref<WorkItem[]>([]);
const previewTemplate = ref<CreativeTemplate | null>(null);
const configStore = useConfigStore();
const bannerFailed = ref(false);
const mediaFilters: Array<{ label: string; value: 'all' | 'image' | 'video' }> = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' }
];
const sortFilters: Array<{ label: string; value: 'default' | 'hot' | 'new' }> = [
  { label: '推荐', value: 'default' },
  { label: '最热', value: 'hot' },
  { label: '最新', value: 'new' }
];
const visualAssets = computed(() => {
  const value = configStore.publicConfig?.visualAssets;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const inspirationBannerSource = computed(() => {
  const url = String(visualAssets.value.inspirationBannerUrl || '').trim();
  return url && !bannerFailed.value ? url : '';
});
const tagFilters = computed(() => ['全部', ...topFilterTags(works.value)]);
const activeFilterCount = computed(() => [
  mediaFilter.value !== 'all',
  sortMode.value !== 'default',
  tagFilter.value !== '全部'
].filter(Boolean).length);
const filteredWorks = computed(() => {
  const list = works.value.filter((item) => {
    if (!tabMatches(item, activeTab.value)) return false;
    if (mediaFilter.value !== 'all' && item.kind !== mediaFilter.value) return false;
    if (tagFilter.value !== '全部' && !workTagsOf(item).includes(tagFilter.value)) return false;
    return true;
  });
  return sortWorks(list, sortMode.value);
});
const leftWorks = computed(() => filteredWorks.value.filter((_, index) => index % 2 === 0));
const rightWorks = computed(() => filteredWorks.value.filter((_, index) => index % 2 === 1));

onShow(() => {
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  loadWorks();
});

async function loadWorks() {
  try {
    const res = await getInspirations<{ list?: Record<string, unknown>[] }>();
    const list = Array.isArray(res.list) ? res.list : [];
    if (list.length) {
      works.value = list.map((item, index) => inspirationToWork(item, index));
      ensureSelectedTagExists();
      return;
    }
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration', 'GET /templates/inspirations returned empty list');
      works.value = fallbackWorks;
      ensureSelectedTagExists();
      return;
    }
    works.value = [];
    ensureSelectedTagExists();
  } catch {
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration', 'GET /templates/inspirations failed');
      works.value = fallbackWorks;
      ensureSelectedTagExists();
      return;
    }
    works.value = [];
    ensureSelectedTagExists();
  }
}

function showHot() {
  activeTab.value = '推荐';
  resetFilter();
}

function openWork(work: WorkItem) {
  previewTemplate.value = workToTemplate(work);
}

function usePreviewTemplate(template: CreativeTemplate) {
  previewTemplate.value = null;
  if (template.mediaType === 'video') {
    uni.navigateTo({ url: `${PAGE_ROUTES.aiVideo}?prompt=${encodeURIComponent(template.prompt)}` });
    return;
  }
  const query = [`type=${encodeURIComponent('文生图')}`, `scene=${encodeURIComponent(template.category)}`, `prompt=${encodeURIComponent(template.prompt)}`];
  uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?${query.join('&')}` });
}

function workToTemplate(work: WorkItem): CreativeTemplate {
  return {
    id: work.id,
    title: work.title,
    tags: uniqueTags([work.kind === 'video' ? '视频' : '图片', ...(work.tags || []), work.category, '模板']),
    prompt: work.prompt || (work.kind === 'video'
      ? `${work.title}，前三秒快速吸引注意，中段展示核心卖点，结尾给出行动引导。`
      : `${work.title}，画面主体清晰，商业质感，高级构图，适合${work.category}投放。`),
    mediaType: work.kind,
    coverUrl: work.cover || fallbackCover(work),
    mode: work.kind === 'video' ? 'text2video' : 'text2img',
    category: work.category,
    duration: work.kind === 'video' ? '10s' : undefined
  };
}

function inspirationToWork(item: Record<string, unknown>, index: number): WorkItem {
  const templateType = String(item.templateType || item.template_type || item.mediaType || item.type || 'image');
  const title = String(item.title || '灵感模板');
  const category = String(item.categoryName || item.category || item.scene || defaultCategory(templateType, title));
  const backendTags = templateTagsOf(item);
  const kind = inferMediaKind(item, templateType, backendTags);
  const fallbackTag = labelOf(kind, category, title);
  const tags = (backendTags.length ? backendTags : [fallbackTag]).slice(0, MAX_WORK_TAGS);
  return {
    id: String(item.id || `inspiration_${index}`),
    title,
    author: String(item.author || item.nickname || '@官方灵感'),
    likes: formatCount(Number(item.favoriteCount || item.favorite_count || item.usageCount || item.usage_count || 0)),
    category,
    tag: tags[0],
    tags,
    kind,
    size: 'short',
    theme: ['sky', 'flower', 'pink', 'neon', 'sakura', 'photo'][index % 6],
    avatar: String(item.avatarUrl || item.avatar_url || item.authorAvatar || item.author_avatar || ''),
    cover: String(item.coverUrl || item.cover_url || item.thumbnail || ''),
    prompt: String(item.prompt || item.description || item.title || ''),
    createdAt: String(item.createdAt || item.created_at || item.updatedAt || item.updated_at || ''),
    sourceIndex: index
  };
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value || 0);
}

function sortWorks(list: WorkItem[], mode: 'default' | 'hot' | 'new') {
  const source = [...list];
  if (mode === 'hot') return source.sort((a, b) => likeValue(b.likes) - likeValue(a.likes));
  if (mode === 'new') return source.sort((a, b) => createdValue(b) - createdValue(a));
  return source.sort((a, b) => Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0));
}

function likeValue(value: string) {
  const text = String(value || '').trim().toLowerCase();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  if (text.endsWith('w')) return number * 10000;
  if (text.endsWith('k')) return number * 1000;
  return number;
}

function createdValue(item: WorkItem) {
  const time = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER - Number(item.sourceIndex || 0);
}

function fallbackCover(work: WorkItem) {
  return work.cover || '';
}

function goCreate() {
  uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?type=${encodeURIComponent('文生图')}` });
}

function toggleFilter() {
  showFilterPanel.value = !showFilterPanel.value;
  loadWorks();
}

function closeFilter() {
  showFilterPanel.value = false;
}

function resetFilter() {
  mediaFilter.value = 'all';
  sortMode.value = 'default';
  tagFilter.value = '全部';
}

function onBannerError() {
  bannerFailed.value = true;
}

function isVideoType(value: string) {
  return /video|视频|短片|短剧/i.test(value);
}

function inferMediaKind(item: Record<string, unknown>, templateType: string, tags: string[]): WorkItem['kind'] {
  const text = [
    templateType,
    item.targetFeature,
    item.target_feature,
    item.usageType,
    item.usage_type,
    item.previewUrl,
    item.preview_url,
    item.coverUrl,
    item.cover_url,
    item.duration,
    ...tags
  ].join(' ');
  return /video|视频|短片|短剧|mp4|mov|webm/i.test(text) ? 'video' : 'image';
}

function defaultCategory(templateType: string, title: string) {
  if (/漫剧|漫画|短剧|故事/i.test(`${templateType}${title}`)) return 'AI漫剧';
  if (isVideoType(templateType)) return 'AI视频';
  return 'AI绘画';
}

function labelOf(kind: WorkItem['kind'], category: string, title: string) {
  const text = `${category}${title}`;
  if (/漫剧|漫画|短剧|故事/i.test(text)) return '漫画';
  if (kind === 'video') return '视频';
  if (/摄影|写真|照片|相机/i.test(text)) return '摄影';
  if (/壁纸|锁屏|桌面/i.test(text)) return '壁纸';
  return '绘画';
}

function tabMatches(item: WorkItem, tab: string): boolean {
  if (tab === '推荐') return true;
  const text = `${item.category}${item.title}${item.tag}${(item.tags || []).join('')}`;
  if (tab === 'AI视频') return item.kind === 'video' && !/漫剧|漫画|短剧|故事/i.test(text);
  if (tab === 'AI漫剧') return /漫剧|漫画|短剧|故事/i.test(text);
  if (tab === '摄影') return /摄影|写真|照片|相机/i.test(text);
  if (tab === '壁纸') return /壁纸|锁屏|桌面/i.test(text);
  if (tab === 'AI绘画') return item.kind === 'image' && !tabMatches(item, 'AI漫剧') && !tabMatches(item, '摄影') && !tabMatches(item, '壁纸');
  return item.category === tab;
}

function templateTagsOf(item: Record<string, unknown>) {
  return uniqueTags([
    ...normalizeTagValue(item.tagsJson),
    ...normalizeTagValue(item.tags_json),
    ...normalizeTagValue(item.tags)
  ]).slice(0, MAX_WORK_TAGS);
}

function normalizeTagValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      return normalizeTagValue(JSON.parse(text));
    } catch {
      return [];
    }
  }
  return text.split(/[,\uFF0C]+/).map((item) => item.trim()).filter(Boolean);
}

function uniqueTags(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function workTagsOf(item: WorkItem) {
  return item.tags?.length ? item.tags : [item.tag];
}

function topFilterTags(list: WorkItem[]) {
  const counts = new Map<string, { count: number; firstIndex: number }>();
  list.forEach((item, index) => {
    workTagsOf(item).forEach((tag) => {
      const current = counts.get(tag);
      if (current) {
        current.count += 1;
        return;
      }
      counts.set(tag, { count: 1, firstIndex: index });
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex)
    .slice(0, MAX_FILTER_TAGS)
    .map(([tag]) => tag);
}

function ensureSelectedTagExists() {
  if (tagFilter.value !== '全部' && !tagFilters.value.includes(tagFilter.value)) {
    tagFilter.value = '全部';
  }
}
</script>

<style scoped lang="scss">
.create-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 0 24rpx calc(160rpx + env(safe-area-inset-bottom));
  background: #f7f8ff;
  color: #f7f4ff;
}

.create-page::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 76% 4%, rgba(255, 200, 87, 0.16), rgba(255, 255, 255, 0) 22%),
    radial-gradient(circle at 12% 18%, rgba(81, 70, 255, 0.18), rgba(255, 255, 255, 0) 28%),
    linear-gradient(180deg, #1b1734 0%, #201b3c 54%, #261c43 100%);
  content: "";
  pointer-events: none;
}

.create-page > view:not(.app-nav-root),
.create-page > scroll-view {
  position: relative;
  z-index: 1;
}

.create-top {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  margin-bottom: 20rpx;
}

.create-search {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 74rpx;
  padding: 0 24rpx 0 72rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.08);
}

.create-search-icon {
  position: absolute;
  top: 50%;
  left: 26rpx;
  color: rgba(255, 255, 255, 0.6);
  font-size: 34rpx;
  transform: translateY(-52%);
}

.create-search-input {
  width: 100%;
  height: 74rpx;
  color: #f7f4ff;
  font-size: 26rpx;
  font-weight: 600;
}

.create-search-placeholder {
  color: rgba(226, 222, 237, 0.55);
}

.create-pro-entry {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 70rpx;
  height: 70rpx;
  border: 2rpx solid rgba(210, 255, 72, 0.32);
  border-radius: 22rpx;
  background: linear-gradient(135deg, rgba(204, 255, 54, 0.96), rgba(95, 255, 146, 0.88));
  color: #252a3d;
  font-size: 34rpx;
  font-weight: 900;
  box-shadow: 0 12rpx 24rpx rgba(143, 255, 92, 0.18);
}

.create-hero {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 292rpx;
  margin-bottom: 18rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 72% 26%, rgba(122, 102, 255, 0.34), rgba(19, 17, 38, 0) 32%),
    radial-gradient(circle at 30% 18%, rgba(255, 186, 78, 0.24), rgba(10, 9, 21, 0) 26%),
    linear-gradient(135deg, #7a5cff 0%, #8c70ff 48%, #ff7acb 100%);
  box-shadow: 0 20rpx 48rpx rgba(0, 0, 0, 0.32);
}

.create-hero::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
  content: "";
  pointer-events: none;
}

.hero-lights {
  position: absolute;
  top: 22rpx;
  right: 54rpx;
  left: 54rpx;
  z-index: 2;
  height: 50rpx;
  border-top: 3rpx solid rgba(255, 209, 111, 0.42);
  border-radius: 50%;
  transform: rotate(-2deg);
}

.light-dot {
  position: absolute;
  top: -3rpx;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #ffe19d;
  box-shadow: 0 0 18rpx rgba(255, 220, 141, 0.88);
}

.light-dot:nth-child(1) { left: 10%; }
.light-dot:nth-child(2) { left: 28%; }
.light-dot:nth-child(3) { left: 48%; }
.light-dot:nth-child(4) { left: 68%; }
.light-dot:nth-child(5) { left: 86%; }

.hero-copy {
  position: absolute;
  top: 72rpx;
  left: 36rpx;
  z-index: 3;
  width: 360rpx;
}

.hero-title {
  color: #fff8e8;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.1;
  text-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.52);
}

.hero-dots {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 28rpx;
  padding-left: 136rpx;
}

.hero-dots text {
  width: 8rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: rgba(255, 255, 255, 0.68);
}

.hero-dots text:first-child {
  width: 18rpx;
  background: #ffffff;
}

.hero-stage {
  position: absolute;
  right: 16rpx;
  bottom: 0;
  z-index: 2;
  width: 308rpx;
  height: 250rpx;
}

.hero-speaker {
  position: absolute;
  right: 86rpx;
  bottom: 42rpx;
  width: 82rpx;
  height: 112rpx;
  border-radius: 18rpx;
  background: linear-gradient(180deg, #bba5ff, #7a5cff);
  box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.08), 0 18rpx 28rpx rgba(0, 0, 0, 0.34);
}

.hero-speaker::before,
.hero-speaker::after {
  position: absolute;
  left: 50%;
  border-radius: 50%;
  content: "";
  transform: translateX(-50%);
}

.hero-speaker::before {
  top: 14rpx;
  width: 34rpx;
  height: 34rpx;
  background: #7b78ff;
}

.hero-speaker::after {
  bottom: 18rpx;
  width: 46rpx;
  height: 46rpx;
  background: #7a5cff;
  box-shadow: inset 0 0 0 10rpx rgba(123, 120, 255, 0.5);
}

.hero-performer {
  position: absolute;
  right: 158rpx;
  bottom: 16rpx;
  width: 112rpx;
  height: 170rpx;
}

.performer-head {
  position: absolute;
  top: 0;
  left: 18rpx;
  width: 74rpx;
  height: 74rpx;
  border-radius: 38rpx;
  background: linear-gradient(160deg, #ffc17b, #c47740);
  box-shadow: 0 0 0 8rpx rgba(255, 225, 157, 0.12);
}

.performer-head::before,
.performer-head::after {
  position: absolute;
  top: 28rpx;
  width: 9rpx;
  height: 9rpx;
  border-radius: 50%;
  background: #ff7acb;
  content: "";
}

.performer-head::before { left: 22rpx; }
.performer-head::after { right: 22rpx; }

.performer-body {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 102rpx;
  border-radius: 38rpx 38rpx 18rpx 18rpx;
  background: linear-gradient(135deg, #3767ff, #173bb8);
  box-shadow: inset 0 16rpx 0 rgba(255, 255, 255, 0.08);
}

.performer-mic {
  position: absolute;
  top: 66rpx;
  right: 12rpx;
  width: 18rpx;
  height: 58rpx;
  border-radius: 10rpx;
  background: #ffe6b0;
  transform: rotate(-18deg);
}

.hero-guest {
  position: absolute;
  right: 10rpx;
  bottom: 16rpx;
  width: 104rpx;
  height: 152rpx;
}

.guest-head {
  position: absolute;
  top: 10rpx;
  left: 20rpx;
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: linear-gradient(160deg, #ffffff, #c8c5d6);
}

.guest-head::before {
  position: absolute;
  left: 19rpx;
  top: 26rpx;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: #7a5cff;
  box-shadow: 24rpx 0 0 #7a5cff;
  content: "";
}

.guest-body {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 86rpx;
  border-radius: 44rpx 44rpx 20rpx 20rpx;
  background: linear-gradient(135deg, #f0f1ff, #b8b7cf);
}

.create-tabs {
  width: 100%;
  overflow: hidden;
  margin-bottom: 18rpx;
  white-space: nowrap;
}

.create-tab-row {
  display: inline-flex;
  align-items: center;
  gap: 30rpx;
  min-width: 100%;
}

.create-tab {
  position: relative;
  flex-shrink: 0;
  height: 58rpx;
  color: #c8c3d5;
  font-size: 27rpx;
  font-weight: 800;
  line-height: 58rpx;
  white-space: nowrap;
}

.create-tab.active {
  color: #fff5d8;
}

.create-tab.active::after {
  position: absolute;
  right: 6rpx;
  bottom: 2rpx;
  left: 6rpx;
  height: 6rpx;
  border-radius: 3rpx;
  background: linear-gradient(90deg, #ffea6a, #6fff88);
  content: "";
}

.create-waterfall {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  width: 100%;
}

.waterfall-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.feed-card {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  background: transparent;
  text-align: left;
}

.feed-art {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 300rpx;
  border-radius: 20rpx;
  background: #e8f0ff;
  box-shadow: 0 18rpx 34rpx rgba(0, 0, 0, 0.28);
}

.feed-card.tall .feed-art { height: 430rpx; }
.feed-card.short .feed-art { height: 260rpx; }

.feed-art::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.16) 56%, rgba(255, 255, 255, 0.58));
  content: "";
}

.feed-scene,
.feed-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.feed-scene::before,
.feed-scene::after {
  position: absolute;
  content: "";
}

.theme-lantern {
  background:
    radial-gradient(circle at 30% 36%, rgba(255, 213, 130, 0.54), rgba(118, 36, 29, 0) 32%),
    linear-gradient(145deg, #411616, #a94c2f 48%, #22121b);
}

.theme-street {
  background:
    radial-gradient(circle at 68% 32%, rgba(255, 241, 112, 0.48), rgba(255, 241, 112, 0) 26%),
    linear-gradient(160deg, #2a3355, #d3a15e 50%, #402b31);
}

.theme-kitchen {
  background:
    radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0) 28%),
    linear-gradient(155deg, #eddcc8, #b97d64 44%, #2b1b1d);
}

.theme-studio {
  background:
    radial-gradient(circle at 50% 20%, rgba(103, 245, 219, 0.36), rgba(103, 245, 219, 0) 30%),
    linear-gradient(145deg, #e8f0ff, #7a5cff 52%, #ff7acb);
}

.theme-neon {
  background:
    radial-gradient(circle at 70% 28%, rgba(255, 83, 192, 0.5), rgba(255, 83, 192, 0) 30%),
    linear-gradient(145deg, #7a5cff, #8fb7ff 56%, #ff7acb);
}

.theme-green {
  background:
    radial-gradient(circle at 48% 36%, rgba(200, 255, 104, 0.4), rgba(30, 114, 60, 0) 34%),
    linear-gradient(145deg, #e8f0ff, #ff7acb 50%, #7a5cff);
}

.theme-lantern .feed-scene::before,
.theme-street .feed-scene::before,
.theme-kitchen .feed-scene::before,
.theme-studio .feed-scene::before,
.theme-neon .feed-scene::before,
.theme-green .feed-scene::before {
  left: 32rpx;
  top: 54rpx;
  width: 150rpx;
  height: 150rpx;
  border-radius: 34rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.24);
  box-shadow: 0 0 24rpx rgba(255, 255, 255, 0.18);
  transform: rotate(8deg);
}

.theme-lantern .feed-scene::after,
.theme-street .feed-scene::after,
.theme-kitchen .feed-scene::after,
.theme-studio .feed-scene::after,
.theme-neon .feed-scene::after,
.theme-green .feed-scene::after {
  right: 26rpx;
  bottom: 36rpx;
  width: 120rpx;
  height: 80rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #ff5fc6, #6dfde7);
}

.feed-play {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  z-index: 2;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(10rpx);
}

.feed-play::after {
  position: absolute;
  top: 11rpx;
  left: 15rpx;
  width: 0;
  height: 0;
  border-top: 9rpx solid transparent;
  border-bottom: 9rpx solid transparent;
  border-left: 13rpx solid rgba(255, 255, 255, 0.92);
  content: "";
}

.feed-title {
  overflow: hidden;
  margin-top: 12rpx;
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  margin-top: 10rpx;
  color: #9b95ab;
  font-size: 21rpx;
  font-weight: 700;
}

.feed-meta text:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-like {
  flex-shrink: 0;
  color: #bdb6cc;
}

.create-empty {
  padding: 56rpx 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.06);
  color: #c8c3d5;
  font-size: 26rpx;
  font-weight: 800;
  text-align: center;
}

.create-empty-action {
  width: 176rpx;
  height: 56rpx;
  margin: 24rpx auto 0;
  border-radius: 28rpx;
  background: linear-gradient(90deg, #ffe55d, #70ff8c);
  color: #252a3d;
  line-height: 56rpx;
}

.inspiration-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 0 24rpx calc(160rpx + env(safe-area-inset-bottom));
  background: #f8f6ff;
  color: #1f2437;
}

.inspiration-page::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 16% 4%, rgba(123, 92, 255, 0.12), transparent 28%),
    radial-gradient(circle at 86% 8%, rgba(255, 92, 184, 0.12), transparent 26%),
    linear-gradient(180deg, #fffaff 0%, #f8f6ff 42%, #f7f8ff 100%);
  content: "";
  pointer-events: none;
}

.inspiration-page > view:not(.app-nav-root),
.inspiration-page > scroll-view {
  position: relative;
  z-index: 1;
}

.inspiration-page button::after {
  border: 0;
}

.nav-left-space {
  width: 64rpx;
  height: 64rpx;
}

.inspiration-hero {
  position: relative;
  overflow: hidden;
  height: 286rpx;
  margin-bottom: 24rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 88% 74%, rgba(255, 209, 92, 0.42), transparent 18%),
    radial-gradient(circle at 72% 30%, rgba(255, 255, 255, 0.22), transparent 26%),
    linear-gradient(135deg, #6c4bff 0%, #8c55ff 48%, #ff5cb8 100%);
  box-shadow: 0 18rpx 36rpx rgba(122, 92, 255, 0.2);
}

.inspiration-hero::after {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.16) 0 4rpx, transparent 5rpx) 0 0 / 118rpx 96rpx,
    linear-gradient(90deg, rgba(255, 255, 255, 0.2), transparent 54%);
  content: "";
  pointer-events: none;
}

.inspiration-hero-image {
  position: absolute;
  inset: 0;
  z-index: 8;
  width: 100%;
  height: 100%;
}

.hero-copy {
  position: absolute;
  top: 56rpx;
  left: 36rpx;
  z-index: 3;
  width: 390rpx;
}

.hero-title {
  color: #ffffff;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.18;
  text-shadow: 0 8rpx 20rpx rgba(83, 54, 214, 0.28);
}

.hero-subtitle {
  margin-top: 20rpx;
  color: rgba(255, 255, 255, 0.88);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.35;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 58rpx;
  margin-top: 26rpx;
  padding: 0 26rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #6c4bff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 58rpx;
  box-shadow: 0 12rpx 24rpx rgba(69, 44, 192, 0.18);
}

.hero-action text {
  margin-left: 8rpx;
  font-size: 26rpx;
}

.hero-bulb {
  position: absolute;
  right: 28rpx;
  bottom: 18rpx;
  z-index: 2;
  width: 210rpx;
  height: 226rpx;
  transform: rotate(14deg);
}

.bulb-glass {
  position: absolute;
  top: 8rpx;
  left: 22rpx;
  width: 150rpx;
  height: 150rpx;
  border: 6rpx solid rgba(255, 255, 255, 0.68);
  border-radius: 84rpx 84rpx 72rpx 72rpx;
  background:
    radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.86) 0 16rpx, transparent 18rpx),
    radial-gradient(circle at 68% 56%, rgba(255, 209, 92, 0.48), transparent 38%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 223, 134, 0.55));
  box-shadow: 0 0 34rpx rgba(255, 229, 132, 0.62), inset -10rpx -12rpx rgba(255, 92, 184, 0.12);
}

.bulb-heart {
  position: absolute;
  top: 56rpx;
  left: 50rpx;
  width: 56rpx;
  height: 46rpx;
  background: #ffd15c;
  transform: rotate(-31deg);
}

.bulb-heart::before,
.bulb-heart::after {
  position: absolute;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: #ffd15c;
  content: "";
}

.bulb-heart::before {
  top: -18rpx;
  left: 0;
}

.bulb-heart::after {
  right: -16rpx;
  bottom: 0;
}

.bulb-base {
  position: absolute;
  left: 70rpx;
  bottom: 18rpx;
  width: 78rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background:
    linear-gradient(180deg, transparent 0 12rpx, rgba(255, 255, 255, 0.18) 13rpx 16rpx, transparent 17rpx 28rpx, rgba(255, 255, 255, 0.16) 29rpx 32rpx, transparent 33rpx 44rpx, rgba(255, 255, 255, 0.14) 45rpx 48rpx, transparent 49rpx),
    linear-gradient(180deg, #7368ff, #5147d8);
  box-shadow: 0 12rpx 24rpx rgba(66, 47, 187, 0.24);
}

.bulb-ring {
  position: absolute;
  right: -8rpx;
  top: 92rpx;
  width: 190rpx;
  height: 62rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.44);
  border-radius: 50%;
  transform: rotate(-24deg);
}

.hero-spark {
  position: absolute;
  width: 18rpx;
  height: 18rpx;
  background: #ffd15c;
  transform: rotate(45deg);
}

.hero-spark.one { top: 12rpx; right: 8rpx; }
.hero-spark.two { top: 84rpx; left: 0; background: #ffffff; }
.hero-spark.three { right: 6rpx; bottom: 84rpx; background: #ff9e3d; }

.category-shell {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 20rpx;
}

.create-tabs {
  flex: 1;
  width: auto;
  min-width: 0;
  overflow: hidden;
  margin-bottom: 0;
  white-space: nowrap;
}

.create-tab-row {
  display: inline-flex;
  align-items: center;
  gap: 18rpx;
  min-width: 100%;
  padding-right: 6rpx;
}

.create-tab {
  flex-shrink: 0;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  color: #7b8096;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 56rpx;
  white-space: nowrap;
}

.create-tab.active {
  background: linear-gradient(135deg, #7b5cff, #6c4bff);
  color: #ffffff;
  box-shadow: 0 10rpx 20rpx rgba(123, 92, 255, 0.22);
}

.create-tab.active::after {
  display: none;
}

.filter-button {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58rpx;
  height: 58rpx;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1rpx solid rgba(123, 92, 255, 0.16);
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10rpx 20rpx rgba(122, 92, 255, 0.08);
}

.filter-button.active {
  border-color: rgba(123, 92, 255, 0.36);
  background: #f1efff;
}

.filter-arrow {
  width: 18rpx;
  height: 18rpx;
  border-right: 4rpx solid #6c4bff;
  border-bottom: 4rpx solid #6c4bff;
  transform: rotate(45deg) translateY(-3rpx);
  transition: transform 180ms ease;
}

.filter-button.expanded .filter-arrow {
  transform: rotate(225deg) translate(-3rpx, -3rpx);
}

.filter-count {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border: 2rpx solid #ffffff;
  border-radius: 14rpx;
  background: #ff5c8a;
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 26rpx;
  text-align: center;
}

.filter-panel {
  width: 100%;
  margin: -4rpx 0 22rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid rgba(123, 92, 255, 0.12);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14rpx 32rpx rgba(122, 92, 255, 0.12);
}

.filter-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
}

.filter-sheet-title {
  color: #172033;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.2;
}

.filter-sheet-subtitle {
  margin-top: 8rpx;
  color: #8b8fa3;
  font-size: 23rpx;
  font-weight: 800;
}

.filter-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 86rpx;
  height: 48rpx;
  margin: 0;
  padding: 0 18rpx;
  box-sizing: border-box;
  border: 1rpx solid rgba(123, 92, 255, 0.18);
  border-radius: 24rpx;
  background: #f3f5fb;
  color: #64748b;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 48rpx;
}

.filter-block {
  margin-top: 24rpx;
}

.filter-label {
  margin-bottom: 14rpx;
  color: #2f3848;
  font-size: 25rpx;
  font-weight: 900;
}

.filter-option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 58rpx;
  margin: 0;
  padding: 0 24rpx;
  box-sizing: border-box;
  border: 1rpx solid #dce8f6;
  border-radius: 29rpx;
  background: #f8fbff;
  color: #64748b;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 58rpx;
}

.filter-tag-row {
  max-height: 218rpx;
  overflow: hidden;
}

.filter-chip.active {
  border-color: rgba(123, 92, 255, 0.34);
  background: linear-gradient(135deg, #7b5cff, #a76bff);
  color: #ffffff;
  box-shadow: 0 10rpx 20rpx rgba(123, 92, 255, 0.18);
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 32rpx;
}

.filter-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 156rpx;
  height: 64rpx;
  margin: 0;
  padding: 0 26rpx;
  box-sizing: border-box;
  border-radius: 32rpx;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 64rpx;
}

.filter-confirm {
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
  box-shadow: 0 14rpx 28rpx rgba(123, 92, 255, 0.2);
}

.create-waterfall {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  width: 100%;
}

.waterfall-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.feed-card {
  overflow: hidden;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border-radius: 20rpx;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 10rpx 24rpx rgba(122, 92, 255, 0.1);
}

.feed-art,
.feed-card.short .feed-art,
.feed-card.tall .feed-art {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 292rpx;
  border-radius: 20rpx 20rpx 0 0;
  background: #e8f0ff;
  box-shadow: none;
}

.feed-art::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 60%, rgba(31, 36, 55, 0.1));
  content: "";
  pointer-events: none;
}

.feed-scene,
.feed-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.feed-scene::before,
.feed-scene::after {
  position: absolute;
  content: "";
}

.theme-sky {
  background:
    radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.9), transparent 20%),
    radial-gradient(circle at 72% 18%, rgba(255, 213, 128, 0.72), transparent 18%),
    linear-gradient(145deg, #81b9ff 0%, #ffe0d5 48%, #7b5cff 100%);
}

.theme-flower {
  background:
    radial-gradient(circle at 78% 24%, rgba(255, 255, 255, 0.78), transparent 19%),
    radial-gradient(circle at 24% 74%, rgba(255, 174, 217, 0.6), transparent 24%),
    linear-gradient(135deg, #a78bff 0%, #ffd6e8 52%, #fff7e9 100%);
}

.theme-pink {
  background:
    radial-gradient(circle at 40% 30%, rgba(255, 255, 255, 0.7), transparent 22%),
    linear-gradient(145deg, #ffc3e4 0%, #ff8bcf 48%, #8d70ff 100%);
}

.theme-neon {
  background:
    radial-gradient(circle at 70% 28%, rgba(255, 92, 184, 0.52), transparent 26%),
    linear-gradient(145deg, #151b4f 0%, #6c4bff 48%, #ff5cb8 100%);
}

.theme-sakura {
  background:
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.84), transparent 20%),
    linear-gradient(145deg, #b7e6ff 0%, #ffd6e8 52%, #7b5cff 100%);
}

.theme-photo {
  background:
    radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.74), transparent 22%),
    linear-gradient(145deg, #f2d6ff 0%, #ffb7d8 48%, #8c70ff 100%);
}

.theme-sky .feed-scene::before,
.theme-flower .feed-scene::before,
.theme-pink .feed-scene::before,
.theme-neon .feed-scene::before,
.theme-sakura .feed-scene::before,
.theme-photo .feed-scene::before {
  left: 34rpx;
  top: 58rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 42rpx;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: 86rpx 40rpx 0 -20rpx rgba(255, 255, 255, 0.34), 30rpx 118rpx 0 -32rpx rgba(255, 209, 92, 0.56);
}

.theme-sky .feed-scene::after,
.theme-flower .feed-scene::after,
.theme-pink .feed-scene::after,
.theme-neon .feed-scene::after,
.theme-sakura .feed-scene::after,
.theme-photo .feed-scene::after {
  right: 28rpx;
  bottom: 34rpx;
  width: 126rpx;
  height: 74rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.32);
  transform: rotate(-12deg);
}

.feed-badge {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  z-index: 2;
  height: 42rpx;
  padding: 0 18rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #7b5cff, #a76bff);
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 42rpx;
  box-shadow: 0 8rpx 18rpx rgba(123, 92, 255, 0.22);
}

.feed-play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: 74rpx;
  height: 74rpx;
  border-radius: 50%;
  background: rgba(31, 36, 55, 0.34);
  backdrop-filter: blur(10rpx);
  transform: translate(-50%, -50%);
}

.feed-play::after {
  position: absolute;
  top: 22rpx;
  left: 29rpx;
  width: 0;
  height: 0;
  border-top: 15rpx solid transparent;
  border-bottom: 15rpx solid transparent;
  border-left: 21rpx solid rgba(255, 255, 255, 0.94);
  content: "";
}

.feed-title {
  overflow: hidden;
  margin: 18rpx 18rpx 0;
  color: #1f2437;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  margin: 14rpx 18rpx 18rpx;
  color: #8b8fa3;
  font-size: 21rpx;
  font-weight: 800;
}

.feed-author {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.feed-author text {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-avatar {
  flex-shrink: 0;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: #f0eaff;
}

.feed-avatar.fallback {
  background:
    radial-gradient(circle at 50% 36%, #ffe4d6 0 8rpx, transparent 9rpx),
    linear-gradient(135deg, #7b5cff, #ff5cb8);
}

.feed-like {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  color: #8e87b2;
}

.heart-icon {
  position: relative;
  width: 19rpx;
  height: 17rpx;
  transform: rotate(-45deg);
}

.heart-icon::before,
.heart-icon::after {
  position: absolute;
  width: 12rpx;
  height: 12rpx;
  border: 3rpx solid #8e87b2;
  border-radius: 50%;
  content: "";
}

.heart-icon::before {
  left: 0;
  top: 0;
}

.heart-icon::after {
  right: 0;
  bottom: 0;
}

.create-empty {
  padding: 56rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.82);
  color: #8b8fa3;
  font-size: 26rpx;
  font-weight: 800;
  text-align: center;
  box-shadow: 0 10rpx 24rpx rgba(122, 92, 255, 0.08);
}

.create-empty-action {
  width: 176rpx;
  height: 56rpx;
  margin: 24rpx auto 0;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
  line-height: 56rpx;
}
</style>
