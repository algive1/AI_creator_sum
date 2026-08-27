<template>
  <view class="member-info-page">
    <view class="content">
      <view class="section-title">我的会员信息 ✨</view>

      <view class="member-card" :class="memberView.theme">
        <view class="member-card-head">
          <image class="level-icon" :src="memberView.icon" mode="aspectFit" />
          <view class="member-copy">
            <view class="member-title">{{ memberView.title }}</view>
            <view class="member-start">{{ memberView.startedText || (memberView.isMember ? '已开通' : '当前未开通会员') }}</view>
          </view>
          <view v-if="memberView.remainingText" class="remaining-pill">{{ memberView.remainingText }}</view>
        </view>

        <view v-if="memberView.isMember" class="benefit-row">
          <view v-for="item in benefitItems" :key="item.label" class="benefit-item">
            <image :src="item.icon" mode="aspectFit" />
            <text>{{ item.label }}</text>
          </view>
        </view>
        <view v-else-if="purchaseUiEnabled" class="free-copy">开通会员后可获得高清画质、优先处理、专属素材等创作权益。</view>
      </view>

      <view class="detail-panel">
        <view class="detail-row">
          <text>会员类型</text>
          <text>{{ memberView.title }}</text>
        </view>
        <view class="detail-row">
          <text>到期时间</text>
          <text>{{ memberView.expireText }}</text>
        </view>
        <view class="detail-row">
          <text>开通时间</text>
          <text>{{ memberView.startedText || '-' }}</text>
        </view>
        <view v-if="purchaseUiEnabled" class="detail-row">
          <text>支付方式</text>
          <text>{{ memberView.isMember ? '微信支付' : '-' }}</text>
        </view>
        <button v-if="purchaseUiEnabled" class="manage-btn" @tap="goMember">{{ memberView.isMember ? '管理会员' : '开通会员' }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES } from '@/utils/constants';
import { getMemberView } from '@/utils/member';
import { useConfigStore } from '@/stores/config';
import { canRenderPurchaseUi, isPurchaseEnabled, showPurchaseUnavailable } from '@/utils/purchase-guard';

const auth = useAuthStore();
const userStore = useUserStore();
const configStore = useConfigStore();

const memberView = computed(() => getMemberView(userStore.membership));
const purchaseEnabled = computed(() => isPurchaseEnabled(configStore.publicConfig));
const purchaseUiEnabled = computed(() => canRenderPurchaseUi(configStore.publicConfigReady, configStore.publicConfig));
const benefitItems = computed(() => {
  const rights = Array.isArray(userStore.membership?.rights) ? userStore.membership?.rights as Array<Record<string, unknown>> : [];
  const labels = rights.map((item) => String(item.rightName || item.right_name || '')).filter(Boolean).slice(0, 6);
  const fallback = ['高清画质', '无限创作', 'AI特效', '专属素材', '优先处理', '去水印'];
  return (labels.length ? labels : fallback).slice(0, 6).map((label) => ({
    label,
    icon: benefitIconOf(label)
  }));
});

onShow(() => {
  uni.setNavigationBarTitle({ title: '我的会员信息' });
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  if (auth.isLoggedIn) userStore.loadFullProfile().catch(() => undefined);
});

function benefitIconOf(label: string) {
  if (/画质|清晰|HD/i.test(label)) return '/static/icons/benefit_hd_quality.svg';
  if (/视频/i.test(label)) return '/static/icons/benefit_ai_video.svg';
  if (/漫画|漫剧/i.test(label)) return '/static/icons/benefit_ai_comic.svg';
  if (/素材|模型|库/i.test(label)) return '/static/icons/benefit_materials.svg';
  if (/优先|队列|处理/i.test(label)) return '/static/icons/benefit_priority.svg';
  if (/水印/i.test(label)) return '/static/icons/benefit_remove_watermark.svg';
  return '/static/icons/benefit_priority.svg';
}

function goMember() {
  if (!purchaseEnabled.value) {
    showPurchaseUnavailable(configStore.publicConfig);
    return;
  }
  uni.navigateTo({ url: PAGE_ROUTES.member });
}
</script>

<style scoped lang="scss">
.member-info-page {
  min-height: 100vh;
  padding: 28rpx 24rpx calc(44rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 12% 4%, rgba(122, 92, 255, 0.12), transparent 28%),
    radial-gradient(circle at 88% 8%, rgba(255, 122, 203, 0.12), transparent 26%),
    linear-gradient(180deg, #f8f6ff 0%, #ffffff 54%, #f7f4ff 100%);
  box-sizing: border-box;
}

.content {
  position: relative;
}

.section-title {
  margin: 6rpx 4rpx 24rpx;
  color: #1f2437;
  font-size: 32rpx;
  font-weight: 900;
}

.member-card {
  position: relative;
  overflow: hidden;
  min-height: 250rpx;
  padding: 32rpx 30rpx 24rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 78% 30%, rgba(255, 255, 255, 0.28), transparent 26%),
    linear-gradient(135deg, #5b28db 0%, #7a4dff 58%, #b36bff 100%);
  color: #ffffff;
  box-shadow: 0 20rpx 42rpx rgba(108, 75, 255, 0.2);
}

.member-card.free {
  background: linear-gradient(135deg, #eef2f9, #ffffff);
  color: #1f2437;
}

.member-card.standard {
  background: linear-gradient(135deg, #6c4bff 0%, #8d6bff 62%, #b9a8ff 100%);
}

.member-card.forever {
  background: linear-gradient(135deg, #5a28d8 0%, #8f49ff 48%, #ff5cb8 100%);
}

.member-card-head {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.level-icon {
  flex-shrink: 0;
  width: 88rpx;
  height: 88rpx;
}

.member-copy {
  flex: 1;
  min-width: 0;
}

.member-title {
  overflow: hidden;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-start {
  margin-top: 14rpx;
  color: rgba(255, 255, 255, 0.84);
  font-size: 24rpx;
  font-weight: 700;
}

.free .member-start {
  color: #747b96;
}

.remaining-pill {
  flex-shrink: 0;
  height: 44rpx;
  padding: 0 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.54);
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 44rpx;
}

.benefit-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 34rpx;
}

.benefit-item {
  min-width: 0;
  text-align: center;
}

.benefit-item image {
  width: 52rpx;
  height: 52rpx;
}

.benefit-item text {
  display: block;
  overflow: hidden;
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.86);
  font-size: 20rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.free-copy {
  margin-top: 34rpx;
  color: #6b7290;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 1.6;
}

.detail-panel {
  margin-top: 0;
  padding: 18rpx 28rpx 30rpx;
  border-radius: 0 0 28rpx 28rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16rpx 34rpx rgba(31, 36, 55, 0.08);
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.12);
  color: #8086a4;
  font-size: 26rpx;
  font-weight: 700;
}

.detail-row text:last-child {
  max-width: 420rpx;
  overflow: hidden;
  color: #596080;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manage-btn {
  height: 76rpx;
  margin-top: 30rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #6c4bff, #ff5cb8);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 76rpx;
  box-shadow: 0 14rpx 28rpx rgba(108, 75, 255, 0.22);
}
</style>
