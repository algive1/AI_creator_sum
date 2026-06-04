<template>
  <view class="generation-actions">
    <button class="generate-cta" :class="{ disabled: disabled || loading }" :disabled="disabled || loading" @tap="onGenerate">
      <text class="generate-cta-title">{{ loading ? loadingTitle : title }}</text>
      <text class="generate-cta-cost">{{ cost }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string;
  cost?: string;
  loading?: boolean;
  disabled?: boolean;
  loadingTitle?: string;
}>(), {
  title: '立即生成',
  cost: '',
  loading: false,
  disabled: false,
  loadingTitle: '提交中...'
});

const emit = defineEmits<{ generate: [] }>();

function onGenerate() {
  if (props.disabled || props.loading) return;
  emit('generate');
}
</script>

<style scoped lang="scss">
.generation-actions {
  position: fixed;
  right: 24rpx;
  bottom: calc(22rpx + env(safe-area-inset-bottom));
  left: 24rpx;
  z-index: 40;
}

.generate-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 96rpx;
  border-radius: 28rpx;
  background: linear-gradient(90deg, #7a5cff, #ff7acb);
  color: #ffffff;
  box-shadow: 0 18rpx 38rpx rgba(122, 92, 255, 0.28);
}

.generate-cta.disabled {
  opacity: 0.72;
}

.generate-cta-title {
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.25;
}

.generate-cta-cost {
  margin-top: 6rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 22rpx;
  font-weight: 700;
}
</style>
