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

      <view v-if="loading" class="state-card state-loading">
        <text class="state-spinner"></text>
        <text>正在加载消息...</text>
      </view>
      <view v-else-if="announcements.length === 0 && notifications.length === 0" class="state-card">暂无消息</view>

      <view v-if="!loading && notifications.length" class="notification-list">
        <view v-for="item in notifications" :key="item.id" class="notification-card" @tap="openNotification(item)">
          <image class="notification-avatar" :src="item.actorAvatarUrl || defaultAvatar" mode="aspectFill" />
          <view class="notification-body">
            <view class="notification-title">
              <text v-if="!item.readAt" class="unread-dot"></text>
              <text>{{ item.title }}</text>
            </view>
            <view class="notification-content">{{ item.content }}</view>
            <view class="announcement-time">{{ formatTime(item.createdAt) }}</view>
          </view>
        </view>
      </view>

      <view v-if="!loading && announcements.length" class="announcement-list">
        <view v-for="item in announcements" :key="item.id" class="announcement-card" @tap="openAnnouncement(item)">
          <view class="announcement-top">
            <view class="announcement-title">
              <text v-if="!item.readAt" class="unread-dot"></text>
              <text>{{ item.title }}</text>
            </view>
            <view class="announcement-type">{{ typeLabel(item.type) }}</view>
          </view>
          <view class="announcement-content">{{ announcementPreview(item.content) }}</view>
          <view class="announcement-bottom">
            <view class="announcement-time">{{ formatTime(item.startAt || item.createdAt) }}</view>
            <view class="announcement-open">查看详情</view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="detailVisible && detailAnnouncement" class="detail-mask" @tap="closeAnnouncementDetail">
      <view class="detail-panel" @tap.stop>
        <view class="detail-head">
          <view class="detail-heading">
            <view class="detail-title">{{ detailAnnouncement.title }}</view>
            <view class="detail-meta">
              <text>{{ typeLabel(detailAnnouncement.type) }}</text>
              <text>{{ formatTime(detailAnnouncement.startAt || detailAnnouncement.createdAt) }}</text>
            </view>
          </view>
          <view class="detail-close" @tap="closeAnnouncementDetail">×</view>
        </view>
        <scroll-view scroll-y class="detail-scroll">
          <rich-text class="detail-rich" :nodes="detailContentHtml" />
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { getAnnouncementDetail, getAnnouncements, markAnnouncementRead } from '@/api/config';
import { getNotifications, markNotificationRead } from '@/api/template';
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

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  content: string;
  actorNickname: string;
  actorAvatarUrl: string;
  templateId: number;
  templateTitle: string;
  readAt: string | null;
  createdAt?: string | null;
}

const auth = useAuthStore();
const loading = ref(false);
const announcements = ref<AnnouncementItem[]>([]);
const notifications = ref<NotificationItem[]>([]);
const detailVisible = ref(false);
const detailAnnouncement = ref<AnnouncementItem | null>(null);
const detailContentHtml = computed(() => renderAnnouncementHtml(detailAnnouncement.value?.content || ''));
const defaultAvatar = '/static/visuals/avatar/default_avatar_3d.png';

onShow(() => {
  loadAnnouncements();
});

onPullDownRefresh(() => {
  loadAnnouncements().finally(() => uni.stopPullDownRefresh());
});

