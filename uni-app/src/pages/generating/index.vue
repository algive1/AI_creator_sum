<template>
  <view class="flow-page generating-page">
    <view class="ai-orb">
      <view class="orb-mesh"></view>
      <view class="orb-ring ring-one"></view>
      <view class="orb-ring ring-two"></view>
      <view class="orb-core">AI</view>
    </view>

    <view class="status-pill" :class="statusView.kind">{{ statusView.label }}</view>
    <view class="status-title">{{ statusView.title }}</view>
    <view class="status-desc">{{ statusView.desc }}</view>

    <view class="progress-card">
      <view class="progress-head">
        <text>{{ progress }}%</text>
        <text>{{ currentStep }}</text>
      </view>
      <view class="progress-track-large">
        <view class="progress-fill-large" :style="{ width: `${progress}%` }"></view>
      </view>
      <view class="step-list">
        <view v-for="item in steps" :key="item.name" class="step-item" :class="item.state">
          <view class="step-dot"></view>
          <view>{{ item.name }}</view>
        </view>
      </view>
    </view>

    <view class="card task-info-card">
      <view class="section-title">任务信息</view>
      <view class="info-row">
        <text>任务类型</text>
        <text>{{ taskTypeName }}</text>
      </view>
      <view class="info-row">
        <text>质量标签</text>
        <text>{{ task.quality || '高清' }}</text>
      </view>
      <view class="info-row">
        <text>项目名称</text>
        <text>{{ taskTitleOf(task) }}</text>
      </view>
      <view class="info-row">
        <text>预计剩余</text>
        <text>{{ statusView.label }}</text>
      </view>
    </view>

    <view class="notice-card">生成期间可返回记录页查看任务状态；若失败将展示原因并支持重新生成。</view>

    <view class="bottom-actions">
      <view class="two-actions">
        <button class="secondary-btn" @tap="runInBackground">后台运行</button>
        <button v-if="done || failed || cancelled" class="primary-btn" @tap="viewResult">查看详情</button>
        <button v-else class="danger-btn" @tap="cancelTask">取消任务</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { cancelTask as cancelTaskRequest } from '@/api/task';
import { useTaskStore } from '@/stores/task';
import { PAGE_ROUTES } from '@/utils/constants';
import { isTaskCancelled, isTaskCompleted, isTaskFailed, taskProgressOf, taskStatusViewOf, taskTitleOf, taskTypeOf } from '@/utils/task-display';

interface StepItem {
  name: string;
  state: 'done' | 'active' | 'pending';
}

const taskStore = useTaskStore();
const task = ref<Record<string, unknown>>({});
const timer = ref<ReturnType<typeof setInterval> | null>(null);
const taskId = ref('');
const taskType = ref('image');
const done = computed(() => isTaskCompleted(task.value));
const failed = computed(() => isTaskFailed(task.value));
const cancelled = computed(() => isTaskCancelled(task.value));
const statusView = computed(() => taskStatusViewOf(task.value));
const progress = computed(() => taskProgressOf(task.value));
const currentStep = computed(() => getCurrentStepName(progress.value));
const steps = computed(() => buildSteps(progress.value));
const taskTypeName = computed(() => taskType.value === 'video' ? 'AI视频方案' : 'AI生图');

onLoad((query) => {
  taskId.value = String(query?.id || '');
  taskType.value = String(query?.type || 'image');
  task.value = {
    id: taskId.value,
    type: taskType.value,
    title: taskType.value === 'video' ? 'AI视频生成任务' : 'AI生图任务',
    status: 'processing',
    progress: 8
  };
  loadTask();
  startPolling();
});

onUnload(() => {
  if (timer.value) clearInterval(timer.value);
  timer.value = null;
});

function getStepIndex(value: number) {
  return Math.min(3, Math.floor(value / 25));
}

function getCurrentStepName(value: number) {
  return ['解析需求', '优化提示词', '生成内容', '合成输出'][getStepIndex(value)] || '解析需求';
}

function buildSteps(value: number): StepItem[] {
  const current = getStepIndex(value);
  return ['解析需求', '优化提示词', '生成内容', '合成输出'].map((name, index) => ({
    name,
    state: index < current ? 'done' : index === current ? 'active' : 'pending'
  }));
}

function startPolling() {
  if (timer.value) clearInterval(timer.value);
  if (!taskId.value || statusView.value.terminal) return;
  timer.value = setInterval(() => {
    loadTask();
  }, 3000);
}

function loadTask() {
  if (!taskId.value) return;
  taskStore.loadTask(Number(taskId.value)).then((res) => {
    task.value = res;
    taskType.value = taskTypeOf(res);
    if (statusView.value.terminal) {
      if (timer.value) clearInterval(timer.value);
      timer.value = null;
    }
  }).catch(() => undefined);
}

function runInBackground() {
  uni.reLaunch({ url: PAGE_ROUTES.history });
}

function cancelTask() {
  if (!taskId.value) return;
  uni.showModal({
    title: '取消任务',
    content: '确定要取消当前生成任务吗？',
    cancelText: '继续生成',
    confirmText: '确认取消',
    success: (res) => {
      if (!res.confirm) return;
      cancelTaskRequest(Number(taskId.value)).then(() => {
        if (timer.value) clearInterval(timer.value);
        timer.value = null;
        uni.redirectTo({ url: `${PAGE_ROUTES.result}?id=${taskId.value}&type=${taskType.value}` });
      }).catch(() => undefined);
    }
  });
}

