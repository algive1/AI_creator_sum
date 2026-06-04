<template>
  <scroll-view scroll-x class="tabs-scroll" :show-scrollbar="false">
    <view class="tabs">
      <button
        v-for="item in items"
        :key="item"
        class="tab"
        :class="{ active: modelValue === item }"
        @tap="$emit('update:modelValue', item)"
      >
        {{ item }}
      </button>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
defineProps<{
  items: string[];
  modelValue: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<style scoped lang="scss">
.tabs-scroll {
  width: 100%;
  overflow: hidden;
  margin-bottom: 22rpx;
  white-space: nowrap;
}

.tabs {
  display: inline-flex;
  gap: 10rpx;
  min-width: 100%;
  padding: 8rpx;
  border: 1rpx solid rgba(49, 67, 94, 0.1);
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.74);
}

.tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 126rpx;
  height: 64rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  color: #6d7688;
  font-size: 25rpx;
  font-weight: 900;
  white-space: nowrap;
}

.tab.active {
  background: linear-gradient(90deg, #7258ff, #ff6aa8);
  color: #fff;
  box-shadow: 0 12rpx 26rpx rgba(114, 88, 255, 0.2);
}
</style>
