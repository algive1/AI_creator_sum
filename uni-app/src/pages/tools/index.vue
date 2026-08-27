<template>
  <view class="tools-page">
    <AppTopbar class="app-nav-root" title="工具" back transparent />

    <view class="tool-strip">
      <view class="tool-strip-title">工具箱</view>
      <view class="tool-strip-sub">图片处理、素材工具和游戏换算</view>
    </view>

    <view v-if="!toolsEnabled" class="disabled-panel">
      <view class="disabled-title">工具功能维护中</view>
      <view class="disabled-text">后台关闭了工具箱入口，请稍后再试。</view>
    </view>

    <view v-else class="tool-grid">
      <button
        v-for="item in displayItems"
        :key="item.key"
        class="tool-card"
        :class="{ 'obs-tool-card': item.type === 'aionObs' }"
        @tap="openDisplayItem(item)"
      >
        <template v-if="item.type === 'aionObs'">
          <view class="tool-icon obs-tool-icon">
            <image class="tool-icon-image" :src="obsToolIconUrl" mode="aspectFit" />
          </view>
          <view class="tool-copy">
            <view class="tool-title">OBS遗物计算器</view>
            <view class="tool-desc">永恒之塔遗物、装备与勋章换算</view>
          </view>
        </template>
        <template v-else>
          <view class="tool-icon">
            <image class="tool-icon-image" :src="toolIconUrl(item.tool.icon)" mode="aspectFit" />
          </view>
          <view class="tool-copy">
            <view class="tool-title">{{ item.tool.title }}</view>
            <view class="tool-desc">{{ item.tool.description }}</view>
          </view>
        </template>
      </button>
    </view>

    <view v-if="toolsEnabled && !tools.length" class="empty-panel tools-empty-hint">
      <view class="empty-title">暂无可用工具</view>
      <view class="empty-text">图片处理工具暂未启用，OBS 计算器仍可使用。</view>
    </view>

    <AppDialogHost />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import { getToolsConfig, type ToolItem } from '@/api/tools';
import { useAuthStore } from '@/stores/auth';
import { PAGE_ROUTES } from '@/utils/constants';
import { createShareMessage, createShareTimeline, enableShareMenu } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';
import { buildToolDisplayItems, type ToolDisplayItem } from './tool-display-order';

const auth = useAuthStore();
const TOOL_ICON_BASE = '/static/icons/tools';
const toolsEnabled = ref(true);
const tools = ref<ToolItem[]>([]);
const obsToolIconUrl = `${TOOL_ICON_BASE}/tool-aion-obs.svg`;
const displayItems = computed(() => buildToolDisplayItems(tools.value));

onShow(async () => {
  enableShareMenu();
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' });
    const loggedIn = await ensureLoggedIn({
      title: '登录后使用工具',
      subtitle: '登录并授权手机号后，可使用图片处理工具。'
    });
    if (!loggedIn) return;
  }
  loadTools();
});

onShareAppMessage(() => createShareMessage({
  title: 'AI 创作工具箱，图片处理更省事',
  path: PAGE_ROUTES.tools
}));

onShareTimeline(() => createShareTimeline({
  title: 'AI 创作工具箱，图片处理更省事',
  path: PAGE_ROUTES.tools
}));

async function loadTools() {
  try {
    const config = await getToolsConfig();
    toolsEnabled.value = config.enabled;
    tools.value = config.tools || [];
  } catch {
    uni.showToast({ title: '工具配置加载失败', icon: 'none' });
  }
}

function openTool(tool: ToolItem) {
  uni.navigateTo({ url: `${PAGE_ROUTES.toolRun}?key=${tool.key}` });
}

function openDisplayItem(item: ToolDisplayItem<ToolItem>) {
  if (item.type === 'aionObs') {
    openAionObsCalculator();
    return;
  }
  openTool(item.tool);
}

function openAionObsCalculator() {
  uni.navigateTo({ url: PAGE_ROUTES.aionObsCalculator });
}

function toolIconUrl(icon: string) {
  const safeIcon = String(icon || 'grid').replace(/[^a-z0-9_-]/gi, '');
  return `${TOOL_ICON_BASE}/tool-${safeIcon}.svg`;
}
</script>

<style scoped lang="scss">
.tools-page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(170rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 18% 4%, rgba(114, 88, 255, 0.14), transparent 28%),
    radial-gradient(circle at 86% 0%, rgba(67, 184, 154, 0.14), transparent 24%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 72%);
}

.tool-strip {
  margin-top: 12rpx;
  padding: 26rpx 28rpx;
  border: 1rpx solid rgba(114, 88, 255, 0.12);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 20rpx 44rpx rgba(42, 46, 70, 0.08);
  text-align: center;
}

.tool-strip-title {
  color: #1e2438;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.2;
}

.tool-strip-sub {
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.35;
}

.disabled-panel {
  margin-top: 22rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.14);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.9);
  text-align: center;
}

.disabled-title {
  color: #1e2438;
  font-size: 30rpx;
  font-weight: 900;
}

.disabled-text {
  margin-top: 6rpx;
  color: #7c8297;
  font-size: 22rpx;
  line-height: 1.45;
}

.empty-panel {
  margin-top: 22rpx;
  padding: 34rpx 28rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.14);
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16rpx 34rpx rgba(40, 44, 70, 0.06);
  text-align: center;
}

.empty-title {
  color: #1e2438;
  font-size: 30rpx;
  font-weight: 900;
}

.empty-text {
  margin-top: 8rpx;
  color: #7c8297;
  font-size: 23rpx;
  line-height: 1.45;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 22rpx;
}

.tool-card {
  display: flex;
  min-height: 166rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 22rpx 18rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.14);
  border-radius: 18rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 34rpx rgba(40, 44, 70, 0.06);
  text-align: center;
}

.tool-card:active {
  border-color: rgba(114, 88, 255, 0.42);
  background: linear-gradient(135deg, rgba(114, 88, 255, 0.08), #ffffff 62%);
}

.tool-icon {
  display: flex;
  width: 56rpx;
  height: 56rpx;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
  border-radius: 16rpx;
  background: rgba(114, 88, 255, 0.08);
}

.tool-icon-image {
  width: 36rpx;
  height: 36rpx;
}

.obs-tool-card:active {
  border-color: rgba(35, 183, 217, 0.44);
  background: linear-gradient(135deg, rgba(35, 183, 217, 0.1), #ffffff 62%);
}

.obs-tool-icon {
  background: rgba(114, 88, 255, 0.08);
}

.tools-empty-hint {
  margin-top: 18rpx;
}

.tool-copy {
  min-width: 0;
  width: 100%;
}

.tool-title {
  color: #1f2437;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.25;
  text-align: center;
}

.tool-desc {
  margin-top: 7rpx;
  color: #83889c;
  font-size: 21rpx;
  line-height: 1.35;
  text-align: center;
}
</style>
