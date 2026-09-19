<template>
  <view class="screen inspiration-page">
    <AppTopbar class="app-nav-root" title="发现灵感" transparent>
      <template #left>
        <view class="nav-left-space"></view>
      </template>
    </AppTopbar>

    <view class="inspiration-hero">
      <view class="hero-copy">
        <view class="hero-title">激发创作灵感</view>
        <view class="hero-subtitle">探索热门创意，发现更多可能</view>
        <button class="hero-action" @tap="goCreate">去创作<text>→</text></button>
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

    <view class="inspiration-search" @tap="openCategoryPanel">
      <text class="inspiration-search-icon"></text>
      <input
        v-model="searchKeyword"
        class="inspiration-search-input"
        placeholder="搜索灵感模板"
        placeholder-class="inspiration-search-placeholder"
        confirm-type="search"
        @focus="openCategoryPanel"
      />
      <button v-if="searchKeyword" class="inspiration-search-clear" hover-class="none" @tap.stop="clearSearch">×</button>
    </view>

    <view v-if="topTemplates.length" class="top-template-section">
      <view class="top-template-head">
        <view class="top-template-title">推荐灵感</view>
        <button class="top-template-refresh" hover-class="none" :class="{ loading: loadingRandomInspirations, cycling: cyclingRandomInspirations }" :disabled="loadingRandomInspirations" @tap="refreshRandomInspirations">
          <text>{{ loadingRandomInspirations ? '刷新中' : '换一换' }}</text>
          <text class="top-template-refresh-icon"></text>
        </button>
      </view>
      <scroll-view scroll-x class="top-template-scroll" :show-scrollbar="false">
        <view class="top-template-row">
          <view
            v-for="item in topTemplates"
            :key="item.id"
            class="top-template-card"
            @tap="openWork(item)"
          >
            <view class="top-template-cover-wrap">
              <image v-if="item.cover" class="top-template-cover" :src="item.cover" mode="aspectFill" lazy-load />
              <view v-else class="top-template-cover fallback" :class="'theme-' + item.theme"></view>
              <view v-if="item.kind === 'video'" class="top-template-video-icon"></view>
            </view>
            <view class="top-template-name">{{ item.title }}</view>
            <view class="top-template-tags">
              <text v-for="tag in topTemplateTags(item)" :key="tag" class="top-template-tag">{{ tag }}</text>
            </view>
            <button class="top-template-generate" hover-class="none" @tap.stop="useTopTemplate(item)">
              <text>一键生成</text>
            </button>
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="showCategoryPanel" class="category-panel">
      <view class="category-panel-head">
        <view>
          <view class="category-panel-title">灵感模板分类</view>
          <view class="category-panel-subtitle">{{ categoryOptions.length - 1 }} 个分类</view>
        </view>
        <button class="category-panel-close" hover-class="none" @tap="showCategoryPanel = false">收起</button>
      </view>
      <view class="category-grid">
        <button
          v-for="item in categoryOptions"
          :key="item.key"
          class="category-chip"
          hover-class="none"
          :class="{ active: activeTab === item.name }"
          @tap="selectCategory(item.name)"
        >
          {{ item.name }}
        </button>
      </view>
    </view>

    <view class="category-shell">
      <scroll-view scroll-x class="create-tabs">
        <view class="create-tab-row">
          <view
            v-for="item in categoryOptions"
            :key="item.key"
            class="create-tab"
            :class="{ active: activeTab === item.name }"
            @tap="selectCategory(item.name)"
          >
            {{ item.name }}
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
        <button v-for="item in leftWorks" :key="item.id" class="feed-card" :class="item.aspectClass" @tap="openWork(item)">
          <view class="feed-art" :class="'theme-' + item.theme" :style="{ height: `${item.coverHeightRpx}rpx` }">
            <image v-if="item.cover" class="feed-cover" :src="item.cover" mode="aspectFill" lazy-load @load="onCoverLoad(item.id, $event)" />
            <view v-else class="feed-scene"></view>
            <view class="feed-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="feed-video-mark">
              <view class="feed-play"></view>
              <text v-if="item.durationText" class="feed-duration">{{ item.durationText }}</text>
            </view>
          </view>
          <view class="feed-title">{{ item.title }}</view>
          <view class="feed-meta">
            <view class="feed-actions">
              <button class="feed-favorite" :class="{ active: item.isFavorited }" hover-class="none" @tap.stop="toggleFavorite(item)">
                <image :src="item.isFavorited ? '/static/icons/icon_favorite_filled.svg' : '/static/icons/icon_favorite_line.svg'" mode="aspectFit" />
                <text v-if="hasFavoriteCount(item.favoriteCount)">{{ item.favoriteText }}</text>
              </button>
              <view class="feed-usage">
                <image src="/static/icons/icon_usage_line.svg" mode="aspectFit" />
                <text>{{ item.usageText }}</text>
              </view>
            </view>
          </view>
        </button>
      </view>
      <view class="waterfall-column">
        <button v-for="item in rightWorks" :key="item.id" class="feed-card" :class="item.aspectClass" @tap="openWork(item)">
          <view class="feed-art" :class="'theme-' + item.theme" :style="{ height: `${item.coverHeightRpx}rpx` }">
            <image v-if="item.cover" class="feed-cover" :src="item.cover" mode="aspectFill" lazy-load @load="onCoverLoad(item.id, $event)" />
            <view v-else class="feed-scene"></view>
            <view class="feed-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="feed-video-mark">
              <view class="feed-play"></view>
              <text v-if="item.durationText" class="feed-duration">{{ item.durationText }}</text>
            </view>
          </view>
          <view class="feed-title">{{ item.title }}</view>
          <view class="feed-meta">
            <view class="feed-actions">
              <button class="feed-favorite" :class="{ active: item.isFavorited }" hover-class="none" @tap.stop="toggleFavorite(item)">
                <image :src="item.isFavorited ? '/static/icons/icon_favorite_filled.svg' : '/static/icons/icon_favorite_line.svg'" mode="aspectFit" />
                <text v-if="hasFavoriteCount(item.favoriteCount)">{{ item.favoriteText }}</text>
              </button>
              <view class="feed-usage">
                <image src="/static/icons/icon_usage_line.svg" mode="aspectFit" />
                <text>{{ item.usageText }}</text>
              </view>
            </view>
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
      @favorite="togglePreviewFavorite"
      @use="usePreviewTemplate"
    />
    <AppDialogHost />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onReachBottom, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import { favoriteTemplate, getInspirations, getTemplateCategories, getTopInspirations, unfavoriteTemplate, useTemplate as useContentTemplate } from '@/api/template';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES } from '@/utils/constants';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { normalizeBackendMediaUrl } from '@/utils/media-url';
