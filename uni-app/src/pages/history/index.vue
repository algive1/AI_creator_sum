<template>
  <view class="page works-page">
    <AppTopbar class="app-nav-root" title="作品库" back />

    <view v-if="showSyncState" class="library-toolbar">
      <view class="sync-state" :class="{ warning: syncFailed }">
        <image class="sync-icon" :src="historyIcon" mode="aspectFit" />
        <view class="sync-copy">
          <view class="sync-title">{{ syncTitle }}</view>
          <view class="sync-desc">{{ syncDesc }}</view>
        </view>
      </view>
    </view>

    <view class="search-row">
      <view class="search-box">
        <view class="search-glyph"></view>
        <input class="search-input" v-model="query" placeholder="搜索作品名称、标签、描述" placeholder-class="search-placeholder" />
      </view>
      <button class="filter-icon" @tap="activeFilter = '全部'">
        <image :src="filterIcon" mode="aspectFit" />
      </button>
    </view>

    <view class="library-banner">
      <view class="banner-copy">
        <view class="banner-title">我的创作资产库</view>
        <view class="banner-desc">生成结果会自动收进这里。按作品类型归档，方便查找、复用和继续创作。</view>
      </view>
      <view class="banner-visual">
        <image class="banner-art" :src="bannerVisual" mode="aspectFit" />
      </view>
    </view>

    <view class="library-risk">
      <image class="risk-icon" src="/static/icons/icon_security_shield.svg" mode="aspectFit" />
      <text>云端同步可能有短暂延迟，生成失败不代表素材丢失，可进入详情重试。</text>
    </view>

    <view class="stats-grid">
      <view class="stat-card">
        <view class="stat-value">{{ overview.stats.total }}</view>
        <view class="stat-label">全部作品</view>
      </view>
      <view class="stat-card">
        <view class="stat-value">{{ overview.stats.month }}</view>
        <view class="stat-label">本月新增</view>
      </view>
      <view class="stat-card">
        <view class="stat-value">{{ overview.stats.active }}</view>
        <view class="stat-label">生成中</view>
      </view>
    </view>

    <view class="asset-panel">
      <view
        v-for="item in overview.categories"
        :key="item.key"
        class="asset-entry"
        :class="{ active: activeFilter === item.key }"
        @tap="activeFilter = item.key"
      >
        <view class="asset-icon" :class="assetToneClass(item.key)">
          <image :src="assetIconOf(item.key)" mode="aspectFit" />
        </view>
        <view class="asset-name">{{ item.label }}</view>
        <view class="asset-count">{{ item.count }}</view>
      </view>
    </view>

    <view v-if="overview.recent.length" class="recent-section">
      <view class="section-head">
        <view class="section-title">最近使用</view>
        <button class="section-link" @tap="activeFilter = '全部'">查看全部</button>
      </view>
      <scroll-view scroll-x class="recent-scroll" show-scrollbar="false">
        <view class="recent-row">
          <button v-for="item in overview.recent" :key="`recent-${item.id}`" class="recent-item" @tap="openRecord(item)">
            <view class="recent-thumb">
              <image v-if="item.thumbnail" :src="item.thumbnail" mode="aspectFill" lazy-load />
              <view v-else class="thumb-fallback">{{ item.categoryLabel }}</view>
              <view class="recent-type-badge">{{ item.typeLabel }}</view>
              <view v-if="item.type === 'video'" class="play-dot">播</view>
            </view>
            <view class="recent-title">{{ item.title }}</view>
          </button>
        </view>
      </scroll-view>
    </view>

    <scroll-view scroll-x class="filter-scroll" show-scrollbar="false">
      <view class="filter-row">
        <button
          v-for="item in filters"
          :key="item"
          class="filter-pill"
          :class="{ active: activeFilter === item }"
          @tap="activeFilter = item"
        >
          {{ item }}
        </button>
      </view>
    </scroll-view>

    <view class="sort-row">
      <view class="sort-summary">
        <text>最新</text>
        <text>{{ resultSummary }}</text>
      </view>
      <image class="grid-mark" :src="gridIcon" mode="aspectFit" />
    </view>

    <view v-if="records.length" class="asset-grid">
      <view
        v-for="item in records"
        :key="String(item.id)"
        class="work-tile"
        :class="{ active: item.isActive, failed: item.isFailed }"
        @tap="openRecord(item)"
      >
        <view class="tile-preview" :class="[`tile-${item.ratioClass}`, item.type]">
          <image v-if="item.thumbnail" class="tile-image" :src="item.thumbnail" mode="aspectFill" lazy-load />
          <view v-else class="tile-fallback">
            <text>{{ item.categoryLabel }}</text>
          </view>
          <view class="tile-status" :class="item.statusKind">{{ item.statusLabel }}</view>
          <view class="tile-type-badge">{{ item.typeLabel }}</view>
          <view v-if="item.type === 'video'" class="tile-play">▶</view>
          <view v-if="item.isActive" class="tile-progress">
            <view class="tile-progress-fill" :style="{ width: `${item.progress}%` }"></view>
          </view>
        </view>
        <view class="tile-body">
          <view class="tile-title">{{ item.title }}</view>
          <view class="tile-meta">
            <text>{{ item.outputCount || 1 }} 个结果</text>
          </view>
          <view class="tile-foot">
            <text>{{ item.isActive ? '任务处理中' : item.isFailed ? '查看详情处理' : '点击查看作品' }}</text>
            <button v-if="item.isActive" class="tile-continue" @tap.stop="keepTaskInBackground(item)">后台继续</button>
            <button class="tile-more" @tap.stop="showItemMenu(item)">•••</button>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="empty-state">
      <image class="empty-illus" :src="emptyIcon" mode="aspectFit" />
      <view class="empty-copy">
        <view class="empty-title">{{ emptyTitle }}</view>
        <view class="empty-desc">{{ emptyDesc }}</view>
        <view v-if="emptyNote" class="empty-note">{{ emptyNote }}</view>
      </view>
      <button class="primary-btn" @tap="handleEmptyAction">{{ emptyActionText }}</button>
    </view>

    <AppDialogHost />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useTaskStore } from '@/stores/task';
