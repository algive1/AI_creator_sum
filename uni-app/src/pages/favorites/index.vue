<template>
  <view class="favorites-page">
    <AppTopbar title="我的收藏" back transparent />

    <view class="favorites-head">
      <view>
        <view class="favorites-title">收藏灵感</view>
        <view class="favorites-subtitle">{{ totalText }} 个模板</view>
      </view>
      <button class="refresh-btn" hover-class="none" @tap="refreshList">刷新</button>
    </view>

    <view v-if="items.length" class="favorites-waterfall">
      <view class="waterfall-column">
        <button v-for="item in leftItems" :key="item.id" class="favorite-card" :class="item.aspectClass" @tap="openPreview(item)">
          <view class="favorite-art" :style="{ height: `${item.coverHeightRpx}rpx` }">
            <image v-if="item.cover" class="favorite-cover" :src="item.cover" mode="aspectFit" lazy-load />
            <view v-else class="favorite-cover fallback">AI</view>
            <view class="favorite-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="video-mark">
              <view class="play-triangle"></view>
              <text v-if="item.durationText">{{ item.durationText }}</text>
            </view>
          </view>
          <view class="favorite-title">{{ item.title }}</view>
          <view class="favorite-meta">
            <view class="favorite-author">
              <image class="official-avatar" :src="OFFICIAL_AVATAR" mode="aspectFill" lazy-load />
              <text>官方灵感</text>
            </view>
            <button class="unfavorite-btn" hover-class="none" @tap.stop="removeFavorite(item)">
              <image src="/static/icons/icon_favorite_filled.svg" mode="aspectFit" />
              <text v-if="hasFavoriteCount(item.favoriteCount)">{{ item.favoriteText }}</text>
            </button>
          </view>
        </button>
      </view>
      <view class="waterfall-column">
        <button v-for="item in rightItems" :key="item.id" class="favorite-card" :class="item.aspectClass" @tap="openPreview(item)">
          <view class="favorite-art" :style="{ height: `${item.coverHeightRpx}rpx` }">
            <image v-if="item.cover" class="favorite-cover" :src="item.cover" mode="aspectFit" lazy-load />
            <view v-else class="favorite-cover fallback">AI</view>
            <view class="favorite-badge">{{ item.tag }}</view>
            <view v-if="item.kind === 'video'" class="video-mark">
              <view class="play-triangle"></view>
              <text v-if="item.durationText">{{ item.durationText }}</text>
            </view>
          </view>
          <view class="favorite-title">{{ item.title }}</view>
          <view class="favorite-meta">
            <view class="favorite-author">
              <image class="official-avatar" :src="OFFICIAL_AVATAR" mode="aspectFill" lazy-load />
              <text>官方灵感</text>
            </view>
            <button class="unfavorite-btn" hover-class="none" @tap.stop="removeFavorite(item)">
              <image src="/static/icons/icon_favorite_filled.svg" mode="aspectFit" />
              <text v-if="hasFavoriteCount(item.favoriteCount)">{{ item.favoriteText }}</text>
            </button>
          </view>
        </button>
      </view>
    </view>

    <view v-else-if="!loading" class="empty-state">
      <view class="empty-icon">♡</view>
      <view class="empty-title">还没有收藏</view>
      <view class="empty-subtitle">看到喜欢的灵感模板，点一下收藏就会出现在这里。</view>
      <button class="empty-action" hover-class="none" @tap="goInspiration">去逛灵感</button>
    </view>

    <view v-if="loading" class="loading-state">加载中...</view>
    <view v-else-if="items.length && !hasMore" class="end-state">已加载全部</view>

    <TemplatePreviewSheet
      :template="previewTemplate"
      @close="previewTemplate = null"
      @favorite="togglePreviewFavorite"
      @use="usePreviewTemplate"
    />
    <AppDialogHost />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import { getFavoriteTemplates, unfavoriteTemplate, useTemplate as useContentTemplate } from '@/api/template';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES } from '@/utils/constants';
import { normalizeBackendMediaUrl } from '@/utils/media-url';
import { showMemberRequiredDialog } from '@/utils/app-dialog';
import type { CreativeTemplate } from '@/utils/mock';
import { ensureLoggedIn } from '@/utils/login-guard';

type AspectClass = 'aspect-short' | 'aspect-standard' | 'aspect-tall' | 'aspect-poster';

