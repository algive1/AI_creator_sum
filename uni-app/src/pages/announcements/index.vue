<template>
  <view class="announcements-page">
    <view class="content">
      <view class="page-head">
        <view>
          <view class="page-title">公告消息</view>
          <view class="page-subtitle">平台通知、活动和服务变更</view>
        </view>
        <view class="head-icon">
          <image src="/static/icons/icon_message.svg" mode="aspectFit" />
        </view>
      </view>

      <view v-if="loading" class="state-card">正在加载公告...</view>
      <view v-else-if="announcements.length === 0" class="state-card">暂无公告</view>

      <view v-else class="announcement-list">
        <view v-for="item in announcements" :key="item.id" class="announcement-card">
          <view class="announcement-top">
            <view class="announcement-title">
              <text v-if="!item.readAt" class="unread-dot"></text>
              <text>{{ item.title }}</text>
            </view>
            <view class="announcement-type">{{ typeLabel(item.type) }}</view>
          </view>
          <view class="announcement-content">{{ item.content }}</view>
          <view class="announcement-time">{{ formatTime(item.startAt || item.createdAt) }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { getAnnouncements, markAnnouncementRead } from '@/api/config';
import { useAuthStore } from '@/stores/auth';

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  type: string;
  readAt: string | null;
  startAt?: string | null;
  createdAt?: string | null;
}

const auth = useAuthStore();
const loading = ref(false);
const announcements = ref<AnnouncementItem[]>([]);

onShow(() => {
  loadAnnouncements();
});

onPullDownRefresh(() => {
  loadAnnouncements().finally(() => uni.stopPullDownRefresh());
});

async function loadAnnouncements() {
  loading.value = true;
  try {
    const res = await getAnnouncements<{ list?: Array<Record<string, unknown>> }>({ page: 1, pageSize: 50 });
    announcements.value = (Array.isArray(res.list) ? res.list : []).map(normalizeAnnouncement);
    if (auth.isLoggedIn) markVisibleAsRead();
  } catch {
    announcements.value = [];
    uni.showToast({ title: '公告加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function normalizeAnnouncement(row: Record<string, unknown>): AnnouncementItem {
  return {
    id: Number(row.id || 0),
    title: String(row.title || '公告'),
    content: String(row.content || ''),
    type: String(row.type || 'system'),
    readAt: String(row.readAt || row.read_at || '') || null,
    startAt: String(row.startAt || row.start_at || '') || null,
    createdAt: String(row.createdAt || row.created_at || '') || null
  };
}

function markVisibleAsRead() {
  const unread = announcements.value.filter((item) => item.id && !item.readAt);
  if (!unread.length) return;
  Promise.all(unread.map((item) => markAnnouncementRead(item.id).catch(() => undefined))).then(() => {
    const now = new Date().toISOString();
    announcements.value = announcements.value.map((item) => item.readAt ? item : { ...item, readAt: now });
  });
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    popup: '弹窗',
    home: '首页',
    profile: '个人中心',
    system: '系统',
    activity: '活动',
    maintenance: '维护'
  };
  return map[type] || '公告';
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.announcements-page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(42rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 12% 6%, rgba(122, 92, 255, 0.14), transparent 28%),
    radial-gradient(circle at 88% 12%, rgba(255, 122, 203, 0.13), transparent 24%),
    linear-gradient(180deg, #f8f6ff 0%, #ffffff 54%, #f7f4ff 100%);
  color: #252941;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 30rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.82);
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
}

.page-title {
  color: #252941;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.2;
}

.page-subtitle {
  margin-top: 10rpx;
  color: #7e879a;
  font-size: 23rpx;
  font-weight: 800;
}

.head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68rpx;
  height: 68rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #f0ecff, #fff1fa);
}

.head-icon image {
  width: 38rpx;
  height: 38rpx;
}

.state-card,
.announcement-card {
  border: 2rpx solid rgba(255, 255, 255, 0.86);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16rpx 34rpx rgba(34, 42, 74, 0.07);
}

.state-card {
  padding: 48rpx 24rpx;
  color: #8b91aa;
  font-size: 25rpx;
  font-weight: 800;
  text-align: center;
}

.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.announcement-card {
  padding: 26rpx 28rpx;
}

.announcement-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.announcement-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10rpx;
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.3;
}

.announcement-title text:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-dot {
  flex-shrink: 0;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #ff4d5f;
}

.announcement-type {
  flex-shrink: 0;
  height: 34rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background: rgba(122, 92, 255, 0.1);
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 34rpx;
}

.announcement-content {
  margin-top: 18rpx;
  color: #596177;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.6;
  white-space: pre-wrap;
}

.announcement-time {
  margin-top: 18rpx;
  color: #9aa2b6;
  font-size: 21rpx;
  font-weight: 800;
}
</style>