import { PAGE_ROUTES } from '@/utils/constants';
import { taskPoller } from '@/utils/task-poller';
import {
  buildWorkLibraryItems,
  buildWorkLibraryOverview,
  WORK_LIBRARY_FILTERS,
  type WorkLibraryFilter,
  type WorkLibraryItem,
} from '@/utils/work-library';
import { createShareMessage, enableShareMenu } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';

const taskStore = useTaskStore();
const authStore = useAuthStore();
const configStore = useConfigStore();
const filters = WORK_LIBRARY_FILTERS;
const historyIcon = '/static/tabbar/history.png';
const emptyIcon = '/static/tabbar/history.png';
const filterIcon = '/static/icons/icon_filter.svg';
const bannerVisual = '/static/visuals/dialog/benefit-template.png';
const gridIcon = '/static/icons/menu_task.svg';
const assetIconMap: Record<string, string> = {
  图片: '/static/icons/icon_image_ai.svg',
  视频: '/static/icons/icon_video_ai.svg',
  漫剧: '/static/icons/icon_comic_ai.svg',
  角色: '/static/icons/default_avatar_girl.svg',
  场景: '/static/icons/icon_requirement_scene_line.svg',
  道具: '/static/icons/icon_requirement_point_line.svg',
  声音: '/static/icons/icon_message.svg',
  剧本: '/static/icons/menu_task.svg',
};
const activeFilter = ref<WorkLibraryFilter>('全部');
const query = ref('');
const loading = ref(false);
const syncFailed = ref(false);
const pollingIds = new Set<number>();
const source = computed<Record<string, unknown>[]>(() => taskStore.list as Record<string, unknown>[]);
const overview = computed(() => buildWorkLibraryOverview(source.value));
const records = computed(() => buildWorkLibraryItems(source.value, activeFilter.value, query.value));
const showSyncState = computed(() => loading.value || syncFailed.value);
const syncTitle = computed(() => {
  if (loading.value) return '正在同步云端作品';
  if (syncFailed.value) return '作品暂未同步';
  return '';
});
const syncDesc = computed(() => {
  if (loading.value) return '正在读取最新生成记录';
  if (syncFailed.value) return '请检查登录状态或稍后再试';
  return '';
});
const resultSummary = computed(() => {
  if (loading.value) return '同步中';
  if (syncFailed.value) return '未同步';
  return `${records.value.length} 个内容`;
});
const emptyTitle = computed(() => {
  if (loading.value) return '正在同步作品';
  if (!authStore.isLoggedIn) return '登录后查看全部作品';
  if (syncFailed.value) return '全部作品暂未展示';
  if (query.value) return '没有匹配的作品';
  if (activeFilter.value === '全部') return '暂无作品内容';
  return `${activeFilter.value}分类暂无内容`;
});
const emptyDesc = computed(() => {
  if (loading.value) return '正在从云端读取作品列表，请稍候。';
  if (!authStore.isLoggedIn) return '作品库内容来自云端账号，未登录时不会拉取作品列表。';
  if (syncFailed.value) return '当前没有成功拉取云端作品，常见原因是登录状态过期或网络暂时不可用。';
  if (query.value) return '换个关键词试试，或清空搜索查看全部作品。';
  if (activeFilter.value === '全部') return '完成一次生成后，图片、视频、漫剧和创作资产会自动出现在这里。';
  return '这个分类当前还没有内容。完成对应类型的创作后，会自动展示在这里。';
});
const emptyNote = computed(() => {
  if (syncFailed.value) return '说明：当前空列表不代表作品被删除，只是本次同步失败。';
  if (activeFilter.value === '全部' && !loading.value && authStore.isLoggedIn && !syncFailed.value) return '说明：全部作品为空时，表示当前账号暂未拉取到生成记录。';
  return '';
});
const emptyActionText = computed(() => {
  if (!authStore.isLoggedIn) return '去登录';
  if (syncFailed.value || loading.value) return '重新同步';
  return '去创作';
});