import { showMemberRequiredDialog } from '@/utils/app-dialog';
import type { CreativeTemplate } from '@/utils/mock';
import { createShareMessage, createShareTimeline, enableShareMenu } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';

interface WorkItem {
  id: string;
  title: string;
  author: string;
  usageCount: number;
  favoriteCount: number;
  usageText: string;
  favoriteText: string;
  isFavorited: boolean;
  category: string;
  tag: string;
  tags?: string[];
  kind: 'image' | 'video';
  ratio: string;
  aspectRatio: number;
  coverHeightRpx: number;
  aspectClass: 'aspect-short' | 'aspect-standard' | 'aspect-tall' | 'aspect-poster';
  durationText?: string;
  theme: string;
  avatar?: string;
  cover?: string;
  mediaUrl?: string;
  prompt?: string;
  createdAt?: string;
  sourceIndex?: number;
  canUse?: boolean;
  canSave?: boolean;
  lockReason?: string;
}

interface TemplateCategory {
  id?: number | string;
  key: string;
  name: string;
}

const fallbackCategories: TemplateCategory[] = [
  { key: 'recommend', name: '推荐' },
  { key: 'ai_image', name: 'AI绘画' },
  { key: 'ai_video', name: 'AI视频' },
  { key: 'ai_comic', name: 'AI漫剧' },
  { key: 'photo', name: '摄影' },
  { key: 'wallpaper', name: '壁纸' }
];
const fallbackWorks: WorkItem[] = [
  fallbackWork('work_cloud_video', '云端之上 · 梦幻城堡', 'AI视频', '视频', 'video', '9:16', 1280, 120, 'sky'),
  fallbackWork('work_comic_girl', '治愈系少女日常', 'AI漫剧', '漫画', 'image', '4:5', 8563, 72, 'flower'),
  fallbackWork('work_pink_illustration', '粉色少女心', 'AI绘画', '绘画', 'image', '3:4', 6234, 44, 'pink'),
  fallbackWork('work_future_city', '未来城市科幻风', 'AI视频', '视频', 'video', '16:9', 1800, 88, 'neon'),
  fallbackWork('work_wallpaper_sakura', '春日樱花壁纸', '壁纸', '壁纸', 'image', '9:16', 4210, 31, 'sakura'),
  fallbackWork('work_photo_light', '柔光人像摄影', '摄影', '摄影', 'image', '1:1', 3892, 22, 'photo')
];
const MAX_WORK_TAGS = 8;
const MAX_FILTER_TAGS = 24;
const WATERFALL_CARD_WIDTH_RPX = 342;
const COVER_MAX_HEIGHT_RPX = 720;
const COVER_RATIO_PRELOAD_LIMIT = 12;
const COVER_RATIO_PRELOAD_TIMEOUT_MS = 500;
const WORK_PAGE_SIZE = 24;

