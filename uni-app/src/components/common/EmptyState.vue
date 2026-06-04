<template>
  <view class="empty">
    <view class="empty-mark">{{ mark }}</view>
    <view class="empty-title">{{ title }}</view>
    <view v-if="desc" class="empty-desc">{{ desc }}</view>
    <button v-if="actionText" class="empty-action" @tap="$emit('action')">{{ actionText }}</button>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  desc?: string;
  actionText?: string;
  mark?: string;
}>(), {
  desc: '',
  actionText: '',
  mark: 'AI'
});

defineEmits<{ action: [] }>();
</script>

<style scoped lang="scss">
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320rpx;
  padding: 44rpx 28rpx;
  border: 1rpx dashed rgba(114, 88, 255, 0.22);
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.62);
  text-align: center;
}

.empty-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  margin-bottom: 18rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #172033, #7258ff);
  color: #fff;
  font-size: 24rpx;
  font-weight: 900;
}

.empty-title {
  color: #172033;
  font-size: 30rpx;
  font-weight: 900;
}

.empty-desc {
  margin-top: 10rpx;
  color: #6d7688;
  font-size: 24rpx;
  line-height: 1.5;
}

.empty-action {
  min-width: 180rpx;
  min-height: 64rpx;
  margin-top: 24rpx;
  border-radius: 14rpx;
  background: #172033;
  color: #fff;
  font-size: 24rpx;
  font-weight: 800;
}
</style>