onLoad((queryParams) => {
  const nextFilter = decodeFilter(queryParams?.filter);
  if (nextFilter) activeFilter.value = nextFilter;
});

onShow(async () => {
  enableShareMenu(false);
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  await authStore.hydrate();
  if (!authStore.isLoggedIn) {
    syncFailed.value = false;
    taskStore.list = [];
    stopPollingWorks();
    return;
  }
  loadWorks();
});

onHide(() => stopPollingWorks());
onUnload(() => stopPollingWorks());

onShareAppMessage(() => createShareMessage({
  title: '来看看我的 AI 作品库',
  path: PAGE_ROUTES.inspiration,
}));

function loadWorks() {
  loading.value = true;
  syncFailed.value = false;
  taskStore.loadTasks().catch(() => {
    syncFailed.value = true;
  }).finally(() => {
    loading.value = false;
    syncPollingWorks();
  });
}

function syncPollingWorks() {
  const activeIds = buildWorkLibraryItems(source.value, '生成中')
    .filter((item) => item.id > 0)
    .map((item) => item.id);
  pollingIds.forEach((id) => {
    if (!activeIds.includes(id)) {
      taskPoller.removeListener(id, handlePolledTask);
      pollingIds.delete(id);
    }
  });
  activeIds.forEach((id) => {
    if (pollingIds.has(id)) return;
    pollingIds.add(id);
    taskPoller.add(id, handlePolledTask);
  });
  if (activeIds.length) taskPoller.pollNow().catch(() => undefined);
}

function stopPollingWorks() {
  pollingIds.forEach((id) => taskPoller.removeListener(id, handlePolledTask));
  pollingIds.clear();
}

function handlePolledTask(task: Record<string, unknown>) {
  const id = Number(task.id || task.taskId || 0);
  const index = taskStore.list.findIndex((item) => Number(item.id || item.taskId || 0) === id);
  if (index >= 0) {
    taskStore.list.splice(index, 1, task);
  } else {
    taskStore.list.unshift(task);
  }
  syncPollingWorks();
}

function openRecord(item: WorkLibraryItem) {
  if (!item.id) return;
  cacheResultSnapshot(item);
  uni.navigateTo({ url: `${PAGE_ROUTES.result}?id=${item.id}&type=${item.type}` });
}

function showItemMenu(item: WorkLibraryItem) {
  const options = item.isFailed ? ['查看详情', '重新生成', '复制提示词'] : ['查看详情', '再次生成', '复制提示词'];
  uni.showActionSheet({
    itemList: options,
    success: ({ tapIndex }) => {
      if (tapIndex === 0) openRecord(item);
      if (tapIndex === 1) regenerate(item);
      if (tapIndex === 2) copyPrompt(item);
    },
  });
}

