<template>
  <view class="flow-page invite-page">
    <view class="friends-hero">
      <view class="star s1"></view>
      <view class="star s2"></view>
      <view class="friend boy">
        <view class="head"></view>
        <view class="body"></view>
      </view>
      <view class="friend girl">
        <view class="head"></view>
        <view class="body"></view>
      </view>
      <view class="gift"></view>
    </view>

    <view class="invite-title">邀请好友加入</view>
    <view class="invite-subtitle">你们都能获得积分奖励</view>

    <view class="code-card">
      <view>
        <view class="code-label">我的邀请码</view>
        <view class="invite-code">{{ code }}</view>
      </view>
      <view class="copy-btn" @tap="copyCode">复制</view>
    </view>

    <view class="panel">
      <view class="panel-title">邀请奖励</view>
      <view v-for="item in rewards" :key="item.title" class="reward-row">
        <view class="reward-icon"></view>
        <view>{{ item.title }}</view>
        <text>+{{ item.points }} 积分</text>
      </view>
    </view>

    <view class="primary-action" @tap="inviteFriend">去邀请好友</view>
    <view class="invite-count">已成功邀请 {{ invited }} 位好友</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getInviteCode, getInviteRecords, getInviteSummary } from '@/api/invite';
const code = ref('AI2026');
const invited = ref(0);
const shareTitle = ref('邀请你一起使用 AI 创作工坊');
const sharePath = ref('');
const rewards = [
  { title: '好友首次注册成功', points: 200 },
  { title: '好友开通会员', points: 500 },
  { title: '好友每日活跃奖励', points: 50 }
];

onShow(() => {
  loadInvite();
});

function loadInvite() {
  getInviteCode<Record<string, unknown>>()
    .then((res) => {
      code.value = String(res.inviteCode || '');
      shareTitle.value = String(res.shareTitle || shareTitle.value);
      sharePath.value = String(res.sharePath || '');
    })
    .catch(() => { code.value = ''; });
  getInviteSummary<Record<string, unknown>>()
    .then((res) => {
      invited.value = Number(res.inviteCount || res.invitedCount || 0);
    })
    .catch(() => { invited.value = 0; });
  getInviteRecords({ page: 1, pageSize: 1 }).catch(() => undefined);
}

function copyCode() {
  if (!code.value) {
    uni.showToast({ title: '请登录后获取邀请码', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: code.value,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'none' })
  });
}

function inviteFriend() {
  const content = sharePath.value ? `${shareTitle.value}\n${sharePath.value}` : code.value;
  uni.setClipboardData({
    data: content,
    success: () => uni.showToast({ title: '邀请信息已复制', icon: 'none' })
  });
}
</script>

<style scoped lang="scss">
.invite-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-right: 32rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  padding-left: 32rpx;
  background:
    radial-gradient(circle at 18% 10%, rgba(122, 92, 255, 0.14), transparent 28%),
    radial-gradient(circle at 82% 12%, rgba(255, 122, 203, 0.16), transparent 26%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.friends-hero {
  position: relative;
  height: 320rpx;
}

.friend {
  position: absolute;
  bottom: 40rpx;
  width: 126rpx;
  height: 214rpx;
}

.friend.boy {
  left: 184rpx;
}

.friend.girl {
  right: 150rpx;
}

.head {
  position: absolute;
  left: 50%;
  top: 18rpx;
  width: 82rpx;
  height: 82rpx;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffe5d9, #ffc3bd);
  transform: translateX(-50%);
  box-shadow: inset 0 12rpx 0 rgba(78, 40, 52, 0.85);
}

.head::before,
.head::after {
  position: absolute;
  top: 42rpx;
  width: 10rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #30203a;
  content: "";
}

.head::before { left: 24rpx; }
.head::after { right: 24rpx; }

.body {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 112rpx;
  height: 126rpx;
  border-radius: 48rpx 48rpx 22rpx 22rpx;
  transform: translateX(-50%);
}

.boy .body {
  background: linear-gradient(180deg, #bba5ff, #7a5cff);
}

.girl .head {
  box-shadow: inset 0 12rpx 0 rgba(112, 51, 77, 0.85);
}

.girl .body {
  background: linear-gradient(180deg, #ffbfdc, #ff7acb);
}

.gift {
  position: absolute;
  right: 104rpx;
  bottom: 28rpx;
  width: 70rpx;
  height: 70rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #ffc857, #ffc857);
  transform: rotate(-8deg);
}

.gift::before {
  position: absolute;
  left: 50%;
  top: 0;
  width: 14rpx;
  height: 70rpx;
  background: #ffffff;
  content: "";
  opacity: 0.72;
  transform: translateX(-50%);
}

.star {
  position: absolute;
  border-radius: 50%;
  background: #ffc857;
}

.s1 {
  left: 94rpx;
  top: 74rpx;
  width: 24rpx;
  height: 24rpx;
}

.s2 {
  right: 86rpx;
  top: 46rpx;
  width: 18rpx;
  height: 18rpx;
  background: #ff7acb;
}

.invite-title,
.invite-subtitle {
  text-align: center;
}

.invite-title {
  color: #252941;
  font-size: 32rpx;
  font-weight: 900;
}

.invite-subtitle {
  margin-top: 12rpx;
  color: #677095;
  font-size: 25rpx;
  font-weight: 800;
}

.code-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin: 42rpx 0 34rpx;
  padding: 28rpx 30rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
  backdrop-filter: blur(16rpx);
}

.code-label {
  color: #a0a7bd;
  font-size: 22rpx;
  font-weight: 800;
}

.invite-code {
  margin-top: 12rpx;
  color: #252941;
  font-size: 46rpx;
  font-weight: 900;
  letter-spacing: 1rpx;
}

.copy-btn,
.primary-action {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #7a5cff, #6d55f0);
  color: #ffffff;
  font-weight: 900;
}

.copy-btn {
  width: 112rpx;
  height: 64rpx;
  border-radius: 32rpx;
  font-size: 24rpx;
}

.panel {
  padding: 24rpx 28rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 92% 8%, rgba(255, 200, 87, 0.18), transparent 22%),
    rgba(255, 255, 255, 0.94);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
  backdrop-filter: blur(16rpx);
}

.panel-title {
  margin-bottom: 16rpx;
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
}

.reward-row {
  display: flex;
  align-items: center;
  min-height: 80rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.1);
  color: #414765;
  font-size: 24rpx;
  font-weight: 900;
}

.reward-row:last-child {
  border-bottom: 0;
}

.reward-icon {
  flex-shrink: 0;
  width: 34rpx;
  height: 34rpx;
  margin-right: 18rpx;
  border-radius: 10rpx;
  background: linear-gradient(135deg, #7a5cff, #ff7acb);
}

.reward-row text {
  margin-left: auto;
  color: #ffc857;
  font-size: 23rpx;
  font-weight: 900;
}

.primary-action {
  height: 86rpx;
  margin-top: 44rpx;
  border-radius: 43rpx;
  font-size: 29rpx;
  box-shadow: 0 18rpx 34rpx rgba(122, 92, 255, 0.28);
}

.invite-count {
  margin-top: 18rpx;
  color: #9aa1b8;
  font-size: 23rpx;
  font-weight: 800;
  text-align: center;
}
</style>
