<template>
  <view class="top-tabs" :class="`top-tabs-${items.length}`">
    <view
      v-for="item in items"
      :key="item"
      class="top-tab"
      :class="{ active: modelValue === item }"
      @tap="select(item)"
    >
      {{ labels?.[item] || item }}
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  items: string[];
  modelValue: string;
  labels?: Record<string, string>;
}>();

const emit = defineEmits<{
  select: [value: string];
}>();

function select(value: string) {
  emit('select', value);
}
</script>

<style scoped lang="scss">
.top-tabs {
  display: grid;
  gap: 8rpx;
  width: 100%;
  margin-bottom: 22rpx;
  padding: 8rpx;
  border: 1rpx solid rgba(59, 130, 246, 0.12);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.78);
}

.top-tabs-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.top-tabs-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.top-tabs-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.top-tabs-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }

.top-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 68rpx;
  padding: 0 8rpx;
  border-radius: 12rpx;
  color: #64748b;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 1.15;
  white-space: nowrap;
}

.top-tabs-5 .top-tab {
  font-size: 22rpx;
}

.top-tab.active {
  background: linear-gradient(90deg, #ff7acb, #8b5cf6);
  color: #ffffff;
  box-shadow: 0 10rpx 24rpx rgba(139, 92, 246, 0.2);
}
</style>
