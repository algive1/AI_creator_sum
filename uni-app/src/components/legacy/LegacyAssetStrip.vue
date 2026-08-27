<template>
  <view class="asset-strip-section">
    <view class="asset-strip-tip">{{ tip }}</view>
    <scroll-view scroll-x class="asset-thumb-scroll" :show-scrollbar="false">
      <view class="asset-thumb-grid">
        <view
          v-for="slot in normalizedSlots"
          :key="slot.slotIndex"
          class="asset-thumb-item"
          :class="{ filled: Boolean(slot.asset), disabled: slot.disabled }"
        >
          <block v-if="slot.asset">
            <button class="asset-thumb-preview" @tap="$emit('replace', slot.slotIndex)">
              <image v-if="slot.asset.mediaType === 'image' || !slot.asset.mediaType" class="asset-thumb-img" :src="slot.asset.path" mode="aspectFill" />
              <view v-else class="asset-video-placeholder" :class="{ audio: slot.asset.mediaType === 'audio' }">
                <view class="asset-video-mark">{{ slot.asset.mediaType === 'audio' ? '♪' : '▶' }}</view>
                <view class="asset-video-text">{{ slot.asset.mediaType === 'audio' ? assetAudioTitle(slot.asset) : '源视频' }}</view>
              </view>
              <view class="asset-replace-mask">
                <text class="asset-replace-icon">↻</text>
                <text>替换</text>
              </view>
              <text class="asset-type-tag" :class="assetTagClass(slot.asset)">{{ slot.asset.typeLabel }}</text>
            </button>
            <view class="asset-delete" @tap.stop="$emit('remove', slot.slotIndex)">
              <text class="asset-delete-icon">×</text>
            </view>
          </block>
          <button v-else class="asset-empty-slot" :class="{ disabled: slot.disabled }" :disabled="slot.disabled" @tap="$emit('hint')">
            <text class="asset-empty-text">{{ slot.disabled ? '不可用' : '待上传' }}</text>
            <text class="asset-empty-index">{{ slot.disabled ? '模型限制' : `槽位 ${slot.displayIndex}` }}</text>
          </button>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface LegacyAsset {
  path: string;
  url?: string;
  type: string;
  typeLabel: string;
  sourceType?: 'upload' | 'url';
  uploadKey?: unknown;
  fileId?: number;
  fileNo?: string;
  mediaType?: 'image' | 'video' | 'audio';
}

type NormalizedSlot = {
  slotIndex: number;
  displayIndex: number;
  asset?: LegacyAsset | null;
  disabled: boolean;
};

const MIN_VISIBLE_SLOTS = 4;

const props = withDefaults(defineProps<{
  assets: Array<LegacyAsset | null | undefined>;
  max?: number;
  tip?: string;
}>(), {
  max: 4,
  tip: '预览图区域无法上传，可以点击进行替换或删除'
});

defineEmits<{
  replace: [slotIndex: number];
  remove: [slotIndex: number];
  hint: [];
}>();

const visibleSlotCount = computed(() => Math.max(MIN_VISIBLE_SLOTS, props.max, props.assets.length));

const normalizedSlots = computed<NormalizedSlot[]>(() => Array.from({ length: visibleSlotCount.value }, (_, index) => {
  const asset = props.assets[index] || null;
  return {
    slotIndex: index,
    displayIndex: index + 1,
    asset,
    disabled: index >= props.max
  };
}));

function assetTagClass(asset: LegacyAsset) {
  if (asset.type === 'product' || asset.type === 'start_frame') return 'product';
  if (asset.mediaType === 'video' || asset.type === 'source_video') return 'video';
  if (asset.mediaType === 'audio') return 'audio';
  return 'reference';
}

function assetAudioTitle(asset: LegacyAsset) {
  const source = asset.path || asset.url || '';
  const name = source.split(/[\\/]/).pop() || source.replace(/^https?:\/\//, '').split('/')[0];
  return name ? name.slice(0, 18) : '音频';
}
</script>

<style scoped lang="scss">
.asset-strip-section {
  margin-top: -8rpx;
  margin-bottom: 24rpx;
}

.asset-strip-tip {
  margin-bottom: 12rpx;
  color: #91a3ad;
  font-size: 23rpx;
  font-weight: 700;
}

.asset-thumb-scroll {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.asset-thumb-grid {
  display: inline-flex;
  gap: 12rpx;
  min-width: 100%;
  max-width: none;
  padding: 12rpx 2rpx 8rpx;
  white-space: nowrap;
}

.asset-thumb-item {
  position: relative;
  flex: 0 0 calc((100vw - 96rpx) / 4);
  width: calc((100vw - 96rpx) / 4);
  min-width: calc((100vw - 96rpx) / 4);
  max-width: none;
  aspect-ratio: 4 / 3;
  border-radius: 18rpx;
}

.asset-thumb-preview,
.asset-empty-slot {
  overflow: hidden;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 18rpx;
  line-height: 1;
}

.asset-thumb-preview {
  position: relative;
  display: block;
}

.asset-thumb-preview::after,
.asset-empty-slot::after {
  border: 0;
}

.asset-thumb-img {
  width: 100%;
  height: 100%;
}

.asset-video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #101827, #2f345f);
  color: #ffffff;
}

.asset-video-placeholder.audio {
  background: linear-gradient(135deg, #172033, #4f3f8f);
}

.asset-video-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46rpx;
  height: 46rpx;
  border-radius: 23rpx;
  background: rgba(255, 255, 255, 0.2);
  font-size: 22rpx;
  font-weight: 900;
}

.asset-video-text {
  margin-top: 8rpx;
  font-size: 19rpx;
  font-weight: 900;
}

.asset-replace-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  background: rgba(15, 23, 42, 0.36);
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 900;
  opacity: 0;
}

.asset-thumb-preview:active .asset-replace-mask {
  opacity: 1;
}

.asset-replace-icon {
  font-size: 30rpx;
}

.asset-type-tag {
  position: absolute;
  left: 8rpx;
  bottom: 8rpx;
  height: 30rpx;
  padding: 0 10rpx;
  border-radius: 15rpx;
  background: rgba(122, 92, 255, 0.86);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 30rpx;
}

.asset-type-tag.reference {
  background: rgba(53, 194, 255, 0.86);
}

.asset-type-tag.video {
  background: rgba(15, 23, 42, 0.84);
}

.asset-type-tag.audio {
  background: rgba(114, 88, 255, 0.88);
}

.asset-delete {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42rpx;
  height: 42rpx;
  border-radius: 21rpx;
  background: #ff7a8b;
  color: #ffffff;
  box-shadow: 0 6rpx 16rpx rgba(255, 122, 139, 0.28);
}

.asset-delete-icon {
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1;
}

.asset-empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #cfd9e8;
  background: #f8fbff;
  color: #7d8797;
}

.asset-empty-slot.disabled {
  border-style: solid;
  border-color: #dfe5ee;
  background: #eef2f7;
  color: #a8b1c0;
}

.asset-empty-text {
  color: #2f3848;
  font-size: 23rpx;
  font-weight: 900;
}

.asset-empty-slot.disabled .asset-empty-text {
  color: #8d99a8;
}

.asset-empty-index {
  margin-top: 8rpx;
  color: #7a5cff;
  font-size: 21rpx;
  font-weight: 800;
}

.asset-empty-slot.disabled .asset-empty-index {
  color: #a8b1c0;
}
</style>
