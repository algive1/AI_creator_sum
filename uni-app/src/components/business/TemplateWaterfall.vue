<template>
  <view v-if="items.length" class="waterfall">
    <view class="column">
      <button v-for="item in left" :key="String(item.id)" class="feed-card" @tap="$emit('select', item)">
        <image v-if="cover(item)" class="feed-cover" :src="cover(item)" mode="aspectFill" />
        <view v-else class="feed-art"><text>{{ typeLabel(item) }}</text></view>
        <view class="feed-title">{{ title(item) }}</view>
        <view class="feed-meta">
          <text>{{ item.author || item.categoryName || '官方模板' }}</text>
          <text>{{ item.usageCount || item.favoriteCount || item.likes || 0 }}次</text>
        </view>
      </button>
    </view>
    <view class="column">
      <button v-for="item in right" :key="String(item.id)" class="feed-card" @tap="$emit('select', item)">
        <image v-if="cover(item)" class="feed-cover" :src="cover(item)" mode="aspectFill" />
        <view v-else class="feed-art accent"><text>{{ typeLabel(item) }}</text></view>
        <view class="feed-title">{{ title(item) }}</view>
        <view class="feed-meta">
          <text>{{ item.author || item.categoryName || '官方模板' }}</text>
          <text>{{ item.usageCount || item.favoriteCount || item.likes || 0 }}次</text>
        </view>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  items: Record<string, unknown>[];
}>();

defineEmits<{ select: [item: Record<string, unknown>] }>();

const left = computed(() => props.items.filter((_, index) => index % 2 === 0));
const right = computed(() => props.items.filter((_, index) => index % 2 === 1));

function cover(item: Record<string, unknown>) {
  return String(item.coverUrl || item.cover || item.thumbnail || '');
}

function title(item: Record<string, unknown>) {
  return String(item.title || item.name || '灵感模板');
}

function typeLabel(item: Record<string, unknown>) {
  return String(item.templateType || item.type || 'AI');
}
</script>

<style scoped lang="scss">
.waterfall {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.feed-card {
  overflow: hidden;
  border: 1rpx solid rgba(49, 67, 94, 0.1);
  border-radius: 16rpx;
  background: #fff;
  text-align: left;
  box-shadow: 0 14rpx 34rpx rgba(35, 45, 72, 0.08);
}

.feed-cover,
.feed-art {
  width: 100%;
  height: 260rpx;
}

.feed-art {
  display: flex;
  align-items: flex-end;
  padding: 22rpx;
  background: linear-gradient(145deg, #182033, #466276);
  color: #fff;
  font-size: 24rpx;
  font-weight: 900;
}

.feed-art.accent {
  background: linear-gradient(145deg, #352654, #b95787);
}

.feed-title {
  min-height: 74rpx;
  padding: 18rpx 18rpx 0;
  color: #172033;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.35;
}

.feed-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 14rpx 18rpx 18rpx;
  color: #6d7688;
  font-size: 22rpx;
  font-weight: 700;
}

.feed-meta text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
