<template>
  <button class="task-card" @tap="$emit('select', task)">
    <image v-if="thumbnail" class="task-thumb" :src="thumbnail" mode="aspectFill" />
    <view v-else class="task-thumb empty">{{ typeText }}</view>
    <view class="task-main">
      <view class="task-title">{{ title }}</view>
      <view class="task-meta">{{ createdAt }} · {{ ratio || '自动比例' }}</view>
      <view class="task-progress">
        <view class="task-progress-bar" :style="{ width: `${progress}%` }"></view>
      </view>
    </view>
    <view class="task-status" :class="statusView.kind">{{ statusView.label }}</view>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDateTime } from '@/utils/format';
import { taskProgressOf, taskStatusViewOf } from '@/utils/task-display';

const props = defineProps<{
  task: Record<string, unknown>;
}>();

defineEmits<{ select: [task: Record<string, unknown>] }>();

const thumbnail = computed(() => String(props.task.thumbnail || props.task.coverUrl || ''));
const title = computed(() => String(props.task.title || props.task.prompt || 'AI创作任务'));
const ratio = computed(() => String(props.task.ratio || ''));
const createdAt = computed(() => formatDateTime(String(props.task.createdAt || props.task.created_at || '')));
const progress = computed(() => taskProgressOf(props.task));
const typeText = computed(() => props.task.type === 'video' ? '视频' : '图片');
const statusView = computed(() => taskStatusViewOf(props.task));
</script>

<style scoped lang="scss">
.task-card {
  display: grid;
  grid-template-columns: 136rpx minmax(0, 1fr) 88rpx;
  gap: 18rpx;
  align-items: center;
  width: 100%;
  padding: 18rpx;
  border: 1rpx solid rgba(49, 67, 94, 0.1);
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.9);
  text-align: left;
  box-shadow: 0 12rpx 30rpx rgba(35, 45, 72, 0.07);
}

.task-thumb {
  width: 136rpx;
  height: 136rpx;
  border-radius: 14rpx;
}

.task-thumb.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #172033, #7258ff);
  color: #fff;
  font-size: 24rpx;
  font-weight: 900;
}

.task-title {
  overflow: hidden;
  color: #172033;
  font-size: 28rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  margin-top: 10rpx;
  color: #6d7688;
  font-size: 23rpx;
}

.task-progress {
  overflow: hidden;
  width: 100%;
  height: 10rpx;
  margin-top: 18rpx;
  border-radius: 8rpx;
  background: #e9edf5;
}

.task-progress-bar {
  height: 100%;
  border-radius: 8rpx;
  background: linear-gradient(90deg, #23b7d9, #7258ff);
}

.task-status {
  justify-self: end;
  width: 76rpx;
  padding: 8rpx 0;
  border-radius: 10rpx;
  background: #eef3fb;
  color: #6d7688;
  font-size: 22rpx;
  font-weight: 900;
  text-align: center;
}

.task-status.success,
.task-status.completed {
  background: rgba(43, 182, 115, 0.12);
  color: #198d58;
}

.task-status.queued,
.task-status.generating,
.task-status.processing {
  background: rgba(35, 183, 217, 0.14);
  color: #1289a6;
}

.task-status.failed {
  background: rgba(232, 82, 103, 0.12);
  color: #c43d50;
}

.task-status.cancelled {
  background: rgba(100, 116, 139, 0.14);
  color: #64748b;
}
</style>
