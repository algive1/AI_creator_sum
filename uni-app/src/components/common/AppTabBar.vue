<template>
  <view class="tabbar" :style="tabbarStyle">
    <button
      v-for="item in tabs"
      :key="item.path"
      class="tab-item"
      :class="{ active: activePath === item.path, center: item.center }"
      @tap="go(item.path)"
    >
      <view class="tab-icon" :class="[getIconUrl(item) ? 'has-image' : item.icon]">
        <image v-if="getIconUrl(item)" class="tab-icon-image" :src="getIconUrl(item)" mode="aspectFit" />
        <text v-else class="icon-core"></text>
      </view>
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
  iconPath?: string;
  selectedIconPath?: string;
  center?: boolean;
};

const fallbackTabs: TabItem[] = [
  { text: '首页', path: PAGE_ROUTES.home, icon: 'home' },
  { text: '灵感', path: PAGE_ROUTES.inspiration, icon: 'spark' },
  { text: '漫剧', path: PAGE_ROUTES.comic, icon: 'create', center: true },
  { text: '记录', path: PAGE_ROUTES.history, icon: 'record' },
  { text: '我的', path: PAGE_ROUTES.profile, icon: 'mine' }
];
const TAB_ICON_BASE = '/static/icons/tabbar';
const config = useConfigStore();
const pathIconMap: Record<string, string> = {
  [PAGE_ROUTES.home]: 'home',
  [PAGE_ROUTES.inspiration]: 'spark',
  [PAGE_ROUTES.comic]: 'create',
  [PAGE_ROUTES.history]: 'record',
  [PAGE_ROUTES.profile]: 'mine'
};
const localTabIconMap: Record<string, { iconPath: string; selectedIconPath: string }> = {
  home: { iconPath: `${TAB_ICON_BASE}/tab-home.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-home-active.svg` },
  spark: { iconPath: `${TAB_ICON_BASE}/tab-spark.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-spark-active.svg` },
  inspiration: { iconPath: `${TAB_ICON_BASE}/tab-spark.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-spark-active.svg` },
  create: { iconPath: `${TAB_ICON_BASE}/tab-create.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-create-active.svg` },
  film: { iconPath: `${TAB_ICON_BASE}/tab-create.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-create-active.svg` },
  comic: { iconPath: `${TAB_ICON_BASE}/tab-create.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-create-active.svg` },
  record: { iconPath: `${TAB_ICON_BASE}/tab-record.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-record-active.svg` },
  history: { iconPath: `${TAB_ICON_BASE}/tab-record.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-record-active.svg` },
  mine: { iconPath: `${TAB_ICON_BASE}/tab-mine.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-mine-active.svg` },
  profile: { iconPath: `${TAB_ICON_BASE}/tab-mine.svg`, selectedIconPath: `${TAB_ICON_BASE}/tab-mine-active.svg` }
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
    icon: normalizeIconKey(raw.iconKey || (isImageUrl(raw.icon) ? '' : raw.icon) || pathIconMap[path] || 'home'),
    iconPath: normalizeIconUrl(raw.iconPath || raw.iconUrl || raw.defaultIconPath || raw.defaultIconUrl || raw.iconImage || raw.icon),
    selectedIconPath: normalizeIconUrl(raw.selectedIconPath || raw.activeIconPath || raw.selectedIconUrl || raw.activeIconUrl),
    center: Boolean(raw.center || raw.primary || path === PAGE_ROUTES.comic)
  };
}

function getIconUrl(item: TabItem) {
  if (activePath.value === item.path && item.selectedIconPath) return item.selectedIconPath;
  if (item.iconPath) return item.iconPath;
  const local = localTabIconMap[item.icon] || localTabIconMap[pathIconMap[item.path]];
  if (!local) return '';
  return activePath.value === item.path ? local.selectedIconPath : local.iconPath;
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

function normalizeIconUrl(value: unknown) {
  const raw = String(value || '').trim();
  return isImageUrl(raw) ? raw : '';
}

function normalizeIconKey(value: unknown) {
  const raw = String(value || '').trim();
  const aliasMap: Record<string, string> = {
    index: 'home',
    inspiration: 'spark',
    idea: 'spark',
    ideas: 'spark',
    comic: 'create',
    manga: 'create',
    film: 'create',
    video: 'create',
    history: 'record',
    records: 'record',
    profile: 'mine',
    user: 'mine'
  };
  return aliasMap[raw] || raw || 'home';
}

function isImageUrl(value: unknown) {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || raw.startsWith('/');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
</script>

<style scoped lang="scss">
.tabbar {
  position: fixed;
  right: 18rpx;
  bottom: calc(8rpx + env(safe-area-inset-bottom));
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

.tab-item.active:not(.center)::after {
  position: absolute;
  bottom: 2rpx;
  left: 50%;
  width: 24rpx;
  height: 5rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #7a5cff, #ff7acb);
  content: "";
  transform: translateX(-50%);
}

.tab-icon {
  position: relative;
  width: 50rpx;
  height: 50rpx;
  margin-bottom: 6rpx;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.active .tab-icon {
  background: transparent;
  box-shadow: none;
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

.tab-icon-image {
  display: block;
  width: 100%;
  height: 100%;
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
  transform: translateY(-38rpx);
}

.center .tab-icon {
  z-index: 1;
  width: 102rpx;
  height: 102rpx;
  box-sizing: border-box;
  margin-bottom: -2rpx;
  padding: 22rpx;
  border: 8rpx solid rgba(255, 255, 255, 0.94);
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.46), transparent 26%),
    linear-gradient(135deg, #7a5cff 0%, #a653ff 48%, #ff4fc3 100%);
  box-shadow: 0 20rpx 34rpx rgba(122, 92, 255, 0.34), 0 8rpx 18rpx rgba(255, 79, 195, 0.22);
}

.center .tab-icon::after {
  position: absolute;
  inset: -14rpx;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(122, 92, 255, 0.18), rgba(122, 92, 255, 0));
  content: "";
}

.center.active .tab-icon {
  border-color: #ffffff;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.54), transparent 28%),
    linear-gradient(135deg, #6f4cff 0%, #9f45ff 46%, #ff3db8 100%);
  box-shadow: 0 24rpx 42rpx rgba(122, 92, 255, 0.42), 0 10rpx 22rpx rgba(255, 79, 195, 0.26);
}

.center.active .tab-icon::before {
  position: absolute;
  inset: -5rpx;
  border: 3rpx solid rgba(122, 92, 255, 0.18);
  border-radius: 50%;
  content: "";
}

.center .icon-core {
  width: 30rpx;
  height: 24rpx;
  border-radius: 7rpx;
}

.center .tab-text {
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 1000;
  line-height: 24rpx;
}
</style>