const activeTab = ref('推荐');
const mediaFilter = ref<'all' | 'image' | 'video'>('all');
const sortMode = ref<'default' | 'hot' | 'new'>('default');
const tagFilter = ref('全部');
const showFilterPanel = ref(false);
const showCategoryPanel = ref(false);
const searchKeyword = ref('');
const works = ref<WorkItem[]>([]);
const topTemplates = ref<WorkItem[]>([]);
const worksLoading = ref(false);
const worksHasMore = ref(true);
let worksPage = 1;
const loadingRandomInspirations = ref(false);
const cyclingRandomInspirations = ref(false);
const categories = ref<TemplateCategory[]>(fallbackCategories);
const previewTemplate = ref<CreativeTemplate | null>(null);
const configStore = useConfigStore();
const authStore = useAuthStore();
const userStore = useUserStore();
const bannerFailed = ref(false);
const favoritePending = ref<Record<string, boolean>>({});
const pendingFavoriteId = ref('');
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
const categoryOptions = computed(() => categories.value.length ? categories.value : fallbackCategories);
const tagFilters = computed(() => ['全部', ...topFilterTags(works.value)]);
const activeFilterCount = computed(() => [
  mediaFilter.value !== 'all',
  sortMode.value !== 'default',
  tagFilter.value !== '全部'
].filter(Boolean).length);
const filteredWorks = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const list = works.value.filter((item) => {
    if (!tabMatches(item, activeTab.value)) return false;
    if (mediaFilter.value !== 'all' && item.kind !== mediaFilter.value) return false;
    if (tagFilter.value !== '全部' && !workTagsOf(item).includes(tagFilter.value)) return false;
    if (keyword && !searchMatches(item, keyword)) return false;
    return true;
  });
  return sortWorks(list, sortMode.value);
});
const leftWorks = computed(() => filteredWorks.value.filter((_, index) => index % 2 === 0));
const rightWorks = computed(() => filteredWorks.value.filter((_, index) => index % 2 === 1));

onLoad((query) => {
  pendingFavoriteId.value = String(query?.favoriteId || '');
});

onShow(() => {
  enableShareMenu();
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  loadCategories();
  loadTopTemplates();
  loadWorks({ reset: true });
});

onReachBottom(() => {
  loadWorks();
});

onShareAppMessage(() => createShareMessage({
  title: '来 AI艺术生成工坊找灵感模板',
  path: PAGE_ROUTES.inspiration
}));

onShareTimeline(() => createShareTimeline({
  title: '来 AI艺术生成工坊找灵感模板',
  path: PAGE_ROUTES.inspiration
}));

async function loadCategories() {
  try {
    const res = await getTemplateCategories<{ list?: Record<string, unknown>[] }>();
    const list = Array.isArray(res.list) ? res.list : [];
    const next = [
      { key: 'recommend', name: '推荐' },
      ...list.map(categoryToOption).filter((item) => item.name && item.name !== '推荐')
    ];
    categories.value = dedupeCategories(next);
    ensureSelectedCategoryExists();
  } catch {
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration-categories', 'GET /templates/categories failed');
    }
    categories.value = fallbackCategories;
    ensureSelectedCategoryExists();
  }
}

async function loadWorks(options: { reset?: boolean; random?: boolean } = {}) {
  const { reset = false, random = false } = options;
  if (worksLoading.value || (!reset && !worksHasMore.value)) return;
  if (reset) {
    worksPage = 1;
    worksHasMore.value = true;
  }
  worksLoading.value = true;
  try {
    const res = await getInspirations<{ list?: Record<string, unknown>[]; hasMore?: boolean }>({
      page: worksPage,
      pageSize: WORK_PAGE_SIZE,
      random,
    });
    const list = Array.isArray(res.list) ? res.list : [];
    if (list.length) {
      const offset = (worksPage - 1) * WORK_PAGE_SIZE;
      const next = await primeCoverRatios(list.map((item, index) => inspirationToWork(item, offset + index)));
      works.value = reset ? next : mergeWorks(works.value, next);
      worksPage += 1;
      worksHasMore.value = typeof res.hasMore === 'boolean' ? res.hasMore : list.length >= WORK_PAGE_SIZE;
      ensureSelectedTagExists();
      consumePendingFavorite();
      return;
    }
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration', 'GET /templates/inspirations returned empty list');
      works.value = fallbackWorks;
      worksHasMore.value = false;
      ensureSelectedTagExists();
      consumePendingFavorite();
      return;
    }
    if (reset) works.value = [];
    worksHasMore.value = false;
    ensureSelectedTagExists();
  } catch {
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration', 'GET /templates/inspirations failed');
      if (reset) works.value = fallbackWorks;
      worksHasMore.value = false;
      ensureSelectedTagExists();
      consumePendingFavorite();
      return;
    }
    if (reset) works.value = [];
    worksHasMore.value = false;
    ensureSelectedTagExists();
  } finally {
    worksLoading.value = false;
  }
}