function regenerate(item: WorkLibraryItem) {
  const sourceId = item.id ? `?sourceId=${encodeURIComponent(String(item.id))}` : '';
  const target = item.type === 'video' ? PAGE_ROUTES.aiVideo : item.type === 'comic' ? PAGE_ROUTES.comic : PAGE_ROUTES.aiImage;
  uni.navigateTo({ url: `${target}${sourceId}` });
}

function copyPrompt(item: WorkLibraryItem) {
  if (!item.prompt) {
    uni.showToast({ title: '暂无提示词可复制', icon: 'none' });
    return;
  }
  uni.setClipboardData({ data: item.prompt });
}

function keepTaskInBackground(item: WorkLibraryItem) {
  uni.showToast({ title: item.statusHint || '任务已在后台继续', icon: 'none' });
}

function cacheResultSnapshot(item: WorkLibraryItem) {
  try {
    uni.setStorageSync(`ai_result_route_snapshot:${item.id}`, item.raw);
  } catch {
    // 本地缓存失败不影响进入详情页。
  }
}

function decodeFilter(value: unknown): WorkLibraryFilter | '' {
  const text = decodeURIComponent(String(value || '')) as WorkLibraryFilter;
  return filters.includes(text) ? text : '';
}

function assetIconOf(key: string) {
  return assetIconMap[key] || '/static/icons/icon_requirement_point_line.svg';
}

function assetToneClass(key: string) {
  const map: Record<string, string> = {
    图片: 'asset-tone-image',
    视频: 'asset-tone-video',
    漫剧: 'asset-tone-comic',
    角色: 'asset-tone-role',
    场景: 'asset-tone-scene',
    道具: 'asset-tone-prop',
    声音: 'asset-tone-audio',
    剧本: 'asset-tone-script',
  };
  return map[key] || 'asset-tone-image';
}

async function handleEmptyAction() {
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后查看作品库',
      subtitle: '登录并授权手机号后，可同步你的云端作品。'
    });
    if (!loggedIn) return;
    loadWorks();
    return;
  }
  if (syncFailed.value || loading.value) {
    loadWorks();
    return;
  }
  goCreate();
}

function goCreate() {
  uni.reLaunch({ url: PAGE_ROUTES.inspiration });
}
</script>

<style scoped lang="scss">
.works-page {
  min-height: 100vh;
  padding: 0 24rpx calc(230rpx + env(safe-area-inset-bottom));
  background:
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 52%, #f6fbff 100%);
}

.works-page :deep(.topbar) {
  background: #fff;
  backdrop-filter: none;
  box-shadow: 0 1rpx 0 rgba(116, 128, 154, 0.08);
}

.library-toolbar {
  display: flex;
  align-items: center;
  padding: 6rpx 0 18rpx;
}

.sync-state {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 14rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid rgba(116, 128, 154, 0.1);
  border-radius: 18rpx;
  background: #fff;
}

.sync-state.warning {
  border-color: rgba(245, 158, 11, 0.22);
  background: #fffaf0;
}

.sync-icon {
  flex: 0 0 auto;
  width: 42rpx;
  height: 42rpx;
}

.sync-copy {
  min-width: 0;
}

.sync-title {
  color: #161b31;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.25;
}

.sync-desc {
  margin-top: 4rpx;
  overflow: hidden;
  color: #6c7890;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 18rpx;
}

.search-box {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 68rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(116, 128, 154, 0.12);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.9);
}

.search-glyph {
  position: relative;
  flex: 0 0 auto;
  width: 28rpx;
  height: 28rpx;
  margin-right: 12rpx;
}

.search-glyph::before {
  position: absolute;
  left: 2rpx;
  top: 2rpx;
  width: 16rpx;
  height: 16rpx;
  border: 3rpx solid #9aa4b6;
  border-radius: 50%;
  content: "";
}

.search-glyph::after {
  position: absolute;
  right: 2rpx;
  bottom: 3rpx;
  width: 12rpx;
  height: 3rpx;
  border-radius: 999rpx;
  background: #9aa4b6;
  content: "";
  transform: rotate(45deg);
  transform-origin: center;
}

