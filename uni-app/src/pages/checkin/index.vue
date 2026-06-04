<template>
  <view class="flow-page checkin-page">
    <view class="calendar-hero">
      <view class="calendar-body">
        <view class="calendar-ring left"></view>
        <view class="calendar-ring right"></view>
        <view class="check-mark"></view>
      </view>
      <view class="hero-star"></view>
    </view>

    <view class="check-title">每日签到</view>
    <view class="check-streak">已连续签到 <text>{{ streak }}</text> 天</view>
    <view class="today-reward">{{ signedToday ? '今日已领取' : '今日可领取' }} <text>+{{ todayReward }}</text> 积分</view>

    <scroll-view scroll-x class="reward-days-scroll" enable-flex>
      <view class="reward-days">
        <view v-for="item in days" :key="item.day" class="day-card" :class="item.status">
          <view>第{{ item.day }}天</view>
          <text>+{{ item.reward }}</text>
          <view class="day-status">{{ item.statusText }}</view>
        </view>
      </view>
    </scroll-view>

    <view class="primary-action" :class="{ disabled: signedToday }" @tap="checkIn">{{ buttonText }}</view>
    <view v-if="showExtraActions" class="extra-actions">
      <view v-if="showSuperAction" class="secondary-action" :class="{ disabled: superSignedToday }" @tap="checkInSuper">
        {{ superButtonText }}
      </view>
      <view v-if="showMakeupAction" class="secondary-action" :class="{ disabled: !makeupAvailable }" @tap="makeupCheckIn">
        {{ makeupButtonText }}
      </view>
    </view>

    <view class="panel">
      <view class="panel-title">签到说明</view>
      <view class="rule-row">
        <text>连续签到奖励逐日增加</text>
        <text>最高 +80</text>
      </view>
      <view class="rule-row">
        <text>中断后从第1天重新计算</text>
        <text>自动重置</text>
      </view>
      <view class="rule-row">
        <text>补签和超级签到按后台配置展示</text>
        <text>{{ extraRuleText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getSignInStatus, makeupSignIn, normalSignIn, superSignIn } from '@/api/sign-in';
import { PAGE_ROUTES } from '@/utils/constants';
interface RewardDay {
  day: number;
  reward: number;
  status: 'done' | 'today' | 'pending';
  statusText: string;
}

const streak = ref(0);
const signedToday = ref(false);
const todayReward = ref(0);
const dayItems = ref<RewardDay[]>([]);
const config = ref<Record<string, unknown>>({});
const superInfo = ref<Record<string, unknown>>({});
const makeupInfo = ref<Record<string, unknown>>({});
const buttonText = computed(() => signedToday.value ? '今日已签到' : `今日签到，领取 +${todayReward.value} 积分`);
const days = computed<RewardDay[]>(() => dayItems.value);
const showSuperAction = computed(() => Boolean(config.value.superEnabled || superInfo.value.enabled || superInfo.value.adRequired));
const superSignedToday = computed(() => Boolean(superInfo.value.signedToday));
const superNeedsAd = computed(() => Boolean(superInfo.value.adRequired) && !Boolean(superInfo.value.adCompletedToday));
const superReward = computed(() => Number(superInfo.value.todayReward || 0));
const superButtonText = computed(() => {
  if (superSignedToday.value) return '超级签到已完成';
  if (superNeedsAd.value) return '看广告后可超级签到';
  return `超级签到，领取 +${superReward.value} 积分`;
});
const showMakeupAction = computed(() => Boolean(makeupInfo.value.enabled));
const makeupAvailable = computed(() => Boolean(makeupInfo.value.available));
const makeupTargetDate = computed(() => String(makeupInfo.value.targetDate || ''));
const makeupCost = computed(() => Number(makeupInfo.value.costPoints || 0));
const makeupButtonText = computed(() => {
  if (!makeupAvailable.value) return String(makeupInfo.value.message || '暂无可补签日期');
  return makeupCost.value > 0 ? `补签昨日，扣 ${makeupCost.value} 积分` : '补签昨日';
});
const showExtraActions = computed(() => showSuperAction.value || showMakeupAction.value);
const extraRuleText = computed(() => showExtraActions.value ? '已接入' : '未开启');

onShow(() => {
  loadStatus();
});

function loadStatus() {
  getSignInStatus<Record<string, unknown>>()
    .then((res) => {
      const normal = asRecord(res.normal);
      config.value = asRecord(res.config);
      superInfo.value = asRecord(res.super);
      makeupInfo.value = asRecord(res.makeup);
      streak.value = Number(normal.streak || res.streak || 0);
      signedToday.value = Boolean(normal.signedToday ?? res.signedToday);
      todayReward.value = Number(normal.todayReward || res.todayReward || 0);
      const sourceDays = Array.isArray(normal.days) ? normal.days : res.days;
      const list = Array.isArray(sourceDays) ? sourceDays as Record<string, unknown>[] : [];
      dayItems.value = list.map((item) => ({
        day: Number(item.day || 0),
        reward: Number(item.reward || 0),
        status: String(item.status || 'pending') as RewardDay['status'],
        statusText: String(item.statusText || (item.status === 'done' ? '已签' : item.status === 'today' ? '今日' : '未签'))
      }));
    })
    .catch(() => {
      streak.value = 0;
      signedToday.value = false;
      todayReward.value = 0;
      dayItems.value = [];
      config.value = {};
      superInfo.value = {};
      makeupInfo.value = {};
    });
}

async function checkIn() {
  if (signedToday.value) return;
  const res = await normalSignIn<Record<string, unknown>>();
  const reward = Number(res.rewardPoints || res.reward || todayReward.value || 0);
  uni.showToast({ title: reward ? `+${reward} 积分` : '签到成功', icon: 'none' });
  loadStatus();
}

async function checkInSuper() {
  if (!showSuperAction.value || superSignedToday.value) return;
  if (superNeedsAd.value) {
    uni.navigateTo({ url: PAGE_ROUTES.pointsAd });
    return;
  }
  const res = await superSignIn<Record<string, unknown>>();
  const reward = Number(res.rewardPoints || res.reward || superReward.value || 0);
  uni.showToast({ title: reward ? `+${reward} 积分` : '超级签到成功', icon: 'none' });
  loadStatus();
}

async function makeupCheckIn() {
  if (!makeupAvailable.value) return;
  const res = await makeupSignIn<Record<string, unknown>>(makeupTargetDate.value || undefined);
  const reward = Number(res.rewardPoints || res.reward || 0);
  uni.showToast({ title: reward ? `补签成功 +${reward}` : '补签成功', icon: 'none' });
  loadStatus();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
</script>

<style scoped lang="scss">
.checkin-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-right: 32rpx;
  padding-bottom: calc(80rpx + env(safe-area-inset-bottom));
  padding-left: 32rpx;
  background:
    radial-gradient(circle at 18% 8%, rgba(122, 92, 255, 0.14), transparent 30%),
    radial-gradient(circle at 88% 18%, rgba(255, 203, 87, 0.16), transparent 28%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.calendar-hero {
  position: relative;
  height: 300rpx;
}

.calendar-hero::before {
  position: absolute;
  left: 50%;
  bottom: 24rpx;
  width: 330rpx;
  height: 64rpx;
  border-radius: 50%;
  background: rgba(122, 92, 255, 0.14);
  content: "";
  filter: blur(10rpx);
  transform: translateX(-50%);
}

.calendar-body {
  position: absolute;
  left: 50%;
  top: 22rpx;
  width: 220rpx;
  height: 220rpx;
  border-radius: 42rpx;
  background: linear-gradient(180deg, #ffffff 0%, #f4f0ff 100%);
  box-shadow: inset 0 46rpx 0 #7a5cff, inset -12rpx -14rpx 0 rgba(122, 92, 255, 0.08), 0 30rpx 54rpx rgba(122, 92, 255, 0.22);
  transform: translateX(-50%);
}

.calendar-ring {
  position: absolute;
  top: -20rpx;
  width: 34rpx;
  height: 62rpx;
  border: 12rpx solid #7a5cff;
  border-bottom: 0;
  border-radius: 22rpx 22rpx 0 0;
}

.calendar-ring.left {
  left: 46rpx;
}

.calendar-ring.right {
  right: 46rpx;
}

.check-mark {
  position: absolute;
  left: 76rpx;
  top: 112rpx;
  width: 78rpx;
  height: 42rpx;
  border-bottom: 18rpx solid #7a5cff;
  border-left: 18rpx solid #7a5cff;
  border-radius: 8rpx;
  transform: rotate(-45deg);
}

.hero-star {
  position: absolute;
  right: 160rpx;
  bottom: 58rpx;
  width: 44rpx;
  height: 44rpx;
  background: #ffc857;
  clip-path: polygon(50% 0, 62% 34%, 98% 34%, 68% 55%, 80% 90%, 50% 68%, 20% 90%, 32% 55%, 2% 34%, 38% 34%);
}

.check-title,
.check-streak,
.today-reward {
  text-align: center;
}

.check-title {
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
}

.check-streak {
  margin-top: 18rpx;
  color: #677095;
  font-size: 25rpx;
  font-weight: 800;
}

.check-streak text {
  color: #7a5cff;
  font-size: 42rpx;
  font-weight: 900;
}

.today-reward {
  margin-top: 12rpx;
  color: #8b91a8;
  font-size: 24rpx;
  font-weight: 800;
}

.today-reward text {
  color: #ffc857;
  font-size: 36rpx;
  font-weight: 900;
  text-shadow: 0 8rpx 18rpx rgba(255, 200, 87, 0.22);
}

.reward-days-scroll {
  width: 100%;
  margin: 42rpx 0 40rpx;
  white-space: nowrap;
}

.reward-days {
  display: inline-flex;
  gap: 16rpx;
  min-width: 100%;
}

.day-card {
  position: relative;
  flex: 0 0 132rpx;
  width: 132rpx;
  height: 140rpx;
  padding-top: 20rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.8);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #7a5cff;
  text-align: center;
  box-shadow: 0 16rpx 30rpx rgba(122, 92, 255, 0.1);
}

.day-card.today {
  background: linear-gradient(180deg, #7a5cff, #6d55f0);
  color: #ffffff;
  box-shadow: 0 20rpx 36rpx rgba(122, 92, 255, 0.26);
}

.day-card view:first-child {
  font-size: 21rpx;
  font-weight: 900;
}

.day-card text {
  display: block;
  margin-top: 12rpx;
  color: inherit;
  font-size: 30rpx;
  font-weight: 900;
}

.day-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64rpx;
  height: 34rpx;
  margin-top: 14rpx;
  padding: 0 10rpx;
  border-radius: 17rpx;
  background: #e8f0ff;
  color: #8b91a8;
  font-size: 18rpx;
  font-weight: 900;
}

.day-card.done .day-status {
  background: #ffc857;
  color: #ffffff;
}

.day-card.today .day-status {
  background: rgba(255, 255, 255, 0.92);
  color: #7a5cff;
}

.primary-action {
  height: 76rpx;
  margin: 0 64rpx 42rpx;
  border-radius: 38rpx;
  background: linear-gradient(135deg, #7a5cff, #6d55f0);
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 76rpx;
  text-align: center;
  box-shadow: 0 18rpx 34rpx rgba(122, 92, 255, 0.28);
}

.primary-action.disabled {
  background: #cfd6ee;
  box-shadow: none;
}

.extra-actions {
  display: grid;
  gap: 18rpx;
  margin: -18rpx 64rpx 42rpx;
}

.secondary-action {
  height: 70rpx;
  border: 2rpx solid rgba(122, 92, 255, 0.18);
  border-radius: 35rpx;
  background: #ffffff;
  color: #6d55f0;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 70rpx;
  text-align: center;
}

.secondary-action.disabled {
  border-color: transparent;
  background: #eef1f8;
  color: #8b91a8;
}

.panel {
  padding: 24rpx 28rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
  backdrop-filter: blur(16rpx);
}

.panel-title {
  margin-bottom: 16rpx;
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
}

.rule-row {
  display: flex;
  justify-content: space-between;
  min-height: 70rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.1);
  color: #677095;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 70rpx;
}

.rule-row:last-child {
  border-bottom: 0;
}
</style>