async function loadTopTemplates(random = false) {
  try {
    const res = await getTopInspirations<{ list?: Record<string, unknown>[] }>({ pageSize: 12, random: random });
    const list = Array.isArray(res.list) ? res.list : [];
    topTemplates.value = await primeCoverRatios(list.map((item, index) => inspirationToWork(item, index)));
  } catch {
    if (isDevFallbackEnabled) {
      warnDevFallback('inspiration-top', 'GET /templates/inspirations/top failed');
      topTemplates.value = fallbackWorks.slice(0, 6);
      return;
    }
    topTemplates.value = [];
  }
}

async function refreshRandomInspirations() {
  if (loadingRandomInspirations.value) return;
  playRandomInspirationRefreshMotion();
  loadingRandomInspirations.value = true;
  try {
    await Promise.all([loadTopTemplates(true), loadWorks({ reset: true, random: true })]);
  } finally {
    loadingRandomInspirations.value = false;
  }
}

function playRandomInspirationRefreshMotion() {
  cyclingRandomInspirations.value = true;
  setTimeout(() => {
    cyclingRandomInspirations.value = false;
  }, 420);
}

function showHot() {
  activeTab.value = '推荐';
  resetFilter();
}

function openCategoryPanel() {
  showCategoryPanel.value = true;
}

function selectCategory(name: string) {
  activeTab.value = name;
  showCategoryPanel.value = false;
}

function clearSearch() {
  searchKeyword.value = '';
}

function openWork(work: WorkItem) {
  previewTemplate.value = workToTemplate(work);
}

function useTopTemplate(work: WorkItem) {
  usePreviewTemplate(workToTemplate(work));
}

async function usePreviewTemplate(template: CreativeTemplate) {
  if (template.canUse === false) {
    showMemberRequiredDialog({
      title: '开通会员使用模板',
      message: template.lockReason || '该模板需开通会员后使用。'
    });
    return;
  }
  const backendTemplateId = numericTemplateId(template.id);
  if (backendTemplateId) {
    try {
      await useContentTemplate(backendTemplateId);
    } catch {
      return;
    }
  }
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
    mediaUrl: work.mediaUrl || '',
    mode: work.kind === 'video' ? 'text2video' : 'text2img',
    category: work.category,
    duration: work.kind === 'video' ? work.durationText || '10s' : undefined,
    ratio: work.ratio,
    aspectRatio: work.aspectRatio,
    usageCount: work.usageCount,
    favoriteCount: work.favoriteCount,
    isFavorited: work.isFavorited,
    canUse: work.canUse !== false,
    canSave: work.canSave !== false && work.canUse !== false,
    lockReason: work.lockReason || ''
  };
}

function mergeWorks(current: WorkItem[], next: WorkItem[]) {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  })];
}

function workFromTemplate(template: CreativeTemplate) {
  const id = String(template.id || '');
  return works.value.find((item) => item.id === id) || topTemplates.value.find((item) => item.id === id) || null;
}

function togglePreviewFavorite(template: CreativeTemplate) {
  const work = workFromTemplate(template);
  if (!work) {
    uni.showToast({ title: '该内容暂不支持收藏', icon: 'none' });
    return;
  }
  toggleFavorite(work);
}

function inspirationToWork(item: Record<string, unknown>, index: number): WorkItem {
  const templateType = String(item.templateType || item.template_type || item.mediaType || item.type || 'image');
  const title = String(item.title || item.prompt || '灵感模板');
  const category = String(item.categoryName || item.category || item.scene || defaultCategory(templateType, title));
  const backendTags = templateTagsOf(item);
  const kind = inferMediaKind(item, templateType, backendTags);
  const fallbackTag = labelOf(kind, category, title);
  const tags = (backendTags.length ? backendTags : [fallbackTag]).slice(0, MAX_WORK_TAGS);
  const prompt = String(item.prompt || item.description || item.title || '');
  const width = numericValue(item.width || item.coverWidth || item.cover_width);
  const height = numericValue(item.height || item.coverHeight || item.cover_height);
  const params = templateParamsOf(item);
  const ratio = normalizeRatio(String(item.ratio || item.aspectRatio || item.aspect_ratio || ''), width, height, prompt, params);
  const aspectRatio = aspectRatioValue(ratio);
  const usageCount = Math.max(0, Math.floor(Number(item.usageCount || item.usage_count || 0) || 0));
  const favoriteCount = Math.max(0, Math.floor(Number(item.favoriteCount || item.favorite_count || 0) || 0));
  return {
    id: String(item.id || `inspiration_${index}`),
    title,
    author: String(item.author || item.nickname || '@官方灵感'),
    usageCount,
    favoriteCount,
    usageText: formatCount(usageCount),
    favoriteText: formatCount(favoriteCount),
    isFavorited: item.isFavorited === true || item.is_favorited === true,
    category,
    tag: tags[0],
    tags,
    kind,
    ratio,
    aspectRatio,
    coverHeightRpx: coverHeightOf(aspectRatio),
    aspectClass: aspectClassOf(ratio),
    durationText: durationTextOf(item),
    theme: ['sky', 'flower', 'pink', 'neon', 'sakura', 'photo'][index % 6],
    avatar: String(item.avatarUrl || item.avatar_url || item.authorAvatar || item.author_avatar || ''),
    cover: normalizeBackendMediaUrl(item.coverUrl || item.cover_url || item.thumbnail),
    mediaUrl: normalizeBackendMediaUrl(item.previewUrl || item.preview_url || item.mediaUrl || item.media_url),
    prompt,
    createdAt: String(item.createdAt || item.created_at || item.updatedAt || item.updated_at || ''),
    sourceIndex: index,
    canUse: item.canUse !== false,
    canSave: item.canSave !== false && item.canUse !== false,
    lockReason: String(item.lockReason || '')
  };
}

