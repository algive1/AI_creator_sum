<template>
  <view class="page records-page">
    <AppTopbar class="app-nav-root" title="记录" back transparent />

    <view class="page-head">
      <view class="page-title">记录</view>
    </view>

    <LegacyTopTabs :model-value="activeFilter" :items="filters" @select="activeFilter = $event" />

    <view class="search-box">
      <input class="search-input" v-model="query" placeholder="搜索作品名称或关键词" placeholder-class="search-placeholder" />
    </view>

    <view class="stats-grid">
      <view class="stat-card"><view class="stat-value">{{ stats.total }}</view><view class="muted">生成总数</view></view>
      <view class="stat-card"><view class="stat-value">{{ stats.image }}</view><view class="muted">图片生成</view></view>
      <view class="stat-card"><view class="stat-value">{{ stats.video }}</view><view class="muted">视频方案</view></view>
      <view class="stat-card"><view class="stat-value">{{ stats.saved }}</view><view class="muted">节省时间</view></view>
    </view>

    <view v-if="records.length" class="record-list">
      <button v-for="item in records" :key="String(item.id)" class="history-card" @tap="openRecord(item)">
        <view class="history-thumb" :class="[`history-thumb-${ratioClass(item.ratio)}`, taskTypeOf(item)]">
          <image v-if="taskThumbnailOf(item)" class="history-thumb-img" :src="taskThumbnailOf(item)" mode="aspectFill" />
          <text v-else>{{ taskTypeOf(item) === 'video' ? '视频' : '图片' }}</text>
        </view>
        <view class="history-content">
          <view class="history-main">
            <view class="history-title">{{ taskTitleOf(item) }}</view>
            <view class="history-meta">{{ taskCreatedAtOf(item) }} · {{ item.ratio || item.duration || '自动' }} · {{ item.style || '默认' }}</view>
          </view>
          <view class="tag" :class="statusView(item).kind">{{ statusText(item) }}</view>
        </view>
        <view class="history-extra">
          <view v-if="isTaskFailed(item) && taskFailReasonOf(item)" class="history-reason">{{ taskFailReasonOf(item) }}</view>
          <view v-if="isTaskProcessing(item)" class="progress-track">
            <view class="progress-fill" :style="{ width: `${item.progress || 36}%` }"></view>
          </view>
        </view>
      </button>
    </view>
    <view v-else class="empty-state">
      <view class="empty-title">暂无记录</view>
      <view class="muted">开始一次创作后，这里会沉淀你的作品。</view>
      <button class="primary-btn" @tap="goCreate">开始创作</button>
    </view>
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import LegacyTopTabs from '@/components/legacy/LegacyTopTabs.vue';
import { useTaskStore } from '@/stores/task';
import { PAGE_ROUTES } from '@/utils/constants';
import { isTaskCompleted, isTaskFailed, isTaskProcessing, taskCreatedAtOf, taskFailReasonOf, taskIdOf, taskStatusViewOf, taskThumbnailOf, taskTitleOf, taskTypeOf } from '@/utils/task-display';

const taskStore = useTaskStore();
const filters = ['全部', '图片', '视频', '处理中', '已完成'];
const activeFilter = ref('全部');
const query = ref('');
const stats = reactive({ total: 0, image: 0, video: 0, saved: '12.5h' });

const source = computed<Record<string, unknown>[]>(() => taskStore.list as Record<string, unknown>[]);
const records = computed(() => {
  const keyword = query.value.trim();
  return source.value.filter((item) => {
    if (activeFilter.value === '图片') return taskTypeOf(item) === 'image';
    if (activeFilter.value === '视频') return taskTypeOf(item) === 'video';
    if (activeFilter.value === '处理中') return isTaskProcessing(item);
    if (activeFilter.value === '已完成') return isTaskCompleted(item);
    return true;
  }).filter((item) => !keyword || `${taskTitleOf(item)}${item.prompt || ''}`.includes(keyword));
});

onShow(() => {
  taskStore.loadTasks().catch(() => undefined).finally(() => {
    stats.total = source.value.length;
    stats.image = source.value.filter((item) => taskTypeOf(item) === 'image').length;
    stats.video = source.value.filter((item) => taskTypeOf(item) === 'video').length;
  });
});

