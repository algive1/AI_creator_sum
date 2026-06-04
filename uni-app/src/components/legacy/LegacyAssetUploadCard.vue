<template>
  <view class="card asset-upload-card">
    <view class="upload-head">
      <view class="section-title">{{ title }}</view>
      <view class="upload-count">已上传 {{ uploadedCount }}/{{ maxUploads }}</view>
    </view>
    <view class="image-upload-grid">
      <button v-for="item in types" :key="item.type" class="image-upload-box" @tap="$emit('pick', item.type)">
        <view class="upload-icon-wrap">
          <image class="upload-icon" :src="uploadIconOf(item.type)" mode="aspectFit" />
          <text class="upload-plus">+</text>
        </view>
        <view class="upload-title">{{ item.label }}</view>
        <view class="upload-desc">{{ item.desc }}</view>
        <view class="upload-hint">{{ item.hint }}</view>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  uploadedCount: number;
  maxUploads: number;
  types: Array<{ type: string; label: string; desc: string; hint: string }>;
}>(), {
  title: '上传素材'
});

defineEmits<{ pick: [type: string] }>();

function uploadIconOf(type: string) {
  return type === 'source_video'
    ? '/static/icons/icon_upload_video_line.svg'
    : '/static/icons/icon_upload_image_line.svg';
}
</script>

<style scoped lang="scss">
.card {
  width: 100%;
  overflow: hidden;
  margin-bottom: 24rpx;
  padding: 24rpx 22rpx 22rpx;
  border: 1rpx solid #dce8f6;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(28, 43, 82, 0.07);
}

.upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.section-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  color: #172033;
  font-size: 30rpx;
  font-weight: 900;
}

.section-title::before {
  display: inline-block;
  width: 8rpx;
  height: 34rpx;
  border-radius: 4rpx;
  background: linear-gradient(180deg, #ff7acb, #35c2ff);
  box-shadow: 0 4rpx 10rpx rgba(255, 122, 203, 0.14);
  content: "";
}

.upload-count {
  flex-shrink: 0;
  color: #91a3ad;
  font-size: 24rpx;
  font-weight: 700;
}

.image-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 22rpx;
}

.image-upload-box {
  position: relative;
  overflow: hidden;
  min-height: 186rpx;
  padding: 20rpx 16rpx 18rpx;
  border: 2rpx dashed #cfd9e8;
  border-radius: 18rpx;
  background: #f8fbff;
  color: #637083;
  text-align: center;
}

.image-upload-box:active {
  border-color: #8b7cff;
  background: #f3f1ff;
}

.upload-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58rpx;
  height: 58rpx;
  margin: 0 auto 10rpx;
  border-radius: 18rpx;
  background: #e9ecff;
}

.upload-icon {
  width: 38rpx;
  height: 38rpx;
}

.upload-plus {
  position: absolute;
  right: -6rpx;
  bottom: -8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  border-radius: 15rpx;
  background: #7a5cff;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
}

.upload-title {
  color: #2f3848;
  font-size: 27rpx;
  font-weight: 900;
}

.upload-desc {
  margin-top: 8rpx;
  color: #7d8797;
  font-size: 22rpx;
  font-weight: 700;
}

.upload-hint {
  margin-top: 6rpx;
  color: #7a5cff;
  font-size: 21rpx;
  font-weight: 800;
}
</style>
