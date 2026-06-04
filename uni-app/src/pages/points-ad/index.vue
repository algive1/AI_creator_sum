<template>
  <view class="flow-page reward-page ad-page">
    <view class="ad-hero">
      <view class="coin one"></view>
      <view class="coin two"></view>
      <view class="ad-player">
        <view class="play-triangle"></view>
        <view class="antenna left"></view>
        <view class="antenna right"></view>
      </view>
    </view>

    <view class="hero-copy">
      <view class="hero-desc">看广告得积分</view>
      <view class="today-points">今日还可获得 <text>{{ todayReward }}</text> 积分</view>
      <view class="watch-count">{{ progressText }}</view>
      <view class="reward-tip">每次完整观看可得 {{ rewardPerWatch }} 积分</view>
    </view>

    <view class="primary-action" :class="buttonState" @tap="watchAd">{{ buttonText }}</view>
    <view v-if="adErrorText" class="ad-error">{{ adErrorText }}</view>

    <view class="panel">
      <view class="panel-title">积分明细</view>
      <view v-for="item in history" :key="item.id" class="history-row">
        <view class="history-icon"></view>
        <view class="history-main">
          <view>{{ item.title }}</view>
          <text>{{ item.time }}</text>
        </view>
        <view class="history-side">
          <view class="history-points">+{{ item.points }}</view>
          <text>{{ item.status }}</text>
        </view>
      </view>
      <view v-if="!history.length" class="empty-tip">今天还没有广告积分记录</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { claimAdReward, createAdRewardSession, getAdRewardStatus } from '@/api/ad-reward';
import { getTransactions } from '@/api/points';
interface AdHistory {
  id: string;
  title: string;
  time: string;
  points: number;
  status: string;
}

const rewardPerWatch = ref(0);
const maxPerDay = ref(0);
const watched = ref(0);
const isLoadingAd = ref(false);
const adErrorText = ref('');
const history = ref<AdHistory[]>([]);
const todayReward = computed(() => Math.max(0, maxPerDay.value - watched.value) * rewardPerWatch.value);
const exhausted = computed(() => maxPerDay.value > 0 && watched.value >= maxPerDay.value);
const progressText = computed(() => `今日进度：${watched.value}/${maxPerDay.value || 0}`);
const buttonState = computed(() => exhausted.value ? 'exhausted' : isLoadingAd.value ? 'loading' : adErrorText.value ? 'error' : 'ready');
const buttonText = computed(() => {
  if (exhausted.value) return '今日次数已用完';
  if (isLoadingAd.value) return '广告加载中...';
  if (adErrorText.value) return '广告暂不可用，稍后再试';
  return `立即观看，领取 ${rewardPerWatch.value || 0} 积分`;
});

onShow(() => {
  loadStatus();
  loadHistory();
});

function loadStatus() {
  getAdRewardStatus<Record<string, unknown>>()
    .then((res) => {
      watched.value = Number(res.watchedToday || res.watched || 0);
      maxPerDay.value = Number(res.maxPerDay || res.maxDailyCount || 0);
      rewardPerWatch.value = Number(res.rewardPerWatch || 0);
      adErrorText.value = '';
    })
    .catch(() => {
      watched.value = 0;
      maxPerDay.value = 0;
      rewardPerWatch.value = 0;
      adErrorText.value = '广告状态获取失败';
    });
}

function loadHistory() {
  getTransactions<{ list?: Record<string, unknown>[] }>({ category: 'ad', page: 1, pageSize: 8 })
    .then((res) => {
      const list = Array.isArray(res.list) ? res.list : [];
      history.value = list.map((item) => ({
        id: String(item.id || item.createdAt || item.created_at),
        title: String(item.title || '观看广告'),
        time: String(item.createdAt || item.created_at || ''),
        points: Math.max(0, Number(item.amount || item.points || 0)),
        status: '已到账'
      }));
    })
    .catch(() => { history.value = []; });
}

function watchAd() {
  if (isLoadingAd.value || exhausted.value) return;
  isLoadingAd.value = true;
  adErrorText.value = '';
  createAdRewardSession<Record<string, unknown>>()
    .then((session) => {
      const sessionId = String(session.sessionId || '');
      uni.showModal({
        title: '模拟激励广告',
        content: '当前为联调模拟流程。确认代表完整观看，取消代表中途关闭。',
        confirmText: '完整观看',
        cancelText: '中途关闭',
        success: async (res) => {
          if (!res.confirm) {
            isLoadingAd.value = false;
            uni.showToast({ title: '完整观看后才可领取积分', icon: 'none' });
            return;
          }
          try {
            const reward = await claimAdReward<Record<string, unknown>>(sessionId, true);
            const points = Number(reward.rewardPoints || rewardPerWatch.value || 0);
            uni.showToast({ title: points ? `+${points} 积分` : '奖励已到账', icon: 'none' });
            loadStatus();
            loadHistory();
          } finally {
            isLoadingAd.value = false;
          }
        },
        fail: () => {
          isLoadingAd.value = false;
          adErrorText.value = '广告暂不可用，稍后再试';
        }
      });
    })
    .catch(() => {
      isLoadingAd.value = false;
      adErrorText.value = '广告暂不可用，稍后再试';
    });
}
</script>