interface FavoriteItem {
  id: string;
  title: string;
  category: string;
  tag: string;
  tags: string[];
  kind: 'image' | 'video';
  ratio: string;
  aspectRatio: number;
  coverHeightRpx: number;
  aspectClass: AspectClass;
  usageCount: number;
  favoriteCount: number;
  favoriteText: string;
  durationText?: string;
  cover?: string;
  mediaUrl?: string;
  prompt: string;
  canUse?: boolean;
  canSave?: boolean;
  lockReason?: string;
}

const PAGE_SIZE = 20;
const WATERFALL_CARD_WIDTH_RPX = 341;
const COVER_MIN_HEIGHT_RPX = 196;
const COVER_MAX_HEIGHT_RPX = 560;
const OFFICIAL_AVATAR = '/static/visuals/inspiration/official_inspiration_avatar.png';

const authStore = useAuthStore();
const userStore = useUserStore();
const items = ref<FavoriteItem[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const hasMore = ref(true);
const removing = ref<Record<string, boolean>>({});
const previewTemplate = ref<CreativeTemplate | null>(null);

const leftItems = computed(() => items.value.filter((_, index) => index % 2 === 0));
const rightItems = computed(() => items.value.filter((_, index) => index % 2 === 1));
const totalText = computed(() => formatCount(total.value || items.value.length));

onShow(async () => {
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后查看收藏',
      subtitle: '登录并授权手机号后，可查看你的收藏灵感。'
    });
    if (!loggedIn) {
      items.value = [];
      return;
    }
  }
  refreshList();
});

onPullDownRefresh(async () => {
  await refreshList();
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  if (!loading.value && hasMore.value) loadList(page.value + 1);
});

async function refreshList() {
  page.value = 1;
  hasMore.value = true;
  await loadList(1);
}

async function loadList(nextPage: number) {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await getFavoriteTemplates<{ list?: Record<string, unknown>[]; total?: number; pagination?: Record<string, unknown> }>({
      page: nextPage,
      pageSize: PAGE_SIZE
    });
    const list = Array.isArray(res.list) ? res.list.map(templateToFavoriteItem) : [];
    items.value = nextPage === 1 ? list : mergeItems(items.value, list);
    page.value = nextPage;
    const paginationTotal = Number(res.pagination?.total || res.total || items.value.length);
    total.value = Number.isFinite(paginationTotal) ? paginationTotal : items.value.length;
    hasMore.value = items.value.length < total.value && list.length > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    uni.showToast({ title: message || '收藏列表加载失败', icon: 'none' });
    if (nextPage === 1) items.value = [];
  } finally {
    loading.value = false;
  }
}

function openPreview(item: FavoriteItem) {
  previewTemplate.value = itemToTemplate(item);
}

async function removeFavorite(item: FavoriteItem) {
  const templateId = numericTemplateId(item.id);
  if (!templateId || removing.value[item.id]) return;
  removing.value = { ...removing.value, [item.id]: true };
  const beforeItems = items.value;
  const beforeTotal = total.value;
  items.value = items.value.filter((target) => target.id !== item.id);
  total.value = Math.max(0, total.value - 1);
  try {
    await unfavoriteTemplate<{ favoriteCount?: number; totalFavorites?: number }>(templateId);
    userStore.loadFullProfile().catch(() => undefined);
    if (previewTemplate.value?.id === item.id) {
      previewTemplate.value = null;
    }
  } catch (error) {
    items.value = beforeItems;
    total.value = beforeTotal;
    const message = error instanceof Error ? error.message : '';
    uni.showToast({ title: message || '取消收藏失败', icon: 'none' });
  } finally {
    const next = { ...removing.value };
    delete next[item.id];
    removing.value = next;
  }
}

function togglePreviewFavorite(template: CreativeTemplate) {
  const item = items.value.find((target) => target.id === String(template.id || ''));
  if (!item) return;
  removeFavorite(item);
}