async function loadAnnouncements() {
  loading.value = true;
  try {
    const [res, noticeRes] = await Promise.all([
      getAnnouncements<{ list?: Array<Record<string, unknown>> }>({ page: 1, pageSize: 50 }),
      auth.isLoggedIn
        ? getNotifications<{ list?: Array<Record<string, unknown>> }>({ page: 1, pageSize: 50 })
        : Promise.resolve({ list: [] })
    ]);
    announcements.value = (Array.isArray(res.list) ? res.list : []).map(normalizeAnnouncement);
    notifications.value = (Array.isArray(noticeRes.list) ? noticeRes.list : []).map(normalizeNotification);
  } catch {
    announcements.value = [];
    notifications.value = [];
    uni.showToast({ title: '消息加载失败', icon: 'none' });
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

function normalizeNotification(row: Record<string, unknown>): NotificationItem {
  return {
    id: Number(row.id || 0),
    type: String(row.type || row.notificationType || row.notification_type || 'template_favorite'),
    title: String(row.title || '模板收藏消息'),
    content: String(row.content || ''),
    actorNickname: String(row.actorNickname || row.actor_nickname || ''),
    actorAvatarUrl: String(row.actorAvatarUrl || row.actor_avatar_url || ''),
    templateId: Number(row.templateId || row.template_id || 0),
    templateTitle: String(row.templateTitle || row.template_title || ''),
    readAt: String(row.readAt || row.read_at || '') || null,
    createdAt: String(row.createdAt || row.created_at || '') || null
  };
}

function openNotification(item: NotificationItem) {
  const fallbackContent = item.type === 'template_review_approved'
    ? `「${item.templateTitle || '模板'}」已通过审核，可在模板列表中展示。`
    : `${item.actorNickname || '有用户'}收藏了你的模板《${item.templateTitle || '模板'}》`;
  detailAnnouncement.value = {
    id: item.id,
    title: item.title,
    content: item.content || fallbackContent,
    type: item.type || 'template_favorite',
    readAt: item.readAt,
    createdAt: item.createdAt || null
  };
  detailVisible.value = true;
  if (auth.isLoggedIn && item.id && !item.readAt) {
    markNotificationRead(item.id).catch(() => undefined);
    const now = new Date().toISOString();
    notifications.value = notifications.value.map((row) => row.id === item.id ? { ...row, readAt: now } : row);
    detailAnnouncement.value = detailAnnouncement.value ? { ...detailAnnouncement.value, readAt: now } : detailAnnouncement.value;
  }
}

async function openAnnouncement(item: AnnouncementItem) {
  detailAnnouncement.value = item;
  detailVisible.value = true;
  if (item.id) {
    try {
      const detail = await getAnnouncementDetail<Record<string, unknown>>(item.id);
      detailAnnouncement.value = normalizeAnnouncement(detail);
    } catch {
      // Keep the list item open when detail fetch fails.
    }
  }
  if (auth.isLoggedIn && item.id && !item.readAt) {
    markAnnouncementRead(item.id).catch(() => undefined);
    const now = new Date().toISOString();
    announcements.value = announcements.value.map((row) => row.id === item.id ? { ...row, readAt: now } : row);
    detailAnnouncement.value = detailAnnouncement.value ? { ...detailAnnouncement.value, readAt: now } : detailAnnouncement.value;
  }
}

function closeAnnouncementDetail() {
  detailVisible.value = false;
}

function announcementPreview(content: string) {
  const text = stripHtml(content).replace(/\s+/g, ' ').trim();
  return text.length > 96 ? `${text.slice(0, 96)}...` : text || '点击查看公告详情';
}

function stripHtml(value: string) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAnnouncementHtml(content: string) {
  const text = String(content || '').trim();
  if (!text) return '<p>暂无内容</p>';
  const safe = text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  if (/<\/?[a-z][\s\S]*>/i.test(safe)) return safe;
  return safe
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');
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
  if (type === 'template_favorite' || type === 'template_review_approved') return '模板';
  return map[type] || '公告';
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const raw = String(value).trim().replace(/\//g, '-');
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?/);
  if (match && !hasTimeZone) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    return `${year}-${padDateTime(month)}-${padDateTime(day)} ${padDateTime(hour)}:${padDateTime(minute)}:${padDateTime(second)}`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return `${date.getFullYear()}-${padDateTime(date.getMonth() + 1)}-${padDateTime(date.getDate())} ${padDateTime(date.getHours())}:${padDateTime(date.getMinutes())}:${padDateTime(date.getSeconds())}`;
}

function padDateTime(value: string | number) {
  return String(value).padStart(2, '0');
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
.announcement-card,
.notification-card {
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

.state-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.state-spinner {
  width: 28rpx;
  height: 28rpx;
  box-sizing: border-box;
  border: 4rpx solid rgba(122, 92, 255, 0.18);
  border-top-color: #7a5cff;
  border-radius: 50%;
  animation: state-spin 0.82s linear infinite;
}

@keyframes state-spin {
  to {
    transform: rotate(360deg);
  }
}

.announcement-list,
.notification-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.announcement-card {
  padding: 26rpx 28rpx;
}

.notification-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 24rpx 26rpx;
}

.notification-avatar {
  flex-shrink: 0;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #f2f0fb;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.announcement-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.announcement-title,
.notification-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10rpx;
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.3;
}

.announcement-title text:last-child,
.notification-title text:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-content {
  margin: 10rpx 0 12rpx;
  color: #596177;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.5;
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
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.announcement-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-top: 18rpx;
}

.announcement-time {
  min-width: 0;
  color: #9aa2b6;
  font-size: 21rpx;
  font-weight: 800;
}

.announcement-open {
  flex-shrink: 0;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
}

.detail-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: calc(32rpx + env(safe-area-inset-top)) 28rpx calc(32rpx + env(safe-area-inset-bottom));
  background: rgba(20, 24, 43, 0.58);
}

.detail-panel {
  width: 660rpx;
  max-width: 100%;
  max-height: 82vh;
  overflow: hidden;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 28rpx 80rpx rgba(26, 31, 58, 0.22);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22rpx;
  padding: 30rpx 32rpx 22rpx;
  border-bottom: 1rpx solid #f0edff;
}

.detail-heading {
  min-width: 0;
}

.detail-title {
  color: #252941;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.3;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 12rpx;
  color: #8a91a8;
  font-size: 22rpx;
  font-weight: 800;
}

.detail-close {
  flex-shrink: 0;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #f5f3ff;
  color: #7a5cff;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 48rpx;
  text-align: center;
}

.detail-scroll {
  box-sizing: border-box;
  height: 58vh;
  padding: 28rpx 32rpx 34rpx;
}

.detail-rich {
  color: #343a52;
  font-size: 27rpx;
  line-height: 1.75;
}
</style>
