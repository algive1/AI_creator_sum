<template>
  <view v-if="visible && src" class="protected-viewer">
    <view class="viewer-head">
      <button class="viewer-close" @tap.stop="$emit('close')">×</button>
      <view class="viewer-title">{{ title || '图片预览' }}</view>
    </view>
    <view
      class="viewer-stage"
      @tap.stop="onStageTap"
      @touchstart.stop="onTouchStart"
      @touchmove.stop.prevent="onTouchMove"
      @touchend.stop="onTouchEnd"
      @touchcancel.stop="onTouchEnd"
    >
      <image
        class="viewer-image"
        :src="src"
        mode="aspectFit"
        :show-menu-by-longpress="false"
        :style="imageStyle"
        @error="onImageError"
      />
    </view>
    <view class="viewer-foot">
      <text v-if="ratioLabel">原图比例 {{ ratioLabel }}</text>
      <text v-else>原图比例识别中</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { enableSensitiveCaptureProtection } from '@/utils/capture-protection';

const props = defineProps<{
  visible: boolean;
  src: string;
  title?: string;
}>();

defineEmits<{
  close: [];
}>();

const imageWidth = ref(0);
const imageHeight = ref(0);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);

let startX = 0;
let startY = 0;
let startTranslateX = 0;
let startTranslateY = 0;
let startScale = 1;
let startDistance = 0;
let moved = false;
let lastTapAt = 0;
let stopCaptureProtection: (() => void) | null = null;

const imageStyle = computed(() => {
  return `transform: translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value});`;
});

const ratioLabel = computed(() => {
  if (!imageWidth.value || !imageHeight.value) return '';
  const divisor = greatestCommonDivisor(imageWidth.value, imageHeight.value);
  return `${Math.round(imageWidth.value / divisor)}:${Math.round(imageHeight.value / divisor)}`;
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      startCaptureProtection();
      return;
    }
    resetTransform();
    stopCaptureProtection?.();
    stopCaptureProtection = null;
  },
  { immediate: true }
);

watch(
  () => [props.visible, props.src],
  ([visible, src]) => {
    if (!visible || !src) return;
    resetTransform();
    loadImageInfo(String(src));
  },
  { immediate: true }
);

onUnmounted(() => {
  stopCaptureProtection?.();
  stopCaptureProtection = null;
});

function startCaptureProtection() {
  if (stopCaptureProtection) return;
  stopCaptureProtection = enableSensitiveCaptureProtection();
}

function loadImageInfo(src: string) {
  imageWidth.value = 0;
  imageHeight.value = 0;
  uni.getImageInfo({
    src,
    success: (res) => {
      imageWidth.value = Number(res.width || 0);
      imageHeight.value = Number(res.height || 0);
    },
    fail: () => undefined
  });
}

function onTouchStart(event: any) {
  const touches = Array.from(event.touches || []) as Array<{ clientX: number; clientY: number }>;
  moved = false;
  if (touches.length >= 2) {
    startDistance = distanceBetween(touches[0], touches[1]);
    startScale = scale.value;
    return;
  }
  if (!touches.length) return;
  startX = touches[0].clientX;
  startY = touches[0].clientY;
  startTranslateX = translateX.value;
  startTranslateY = translateY.value;
}

function onTouchMove(event: any) {
  const touches = Array.from(event.touches || []) as Array<{ clientX: number; clientY: number }>;
  if (touches.length >= 2 && startDistance > 0) {
    const nextDistance = distanceBetween(touches[0], touches[1]);
    scale.value = clamp(startScale * (nextDistance / startDistance), 1, 4);
    moved = true;
    return;
  }
  if (touches.length !== 1 || scale.value <= 1) return;
  translateX.value = startTranslateX + touches[0].clientX - startX;
  translateY.value = startTranslateY + touches[0].clientY - startY;
  moved = true;
}

function onTouchEnd() {
  if (scale.value <= 1.02) {
    resetTransform();
  }
}

function onStageTap() {
  if (moved) {
    moved = false;
    return;
  }
  const now = Date.now();
  if (now - lastTapAt < 280) {
    if (scale.value > 1) {
      resetTransform();
    } else {
      scale.value = 2;
      translateX.value = 0;
      translateY.value = 0;
    }
    lastTapAt = 0;
    return;
  }
  lastTapAt = now;
}

function resetTransform() {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
}

function distanceBetween(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function onImageError() {
  uni.showToast({ title: '图片加载失败', icon: 'none' });
}
</script>

<style scoped lang="scss">
.protected-viewer {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  flex-direction: column;
  background: #080b14;
  color: #ffffff;
}

.viewer-head {
  position: relative;
  flex-shrink: 0;
  min-height: 104rpx;
  padding: calc(18rpx + env(safe-area-inset-top)) 96rpx 18rpx;
  box-sizing: border-box;
}

.viewer-close {
  position: absolute;
  left: 24rpx;
  bottom: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 40rpx;
  font-weight: 300;
  line-height: 58rpx;
}

.viewer-title {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.92);
  font-size: 27rpx;
  font-weight: 800;
  line-height: 58rpx;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-stage {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-image {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: center center;
  transition: transform 0.12s ease-out;
  will-change: transform;
}

.viewer-foot {
  flex-shrink: 0;
  min-height: calc(84rpx + env(safe-area-inset-bottom));
  padding: 18rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  color: rgba(255, 255, 255, 0.72);
  font-size: 23rpx;
  font-weight: 700;
  text-align: center;
}
</style>