async function usePreviewTemplate(template: CreativeTemplate) {
  if (template.canUse === false) {
    showMemberRequiredDialog({
      title: '开通会员使用模板',
      message: template.lockReason || '该模板需要开通会员后使用。'
    });
    return;
  }
  const templateId = numericTemplateId(template.id);
  if (templateId) {
    try {
      await useContentTemplate(templateId);
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

function goInspiration() {
  uni.reLaunch({ url: PAGE_ROUTES.inspiration });
}

function itemToTemplate(item: FavoriteItem): CreativeTemplate {
  return {
    id: item.id,
    title: item.title,
    tags: uniqueTags([item.kind === 'video' ? '视频' : '图片', ...item.tags, item.category, '模板']),
    prompt: item.prompt || item.title,
    mediaType: item.kind,
    coverUrl: item.cover || '',
    mediaUrl: item.mediaUrl || '',
    mode: item.kind === 'video' ? 'text2video' : 'text2img',
    category: item.category,
    duration: item.kind === 'video' ? item.durationText || '10s' : undefined,
    ratio: item.ratio,
    aspectRatio: item.aspectRatio,
    usageCount: item.usageCount,
    favoriteCount: item.favoriteCount,
    isFavorited: true,
    canUse: item.canUse !== false,
    canSave: item.canSave !== false && item.canUse !== false,
    lockReason: item.lockReason || ''
  };
}

function templateToFavoriteItem(item: Record<string, unknown>, index: number): FavoriteItem {
  const templateType = String(item.templateType || item.template_type || item.mediaType || item.type || 'image');
  const title = String(item.title || item.prompt || '收藏模板');
  const category = String(item.categoryName || item.category || item.scene || defaultCategory(templateType, title));
  const tags = templateTagsOf(item);
  const kind = inferMediaKind(item, templateType, tags);
  const prompt = String(item.prompt || item.description || title || '');
  const params = templateParamsOf(item);
  const ratio = normalizeRatio(
    String(item.ratio || item.aspectRatio || item.aspect_ratio || ''),
    numericValue(item.width || item.coverWidth || item.cover_width),
    numericValue(item.height || item.coverHeight || item.cover_height),
    prompt,
    params
  );
  const aspectRatio = aspectRatioValue(ratio);
  const favoriteCount = Math.max(0, Math.floor(Number(item.favoriteCount || item.favorite_count || 0) || 0));
  const fallbackTag = kind === 'video' ? '视频' : category;
  return {
    id: String(item.id || `favorite_${index}`),
    title,
    category,
    tag: (tags[0] || fallbackTag).slice(0, 8),
    tags: tags.length ? tags : [fallbackTag],
    kind,
    ratio,
    aspectRatio,
    coverHeightRpx: coverHeightOf(aspectRatio),
    aspectClass: aspectClassOf(ratio),
    usageCount: Math.max(0, Math.floor(Number(item.usageCount || item.usage_count || 0) || 0)),
    favoriteCount,
    favoriteText: formatCount(favoriteCount),
    durationText: durationTextOf(item),
    cover: normalizeBackendMediaUrl(item.coverUrl || item.cover_url || item.thumbnail),
    mediaUrl: normalizeBackendMediaUrl(item.previewUrl || item.preview_url || item.mediaUrl || item.media_url),
    prompt,
    canUse: item.canUse !== false,
    canSave: item.canSave !== false && item.canUse !== false,
    lockReason: String(item.lockReason || '')
  };
}

function mergeItems(source: FavoriteItem[], additions: FavoriteItem[]) {
  const seen = new Set(source.map((item) => item.id));
  return [...source, ...additions.filter((item) => !seen.has(item.id))];
}

function numericTemplateId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeRatio(value: string, width: number, height: number, prompt: string, params?: Record<string, unknown> | null) {
  const text = String(value || '').trim();
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text)) return text;
  if (width > 0 && height > 0) return `${width}:${height}`;
  const paramsRatio = String(params?.aspect_ratio || params?.aspectRatio || params?.ratio || '').trim();
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
  return Math.round(Math.min(COVER_MAX_HEIGHT_RPX, Math.max(COVER_MIN_HEIGHT_RPX, WATERFALL_CARD_WIDTH_RPX / ratio)));
}

function aspectClassOf(ratio: string): AspectClass {
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

function templateTagsOf(item: Record<string, unknown>) {
  const raw = item.tags || item.tagList || item.tag_list;
  if (Array.isArray(raw)) return raw.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8);
  if (typeof raw === 'string') {
    const parsed = parseMaybeJson(raw);
    if (Array.isArray(parsed)) return parsed.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8);
    return raw.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  }
  return [];
}

function inferMediaKind(item: Record<string, unknown>, templateType: string, tags: string[]): FavoriteItem['kind'] {
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
    ...tags
  ].map((value) => String(value || '')).join(' ');
  return /video|mp4|mov|视频|短片|短剧/i.test(text) ? 'video' : 'image';
}