async function toggleFavorite(item: WorkItem) {
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
  if (favoritePending.value[item.id]) return;
  favoritePending.value = { ...favoritePending.value, [item.id]: true };
  const before = { isFavorited: item.isFavorited, favoriteCount: item.favoriteCount };
  applyFavoriteState(item.id, !item.isFavorited, item.favoriteCount + (item.isFavorited ? -1 : 1));
  try {
    const res = item.isFavorited
      ? await unfavoriteTemplate<{ isFavorited?: boolean; favoriteCount?: number }>(templateId)
      : await favoriteTemplate<{ isFavorited?: boolean; favoriteCount?: number }>(templateId);
    applyFavoriteState(item.id, res.isFavorited === true, Number(res.favoriteCount || 0));
    userStore.loadFullProfile().catch(() => undefined);
  } catch (error) {
    applyFavoriteState(item.id, before.isFavorited, before.favoriteCount);
    const message = error instanceof Error ? error.message : '';
    uni.showToast({ title: message || '收藏失败，请稍后重试', icon: 'none' });
  } finally {
    const next = { ...favoritePending.value };
    delete next[item.id];
    favoritePending.value = next;
  }
}

function consumePendingFavorite() {
  if (!pendingFavoriteId.value || !authStore.isLoggedIn) return;
  const target = works.value.find((item) => item.id === pendingFavoriteId.value);
  if (!target) return;
  pendingFavoriteId.value = '';
  if (target.isFavorited) return;
  toggleFavorite(target);
}

function applyFavoriteState(id: string, isFavorited: boolean, count: number) {
  const update = (item: WorkItem) => {
    if (item.id !== id) return item;
    const favoriteCount = Math.max(0, Math.floor(Number(count) || 0));
    return { ...item, isFavorited, favoriteCount, favoriteText: formatCount(favoriteCount) };
  };
  works.value = works.value.map(update);
  topTemplates.value = topTemplates.value.map(update);
  if (previewTemplate.value?.id === id) {
    const favoriteCount = Math.max(0, Math.floor(Number(count) || 0));
    previewTemplate.value = {
      ...previewTemplate.value,
      isFavorited,
      favoriteCount
    };
  }
}

function onCoverLoad(id: string, event: unknown) {
  const detail = (event as { detail?: { width?: number; height?: number } } | null)?.detail;
  const width = numericValue(detail?.width);
  const height = numericValue(detail?.height);
  if (!id || width <= 0 || height <= 0) return;
  applyCoverRatio(id, width, height);
}

function applyCoverRatio(id: string, width: number, height: number) {
  const update = (item: WorkItem) => {
    if (item.id !== id) return item;
    const next = withCoverRatio(item, width, height);
    if (
      item.coverHeightRpx === next.coverHeightRpx &&
      Math.abs(item.aspectRatio - next.aspectRatio) < 0.001
    ) {
      return item;
    }
    return next;
  };
  works.value = works.value.map(update);
  topTemplates.value = topTemplates.value.map(update);
}

async function primeCoverRatios(items: WorkItem[]) {
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index < COVER_RATIO_PRELOAD_LIMIT && !!item.cover);
  if (!targets.length) return items;
  const resolved = await Promise.all(targets.map(async ({ item, index }) => {
    const size = await getCoverImageSize(item.cover || '');
    return size ? { index, item: withCoverRatio(item, size.width, size.height) } : null;
  }));
  if (!resolved.some(Boolean)) return items;
  const next = [...items];
  resolved.forEach((entry) => {
    if (entry) next[entry.index] = entry.item;
  });
  return next;
}