.search-input {
  flex: 1;
  min-width: 0;
  color: #172033;
  font-size: 25rpx;
  font-weight: 700;
}

.search-placeholder {
  color: #a7b0c3;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  background: #fff;
}

.filter-icon image {
  width: 34rpx;
  height: 34rpx;
}

.library-banner {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 168rpx;
  margin-bottom: 16rpx;
  padding: 26rpx;
  overflow: hidden;
  border-radius: 22rpx;
  background:
    linear-gradient(135deg, #7a5cff 0%, #b668ff 48%, #ff78b6 100%);
}

.banner-copy {
  position: relative;
  z-index: 2;
  width: 66%;
}

.banner-title {
  color: #fff;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.2;
}

.banner-desc {
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.86);
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.42;
}

.banner-visual {
  position: absolute;
  right: 4rpx;
  bottom: -10rpx;
  width: 220rpx;
  height: 180rpx;
  opacity: 0.94;
}

.banner-art {
  width: 100%;
  height: 100%;
}

.library-risk {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid #e5ddff;
  border-radius: 16rpx;
  background: #fbfaff;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
}

.risk-icon {
  flex: 0 0 auto;
  width: 30rpx;
  height: 30rpx;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.stat-card {
  padding: 20rpx 12rpx;
  border: 1rpx solid rgba(116, 128, 154, 0.1);
  border-radius: 18rpx;
  background: #fff;
  text-align: center;
}

.stat-value {
  color: #172033;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1;
}

.stat-label {
  margin-top: 10rpx;
  color: #7c879e;
  font-size: 22rpx;
  font-weight: 800;
}

.asset-panel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14rpx 10rpx;
  margin-bottom: 22rpx;
  padding: 22rpx 12rpx;
  border: 1rpx solid #edf1f7;
  border-radius: 20rpx;
  background: #fff;
}

.asset-entry {
  min-width: 0;
  padding: 8rpx 4rpx;
  border-radius: 18rpx;
  text-align: center;
}

.asset-entry.active {
  background: #f7f4ff;
}

.asset-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  margin: 0 auto 10rpx;
  border: 1rpx solid #e2dcff;
  border-radius: 16rpx;
  background: #f3f0ff;
}

.asset-icon image {
  width: 36rpx;
  height: 36rpx;
}

.asset-tone-video,
.asset-tone-audio {
  border-color: #d8ecff;
  background: #eff8ff;
}

.asset-tone-comic,
.asset-tone-script {
  border-color: #efe2ff;
  background: #fbf5ff;
}

.asset-tone-role {
  border-color: #ffe0ea;
  background: #fff5f8;
}

.asset-tone-scene {
  border-color: #d9f2e6;
  background: #f1fbf6;
}

.asset-tone-prop {
  border-color: #ffe5cf;
  background: #fff8f1;
}

.asset-name {
  color: #283044;
  font-size: 23rpx;
  font-weight: 900;
}

.asset-count {
  margin-top: 4rpx;
  color: #8b95aa;
  font-size: 20rpx;
  font-weight: 800;
}

.recent-section {
  margin-bottom: 22rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.section-title {
  color: #172033;
  font-size: 28rpx;
  font-weight: 900;
}

.section-link {
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 1.2;
  background: transparent;
}

.recent-scroll {
  width: 100%;
}

.recent-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  width: 100%;
}

.recent-item {
  min-width: 0;
  padding: 0;
  text-align: left;
  background: transparent;
}

.recent-thumb {
  position: relative;
  width: 100%;
  height: 108rpx;
  overflow: hidden;
  border-radius: 14rpx;
  background: #edf2ff;
}

.recent-thumb image {
  width: 100%;
  height: 100%;
}

.thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
}

.play-dot {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: rgba(18, 24, 38, 0.72);
  color: #fff;
  font-size: 18rpx;
  font-weight: 900;
}

.recent-type-badge {
  position: absolute;
  right: 8rpx;
  top: 8rpx;
  height: 30rpx;
  padding: 0 10rpx;
  border-radius: 15rpx;
  background: rgba(18, 24, 38, 0.72);
  color: #fff;
  font-size: 17rpx;
  font-weight: 900;
  line-height: 30rpx;
}