function ratioClass(ratio: unknown) {
  const map: Record<string, string> = { '1:1': 'square', '16:9': 'landscape', '9:16': 'story', '4:5': 'portrait' };
  return map[String(ratio || '')] || 'landscape';
}

function statusText(item: Record<string, unknown>) {
  return statusView(item).label;
}

function statusView(item: Record<string, unknown>) {
  return taskStatusViewOf(item);
}

function openRecord(item: Record<string, unknown>) {
  const id = taskIdOf(item);
  uni.navigateTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=${taskTypeOf(item)}` });
}

function goCreate() {
  uni.reLaunch({ url: PAGE_ROUTES.inspiration });
}
</script>

<style scoped lang="scss">
.records-page {
  min-height: 100vh;
  padding: 0 28rpx calc(160rpx + env(safe-area-inset-bottom));
  background: linear-gradient(135deg, #fff7fb 0%, #eef8ff 46%, #f5fff4 100%);
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  width: 100%;
  margin-bottom: 26rpx;
}

.page-title {
  min-width: 0;
  overflow: hidden;
  color: #172033;
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-box {
  margin-bottom: 22rpx;
  padding: 14rpx 18rpx;
  border: 1rpx solid rgba(134, 216, 255, 0.22);
  border-radius: 34rpx;
  background: rgba(255, 255, 255, 0.9);
}

.search-input {
  height: 60rpx;
  color: #172033;
  font-size: 28rpx;
}

.search-placeholder {
  color: rgba(100, 116, 139, 0.64);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.stat-card {
  padding: 24rpx;
  border: 1rpx solid rgba(83, 245, 203, 0.18);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.92);
}

.stat-value {
  margin-bottom: 8rpx;
  color: #7a5cff;
  font-size: 38rpx;
  font-weight: 800;
}

.muted {
  color: #64748b;
  font-size: 24rpx;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.history-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14rpx;
  padding: 18rpx;
  border: 1rpx solid rgba(134, 216, 255, 0.18);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.92);
  text-align: left;
}

.history-thumb {
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 260rpx;
  border-radius: 14rpx;
  background: rgba(122, 92, 255, 0.16);
  color: #7a5cff;
  font-weight: 700;
}

.history-thumb-square { height: 360rpx; }
.history-thumb-landscape { height: 270rpx; }
.history-thumb-story { height: 430rpx; }
.history-thumb-portrait { height: 390rpx; }

.history-thumb-img {
  width: 100%;
  height: 100%;
}

.history-thumb.video {
  background: rgba(72, 151, 255, 0.16);
  color: #4897ff;
}

.history-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.history-main,
.history-extra {
  min-width: 0;
  flex: 1;
}

.history-title {
  overflow: hidden;
  margin-bottom: 8rpx;
  color: #172033;
  font-size: 28rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  overflow: hidden;
  color: #64748b;
  font-size: 23rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex-shrink: 0;
  height: 42rpx;
  padding: 0 16rpx;
  border-radius: 21rpx;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 42rpx;
}

.tag.success {
  background: #dcfce7;
  color: #16a34a;
}

.tag.queued,
.tag.generating,
.tag.processing,
.tag.warn {
  background: #fff7ed;
  color: #f97316;
}

.tag.completed {
  background: #dcfce7;
  color: #16a34a;
}

.tag.failed {
  background: #ffe4e6;
  color: #e11d48;
}

.tag.cancelled {
  background: #e2e8f0;
  color: #64748b;
}

.history-reason {
  overflow: hidden;
  margin-top: 8rpx;
  color: #ffc857;
  font-size: 23rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  overflow: hidden;
  height: 10rpx;
  margin-top: 16rpx;
  border-radius: 5rpx;
  background: rgba(134, 216, 255, 0.14);
}

.progress-fill {
  height: 100%;
  border-radius: 5rpx;
  background: linear-gradient(90deg, #7a5cff, #ff7acb);
}

.empty-state {
  padding: 60rpx 30rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
}

.empty-title {
  margin-bottom: 12rpx;
  color: #172033;
  font-size: 34rpx;
  font-weight: 800;
}

.empty-state .primary-btn {
  margin-top: 28rpx;
}
</style>
