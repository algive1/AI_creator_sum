<template>
  <view class="creation-grid">
    <button v-for="item in entries" :key="item.key" class="creation-card" :class="item.key" @tap="$emit('select', item.key)">
      <view class="creation-top">
        <text class="creation-label">{{ item.title }}</text>
        <text class="creation-arrow">›</text>
      </view>
      <view class="creation-desc">{{ item.desc }}</view>
      <view class="creation-visual">
        <view class="visual-frame">
          <view class="visual-core"></view>
        </view>
      </view>
    </button>
  </view>
</template>

<script setup lang="ts">
const entries = [
  { key: 'image', title: 'AI生图', desc: '商品海报 / 场景图' },
  { key: 'video', title: 'AI生视频', desc: '投流短片 / 口播' },
  { key: 'comic', title: 'AI漫剧', desc: '剧情分镜 / 漫画感' }
];

defineEmits<{ select: [key: string] }>();
</script>

<style scoped lang="scss">
.creation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin: 22rpx 0 28rpx;
}

.creation-card {
  position: relative;
  overflow: hidden;
  min-height: 300rpx;
  padding: 22rpx 18rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.2);
  border-radius: 16rpx;
  color: #fff;
  text-align: left;
  box-shadow: 0 20rpx 38rpx rgba(24, 29, 55, 0.18);
}

.creation-card.image {
  background: linear-gradient(158deg, #2c236a, #6d55e8 48%, #201b32);
}

.creation-card.video {
  background: linear-gradient(158deg, #12374f, #1e8bac 48%, #101e2e);
}

.creation-card.comic {
  background: linear-gradient(158deg, #5c224c, #cf5b8b 48%, #261625);
}

.creation-card::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(5, 7, 18, 0.34));
  content: '';
}

.creation-top,
.creation-desc,
.creation-visual {
  position: relative;
  z-index: 1;
}

.creation-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
}

.creation-label {
  overflow: hidden;
  font-size: 28rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creation-arrow {
  font-size: 36rpx;
  font-weight: 300;
}

.creation-desc {
  margin-top: 10rpx;
  color: rgba(255, 255, 255, 0.76);
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.3;
}

.creation-visual {
  position: absolute;
  right: 14rpx;
  bottom: 18rpx;
  width: 118rpx;
  height: 118rpx;
}

.visual-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border: 2rpx solid rgba(255, 255, 255, 0.3);
  border-radius: 16rpx;
  transform: rotate(-8deg);
}

.visual-core {
  position: absolute;
  top: 24rpx;
  left: 24rpx;
  width: 58rpx;
  height: 58rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.84);
}
</style>