.recent-title {
  margin-top: 8rpx;
  color: #20283a;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-scroll {
  width: 100%;
  margin-bottom: 14rpx;
}

.filter-row {
  display: inline-flex;
  gap: 12rpx;
  padding-right: 16rpx;
}

.filter-pill {
  flex: 0 0 auto;
  height: 54rpx;
  padding: 0 22rpx;
  border-radius: 17rpx;
  background: #fff;
  color: #5f6b82;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 54rpx;
}

.filter-pill.active {
  background: #7a5cff;
  color: #fff;
}

.sort-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.sort-summary {
  display: flex;
  align-items: center;
  gap: 14rpx;
  color: #273149;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 44rpx;
}

.sort-summary text:last-child {
  color: #8a94a8;
  font-size: 21rpx;
  font-weight: 800;
}

.grid-mark {
  margin-left: auto;
  width: 30rpx;
  height: 30rpx;
  opacity: 0.72;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.work-tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 316rpx;
  overflow: hidden;
  border: 1rpx solid #dce8f6;
  border-radius: 18rpx;
  background: #fff;
  box-shadow: 0 8rpx 20rpx rgba(28, 43, 82, 0.05);
}

.tile-preview {
  position: relative;
  flex: 0 0 188rpx;
  height: 188rpx;
  overflow: hidden;
  background: #f8fbff;
}

.tile-image {
  width: 100%;
  height: 100%;
}

.tile-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #7a5cff;
  font-size: 28rpx;
  font-weight: 900;
}

.tile-status {
  position: absolute;
  left: 10rpx;
  top: 10rpx;
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 17rpx;
  background: rgba(255, 255, 255, 0.94);
  color: #7a5cff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 34rpx;
}

.tile-status.completed {
  background: #ecfdf3;
  color: #16a34a;
}

.tile-status.failed {
  background: #fff1f2;
  color: #e11d48;
}

.tile-type-badge {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 17rpx;
  background: rgba(18, 24, 38, 0.72);
  color: #fff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 34rpx;
}

.tile-play {
  position: absolute;
  right: 12rpx;
  bottom: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42rpx;
  height: 42rpx;
  border-radius: 50%;
  background: rgba(19, 25, 39, 0.72);
  color: #fff;
  font-size: 20rpx;
  font-weight: 900;
}

.tile-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8rpx;
  background: rgba(255, 255, 255, 0.5);
}

.tile-progress-fill {
  height: 100%;
  border-radius: 0 8rpx 8rpx 0;
  background: linear-gradient(90deg, #7a5cff, #ff78b6);
}

.tile-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 14rpx 14rpx 13rpx;
}

.tile-title {
  min-height: 34rpx;
  color: #20283a;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8rpx;
  min-width: 0;
  margin-top: 8rpx;
  color: #78849a;
  font-size: 20rpx;
  font-weight: 800;
}

.tile-meta text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-foot {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: auto;
  color: #9aa4b6;
  font-size: 19rpx;
  font-weight: 800;
}

.tile-foot text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-continue {
  flex: 0 0 auto;
  height: 36rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  background: #f2efff;
  color: #6d4cff;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 36rpx;
}

.tile-more {
  flex: 0 0 auto;
  width: 46rpx;
  height: 34rpx;
  border-radius: 17rpx;
  background: transparent;
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 34rpx;
}

.empty-state {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-bottom: 158rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(116, 128, 154, 0.1);
  border-radius: 20rpx;
  background: #fff;
}

.empty-illus {
  flex: 0 0 auto;
  width: 70rpx;
  height: 70rpx;
  padding: 14rpx;
  border-radius: 20rpx;
  background: #f3efff;
}

.empty-copy {
  flex: 1;
  min-width: 0;
}

.empty-title {
  color: #172033;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.25;
}

.empty-desc {
  display: -webkit-box;
  margin-top: 6rpx;
  overflow: hidden;
  color: #7c879e;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.empty-note {
  display: -webkit-box;
  margin-top: 8rpx;
  overflow: hidden;
  color: #9a5c00;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.primary-btn {
  flex: 0 0 auto;
  height: 58rpx;
  padding: 0 24rpx;
  border-radius: 16rpx;
  background: #7a5cff;
  color: #fff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 58rpx;
}
</style>
