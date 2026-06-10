<template>
  <view class="flow-page login-page">
    <view class="login-panel">
      <view class="login-logo">AI</view>
      <view class="login-title">登录 AI创作工坊</view>
      <view class="login-desc">同步积分、会员、历史作品和生成任务</view>
      <button class="primary-btn" @tap="wechatLogin">微信一键登录</button>
      <button v-if="showDevLogin" class="ghost-btn dev-btn" @tap="devLoginAction">开发环境登录</button>
      <button class="link-btn" @tap="goAgreement">查看用户协议和隐私政策</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useAuthStore } from '@/stores/auth';
import { PAGE_ROUTES } from '@/utils/constants';
import { isDevFallbackEnabled } from '@/utils/dev-fallback';

const auth = useAuthStore();
const redirect = ref<string>(PAGE_ROUTES.home);
const inviteCode = ref('');
const showDevLogin = isDevFallbackEnabled;

onLoad((query) => {
  redirect.value = query?.redirect ? decodeURIComponent(String(query.redirect)) : PAGE_ROUTES.home;
  inviteCode.value = resolveInviteCode(query);
});

async function wechatLogin() {
  try {
    await auth.loginWithWechat(inviteCode.value || undefined);
    finish();
  } catch (error) {
    uni.showToast({ title: loginErrorText(error), icon: 'none' });
  }
}

async function devLoginAction() {
  try {
    await auth.loginWithDev(inviteCode.value || undefined);
    finish();
  } catch (error) {
    uni.showToast({ title: loginErrorText(error, '开发登录未启用，请检查后端配置'), icon: 'none' });
  }
}

function finish() {
  uni.reLaunch({ url: redirect.value || PAGE_ROUTES.home });
}

function goAgreement() {
  uni.navigateTo({ url: PAGE_ROUTES.agreement });
}

function loginErrorText(error: unknown, fallback?: string) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (message) return message.slice(0, 60);
  return fallback || (showDevLogin ? '微信登录失败，可尝试开发环境登录' : '微信登录失败，请稍后重试');
}

function resolveInviteCode(query?: Record<string, unknown>) {
  const direct = String(query?.inviteCode || query?.invite_code || '').trim();
  if (direct) return direct;
  const scene = String(query?.scene || '').trim();
  if (!scene) return '';
  const decoded = decodeURIComponent(scene);
  const matched = decoded.match(/(?:^|[?&])inviteCode=([^&]+)/i);
  return matched ? decodeURIComponent(matched[1]) : decoded;
}
</script>

<style scoped lang="scss">
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80rpx 38rpx;
}

.login-panel {
  width: 100%;
  padding: 48rpx 34rpx;
  border: 1rpx solid rgba(49, 67, 94, 0.1);
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24rpx 64rpx rgba(35, 45, 72, 0.14);
}

.login-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112rpx;
  height: 112rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #172033, #7258ff);
  color: #fff;
  font-size: 34rpx;
  font-weight: 900;
}

.login-title {
  margin-top: 30rpx;
  color: #172033;
  font-size: 44rpx;
  font-weight: 900;
}

.login-desc {
  margin: 14rpx 0 36rpx;
  color: #596274;
  font-size: 26rpx;
  line-height: 1.5;
}

.dev-btn {
  margin-top: 18rpx;
}

.link-btn {
  margin-top: 28rpx;
  color: #6d7688;
  font-size: 24rpx;
  text-align: center;
}
</style>
