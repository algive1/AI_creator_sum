<template>
  <view
    v-if="dialog"
    class="app-action-modal-overlay"
    @tap="handleMaskTap"
    @touchmove.stop.prevent="noop"
  >
    <view
      class="app-action-modal-card"
      :class="[`variant-${dialog.variant || 'generic'}`, { 'no-visual': !showModalVisual }]"
      @tap.stop
    >
      <button v-if="dialog.closable !== false" class="modal-close" @tap="handleClose">×</button>

      <view v-if="showModalVisual" class="modal-visual" :class="`visual-${dialog.variant || 'generic'}`">
        <image v-if="dialog.image" class="modal-visual-image" :src="dialog.image" mode="aspectFit" />
        <image v-else-if="dialog.variant === 'saveHd'" class="modal-visual-image" src="/static/visuals/dialog/benefit-hd-save.png" mode="aspectFit" />
        <view v-else class="modal-symbol">{{ symbolText }}</view>
      </view>

      <view class="modal-title">{{ dialog.title }}</view>
      <view v-if="dialog.subtitle" class="modal-subtitle">{{ dialog.subtitle }}</view>

      <scroll-view
        v-if="dialog.richContent || dialog.content"
        scroll-y
        class="modal-content-scroll"
        :class="{ 'agreement-content-scroll': dialog.variant === 'agreement' }"
      >
        <rich-text v-if="dialog.richContent" class="modal-rich-text" :nodes="dialog.richContent" />
        <view v-else class="modal-content-text">{{ dialog.content }}</view>
      </scroll-view>

      <view v-if="dialog.benefits?.length" class="modal-benefits" :class="{ compact: dialog.benefits.length >= 3 }">
        <view v-for="item in dialog.benefits" :key="item.label" class="modal-benefit">
          <image v-if="item.image" class="benefit-image" :src="item.image" mode="aspectFit" />
          <view v-else class="benefit-icon">
            <text v-if="item.icon">{{ item.icon }}</text>
            <text v-else class="benefit-icon-dot"></text>
          </view>
          <view class="benefit-label">{{ item.label }}</view>
          <view v-if="item.sub" class="benefit-sub">{{ item.sub }}</view>
        </view>
      </view>

      <view class="modal-actions">
        <button
          v-if="dialog.primaryOpenType === 'getPhoneNumber'"
          class="modal-primary"
          open-type="getPhoneNumber"
          :loading="busy"
          @getphonenumber="handleGetPhoneNumber"
        >
          {{ dialog.primaryLabel || '确认' }}
        </button>
        <button v-else class="modal-primary" :loading="busy" @tap="handlePrimary">
          {{ dialog.primaryLabel || '确认' }}
        </button>

        <button v-if="dialog.secondaryLabel" class="modal-secondary" :disabled="busy" @tap="handleSecondary">
          {{ dialog.secondaryLabel }}
        </button>
        <button v-if="dialog.minorLabel" class="modal-minor" :disabled="busy" @tap="handleMinor">
          {{ dialog.minorLabel }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { appDialogState, closeCurrentAppDialog } from '@/utils/app-dialog';

const busy = ref(false);
const dialog = computed(() => appDialogState.current);
const showModalVisual = computed(() => dialog.value?.hideVisual !== true);
const symbolText = computed(() => {
  if (dialog.value?.variant === 'agreement') return '✓';
  if (dialog.value?.variant === 'announcement') return '!';
  if (dialog.value?.variant === 'phone') return '☎';
  return 'AI';
});

function noop() {}

function handleMaskTap() {
  const current = dialog.value;
  if (!current || current.maskClosable === false || current.closable === false) return;
  closeCurrentAppDialog('mask');
}

function handleClose() {
  closeCurrentAppDialog('close');
}

async function handlePrimary() {
  await runAction('primary');
}

async function handleSecondary() {
  await runAction('secondary');
}

async function handleMinor() {
  await runAction('minor');
}

async function handleGetPhoneNumber(event: unknown) {
  const current = dialog.value;
  if (!current || busy.value) return;
  busy.value = true;
  try {
    const result = await current.onGetPhoneNumber?.(event);
    if (result !== false) closeCurrentAppDialog('phone');
  } finally {
    busy.value = false;
  }
}

async function runAction(result: 'primary' | 'secondary' | 'minor') {
  const current = dialog.value;
  if (!current || busy.value) return;
  busy.value = true;
  try {
    const handler = result === 'primary'
      ? current.onPrimary
      : result === 'secondary'
        ? current.onSecondary
        : current.onMinor;
    const shouldContinue = await handler?.();
    const closeKey = result === 'primary'
      ? current.closeOnPrimary
      : result === 'secondary'
        ? current.closeOnSecondary
        : current.closeOnMinor;
    if (shouldContinue !== false && closeKey !== false) closeCurrentAppDialog(result);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.app-action-modal-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: calc(44rpx + env(safe-area-inset-top)) 28rpx calc(44rpx + env(safe-area-inset-bottom));
  background: rgba(23, 20, 37, 0.58);
}

.app-action-modal-card {
  position: relative;
  width: 642rpx;
  max-width: 100%;
  max-height: 82vh;
  padding: 110rpx 34rpx 30rpx;
  border-radius: 32rpx;
  background:
    radial-gradient(circle at 18% 10%, rgba(168, 245, 194, 0.22), transparent 30%),
    radial-gradient(circle at 86% 0%, rgba(255, 224, 138, 0.24), transparent 24%),
    linear-gradient(180deg, #ffffff 0%, #fbfff9 100%);
  box-sizing: border-box;
  box-shadow: 0 26rpx 60rpx rgba(19, 45, 30, 0.24);
}

.app-action-modal-card.no-visual {
  padding-top: 56rpx;
}

.modal-close {
  position: absolute;
  right: 20rpx;
  top: 20rpx;
  z-index: 2;
  width: 58rpx;
  height: 58rpx;
  padding: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #3c4050;
  font-size: 36rpx;
  font-weight: 500;
  line-height: 58rpx;
  box-shadow: 0 8rpx 18rpx rgba(20, 28, 40, 0.14);
}

.modal-close::after,
.modal-primary::after,
.modal-secondary::after,
.modal-minor::after {
  display: none;
}

.modal-visual {
  position: absolute;
  left: 50%;
  top: -12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 178rpx;
  height: 142rpx;
  transform: translateX(-50%);
}

.modal-visual-image {
  width: 100%;
  height: 100%;
}

.modal-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 118rpx;
  height: 118rpx;
  border-radius: 34rpx;
  background: linear-gradient(135deg, #67e282, #27bd52);
  color: #ffffff;
  font-size: 52rpx;
  font-weight: 1000;
  box-shadow: inset 0 -10rpx 18rpx rgba(11, 103, 34, 0.24), 0 14rpx 26rpx rgba(67, 209, 122, 0.32);
}

.variant-agreement .modal-symbol {
  background: linear-gradient(135deg, #7a5cff, #ff6db9);
}

.variant-phone .modal-symbol {
  background: linear-gradient(135deg, #5ddf8d, #31b9ff);
}

.variant-announcement .modal-symbol {
  background: linear-gradient(135deg, #ffe08a, #ffb23f);
}

.modal-title {
  color: #172033;
  font-size: 38rpx;
  font-weight: 1000;
  line-height: 1.22;
  text-align: center;
}

.modal-subtitle {
  margin: 16rpx auto 0;
  max-width: 520rpx;
  color: #596273;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1.52;
  text-align: center;
}

.modal-content-scroll {
  max-height: 34vh;
  margin-top: 22rpx;
  padding: 20rpx 22rpx;
  border-radius: 22rpx;
  background: rgba(246, 255, 249, 0.86);
  box-sizing: border-box;
}

.agreement-content-scroll {
  max-height: 30vh;
  padding: 22rpx 24rpx;
  background:
    linear-gradient(180deg, rgba(246, 255, 249, 0.92), rgba(255, 255, 255, 0.88));
  text-align: center;
}

.modal-rich-text,
.modal-content-text {
  color: #374151;
  font-size: 26rpx;
  font-weight: 650;
  line-height: 1.7;
}

.variant-agreement .modal-rich-text {
  display: block;
  font-size: 25rpx;
  font-weight: 700;
  text-align: center;
}

.modal-benefits {
  display: flex;
  justify-content: center;
  gap: 18rpx;
  margin-top: 28rpx;
}

.modal-benefits.compact {
  gap: 12rpx;
}

.modal-benefit {
  flex: 1;
  min-width: 0;
  padding: 16rpx 8rpx;
  border-radius: 22rpx;
  background: rgba(235, 252, 239, 0.92);
  text-align: center;
}

.benefit-image {
  display: block;
  width: 62rpx;
  height: 62rpx;
  margin: 0 auto 8rpx;
  border-radius: 18rpx;
}

.benefit-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  margin: 0 auto 8rpx;
  border-radius: 50%;
  background: #dff9e5;
  color: #2dbc58;
  font-size: 24rpx;
  font-weight: 900;
}

.benefit-icon-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 10rpx rgba(45, 188, 88, 0.12);
}

.benefit-label {
  overflow: hidden;
  color: #244231;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.benefit-sub {
  overflow: hidden;
  margin-top: 6rpx;
  color: #758273;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-actions {
  margin-top: 28rpx;
}

.modal-primary,
.modal-secondary,
.modal-minor {
  width: 100%;
  height: 76rpx;
  padding: 0;
  border-radius: 999rpx;
  font-size: 27rpx;
  font-weight: 1000;
  line-height: 76rpx;
}

.modal-primary {
  background: linear-gradient(180deg, #65df73, #35c853);
  color: #ffffff;
  box-shadow: 0 12rpx 22rpx rgba(50, 190, 82, 0.28);
}

.modal-secondary {
  margin-top: 16rpx;
  border: 2rpx solid rgba(54, 176, 86, 0.24);
  background: rgba(255, 255, 255, 0.82);
  color: #1e793b;
}

.modal-minor {
  height: 56rpx;
  margin-top: 8rpx;
  background: transparent;
  color: #626b7a;
  font-size: 24rpx;
  line-height: 56rpx;
}
</style>