function getCoverImageSize(src: string): Promise<{ width: number; height: number } | null> {
  if (!src || typeof uni.getImageInfo !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (size: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(size);
    };
    const timer = setTimeout(() => finish(null), COVER_RATIO_PRELOAD_TIMEOUT_MS);
    uni.getImageInfo({
      src,
      success: (res) => {
        const width = numericValue(res.width);
        const height = numericValue(res.height);
        finish(width > 0 && height > 0 ? { width, height } : null);
      },
      fail: () => finish(null)
    });
  });
}

function withCoverRatio(item: WorkItem, width: number, height: number): WorkItem {
  const ratio = `${Math.round(width)}:${Math.round(height)}`;
  const aspectRatio = width / height;
  return {
    ...item,
    ratio,
    aspectRatio,
    coverHeightRpx: coverHeightOf(aspectRatio),
    aspectClass: aspectClassOf(ratio)
  };
}

function fallbackWork(
  id: string,
  title: string,
  category: string,
  tag: string,
  kind: WorkItem['kind'],
  ratio: string,
  usageCount: number,
  favoriteCount: number,
  theme: string,
): WorkItem {
  return {
    id,
    title,
    author: '@官方灵感',
    usageCount,
    favoriteCount,
    usageText: formatCount(usageCount),
    favoriteText: formatCount(favoriteCount),
    isFavorited: false,
    category,
    tag,
    tags: [tag, category],
    kind,
    ratio,
    aspectRatio: aspectRatioValue(ratio),
    coverHeightRpx: coverHeightOf(aspectRatioValue(ratio)),
    aspectClass: aspectClassOf(ratio),
    durationText: kind === 'video' ? '10s' : '',
    theme,
  };
}

function categoryToOption(item: Record<string, unknown>): TemplateCategory {
  const id = item.categoryId || item.id;
  const name = String(item.name || item.categoryName || item.category || '').trim();
  const key = String(item.categoryKey || item.category_key || id || name).trim();
  return { id: id as number | string | undefined, key: key || name, name };
}

function dedupeCategories(list: TemplateCategory[]) {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = item.name || item.key;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numericTemplateId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value || 0);
}

function hasFavoriteCount(value: number) {
  return Math.max(0, Math.floor(Number(value || 0) || 0)) > 0;
}

function sortWorks(list: WorkItem[], mode: 'default' | 'hot' | 'new') {
  const source = [...list];
  if (mode === 'hot') return source.sort((a, b) => (b.usageCount + b.favoriteCount) - (a.usageCount + a.favoriteCount));
  if (mode === 'new') return source.sort((a, b) => createdValue(b) - createdValue(a));
  return source.sort((a, b) => Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0));
}

function createdValue(item: WorkItem) {
  const time = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER - Number(item.sourceIndex || 0);
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeRatio(value: string, width: number, height: number, prompt: string, params?: Record<string, unknown> | null) {
  const text = normalizeRatioText(value);
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text)) return text;
  if (width > 0 && height > 0) return `${width}:${height}`;
  const paramsRatio = normalizeRatioText(params?.aspect_ratio || params?.aspectRatio || params?.ratio || '');
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(paramsRatio)) return paramsRatio;
  const paramsSize = String(params?.size || params?.resolution || '').trim();
  const sizeMatched = paramsSize.match(/(\d{2,5})\s*[xX*]\s*(\d{2,5})/);
  if (sizeMatched) return `${sizeMatched[1]}:${sizeMatched[2]}`;
  const paramsWidth = numericValue(params?.width || params?.w);
  const paramsHeight = numericValue(params?.height || params?.h);
  if (paramsWidth > 0 && paramsHeight > 0) return `${paramsWidth}:${paramsHeight}`;
  const matched = String(prompt || '').match(/\|(\d{2,5})\|(\d{2,5})\s*$/);
  if (matched) return `${matched[1]}:${matched[2]}`;
  return '4:5';
}

function normalizeRatioText(value: unknown) {
  return String(value || '').trim().replace(/：/g, ':');
}

function templateParamsOf(item: Record<string, unknown>) {
  const raw = item.paramsJson || item.params_json || item.defaultParams || item.default_params;
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return parseMaybeJson(String(raw)) as Record<string, unknown> | null;
}

function aspectRatioValue(ratio: string) {
  const [w, h] = ratio.split(':').map((item) => Number(item));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0.8;
  return w / h;
}

function coverHeightOf(aspectRatio: number) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 0.8;
  const rawHeight = WATERFALL_CARD_WIDTH_RPX / ratio;
  return Math.round(Math.min(COVER_MAX_HEIGHT_RPX, rawHeight));
}

