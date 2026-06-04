<template>
  <view class="template-strip">
    <scroll-view scroll-x class="template-scroll" :show-scrollbar="false">
      <view class="template-row">
        <button v-for="item in templates" :key="item.id" class="template-card" @tap="$emit('select', item)">
          <image class="template-cover" :src="item.coverUrl" mode="aspectFill" />
          <view v-if="item.mediaType === 'video'" class="template-play">
            <view class="template-play-icon"></view>
          </view>
          <view v-if="item.duration" class="template-duration">{{ item.duration }}</view>
          <view class="template-name">{{ item.title }}</view>
        </button>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import type { CreativeTemplate } from '@/utils/mock';

withDefaults(defineProps<{
  title?: string;
  templates: CreativeTemplate[];
}>(), {
  title: '选择模板或查看灵感'
});

defineEmits<{ select: [template: CreativeTemplate] }>();
</script>

<style scoped lang="scss">
.template-strip {
  width: 100%;
  margin: -4rpx 0 18rpx;
}

.template-scroll {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.template-row {
  display: inline-flex;
  gap: 10rpx;
  white-space: nowrap;
}

.template-card {
  position: relative;
  display: inline-block;
  overflow: hidden;
  width: 162rpx;
  min-width: 162rpx;
  height: 144rpx;
  border-radius: 12rpx;
  background: #f8fbff;
  box-shadow: 0 6rpx 16rpx rgba(28, 43, 82, 0.06);
}

.template-cover {
  width: 100%;
  height: 100%;
}

.template-card::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 45%, rgba(15, 23, 42, 0.66));
  content: "";
}

.template-play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42rpx;
  height: 42rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.88);
  border-radius: 21rpx;
  background: rgba(15, 23, 42, 0.34);
  transform: translate(-50%, -50%);
}

.template-play-icon {
  width: 0;
  height: 0;
  margin-left: 4rpx;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 13rpx solid #ffffff;
}

.template-duration {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  z-index: 2;
  height: 26rpx;
  padding: 0 9rpx;
  border-radius: 13rpx;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 800;
  line-height: 26rpx;
}

.template-name {
  position: absolute;
  right: 10rpx;
  bottom: 10rpx;
  left: 10rpx;
  z-index: 2;
  overflow: hidden;
  color: #ffffff;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
