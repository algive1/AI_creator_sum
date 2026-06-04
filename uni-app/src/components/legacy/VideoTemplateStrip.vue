<template>
  <view class="video-inspiration-card">
    <view class="video-section-row">
      <view class="video-section-title">选择视频模板或查看灵感</view>
      <text class="video-section-chevron">›</text>
    </view>
    <scroll-view scroll-x class="video-template-scroll" :show-scrollbar="false">
      <view class="video-template-row">
        <view
          v-for="item in templates"
          :key="item.name"
          class="video-template-card"
          :class="{ active: selected === item.name }"
          @tap="$emit('select', item)"
        >
          <image class="video-template-cover" :src="item.cover" mode="aspectFill" />
          <view class="video-template-play">
            <view class="video-template-play-icon"></view>
          </view>
          <view class="video-template-duration">{{ item.duration }}</view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  templates: Array<{ name: string; duration: string; cover: string; prompt: string }>;
  selected: string;
}>();

defineEmits<{ select: [item: { name: string; duration: string; cover: string; prompt: string }] }>();
</script>

<style scoped lang="scss">
.video-inspiration-card {
  width: 100%;
  margin-bottom: 20rpx;
  padding: 20rpx 18rpx 18rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 22rpx rgba(28, 43, 82, 0.06);
}

.video-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.video-section-title {
  min-width: 0;
  overflow: hidden;
  color: #172033;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-section-chevron {
  flex-shrink: 0;
  color: #64748b;
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1;
}

.video-template-scroll {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.video-template-row {
  display: inline-flex;
  gap: 10rpx;
  min-width: 790rpx;
  white-space: nowrap;
}

.video-template-card {
  position: relative;
  display: inline-block;
  overflow: hidden;
  width: 152rpx;
  min-width: 152rpx;
  height: 190rpx;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
  background: #f8fbff;
  box-shadow: 0 6rpx 16rpx rgba(28, 43, 82, 0.06);
}

.video-template-card.active {
  border-color: #35c2ff;
}

.video-template-cover {
  width: 100%;
  height: 100%;
}

.video-template-play {
  position: absolute;
  top: 50%;
  left: 50%;
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

.video-template-play-icon {
  width: 0;
  height: 0;
  margin-left: 4rpx;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 13rpx solid #ffffff;
}

.video-template-duration {
  position: absolute;
  right: 6rpx;
  bottom: 6rpx;
  height: 26rpx;
  padding: 0 9rpx;
  border-radius: 13rpx;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 800;
  line-height: 26rpx;
}
</style>