function viewResult() {
  uni.navigateTo({ url: `${PAGE_ROUTES.result}?id=${taskId.value}&type=${taskType.value}` });
}
</script>

<style scoped lang="scss">
.generating-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-bottom: calc(150rpx + env(safe-area-inset-bottom));
  text-align: center;
  background:
    radial-gradient(circle at 14% 8%, rgba(122, 92, 255, 0.16), transparent 28%),
    radial-gradient(circle at 88% 10%, rgba(255, 122, 203, 0.14), transparent 28%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.ai-orb {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300rpx;
  margin-bottom: 18rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.16);
  border-radius: 28rpx;
}

.ai-orb::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0)),
    radial-gradient(circle at 50% 45%, rgba(122, 92, 255, 0.12), rgba(247, 248, 255, 0.75));
  content: "";
}

.orb-mesh,
.orb-ring {
  position: absolute;
  pointer-events: none;
}

.orb-mesh {
  inset: 0;
  background:
    radial-gradient(circle at 24% 26%, rgba(122, 92, 255, 0.22), transparent 26%),
    radial-gradient(circle at 76% 30%, rgba(255, 122, 203, 0.2), transparent 24%),
    radial-gradient(circle at 52% 74%, rgba(255, 200, 87, 0.18), transparent 24%),
    linear-gradient(135deg, #eef2ff 0%, #ffffff 52%, #fff0f7 100%);
}

.orb-ring {
  left: 50%;
  top: 50%;
  border: 3rpx solid rgba(122, 92, 255, 0.22);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(-12deg);
}

.ring-one {
  width: 420rpx;
  height: 132rpx;
}

.ring-two {
  width: 320rpx;
  height: 102rpx;
  border-color: rgba(255, 122, 203, 0.2);
  transform: translate(-50%, -50%) rotate(18deg);
}

.orb-core {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 176rpx;
  height: 176rpx;
  border-radius: 88rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #7a5cff;
  font-size: 48rpx;
  font-weight: 900;
  box-shadow: 0 0 0 30rpx rgba(122, 92, 255, 0.16), 0 0 0 64rpx rgba(255, 122, 203, 0.12);
}

.status-title {
  color: #252941;
  font-size: 38rpx;
  font-weight: 900;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132rpx;
  height: 48rpx;
  margin-bottom: 18rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  background: linear-gradient(90deg, #7a5cff, #8b5cf6);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  box-shadow: 0 10rpx 22rpx rgba(122, 92, 255, 0.2);
}

.status-pill.processing {
  background: linear-gradient(90deg, #f59e0b, #f97316);
}

.status-pill.completed {
  background: linear-gradient(90deg, #22c55e, #14b8a6);
}

.status-pill.failed {
  background: linear-gradient(90deg, #ff4d7a, #f43f5e);
}

.status-pill.cancelled {
  background: linear-gradient(90deg, #94a3b8, #64748b);
}

.status-desc {
  margin: 14rpx 0 34rpx;
  color: #8b91a8;
  font-size: 25rpx;
  font-weight: 800;
}

.progress-card {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.16);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.92);
  text-align: left;
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
}

.progress-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16rpx;
  color: #7a5cff;
  font-weight: 900;
}

.progress-track-large {
  overflow: hidden;
  height: 18rpx;
  border-radius: 9rpx;
  background: rgba(122, 92, 255, 0.12);
}

.progress-fill-large {
  height: 100%;
  border-radius: 9rpx;
  background: linear-gradient(90deg, #7a5cff, #ff7acb);
  transition: width 0.3s ease;
}

.step-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 28rpx;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  color: #98a2b3;
  font-size: 22rpx;
  text-align: center;
}

.step-item.done,
.step-item.active {
  color: #252941;
  font-weight: 900;
}

.step-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 9rpx;
  background: rgba(145, 163, 173, 0.45);
}

.step-item.done .step-dot,
.step-item.active .step-dot {
  background: #7a5cff;
}

.task-info-card {
  text-align: left;
}

.info-row {
  display: flex;
  justify-content: space-between;
  min-height: 58rpx;
  color: #8b91a8;
  font-size: 24rpx;
  font-weight: 800;
}

.info-row text:last-child {
  max-width: 420rpx;
  overflow: hidden;
  color: #252941;
  font-weight: 900;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-card {
  margin-bottom: 22rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.14);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.88);
  color: #677095;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.5;
  text-align: left;
}

.bottom-actions {
  position: fixed;
  right: 28rpx;
  bottom: calc(20rpx + env(safe-area-inset-bottom));
  left: 28rpx;
  z-index: 40;
}

.two-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.secondary-btn,
.danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  border-radius: 18rpx;
  font-size: 28rpx;
  font-weight: 900;
}

.secondary-btn {
  border: 1rpx solid rgba(122, 92, 255, 0.18);
  background: rgba(255, 255, 255, 0.92);
  color: #252941;
}

.danger-btn {
  background: rgba(232, 82, 103, 0.12);
  color: #c43d50;
}
</style>
