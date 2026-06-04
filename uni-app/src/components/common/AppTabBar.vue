<template>
  <view class="tabbar" :style="tabbarStyle">
    <button
      v-for="item in tabs"
      :key="item.path"
      class="tab-item"
      :class="{ active: activePath === item.path, center: item.center }"
      @tap="go(item.path)"
    >
      <view class="tab-icon" :class="item.icon"><text class="icon-core"></text></view>
      <text class="tab-text">{{ item.text }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';
import { useConfigStore } from '@/stores/config';

type TabItem = {
  text: string;
  path: string;
  icon: string;
  center?: boolean;
};

const fallbackTabs: TabItem[] = [
  { text: '首页', path: PAGE_ROUTES.home, icon: 'home' },
  { text: '灵感', path: PAGE_ROUTES.inspiration, icon: 'spark' },
  { text: '漫剧', path: PAGE_ROUTES.comic, icon: 'film', center: true },
  { text: '记录', path: PAGE_ROUTES.history, icon: 'record' },
  { text: '我的', path: PAGE_ROUTES.profile, icon: 'mine' }
];
const config = useConfigStore();
const pathIconMap: Record<string, string> = {
  [PAGE_ROUTES.home]: 'home',
  [PAGE_ROUTES.inspiration]: 'spark',
  [PAGE_ROUTES.comic]: 'film',
  [PAGE_ROUTES.history]: 'record',
  [PAGE_ROUTES.profile]: 'mine'
};
const pathTextMap: Record<string, string> = fallbackTabs.reduce((map, item) => {
  map[item.path] = item.text;
  return map;
}, {} as Record<string, string>);
const cachedTabs = ref<TabItem[]>(readCachedTabs());

const configuredTabs = computed(() => readConfiguredTabs(config.publicConfig));
const tabs = computed(() => {
  if (isValidTabConfig(configuredTabs.value)) return configuredTabs.value;
  if (isValidTabConfig(cachedTabs.value)) return cachedTabs.value;
  return fallbackTabs;
});

const activePath = computed(() => {
  const pages = getCurrentPages();
  const route = pages[pages.length - 1]?.route || '';
  return route ? `/${route}` : PAGE_ROUTES.home;
});
const tabbarStyle = computed(() => `grid-template-columns:repeat(${tabs.value.length}, minmax(0, 1fr))`);

watch(configuredTabs, (items) => {
  if (!isValidTabConfig(items)) return;
  cachedTabs.value = items;
  try {
    uni.setStorageSync(STORAGE_KEYS.navigation, items);
  } catch {
    // 导航缓存失败时保留当前内存态，默认导航仍可兜底。
  }
}, { immediate: true });

function go(path: string) {
  if (activePath.value === path) return;
  uni.reLaunch({ url: path });
}

function readConfiguredTabs(sourceConfig: unknown): TabItem[] {
  const root = asRecord(sourceConfig);
  const navigation = asRecord(root.navigation);
  const candidates = [root.tabBar, root.bottomNav, root.navTabs, navigation.tabBar, navigation.bottom, navigation.tabs];
  const source = candidates.find(Array.isArray);
  if (!Array.isArray(source)) return [];
  return source.map(normalizeTab).filter((item): item is TabItem => Boolean(item));
}

function normalizeTab(item: unknown): TabItem | null {
  const raw = asRecord(item);
  if (!raw || raw.enabled === false || raw.visible === false) return null;
  const path = normalizePath(raw.path || raw.pagePath || raw.url || raw.route || raw.value || raw.key || raw.id);
  if (!path) return null;
  return {
    text: String(raw.text || raw.title || raw.name || raw.label || pathTextMap[path] || ''),
    path,
    icon: String(raw.icon || raw.iconKey || pathIconMap[path] || 'home'),
    center: Boolean(raw.center || raw.primary || path === PAGE_ROUTES.comic)
  };
}

function readCachedTabs(): TabItem[] {
  try {
    const cached = uni.getStorageSync(STORAGE_KEYS.navigation);
    if (Array.isArray(cached)) {
      return cached.map(normalizeTab).filter((item): item is TabItem => Boolean(item));
    }
    return readConfiguredTabs(uni.getStorageSync(STORAGE_KEYS.config));
  } catch {
    return [];
  }
}

function isValidTabConfig(items: TabItem[]) {
  return items.length >= 2;
}

function normalizePath(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const aliasMap: Record<string, string> = {
    home: PAGE_ROUTES.home,
    index: PAGE_ROUTES.home,
    inspiration: PAGE_ROUTES.inspiration,
    spark: PAGE_ROUTES.inspiration,
    comic: PAGE_ROUTES.comic,
    manga: PAGE_ROUTES.comic,
    history: PAGE_ROUTES.history,
    records: PAGE_ROUTES.history,
    profile: PAGE_ROUTES.profile,
    mine: PAGE_ROUTES.profile
  };
  if (aliasMap[raw]) return aliasMap[raw];
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
</script>

<style scoped lang="scss">
.tabbar {
  position: fixed;
  right: 18rpx;
  bottom: calc(14rpx + env(safe-area-inset-bottom));
  left: 18rpx;
  z-index: 90;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: 120rpx;
  padding: 12rpx 12rpx 10rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 38rpx;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 -8rpx 38rpx rgba(122, 92, 255, 0.16), 0 18rpx 42rpx rgba(37, 42, 61, 0.08);
  backdrop-filter: blur(22rpx);
}

.tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: #8b91a8;
  font-size: 20rpx;
  font-weight: 900;
}

.tab-item.active {
  color: #7a5cff;
}

.tab-icon {
  position: relative;
  width: 46rpx;
  height: 46rpx;
  margin-bottom: 6rpx;
  border-radius: 16rpx;
  background: #e8f0ff;
  box-shadow: inset -4rpx -6rpx 0 rgba(122, 92, 255, 0.1);
}

.active .tab-icon {
  background: linear-gradient(135deg, #7a5cff, #ff7acb);
  box-shadow: 0 12rpx 22rpx rgba(122, 92, 255, 0.22);
}

.icon-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.active .icon-core {
  background: #fff;
}

.spark .icon-core {
  width: 22rpx;
  height: 22rpx;
  border-radius: 4rpx;
  transform: translate(-50%, -50%) rotate(45deg);
}

.record .icon-core {
  width: 22rpx;
  height: 16rpx;
  border-radius: 4rpx;
}

.mine .icon-core {
  top: 42%;
  box-shadow: 0 18rpx 0 -2rpx currentColor;
}

.center {
  transform: translateY(-26rpx);
}

.center .tab-icon {
  width: 78rpx;
  height: 78rpx;
  margin-bottom: 4rpx;
  border: 8rpx solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  background: linear-gradient(135deg, #7a5cff, #ff7acb);
  box-shadow: 0 18rpx 34rpx rgba(122, 92, 255, 0.32);
}

.center .icon-core {
  width: 30rpx;
  height: 24rpx;
  border-radius: 7rpx;
}

.center .tab-text {
  color: #7a5cff;
  font-size: 19rpx;
}
</style>