<style scoped lang="scss">
.reward-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-right: 32rpx;
  padding-bottom: calc(80rpx + env(safe-area-inset-bottom));
  padding-left: 32rpx;
  background:
    radial-gradient(circle at 20% 8%, rgba(122, 92, 255, 0.14), transparent 30%),
    radial-gradient(circle at 86% 14%, rgba(255, 203, 87, 0.18), transparent 28%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.ad-hero {
  position: relative;
  height: 300rpx;
  margin-top: 8rpx;
}

.ad-hero::before {
  position: absolute;
  left: 50%;
  bottom: 26rpx;
  width: 320rpx;
  height: 62rpx;
  border-radius: 50%;
  background: rgba(122, 92, 255, 0.14);
  content: "";
  filter: blur(10rpx);
  transform: translateX(-50%);
}

.ad-player {
  position: absolute;
  left: 50%;
  top: 32rpx;
  width: 210rpx;
  height: 190rpx;
  border-radius: 46rpx;
  background: linear-gradient(145deg, #8fb7ff, #7a5cff 58%, #684be8);
  box-shadow: inset -14rpx -18rpx 0 rgba(61, 45, 176, 0.18), inset 10rpx 10rpx 0 rgba(255, 255, 255, 0.16), 0 28rpx 52rpx rgba(122, 92, 255, 0.3);
  transform: translateX(-50%);
}

.ad-player::before {
  position: absolute;
  inset: 34rpx 36rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #ffeeb4, #ffffff);
  content: "";
}

.play-triangle {
  position: absolute;
  left: 92rpx;
  top: 78rpx;
  z-index: 2;
  width: 0;
  height: 0;
  border-top: 28rpx solid transparent;
  border-bottom: 28rpx solid transparent;
  border-left: 42rpx solid #7a5cff;
}

.antenna {
  position: absolute;
  top: -28rpx;
  width: 16rpx;
  height: 50rpx;
  border-radius: 8rpx;
  background: #7a5cff;
}

.antenna.left {
  left: 56rpx;
  transform: rotate(-18deg);
}

.antenna.right {
  right: 56rpx;
  transform: rotate(18deg);
}

.antenna::before {
  position: absolute;
  top: -14rpx;
  left: -8rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: #ffc857;
  content: "";
}

.coin {
  position: absolute;
  width: 54rpx;
  height: 54rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffe38e, #ffb33e);
  box-shadow: inset -6rpx -8rpx 0 rgba(210, 119, 32, 0.18);
}

.coin.one {
  right: 154rpx;
  top: 176rpx;
}

.coin.two {
  left: 150rpx;
  bottom: 36rpx;
}

.hero-copy {
  text-align: center;
}

.hero-desc {
  color: #677095;
  font-size: 27rpx;
  font-weight: 900;
}

.today-points {
  margin-top: 34rpx;
  color: #252941;
  font-size: 36rpx;
  font-weight: 900;
}

.today-points text {
  color: #ffc857;
  font-size: 52rpx;
  text-shadow: 0 8rpx 18rpx rgba(255, 200, 87, 0.24);
}

.watch-count {
  margin-top: 14rpx;
  color: #9aa1b8;
  font-size: 24rpx;
  font-weight: 800;
}

.reward-tip {
  margin-top: 10rpx;
  color: #7a5cff;
  font-size: 23rpx;
  font-weight: 900;
}

.primary-action {
  height: 86rpx;
  margin: 58rpx 42rpx 52rpx;
  border-radius: 43rpx;
  background: linear-gradient(135deg, #7a5cff, #6d55f0);
  color: #ffffff;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 86rpx;
  text-align: center;
  box-shadow: 0 18rpx 34rpx rgba(122, 92, 255, 0.28);
}

.primary-action.loading {
  background: linear-gradient(135deg, #9b8cff, #7a5cff);
}

.primary-action.exhausted {
  background: #d8def2;
  color: #7e879f;
  box-shadow: none;
}

.primary-action.error {
  background: linear-gradient(135deg, #8b91a8, #7a5cff);
}

.ad-error {
  margin: -34rpx 0 34rpx;
  color: #8b91a8;
  font-size: 22rpx;
  font-weight: 800;
  text-align: center;
}

.panel {
  padding: 24rpx 28rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 20rpx 46rpx rgba(122, 92, 255, 0.12);
  backdrop-filter: blur(16rpx);
}

.panel-title {
  margin-bottom: 18rpx;
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
}

.history-row {
  display: flex;
  align-items: center;
  min-height: 86rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.1);
}

.history-row:last-child {
  border-bottom: 0;
}

.history-icon {
  flex-shrink: 0;
  width: 34rpx;
  height: 34rpx;
  margin-right: 18rpx;
  border-radius: 10rpx;
  background: linear-gradient(135deg, #7a5cff, #ff7acb);
}

.history-main {
  flex: 1;
  min-width: 0;
  color: #414765;
  font-size: 24rpx;
  font-weight: 900;
}

.history-main text {
  display: block;
  margin-top: 6rpx;
  color: #a0a7bd;
  font-size: 20rpx;
}

.history-side {
  flex-shrink: 0;
  text-align: right;
}

.history-points {
  color: #7a5cff;
  font-size: 24rpx;
  font-weight: 900;
}

.history-side text {
  display: block;
  margin-top: 6rpx;
  color: #ffc857;
  font-size: 19rpx;
  font-weight: 900;
}

.empty-tip {
  padding: 34rpx 0;
  color: #9aa1b8;
  font-size: 24rpx;
  font-weight: 800;
  text-align: center;
}
</style>
