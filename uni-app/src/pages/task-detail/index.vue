<template>
  <view class="flow-page detail-page">
    <view class="content">
      <view v-if="task" class="detail-card">
        <image v-if="thumbnail" class="detail-image" :src="thumbnail" mode="aspectFill" />
        <view v-else class="detail-image empty">AI</view>
        <view class="detail-title">{{ taskTitleOf(task) }}</view>
        <view class="detail-status">{{ statusText }}</view>
        <view class="progress"><view :style="{ width: `${progress}%` }"></view></view>
        <view class="prompt-box">{{ taskPromptOf(task) || '等待任务详情返回' }}</view>
        <button class="primary-btn" @tap="refresh">刷新状态</button>
      </view>
      <EmptyState v-else title="未找到任务" action-text="返回记录" @action="goHistory" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/EmptyState.vue';
import { useTaskStore } from '@/stores/task';
import { PAGE_ROUTES } from '@/utils/constants';
import { taskProgressOf, taskPromptOf, taskStatusViewOf, taskThumbnailOf, taskTitleOf } from '@/utils/task-display';

const taskStore = useTaskStore();
const task = ref<Record<string, unknown> | null>(null);
const taskId = ref(0);
const thumbnail = computed(() => task.value ? taskThumbnailOf(task.value) : '');
const progress = computed(() => task.value ? taskProgressOf(task.value) : 8);
const statusText = computed(() => task.value ? taskStatusViewOf(task.value).label : '待处理');

onLoad((query) => {
  taskId.value = Number(query?.id || 0);
  refresh();
  if (taskId.value) taskStore.startPolling(taskId.value);
});

onUnload(() => taskStore.stopPolling());

function refresh() {
  if (!taskId.value) return;
  taskStore.loadTask(taskId.value).then((res) => {
    task.value = res;
  }).catch(() => {
    task.value = null;
  });
}

function goHistory() {
  uni.reLaunch({ url: PAGE_ROUTES.history });
}
</script>

<style scoped lang="scss">
.detail-page {
  padding-top: 24rpx;
}

.detail-card {
  padding: 24rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16rpx 42rpx rgba(35, 45, 72, 0.1);
}

.detail-image {
  width: 100%;
  height: 460rpx;
  border-radius: 16rpx;
}

.detail-image.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #172033, #7258ff);
  color: #fff;
  font-size: 52rpx;
  font-weight: 900;
}

.detail-title {
  margin-top: 24rpx;
  color: #172033;
  font-size: 34rpx;
  font-weight: 900;
}

.detail-status {
  margin-top: 8rpx;
  color: #6d7688;
  font-size: 25rpx;
  font-weight: 800;
}

.progress {
  overflow: hidden;
  height: 12rpx;
  margin: 22rpx 0;
  border-radius: 10rpx;
  background: #e9edf5;
}

.progress view {
  height: 100%;
  border-radius: 10rpx;
  background: linear-gradient(90deg, #23b7d9, #7258ff);
}

.prompt-box {
  margin-bottom: 24rpx;
  padding: 22rpx;
  border-radius: 14rpx;
  background: #f7faff;
  color: #172033;
  font-size: 25rpx;
  line-height: 1.55;
}
</style>
