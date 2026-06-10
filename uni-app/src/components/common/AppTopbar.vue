<template>
  <view class="topbar-shell" :class="[`topbar-shell--${tone}`, { 'topbar-shell--transparent': transparent }]">
    <view v-if="!spacerOnly" class="topbar" :style="barStyle">
      <view class="topbar-row" :style="rowStyle">
        <slot name="left">
          <button v-if="back" class="topbar-btn" :style="actionStyle" @tap="goBack" aria-label="返回">
            <text class="chevron"></text>
          </button>
          <view v-else class="topbar-brand" :style="actionStyle">{{ brand }}</view>
        </slot>
        <view class="topbar-title">{{ title }}</view>
        <slot name="right">
          <view class="topbar-space" :style="actionStyle"></view>
        </slot>
      </view>
    </view>
    <view class="topbar-spacer" :style="spacerStyle"></view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PAGE_ROUTES } from '@/utils/constants';

type MenuRect = {
  top: number;
  right?: number;
  bottom?: number;
  left: number;
  width?: number;
  height: number;
};

const props = withDefaults(defineProps<{
  title?: string;
  brand?: string;
  back?: boolean;
  tone?: 'light' | 'dark';
  transparent?: boolean;
  spacerOnly?: boolean;
}>(), {
  title: '',
  brand: 'AI',
  back: false,
  tone: 'light',
  transparent: false,
  spacerOnly: false
});

const statusBarHeight = ref(24);
const navHeight = ref(44);
const leftPadding = ref(12);
const rightPadding = ref(96);
const actionSize = ref(32);

try {
  const info = uni.getSystemInfoSync();
  const windowWidth = info.windowWidth || 375;
  statusBarHeight.value = info.statusBarHeight || 24;
  const menu = (uni as unknown as { getMenuButtonBoundingClientRect?: () => MenuRect }).getMenuButtonBoundingClientRect?.();
  if (menu?.top && menu.height) {
    const topGap = Math.max(4, menu.top - statusBarHeight.value);
    navHeight.value = menu.height + topGap * 2;
    actionSize.value = menu.height;
    leftPadding.value = Math.max(12, windowWidth - (menu.right || windowWidth) + 8);
    rightPadding.value = Math.max(88, windowWidth - menu.left + 8);
  }
} catch {
  statusBarHeight.value = 24;
}

const tone = computed(() => props.tone);
const transparent = computed(() => props.transparent);
const spacerOnly = computed(() => props.spacerOnly);
const barStyle = computed(() => [
  `height:${statusBarHeight.value + navHeight.value}px`,
  `padding-top:${statusBarHeight.value}px`
].join(';'));
const rowStyle = computed(() => [
  `height:${navHeight.value}px`,
  `padding-left:${leftPadding.value}px`,
  `padding-right:${rightPadding.value}px`
].join(';'));
const spacerStyle = computed(() => `height:calc(${statusBarHeight.value + navHeight.value}px + 16rpx)`);
const actionStyle = computed(() => [
  `width:${actionSize.value}px`,
  `height:${actionSize.value}px`,
  `border-radius:${Math.max(12, actionSize.value / 2)}px`
].join(';'));

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: PAGE_ROUTES.home });
  }
}
</script>

<style scoped lang="scss">
.topbar-shell {
  width: 100%;
}

.topbar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 80;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18rpx);
}

.topbar-shell--transparent .topbar {
  background: linear-gradient(180deg, rgba(248, 246, 255, 0.94), rgba(248, 246, 255, 0.58) 66%, rgba(248, 246, 255, 0));
  backdrop-filter: none;
}

.topbar-shell--transparent.topbar-shell--dark .topbar {
  background: linear-gradient(180deg, rgba(24, 17, 68, 0.46), rgba(24, 17, 68, 0.18) 68%, rgba(24, 17, 68, 0));
}

.topbar-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  overflow: hidden;
}

.topbar-brand,
.topbar-space,
.topbar-btn {
  flex: 0 0 auto;
}

.topbar-brand,
.topbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.76);
  color: #7258ff;
  font-size: 24rpx;
  font-weight: 900;
  box-shadow: inset 0 0 0 1rpx rgba(114, 88, 255, 0.12);
}

.topbar-shell--dark .topbar-brand,
.topbar-shell--dark .topbar-btn {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.16);
}

.topbar-title {
  position: absolute;
  left: 50%;
  flex: 0 0 auto;
  min-width: 0;
  width: 360rpx;
  overflow: hidden;
  color: #172033;
  font-size: 32rpx;
  font-weight: 900;
  text-align: center;
  text-overflow: ellipsis;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}

.topbar-shell--dark .topbar-title {
  color: #fff;
  text-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.28);
}

.chevron {
  width: 24rpx;
  height: 24rpx;
  border-bottom: 5rpx solid #172033;
  border-left: 5rpx solid #172033;
  transform: rotate(45deg);
}

.topbar-shell--dark .chevron {
  border-color: #fff;
}
</style>
