<template>
  <view class="flow-page tasks-page">
    <view class="points-banner">
      <view>
        <view class="banner-label">今日可使用</view>
        <view class="banner-value">{{ todayAvailable }} <text>积分</text></view>
      </view>
      <view class="banner-gift">
        <view class="gift-box"></view>
        <view class="gift-crown"></view>
      </view>
    </view>

    <view class="task-section">
      <view class="section-title">每日任务</view>
      <view class="task-card">
        <view v-for="item in dailyTasks" :key="item.id" class="task-row">
          <view class="task-icon">
            <image :src="taskIconOf(item.icon)" mode="aspectFit" />
          </view>
          <view class="task-main">
            <view>{{ item.title }}</view>
            <text>+{{ item.reward }}</text>
          </view>
          <view class="task-btn" :class="{ done: item.completed }" @tap="goTask(item.id)">
            {{ item.completed ? '已完成' : item.action }}
          </view>
        </view>
      </view>
    </view>

    <view class="task-section">
      <view class="section-title">成长任务</view>
      <view class="task-card">
        <view v-for="item in growthTasks" :key="item.id" class="task-row">
          <view class="task-icon">
            <image :src="taskIconOf(item.icon)" mode="aspectFit" />
          </view>
          <view class="task-main">
            <view>{{ item.title }}</view>
            <text>+{{ item.reward }}</text>
          </view>
          <view class="task-btn" :class="{ done: item.completed }" @tap="goTask(item.id)">
            {{ item.completed ? '已完成' : item.action }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { PAGE_ROUTES } from '@/utils/constants';
import { getPointTasks } from '@/api/point-task';
import { useConfigStore } from '@/stores/config';
import { isPurchaseEnabled, showPurchaseUnavailable } from '@/utils/purchase-guard';

interface TaskReward {
  id: string;
  title: string;
  reward: number;
  icon: string;
  action: string;
  completed: boolean;
  group: 'daily' | 'growth' | string;
}

const todayAvailable = ref(0);
const dailyBase = [
  { id: 'watch_ad', title: '观看广告（0/5）', reward: 10, icon: 'video', action: '去完成', group: 'daily' },
  { id: 'daily_checkin', title: '每日签到（1/1）', reward: 20, icon: 'calendar', action: '去签到', group: 'daily' },
  { id: 'share_work', title: '分享作品（0/1）', reward: 20, icon: 'share', action: '去完成', group: 'daily' }
];
const growthBase = [
  { id: 'invite_friend', title: '邀请 1 位好友', reward: 200, icon: 'invite', action: '去完成', group: 'growth' },
  { id: 'open_pro', title: '开通会员', reward: 600, icon: 'pro', action: '去升级', group: 'growth' },
  { id: 'checkin_7', title: '连续签到 7 天', reward: 100, icon: 'camera', action: '去签到', group: 'growth' }
];
const dailyTasks = ref<TaskReward[]>([]);
const growthTasks = ref<TaskReward[]>([]);
const configStore = useConfigStore();
const taskIcons: Record<string, string> = {
  video: '/static/icons/benefit_ai_video.svg',
  calendar: '/static/icons/icon_task_checkin.svg',
  share: '/static/icons/icon_task_share.svg',
  invite: '/static/icons/icon_task_invite.svg',
  pro: '/static/icons/icon_task_member.svg',
  camera: '/static/icons/icon_task_checkin.svg'
};

onShow(() => {
  refreshTasksEntry();
});

async function refreshTasksEntry() {
  configStore.hydrate();
  await configStore.loadPublicConfig({ force: true }).catch(() => undefined);
  loadTasks();
}

function loadTasks() {
  getPointTasks<{ todayAvailable?: number; list?: Record<string, unknown>[] }>()
    .then((res) => {
      todayAvailable.value = Number(res.todayAvailable || 0);
      const list = filterPurchaseTasks(Array.isArray(res.list) ? res.list.map(normalizeTask) : []);
      dailyTasks.value = list.filter((item) => item.group === 'daily');
      growthTasks.value = list.filter((item) => item.group !== 'daily');
      if (!list.length) useFallbackTasks();
    })
    .catch(() => {
      useFallbackTasks();
    });
}

function goTask(id: string) {
  const task = [...dailyTasks.value, ...growthTasks.value].find((item) => item.id === id);
  if (task?.completed) return;
  if (id === 'watch_ad') {
    uni.navigateTo({ url: PAGE_ROUTES.pointsAd });
    return;
  }
  if (id === 'daily_checkin' || id === 'checkin_7') {
    uni.navigateTo({ url: PAGE_ROUTES.checkin });
    return;
  }
  if (id === 'share_work') {
    uni.navigateTo({ url: PAGE_ROUTES.history });
    return;
  }
  if (id === 'invite_friend') {
    uni.navigateTo({ url: PAGE_ROUTES.invite });
    return;
  }
  if (id === 'open_pro') {
    if (!isPurchaseEnabled(configStore.publicConfig)) {
      showPurchaseUnavailable(configStore.publicConfig);
      return;
    }
    uni.navigateTo({ url: PAGE_ROUTES.member });
    return;
  }
  uni.showToast({ title: '任务入口未配置', icon: 'none' });
}

function taskIconOf(icon: string) {
  return taskIcons[icon] || taskIcons.calendar;
}

function normalizeTask(item: Record<string, unknown>): TaskReward {
  return {
    id: String(item.id || ''),
    title: String(item.title || ''),
    reward: Number(item.reward || item.rewardPoints || 0),
    icon: String(item.icon || 'calendar'),
    action: String(item.action || '去完成'),
    completed: Boolean(item.completed || item.claimed),
    group: String(item.group || 'daily')
  };
}

function useFallbackTasks() {
  todayAvailable.value = 0;
  dailyTasks.value = dailyBase.map((item) => ({ ...item, completed: false }));
  growthTasks.value = filterPurchaseTasks(growthBase.map((item) => ({ ...item, completed: false })));
}

function filterPurchaseTasks(items: TaskReward[]) {
  if (isPurchaseEnabled(configStore.publicConfig)) return items;
  return items.filter((item) => item.id !== 'open_pro');
}
</script>

<style scoped lang="scss">
.tasks-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-right: 32rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  padding-left: 32rpx;
  background:
    radial-gradient(circle at 20% 8%, rgba(122, 92, 255, 0.13), transparent 30%),
    radial-gradient(circle at 86% 15%, rgba(255, 203, 87, 0.16), transparent 28%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.points-banner {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  min-height: 162rpx;
  margin: 18rpx 0 42rpx;
  padding: 34rpx 36rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 72% 22%, rgba(255, 203, 87, 0.24), transparent 28%),
    linear-gradient(135deg, #eee8ff 0%, #e8f0ff 100%);
}

.banner-label {
  color: #677095;
  font-size: 24rpx;
  font-weight: 900;
}

.banner-value {
  margin-top: 8rpx;
  color: #252941;
  font-size: 52rpx;
  font-weight: 900;
}

.banner-value text {
  color: #677095;
  font-size: 24rpx;
}

.banner-gift {
  position: relative;
  width: 168rpx;
  height: 106rpx;
}

.gift-box {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 136rpx;
  height: 76rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #bba5ff, #7a5cff);
}

.gift-crown {
  position: absolute;
  right: 30rpx;
  top: 0;
  width: 86rpx;
  height: 52rpx;
  border-radius: 10rpx 10rpx 18rpx 18rpx;
  background: linear-gradient(180deg, #ffdf77, #ffc857);
  transform: rotate(-10deg);
}

.task-section {
  margin-bottom: 36rpx;
}

.section-title {
  margin-bottom: 18rpx;
  color: #252941;
  font-size: 30rpx;
  font-weight: 900;
}

.task-card {
  overflow: hidden;
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
}

.task-row {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: 0 24rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.1);
}

.task-row:last-child {
  border-bottom: 0;
}

.task-icon {
  flex-shrink: 0;
  width: 52rpx;
  height: 52rpx;
  margin-right: 22rpx;
}

.task-icon image {
  display: block;
  width: 52rpx;
  height: 52rpx;
}

.task-main {
  flex: 1;
  min-width: 0;
}

.task-main view {
  overflow: hidden;
  color: #414765;
  font-size: 25rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-main text {
  display: block;
  margin-top: 8rpx;
  color: #ffc857;
  font-size: 22rpx;
  font-weight: 900;
}

.task-btn {
  flex-shrink: 0;
  width: 116rpx;
  height: 54rpx;
  border-radius: 27rpx;
  background: linear-gradient(135deg, #7a5cff, #6d55f0);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 54rpx;
  text-align: center;
}

.task-btn.done {
  background: #e8f0ff;
  color: #a0a7bd;
}
</style>