function aspectClassOf(ratio: string): WorkItem['aspectClass'] {
  const [w, h] = ratio.split(':').map((item) => Number(item));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'aspect-tall';
  const value = h / w;
  if (value >= 1.65) return 'aspect-poster';
  if (value >= 1.18) return 'aspect-tall';
  if (value <= 0.82) return 'aspect-short';
  return 'aspect-standard';
}

function durationTextOf(item: Record<string, unknown>) {
  const direct = String(item.durationLabel || item.durationText || '').trim();
  if (direct) return direct;
  const duration = Number(item.duration || item.durationSeconds || item.duration_seconds || 0);
  if (Number.isFinite(duration) && duration > 0) return `${Math.floor(duration)}s`;
  const params = item.paramsJson || item.params_json || item.defaultParams || item.default_params;
  const parsed = typeof params === 'string' ? parseMaybeJson(params) : params;
  const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).duration || (parsed as Record<string, unknown>).durationSeconds : '';
  return value ? String(value) : '';
}

function parseMaybeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
  searchKeyword.value = '';
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

function searchMatches(item: WorkItem, keyword: string) {
  return [
    item.title,
    item.author,
    item.category,
    item.tag,
    ...(item.tags || []),
    item.prompt || ''
  ].join(' ').toLowerCase().includes(keyword);
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

function topTemplateTags(item: WorkItem) {
  return uniqueTags([item.category, ...workTagsOf(item)]).slice(0, 2);
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

function ensureSelectedCategoryExists() {
  if (!categoryOptions.value.some((item) => item.name === activeTab.value)) {
    activeTab.value = '推荐';
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

.inspiration-search {
  position: relative;
  display: flex;
  align-items: center;
  height: 78rpx;
  margin: 0 0 18rpx;
  padding: 0 78rpx 0 74rpx;
  box-sizing: border-box;
  border: 1rpx solid rgba(123, 92, 255, 0.14);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12rpx 26rpx rgba(122, 92, 255, 0.1);
}

.inspiration-search-icon {
  position: absolute;
  top: 24rpx;
  left: 28rpx;
  width: 22rpx;
  height: 22rpx;
  border: 4rpx solid #7b5cff;
  border-radius: 50%;
}

.inspiration-search-icon::after {
  position: absolute;
  right: -12rpx;
  bottom: -9rpx;
  width: 16rpx;
  height: 4rpx;
  border-radius: 2rpx;
  background: #7b5cff;
  content: "";
  transform: rotate(45deg);
}

.inspiration-search-input {
  width: 100%;
  height: 78rpx;
  color: #172033;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 78rpx;
}

.inspiration-search-placeholder {
  color: #8b8fa3;
  font-weight: 800;
}

.inspiration-search-clear {
  position: absolute;
  top: 13rpx;
  right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border-radius: 26rpx;
  background: #eef1fb;
  color: #64748b;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 48rpx;
}

.top-template-section {
  margin: 0 -24rpx 22rpx;
}

.top-template-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 0 24rpx 14rpx;
}

.top-template-title {
  color: #172033;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.2;
}

.top-template-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-width: 92rpx;
  height: 46rpx;
  margin: 0;
  padding: 0 18rpx;
  box-sizing: border-box;
  border-radius: 23rpx;
  background: #f0edff;
  color: #6c4bff;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 46rpx;
}

.top-template-refresh.loading {
  color: #7a5cff;
  opacity: 0.86;
}

.top-template-refresh-icon {
  position: relative;
  width: 22rpx;
  height: 22rpx;
  box-sizing: border-box;
  border: 4rpx solid currentColor;
  border-left-color: transparent;
  border-radius: 50%;
}

.top-template-refresh-icon::after {
  position: absolute;
  right: -5rpx;
  top: -1rpx;
  width: 0;
  height: 0;
  border-top: 7rpx solid currentColor;
  border-left: 7rpx solid transparent;
  content: "";
  transform: rotate(28deg);
}

.top-template-refresh.loading .top-template-refresh-icon {
  animation: pull-refresh-spin 0.82s linear infinite;
}

.top-template-refresh.cycling .top-template-refresh-icon {
  animation: pull-refresh-spin 0.42s ease-out;
}

.top-template-scroll {
  width: 100%;
  white-space: nowrap;
}

.top-template-row {
  display: inline-flex;
  align-items: stretch;
  gap: 18rpx;
  padding: 0 24rpx 6rpx;
}

.top-template-card {
  flex-shrink: 0;
  overflow: hidden;
  width: 246rpx;
  padding: 0 0 14rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #ffffff;
  box-shadow: 0 6rpx 14rpx rgba(70, 55, 120, 0.08);
}

.top-template-cover-wrap {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 246rpx;
  background: #f0edff;
}

.top-template-cover {
  width: 100%;
  height: 100%;
}

.top-template-cover.fallback {
  background: linear-gradient(135deg, #8c55ff, #ff7dbd);
}

.top-template-video-icon {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 17rpx;
  background: rgba(23, 32, 51, 0.7);
}

.top-template-video-icon::after {
  position: absolute;
  top: 9rpx;
  left: 13rpx;
  width: 0;
  height: 0;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 12rpx solid #ffffff;
  content: "";
}

.top-template-name {
  height: 32rpx;
  margin: 12rpx 16rpx 0;
  color: #172033;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 32rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-template-tags {
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 36rpx;
  margin: 8rpx 16rpx 10rpx;
  overflow: hidden;
}

.top-template-tag {
  flex-shrink: 0;
  max-width: 104rpx;
  height: 34rpx;
  padding: 0 12rpx;
  box-sizing: border-box;
  border-radius: 10rpx;
  background: #f0eaff;
  color: #7b5cff;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 34rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-template-generate {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% - 32rpx);
  height: 60rpx;
  margin: 0 16rpx;
  padding: 0;
  box-sizing: border-box;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #7b5cff, #8f63ff);
  color: #ffffff;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 60rpx;
}

.category-panel {
  width: 100%;
  margin: -2rpx 0 18rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border: 1rpx solid rgba(123, 92, 255, 0.12);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14rpx 32rpx rgba(122, 92, 255, 0.12);
}

.category-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.category-panel-title {
  color: #172033;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 1.2;
}

.category-panel-subtitle {
  margin-top: 6rpx;
  color: #8b8fa3;
  font-size: 22rpx;
  font-weight: 800;
}

.category-panel-close {
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

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  max-height: 214rpx;
  overflow: hidden;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  height: 58rpx;
  margin: 0;
  padding: 0 22rpx;
  box-sizing: border-box;
  border: 1rpx solid #dce8f6;
  border-radius: 29rpx;
  background: #f8fbff;
  color: #64748b;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 58rpx;
}

.category-chip.active {
  border-color: rgba(123, 92, 255, 0.34);
  background: linear-gradient(135deg, #7b5cff, #a76bff);
  color: #ffffff;
  box-shadow: 0 10rpx 20rpx rgba(123, 92, 255, 0.18);
}

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
  position: relative;
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

.feed-art {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 340rpx;
  border-radius: inherit;
  background: #f2f0fb;
  box-shadow: none;
}

.feed-scene,
.feed-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.feed-cover {
  background: #f2f0fb;
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
  top: 8rpx;
  left: 8rpx;
  z-index: 2;
  height: 28rpx;
  padding: 0 10rpx;
  border-radius: 11rpx;
  background: rgba(112, 91, 255, 0.68);
  color: #ffffff;
  font-size: 17rpx;
  font-weight: 900;
  line-height: 28rpx;
  opacity: 0.76;
}

.feed-video-mark {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  pointer-events: none;
}

.feed-play {
  position: relative;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  width: 68rpx;
  height: 68rpx;
  flex-shrink: 0;
  border-radius: 34rpx;
  background: rgba(23, 32, 51, 0.58);
  box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8rpx);
}

.feed-play::after {
  position: absolute;
  top: 22rpx;
  left: 28rpx;
  width: 0;
  height: 0;
  border-top: 12rpx solid transparent;
  border-bottom: 12rpx solid transparent;
  border-left: 18rpx solid rgba(255, 255, 255, 0.94);
  content: "";
}

.feed-duration {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  height: 42rpx;
  padding: 0 12rpx;
  border-radius: 21rpx;
  background: rgba(23, 32, 51, 0.58);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 42rpx;
  backdrop-filter: blur(8rpx);
}

.feed-title {
  position: absolute;
  right: 18rpx;
  bottom: 43rpx;
  left: 18rpx;
  z-index: 2;
  overflow: hidden;
  height: 42rpx;
  margin: 0;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 42rpx;
  text-overflow: ellipsis;
  text-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.76),
    0 0 12rpx rgba(0, 0, 0, 0.5),
    0 1rpx 1rpx rgba(0, 0, 0, 0.68);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  white-space: nowrap;
}

.feed-meta {
  position: absolute;
  right: 14rpx;
  bottom: 12rpx;
  left: 14rpx;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 20rpx;
  font-weight: 800;
}

.feed-actions {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}

.feed-usage,
.feed-favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 36rpx;
  margin: 0;
  padding: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 21rpx;
  font-weight: 900;
  line-height: 36rpx;
  text-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.68),
    0 0 9rpx rgba(0, 0, 0, 0.44);
}

.feed-usage image,
.feed-favorite image {
  flex-shrink: 0;
  width: 32rpx;
  height: 32rpx;
  filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.46));
}

.feed-usage image {
  width: 34rpx;
  height: 34rpx;
}

.feed-favorite {
  min-width: 32rpx;
  order: 0;
}

.feed-favorite.active {
  color: #ff7aa3;
}

.feed-usage {
  order: 1;
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