function defaultCategory(templateType: string, title: string) {
  if (/video|视频|短片|短剧/i.test(`${templateType} ${title}`)) return 'AI视频';
  if (/comic|漫画|漫剧/i.test(`${templateType} ${title}`)) return 'AI漫剧';
  return 'AI绘画';
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.map((tag) => tag.trim()).filter((tag) => {
    if (!tag || seen.has(tag)) return false;
    seen.add(tag);
    return true;
  }).slice(0, 6);
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value || 0);
}

function hasFavoriteCount(value: number) {
  return Math.max(0, Math.floor(Number(value || 0) || 0)) > 0;
}
</script>

<style scoped lang="scss">
.favorites-page {
  min-height: 100vh;
  padding: 0 24rpx 44rpx;
  background: linear-gradient(180deg, #fbf9ff 0%, #f5f7ff 45%, #f7f8fb 100%);
  color: #1f2437;
}

.favorites-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 2rpx 24rpx;
}

.favorites-title {
  color: #20243a;
  font-size: 40rpx;
  font-weight: 900;
  line-height: 1.2;
}

.favorites-subtitle {
  margin-top: 8rpx;
  color: #878fa5;
  font-size: 22rpx;
  font-weight: 700;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 118rpx;
  height: 58rpx;
  border-radius: 29rpx;
  background: #ffffff;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
  box-shadow: 0 12rpx 28rpx rgba(116, 94, 197, 0.12);
}

.favorites-waterfall {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18rpx;
  align-items: flex-start;
}

.waterfall-column {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  min-width: 0;
}

.favorite-card {
  display: block;
  width: 100%;
  padding: 0 0 18rpx;
  overflow: hidden;
  border-radius: 16rpx;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 14rpx 36rpx rgba(87, 93, 125, 0.12);
}

.favorite-art {
  position: relative;
  width: 100%;
  height: 318rpx;
  overflow: hidden;
  background: #f2f0fb;
}

.favorite-card.aspect-short .favorite-art {
  height: 226rpx;
}

.favorite-card.aspect-tall .favorite-art {
  height: 420rpx;
}

.favorite-card.aspect-poster .favorite-art {
  height: 486rpx;
}

.favorite-cover {
  width: 100%;
  height: 100%;
  background: #f2f0fb;
}

.favorite-cover.fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #8f77ff, #44c5e8);
  color: rgba(255, 255, 255, 0.9);
  font-size: 46rpx;
  font-weight: 900;
}

.favorite-badge {
  position: absolute;
  right: 10rpx;
  bottom: 10rpx;
  max-width: 142rpx;
  height: 40rpx;
  padding: 0 14rpx;
  overflow: hidden;
  border-radius: 20rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 40rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-mark {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 40rpx;
  padding: 0 14rpx;
  border-radius: 20rpx;
  background: rgba(18, 23, 37, 0.68);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
}

.play-triangle {
  width: 0;
  height: 0;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 12rpx solid #ffffff;
}

.favorite-title {
  height: 36rpx;
  margin: 16rpx 16rpx 0;
  overflow: hidden;
  color: #22263b;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 36rpx;
  text-overflow: ellipsis;
  text-shadow: none;
  white-space: nowrap;
}

.favorite-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  margin: 16rpx 14rpx 0;
  color: #8f94aa;
  font-size: 20rpx;
  font-weight: 800;
}

.favorite-author {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.favorite-author text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.official-avatar {
  flex: 0 0 auto;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
}

.unfavorite-btn {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 34rpx;
  min-width: 32rpx;
  padding: 0;
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 900;
}

.unfavorite-btn image {
  width: 24rpx;
  height: 24rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 150rpx 46rpx 0;
  text-align: center;
}

.empty-icon {
  color: #b39aff;
  font-size: 78rpx;
  line-height: 1;
}

.empty-title {
  margin-top: 22rpx;
  color: #24283e;
  font-size: 34rpx;
  font-weight: 900;
}

.empty-subtitle {
  margin-top: 14rpx;
  color: #8b91aa;
  font-size: 24rpx;
  line-height: 1.6;
}

.empty-action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72rpx;
  min-width: 196rpx;
  margin-top: 34rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #8b6cff, #ff79bd);
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 900;
  box-shadow: 0 18rpx 34rpx rgba(139, 108, 255, 0.22);
}

.loading-state,
.end-state {
  padding: 32rpx 0 20rpx;
  color: #9ba1b5;
  font-size: 22rpx;
  font-weight: 800;
  text-align: center;
}
</style>
