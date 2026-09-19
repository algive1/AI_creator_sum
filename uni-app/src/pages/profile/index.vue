<template>
  <view class="page profile-page">
    <AppTopbar class="app-nav-root" title="我的" back transparent />

    <view class="page-content">
      <view v-if="!loggedIn" class="login-card">
        <image class="login-avatar" :src="defaultAvatar" mode="aspectFit" />
        <view class="login-copy">
          <view class="login-title">登录 / 注册</view>
          <view class="login-subtitle">登录后解锁更多创作功能</view>
          <view class="login-benefits">
            <text>云端存储</text>
            <text>多端同步</text>
            <text>专属权益</text>
          </view>
        </view>
        <button class="login-action" @tap="startLoginOnly">立即登录</button>
      </view>

      <view v-else>
        <view class="profile-hero-head">
          <view class="hero-avatar-wrap">
            <image class="hero-avatar" :src="defaultAvatar" mode="aspectFit" />
          </view>
          <view class="profile-user">
            <view class="name-line">
              <text class="user-name">{{ displayName }}</text>
              <text v-if="hasActiveMembership" class="vip-badge">{{ memberPackageBadge }}</text>
              <text v-if="hasActiveMembership" class="role-badge">{{ profileRoleBadge }}</text>
            </view>
            <view class="user-id-row hero-id-row">
              <text>ID：{{ userId }}</text>
              <button class="copy-id" @tap="copyUserId">复制</button>
            </view>
            <view class="user-slogan">创意无限，灵感无限</view>
          </view>
          <view class="profile-side">
            <view class="profile-icons">
              <view class="top-icon" :class="{ unread: hasUnreadMessages }" @tap="openAnnouncements">
                <image class="top-icon-svg" src="/static/icons/icon_message.svg" mode="aspectFit" />
              </view>
              <view class="top-icon" @tap="confirmLogout">
                <image class="top-icon-svg" src="/static/icons/menu_logout.svg" mode="aspectFit" />
              </view>
            </view>
            <view v-if="hasActiveMembership" class="member-pill hero-member-pill" :class="memberView.theme" @tap="openMemberInfo">
              <image :src="memberView.icon" mode="aspectFit" />
              <text>{{ heroMemberBadgeText }}</text>
            </view>
          </view>
        </view>

        <view class="stats-card">
          <view
            v-for="item in profileStats"
            :key="item.label"
            class="stat-item"
            :class="{ tappable: item.tappable }"
            @tap="openProfileStat(item.label)"
          >
            <view class="stat-value">{{ item.value }}</view>
            <view class="stat-label">{{ item.label }}</view>
          </view>
        </view>
      </view>

      <view v-if="showProfileMemberEntry" class="member-banner" :class="{ inactive: !hasActiveMembership, 'with-image': showProfileMemberOfferBanner }" @tap="openMemberOffer">
        <image v-if="showProfileMemberOfferBanner" class="member-banner-image" :src="profileMemberOfferBannerSource" mode="aspectFill" @error="onProfileMemberOfferBannerError" />
        <view v-if="showProfileMemberOfferBanner" class="member-banner-vip-mark">SVIP</view>
        <view class="member-banner-copy">
          <view class="member-title">{{ memberPackageTitle }}</view>
          <view class="member-date">{{ memberPackageSub }}</view>
          <view class="member-tags">
            <text>{{ memberPackageStatusLabel }}</text>
            <text>{{ memberPackageStatusSub }}</text>
          </view>
          <view class="member-banner-action">{{ memberPackageAction }}</view>
        </view>
        <view v-if="!showProfileMemberOfferBanner" class="gift-crown">
          <view class="crown">
            <view class="crown-point one"></view>
            <view class="crown-point two"></view>
            <view class="crown-point three"></view>
          </view>
          <view class="gift-box"></view>
        </view>
      </view>

      <view v-if="profileWorkbenchEnabled" class="section-row creation-section-row">
        <view class="section-title-soft">我的创作台</view>
        <button class="section-link creation-all-link" @tap="openAllCreations">
          <text>全部</text>
          <image src="/static/icons/menu_arrow.svg" mode="aspectFit" />
        </button>
      </view>
      <view v-if="profileWorkbenchEnabled" class="creation-panel">
        <view class="creation-grid">
          <view
            v-for="item in visibleCreationActions"
            :key="item.id"
            class="creation-entry"
            :class="`creation-entry-${item.id}`"
            @tap="openCreation(item.id)"
          >
            <view class="creation-entry-icon">
              <view class="creation-icon-glow"></view>
              <image class="creation-entry-svg" :src="creationIconOf(item.id)" mode="aspectFit" />
            </view>
            <view class="creation-title">{{ creationTitleOf(item) }}</view>
          </view>
        </view>
      </view>

      <view v-if="profilePointsTasksEnabled" class="task-panel">
        <view class="task-panel-head">
          <view>
            <view class="section-title-soft">今日积分任务</view>
            <view class="task-panel-sub">今日最多可赚 120 积分</view>
          </view>
          <view class="task-orb"></view>
        </view>
        <view class="quick-task-grid">
          <view
            v-for="item in visibleProfileQuickTaskCards"
            :key="item.id"
            class="task-feature-card"
            :class="item.className"
            @tap="openQuickTask(item.id)"
          >
            <view class="feature-copy">
              <view class="feature-title">{{ item.title }}</view>
              <view class="feature-sub">{{ item.sub }}</view>
              <view class="feature-action">{{ item.action }}</view>
            </view>
            <image class="feature-illus feature-illus-img" :src="item.image" mode="aspectFit" />
          </view>
        </view>
      </view>

      <view class="menu-list">
        <button
          v-for="item in visibleMenuItems"
          :key="item.id"
          class="menu-item"
          :open-type="item.id === 'service' && loggedIn && customerService.enabled ? 'contact' : undefined"
          :session-from="item.id === 'service' ? String(customerService.sessionFrom || 'profile') : undefined"
          :show-message-card="item.id === 'service' ? Boolean(customerService.showMessageCard) : undefined"
          :send-message-title="item.id === 'service' ? String(customerService.sendMessageTitle || 'AI艺术生成工坊客服咨询') : undefined"
          :send-message-path="item.id === 'service' ? String(customerService.sendMessagePath || PAGE_ROUTES.profile) : undefined"
          :send-message-img="item.id === 'service' ? String(customerService.sendMessageImg || '') : undefined"
          @tap="openMenu(item.id)"
          >
          <view class="menu-left">
            <image class="menu-icon-svg" :src="menuIconOf(item.id)" mode="aspectFit" />
            <text>{{ item.title }}</text>
          </view>
          <view class="menu-right">
            <text v-if="item.desc">{{ item.desc }}</text>
            <image class="menu-arrow" src="/static/icons/menu_arrow.svg" mode="aspectFit" />
          </view>
        </button>
      </view>

      <view v-if="loggedIn" class="phone-card">
        <view class="phone-copy">
          <view class="phone-title">手机验证</view>
          <view class="phone-sub">{{ phoneBound ? phoneText : '绑定后可用于账号安全校验' }}</view>
        </view>
        <button
          class="phone-bind-btn"
          open-type="getPhoneNumber"
          :loading="phoneBinding"
          @getphonenumber="handleGetPhoneNumber"
        >
          {{ phoneBound ? '更新手机号' : '绑定手机号' }}
        </button>
      </view>
    </view>
    <view v-if="showLoginDialog" class="auth-mask" @tap="closeLoginDialog">
      <view class="auth-dialog" @tap.stop>
        <image class="auth-avatar" :src="defaultAvatar" mode="aspectFit" />
        <view class="auth-title">登录后继续使用</view>
        <view class="auth-copy">同步积分、会员和作品库。</view>
        <button class="auth-primary" :loading="loginLoading" @tap="confirmWechatLogin">手机号快捷登录</button>
        <button class="auth-secondary" @tap="closeLoginDialog">暂不登录</button>
      </view>
    </view>

    <AppDialogHost />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getAnnouncements } from '@/api/config';
import { getMyFreeImageQuota, type FreeImageQuotaStatus } from '@/api/free-image-quota';
import { getNotificationUnreadCount } from '@/api/template';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useTaskStore } from '@/stores/task';
import { useUserStore } from '@/stores/user';
import { PAGE_ROUTES } from '@/utils/constants';
import { getMemberView } from '@/utils/member';
import { profileCreationActions, profileMenuItems } from '@/utils/mock';
import { isTaskProcessing } from '@/utils/task-display';
import { canRenderPurchaseUi, canShowProfileMemberEntry, isPurchaseEnabled, showPurchaseUnavailable } from '@/utils/purchase-guard';
import { getFreeImageQuotaRemainingImages, shouldShowFreeImageQuotaTask } from '@/utils/free-image-quota';
import { selectProfileQuickTaskCards, type ProfileQuickTaskCard } from '@/utils/profile-task-cards';
import { ensureLoggedIn } from '@/utils/login-guard';

const auth = useAuthStore();
const config = useConfigStore();
const userStore = useUserStore();
const taskStore = useTaskStore();

const loggedIn = computed(() => auth.isLoggedIn);
const customerService = computed(() => config.customerService);
const defaultAvatar = '/static/visuals/avatar/default_avatar_3d.png';
const memberView = computed(() => getMemberView(userStore.membership));
const membershipEnabled = computed(() => config.publicConfig?.membershipEnabled !== false);
const purchaseEnabled = computed(() => isPurchaseEnabled(config.publicConfig));
const purchaseUiEnabled = computed(() => canRenderPurchaseUi(config.publicConfigReady, config.publicConfig));
const profileWorkbenchEnabled = computed(() => config.publicConfig?.profileWorkbenchEnabled !== false);
const profilePointsTasksEnabled = computed(() => config.publicConfig?.profilePointsTasksEnabled !== false);
const showProfileMemberEntry = computed(() => canShowProfileMemberEntry(config.publicConfigReady, config.publicConfig));
const storyboardGenerateEnabled = computed(() => config.features.storyboardGenerate !== false);
const rawUserId = computed(() => userStore.user?.displayId || auth.user?.displayId || userStore.user?.id || auth.user?.id || '');
const userId = computed(() => formatUserDisplayId(rawUserId.value));
const displayName = computed(() => String(userStore.user?.nickname || auth.user?.nickname || '创意小助手'));
const visibleCreationActions = computed(() => profileCreationActions.filter((item) => item.id !== 'manga' || storyboardGenerateEnabled.value));
const visibleMenuItems = computed(() => profileMenuItems.filter((item) => item.id !== 'service' || customerService.value.showInProfile !== false));
const hasActiveMembership = computed(() => membershipEnabled.value && loggedIn.value && memberView.value.isMember);
const freeQuotaStatus = ref<FreeImageQuotaStatus | null>(null);
const showProfileFreeImageQuota = computed(() => shouldShowFreeImageQuotaTask(freeQuotaStatus.value, hasActiveMembership.value));
const freeQuotaTaskSub = computed(() => {
  const status = freeQuotaStatus.value;
  if (!status) return '今日剩余 0/0 张';
  return `今日剩余 ${getFreeImageQuotaRemainingImages(status)}/${Math.max(0, Number(status.dailyLimit || 0))} 张`;
});
const profileQuickTaskCandidates = computed<ProfileQuickTaskCard[]>(() => [
  {
    id: 'freeImage',
    title: '免费生图',
    sub: freeQuotaTaskSub.value,
    action: '去生成',
    image: '/static/icons/workbench_image.svg',
    className: 'free-image',
    visible: showProfileFreeImageQuota.value,
  },
  {
    id: 'points',
    title: '购买积分',
    sub: '积分不足时快速补充',
    action: '去购买',
    image: '/static/visuals/points/points_buy_3d.png',
    className: 'points',
    visible: purchaseUiEnabled.value,
  },
  {
    id: 'ad',
    title: '看广告得积分',
    sub: '今日可得 30 积分',
    action: '去观看',
    image: '/static/visuals/points/points_ad_3d.png',
    className: 'ad',
  },
  {
    id: 'checkin',
    title: '每日签到',
    sub: '连续签到奖励更多',
    action: '去签到',
    image: '/static/visuals/points/points_checkin_3d.png',
    className: 'checkin',
  },
  {
    id: 'invite',
    title: '邀请好友',
    sub: '好友注册得积分',
    action: '去邀请',
    image: '/static/visuals/points/points_invite_3d.png',
    className: 'invite',
  },
]);
const visibleProfileQuickTaskCards = computed(() => selectProfileQuickTaskCards(profileQuickTaskCandidates.value, 4));
const profileRoleBadge = computed(() => {
  if (memberView.value.kind === 'standard') return '标准版';
  return '专业版';
});
const heroMemberBadgeText = computed(() => {
  if (memberView.value.period === 'forever') return '永久会员';
  return profileRoleBadge.value;
});
const profileAssets = computed(() => {
  const value = userStore.profile?.assets;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const profileStats = computed(() => [
  { label: '积分', value: formatStatNumber(userStore.pointBalance) },
  { label: '作品', value: formatStatNumber(readNumeric(profileAssets.value, ['totalCreations', 'total_creations'], taskStore.list.length)), tappable: true },
  { label: '收藏', value: formatStatNumber(readNumeric(profileAssets.value, ['totalFavorites', 'total_favorites'], 0)), tappable: true },
  { label: '生成中', value: formatStatNumber(taskStore.list.filter((item) => isTaskProcessing(item)).length), tappable: true },
]);
const memberRemainingDays = computed(() => {
  if (!hasActiveMembership.value) return -1;
  const membership = userStore.membership || {};
  const provided = Number(membership.remainingDays || membership.remaining_days);
  if (Number.isFinite(provided) && provided >= 0) return Math.ceil(provided);
  const expireAt = membership.expireAt || membership.expire_at;
  if (!expireAt) return -1;
  const time = new Date(String(expireAt)).getTime();
  if (!Number.isFinite(time)) return -1;
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000));
});
const memberPackageTitle = computed(() => {
  if (!hasActiveMembership.value) return '专业会员';
  const versionName = String(memberView.value.versionName || '').trim();
  if (versionName) return /会员$/.test(versionName) ? versionName : `${versionName}会员`;
  if (memberView.value.kind === 'standard') return '标准会员';
  if (memberView.value.kind === 'pro') return '专业会员';
  return memberView.value.planName || '会员套餐';
});
const memberPackageBadge = computed(() => hasActiveMembership.value && memberView.value.kind === 'standard' ? 'VIP' : 'PRO');
const memberPackageTag = computed(() => {
  if (!hasActiveMembership.value) return 'PRO';
  return memberView.value.periodText ? `${memberView.value.periodText}套餐` : '已开通';
});
const memberPackageSub = computed(() => {
  if (!hasActiveMembership.value) return '享受全部特权，创作无限可能';
  const plan = memberView.value.planName || memberPackageTag.value;
  return `${plan} · ${memberView.value.remainingText || memberView.value.expireText}`;
});
const memberPackageStatusLabel = computed(() => hasActiveMembership.value ? '会员有效期' : '会员套餐');
const memberPackageMetric = computed(() => {
  if (!hasActiveMembership.value) return 'PRO';
  if (memberView.value.period === 'forever') return '永久';
  return memberRemainingDays.value >= 0 ? String(memberRemainingDays.value) : '--';
});
const memberPackageMetricUnit = computed(() => hasActiveMembership.value && memberView.value.period !== 'forever' && memberRemainingDays.value >= 0 ? '天' : '');
const memberPackageStatusSub = computed(() => {
  if (!hasActiveMembership.value) return '开通后展示有效期';
  if (memberView.value.period === 'forever') return '当前套餐永久有效';
  return memberView.value.expireText && memberView.value.expireText !== '未设置' ? `${memberView.value.expireText} 到期` : '有效期未设置';
});
const memberPackageAction = computed(() => hasActiveMembership.value ? '查看会员' : '立即开通');
const phoneBound = computed(() => Boolean(userStore.user?.phoneBound || userStore.user?.phone));
const phoneText = computed(() => String(userStore.user?.phone || '已绑定手机号'));
const LOCAL_PROFILE_MEMBER_OFFER_BANNER = '/static/visuals/member/profile_member_offer_banner.jpg';
const profileMemberOfferBannerRemoteFailed = ref(false);
const profileMemberOfferBannerLocalFailed = ref(false);
const visualAssets = computed(() => {
  const value = config.publicConfig?.visualAssets;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const profileMemberOfferBannerSource = computed(() => {
  const url = String(visualAssets.value.profileMemberOfferBannerUrl || '').trim();
  if (url && !profileMemberOfferBannerRemoteFailed.value) return url;
  return profileMemberOfferBannerLocalFailed.value ? '' : LOCAL_PROFILE_MEMBER_OFFER_BANNER;
});
const showProfileMemberOfferBanner = computed(() => Boolean(profileMemberOfferBannerSource.value));
const hasUnreadAnnouncements = ref(false);
const unreadTemplateNotifications = ref(0);
const hasUnreadMessages = computed(() => hasUnreadAnnouncements.value || unreadTemplateNotifications.value > 0);
const showLoginDialog = ref(false);
const loginLoading = ref(false);
const phoneBinding = ref(false);
const pendingAction = ref<(() => void) | null>(null);
const pendingServiceContact = ref(false);
const creationIcons: Record<string, string> = {
  image: '/static/icons/workbench_image.svg',
  video: '/static/icons/workbench_video.svg',
  manga: '/static/icons/workbench_comic.svg',
  pointsDetail: '/static/icons/workbench_points.svg'
};
const menuIcons: Record<string, string> = {
  tasks: '/static/icons/menu_task.svg',
  service: '/static/icons/menu_service.svg',
  help: '/static/icons/menu_help.svg',
  agreement: '/static/icons/menu_agreement.svg'
};

onShow(() => {
  config.hydrate();
  config.loadPublicConfig().catch(() => undefined);
  if (auth.isLoggedIn) {
    userStore.loadFullProfile().catch(() => undefined);
    taskStore.loadTasks().catch(() => undefined);
    loadUnreadAnnouncements();
    loadFreeImageQuota().catch(() => undefined);
  } else {
    hasUnreadAnnouncements.value = false;
    unreadTemplateNotifications.value = 0;
    freeQuotaStatus.value = null;
  }
});

function openCreation(id: string) {
  if (id === 'pointsDetail') {
    requireLogin(() => openCreationAfterLogin(id));
    return;
  }
  openCreationAfterLogin(id);
}

function openCreationAfterLogin(id: string) {
  if (id === 'image') {
    uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?type=${encodeURIComponent('文生图')}` });
    return;
  }
  if (id === 'video') {
    uni.navigateTo({ url: PAGE_ROUTES.aiVideo });
    return;
  }
  if (id === 'manga') {
    if (!storyboardGenerateEnabled.value) {
      uni.showToast({ title: 'AI漫剧功能已关闭', icon: 'none' });
      return;
    }
    uni.reLaunch({ url: PAGE_ROUTES.comic });
    return;
  }
  if (id === 'pointsDetail') {
    uni.navigateTo({ url: PAGE_ROUTES.pointsDetail });
    return;
  }
  showSoon();
}

function openAllCreations() {
  uni.reLaunch({ url: PAGE_ROUTES.history });
}

function openProfileStat(label: string) {
  if (label === '收藏') {
    requireLogin(() => uni.navigateTo({ url: PAGE_ROUTES.favorites }));
    return;
  }
  if (label === '作品') {
    requireLogin(() => uni.reLaunch({ url: PAGE_ROUTES.history }));
    return;
  }
  if (label === '生成中') {
    requireLogin(() => uni.reLaunch({ url: `${PAGE_ROUTES.history}?filter=${encodeURIComponent('生成中')}` }));
  }
}

function creationTitleOf(item: { id: string; title: string }) {
  if (item.id === 'video') return 'AI生视频';
  if (item.id === 'pointsDetail') return '积分明细';
  return item.title;
}

function openMenu(id: string) {
  if (id === 'tasks') {
    requireLogin(() => openMenuAfterLogin(id));
    return;
  }
  openMenuAfterLogin(id);
}

function openMenuAfterLogin(id: string) {
  if (id === 'tasks') {
    uni.navigateTo({ url: PAGE_ROUTES.tasks });
    return;
  }
  if (id === 'help') {
    uni.navigateTo({ url: `${PAGE_ROUTES.agreement}?type=help` });
    return;
  }
  if (id === 'agreement') {
    uni.navigateTo({ url: PAGE_ROUTES.agreement });
    return;
  }
  if (id === 'service') {
    if (customerService.value.enabled) return;
    uni.showToast({ title: '客服暂未开启', icon: 'none' });
    return;
  }
  showSoon();
}

function openQuickTask(id: string) {
  requireLogin(() => {
    if (id === 'freeImage') {
      uni.navigateTo({ url: PAGE_ROUTES.aiImage });
      return;
    }
    if (id === 'points') {
      if (!purchaseEnabled.value) {
        showPurchaseUnavailable(config.publicConfig);
        return;
      }
      uni.navigateTo({ url: PAGE_ROUTES.points });
    }
    else if (id === 'ad') uni.navigateTo({ url: PAGE_ROUTES.pointsAd });
    else if (id === 'checkin') uni.navigateTo({ url: PAGE_ROUTES.checkin });
    else if (id === 'invite') uni.navigateTo({ url: PAGE_ROUTES.invite });
  });
}

async function loadFreeImageQuota() {
  if (!auth.isLoggedIn) {
    freeQuotaStatus.value = null;
    return;
  }
  freeQuotaStatus.value = await getMyFreeImageQuota();
}

function openAnnouncements() { uni.navigateTo({ url: PAGE_ROUTES.announcements }); }
function confirmLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后需要重新登录才能查看积分、会员和作品库。',
    cancelText: '取消',
    confirmText: '退出',
    confirmColor: '#ff4d5f',
    success: (res) => {
      if (!res.confirm) return;
      userStore.clear().finally(() => {
        auth.logout().catch(() => undefined);
      });
    }
  });
}
function ensureMembershipEnabled() {
  if (!purchaseEnabled.value) {
    showPurchaseUnavailable(config.publicConfig);
    return false;
  }
  if (membershipEnabled.value) return true;
  uni.showToast({ title: '会员功能已关闭', icon: 'none' });
  return false;
}
function openMemberInfo() {
  if (!ensureMembershipEnabled()) return;
  requireLogin(() => uni.navigateTo({ url: PAGE_ROUTES.memberInfo }));
}
function openMemberOffer() {
  if (!ensureMembershipEnabled()) return;
  if (hasActiveMembership.value) {
    requireLogin(() => uni.navigateTo({ url: PAGE_ROUTES.memberInfo }));
    return;
  }
  uni.navigateTo({ url: PAGE_ROUTES.member });
}
function openMemberStatusAction() {
  if (!ensureMembershipEnabled()) return;
  requireLogin(() => uni.navigateTo({ url: hasActiveMembership.value ? PAGE_ROUTES.memberInfo : PAGE_ROUTES.member }));
}
function onProfileMemberOfferBannerError() {
  const url = String(visualAssets.value.profileMemberOfferBannerUrl || '').trim();
  if (url && !profileMemberOfferBannerRemoteFailed.value) {
    profileMemberOfferBannerRemoteFailed.value = true;
    return;
  }
  profileMemberOfferBannerLocalFailed.value = true;
}
function startLoginOnly() { requireLogin(() => undefined); }
function creationIconOf(id: string) { return creationIcons[id] || creationIcons.pointsDetail; }
function menuIconOf(id: string) { return menuIcons[id] || menuIcons.tasks; }
function showSoon() { uni.showToast({ title: '功能即将开放', icon: 'none' }); }
function readNumeric(source: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}
function formatStatNumber(value: unknown) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}万`;
  return String(number);
}
function loadUnreadAnnouncements() {
  Promise.all([
    getAnnouncements<{ list?: Array<Record<string, unknown>> }>({ page: 1, pageSize: 50 }),
    getNotificationUnreadCount<{ total?: number; templateFavoriteCount?: number; templateReviewCount?: number }>()
  ])
    .then(([res, notifications]) => {
      const list = Array.isArray(res.list) ? res.list : [];
      hasUnreadAnnouncements.value = list.some((item) => !item.readAt && !item.read_at);
      const notificationTotal = notifications.total ?? ((notifications.templateFavoriteCount || 0) + (notifications.templateReviewCount || 0));
      unreadTemplateNotifications.value = Math.max(0, Number(notificationTotal || 0));
    })
    .catch(() => {
      hasUnreadAnnouncements.value = false;
      unreadTemplateNotifications.value = 0;
    });
}
async function requireLogin(action: () => void) {
  if (loggedIn.value) {
    action();
    return;
  }
  pendingAction.value = action;
  const loggedInNow = await ensureLoggedIn({
    title: '登录后继续使用',
    subtitle: '登录后可同步积分、会员和作品库。'
  });
  if (loggedInNow) {
    continuePendingAction();
    return;
  }
  pendingAction.value = null;
}

function closeLoginDialog() {
  if (loginLoading.value) return;
  showLoginDialog.value = false;
  pendingAction.value = null;
  pendingServiceContact.value = false;
}

async function confirmWechatLogin() {
  if (loginLoading.value) return;
  loginLoading.value = true;
  try {
    const loggedInNow = await ensureLoggedIn({
      title: '登录后继续使用',
      subtitle: '登录后可同步积分、会员和作品库。'
    });
    if (loggedInNow) {
      showLoginDialog.value = false;
      continuePendingAction();
    }
  } catch (error) {
    uni.showToast({ title: loginErrorText(error), icon: 'none' });
  } finally {
    loginLoading.value = false;
  }
}

function continuePendingAction() {
  const action = pendingAction.value;
  pendingAction.value = null;
  if (pendingServiceContact.value) {
    pendingServiceContact.value = false;
    uni.showToast({ title: '请再次点击联系客服', icon: 'none' });
    return;
  }
  if (action) action();
}

function copyUserId() {
  uni.setClipboardData({ data: userId.value });
}

function formatUserDisplayId(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '00000001';
  if (/^\d{8}$/.test(text)) return text;
  if (/^\d+$/.test(text)) {
    const id = Number.parseInt(text, 10);
    if (Number.isFinite(id)) {
      const mixed = (id * 73856093 + 19349663) % 100000000;
      return String(mixed).padStart(8, '0');
    }
  }
  return text;
}

async function handleGetPhoneNumber(event: any) {
  if (phoneBinding.value) return;
  const code = String(event?.detail?.code || '').trim();
  if (!code) {
    uni.showToast({ title: '未获得手机号授权', icon: 'none' });
    return;
  }
  phoneBinding.value = true;
  try {
    await userStore.bindPhoneByCode(code);
    uni.showToast({ title: '手机号已绑定', icon: 'none' });
  } catch (error) {
    uni.showToast({ title: loginErrorText(error) || '绑定手机号失败', icon: 'none' });
  } finally {
    phoneBinding.value = false;
  }
}

function loginErrorText(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? message.slice(0, 60) : '登录失败，请稍后重试';
}
</script>

<style scoped lang="scss">
.profile-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding-top: 0;
  padding-right: 24rpx;
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
  padding-left: 24rpx;
  background:
    radial-gradient(circle at 12% 6%, rgba(122, 92, 255, 0.18), rgba(255, 255, 255, 0) 26%),
    radial-gradient(circle at 88% 16%, rgba(255, 122, 203, 0.16), rgba(255, 255, 255, 0) 24%),
    linear-gradient(180deg, #f3f6ff 0%, #fbfcff 54%, #f7f4ff 100%);
  color: #252941;
}

.profile-page::before,
.profile-page::after {
  position: fixed;
  z-index: 0;
  content: "";
  pointer-events: none;
}

.profile-page::before {
  top: 56rpx;
  left: 30rpx;
  width: 650rpx;
  height: 430rpx;
  background:
    radial-gradient(circle, rgba(255, 203, 87, 0.62) 0 8rpx, transparent 9rpx) 72% 6% / 148rpx 128rpx,
    radial-gradient(circle, rgba(255, 122, 203, 0.28) 0 10rpx, transparent 11rpx) 9% 74% / 160rpx 130rpx;
}

.profile-page::after {
  top: 120rpx;
  right: -100rpx;
  width: 300rpx;
  height: 300rpx;
  border-radius: 50%;
  background: rgba(232, 240, 255, 0.88);
  filter: blur(20rpx);
}

.page-content {
  position: relative;
  z-index: 1;
  padding: 0;
}

.profile-hero-head {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 142rpx minmax(0, 1fr) 136rpx;
  align-items: center;
  gap: 18rpx;
  min-height: 218rpx;
  margin-bottom: 22rpx;
  padding: 28rpx 28rpx 30rpx;
  box-sizing: border-box;
  border: 2rpx solid rgba(255, 255, 255, 0.82);
  border-radius: 36rpx;
  background:
    radial-gradient(circle at 88% 10%, rgba(255, 200, 87, 0.34), transparent 22%),
    radial-gradient(circle at 8% 18%, rgba(255, 122, 203, 0.24), transparent 26%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(232, 240, 255, 0.72));
  box-shadow: 0 24rpx 56rpx rgba(122, 92, 255, 0.14);
  backdrop-filter: blur(18rpx);
}

.hero-avatar-wrap {
  position: relative;
  z-index: 1;
  width: 142rpx;
  height: 154rpx;
}

.hero-avatar-wrap::before {
  position: absolute;
  right: 8rpx;
  bottom: 4rpx;
  left: 8rpx;
  height: 28rpx;
  border-radius: 50%;
  background: rgba(122, 92, 255, 0.18);
  content: "";
  filter: blur(8rpx);
}

.hero-avatar {
  position: relative;
  z-index: 1;
  display: block;
  width: 142rpx;
  height: 154rpx;
}

.profile-hero-head::before {
  position: absolute;
  right: 38rpx;
  bottom: 24rpx;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(122, 92, 255, 0.18), rgba(255, 122, 203, 0.16));
  content: "";
  filter: blur(2rpx);
}

.profile-hero-head::after {
  position: absolute;
  left: 34rpx;
  top: 28rpx;
  width: 132rpx;
  height: 30rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.54);
  content: "";
  transform: rotate(-16deg);
}

.astronaut {
  position: relative;
  flex-shrink: 0;
  width: 148rpx;
  height: 158rpx;
}

.helmet {
  position: absolute;
  inset: 8rpx 16rpx 18rpx;
  border-radius: 70rpx 70rpx 54rpx 54rpx;
  background:
    radial-gradient(circle at 50% 10%, #c799ff 0 14rpx, transparent 15rpx),
    linear-gradient(150deg, #f8f5ff 0%, #d6caff 52%, #8c68ff 100%);
  box-shadow: inset -12rpx -12rpx 0 rgba(122, 92, 255, 0.14), 0 18rpx 34rpx rgba(122, 92, 255, 0.18);
}

.face {
  position: absolute;
  left: 36rpx;
  top: 48rpx;
  width: 96rpx;
  height: 94rpx;
  overflow: hidden;
  border: 5rpx solid rgba(122, 92, 255, 0.34);
  border-radius: 48rpx;
  background: linear-gradient(180deg, #ffe6d9, #ffc8bd);
}

.hair {
  position: absolute;
  top: -10rpx;
  left: 8rpx;
  width: 80rpx;
  height: 40rpx;
  border-radius: 36rpx 36rpx 18rpx 18rpx;
  background: #4b2834;
}

.eye {
  position: absolute;
  top: 42rpx;
  width: 18rpx;
  height: 22rpx;
  border-radius: 50%;
  background: #2a1b2e;
  box-shadow: inset 3rpx 3rpx 0 rgba(255, 255, 255, 0.72);
}

.eye.left {
  left: 24rpx;
}

.eye.right {
  right: 24rpx;
}

.smile {
  position: absolute;
  left: 38rpx;
  bottom: 18rpx;
  width: 22rpx;
  height: 12rpx;
  border-bottom: 4rpx solid #9d4a59;
  border-radius: 0 0 18rpx 18rpx;
}

.suit {
  position: absolute;
  left: 50rpx;
  bottom: 0;
  width: 72rpx;
  height: 58rpx;
  border-radius: 24rpx 24rpx 18rpx 18rpx;
  background: linear-gradient(180deg, #bba5ff, #7a5cff);
}

.ear {
  position: absolute;
  top: 80rpx;
  width: 28rpx;
  height: 38rpx;
  border-radius: 14rpx;
  background: #ffc857;
}

.ear.left {
  left: 14rpx;
}

.ear.right {
  right: 14rpx;
}

.profile-user {
  min-width: 0;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  width: 100%;
  min-width: 0;
}

.user-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #252941;
  font-size: 33rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-badge,
.role-badge {
  flex-shrink: 0;
  height: 32rpx;
  padding: 0 10rpx;
  border-radius: 16rpx;
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 32rpx;
  white-space: nowrap;
}

.vip-badge {
  background: linear-gradient(135deg, #7a5cff, #ff7acb);
}

.role-badge {
  background: linear-gradient(135deg, #ffc857, #ff7acb);
}

.profile-side {
  position: relative;
  z-index: 2;
  display: flex;
  align-self: stretch;
  align-items: flex-end;
  justify-content: space-between;
  flex-direction: column;
  min-width: 0;
  padding: 6rpx 0;
}

.profile-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8rpx;
  width: 100%;
}

.user-id,
.user-slogan {
  margin-top: 14rpx;
  color: #677095;
  font-size: 23rpx;
  font-weight: 700;
}

.profile-icons {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 14rpx;
  width: 100%;
}

.hero-member-pill {
  max-width: 136rpx;
  margin-top: 18rpx;
  padding-right: 10rpx;
}

.top-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: 0 10rpx 22rpx rgba(122, 92, 255, 0.12);
}

.top-icon.unread::after {
  position: absolute;
  right: 2rpx;
  top: 4rpx;
  width: 12rpx;
  height: 12rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  background: #ff4d5f;
  content: "";
}

.top-icon-svg {
  display: block;
  width: 30rpx;
  height: 30rpx;
}

.member-banner {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 176rpx;
  margin-bottom: 26rpx;
  padding: 34rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.42);
  border-radius: 32rpx;
  background:
    radial-gradient(circle at 78% 46%, rgba(255, 203, 87, 0.3), transparent 26%),
    linear-gradient(135deg, #7a5cff 0%, #8c70ff 56%, #ff7acb 100%);
  color: #ffffff;
  box-shadow: 0 22rpx 40rpx rgba(122, 92, 255, 0.26);
  backdrop-filter: blur(18rpx);
}

.member-banner.inactive {
  background:
    radial-gradient(circle at 78% 46%, rgba(255, 203, 87, 0.25), transparent 26%),
    linear-gradient(135deg, #6b58f0 0%, #7a5cff 56%, #ff7acb 100%);
}

.member-banner.with-image {
  height: 258rpx;
  min-height: 0;
  padding: 26rpx 0 22rpx 28rpx;
  border: 0;
  border-radius: 28rpx;
  background: transparent;
  box-shadow: 0 18rpx 36rpx rgba(255, 112, 150, 0.2);
}

.member-banner-image {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  opacity: 0.18;
}

.member-banner.with-image .member-banner-image {
  opacity: 1;
}

.member-banner-vip-mark {
  position: absolute;
  right: 156rpx;
  top: 137rpx;
  z-index: 1;
  width: 136rpx;
  height: 38rpx;
  opacity: 0.7;
  color: rgba(206, 82, 104, 0.7);
  font-family: Arial, "Helvetica Neue", sans-serif;
  font-size: 27rpx;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 38rpx;
  text-align: center;
  text-transform: uppercase;
  text-shadow:
    0 1rpx 0 rgba(255, 255, 255, 0.34),
    0 3rpx 6rpx rgba(197, 70, 92, 0.08);
  transform: rotate(8deg) skewX(-2deg) scaleY(0.88);
  pointer-events: none;
}

.member-banner-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 440rpx;
}

.member-banner.with-image .member-banner-copy {
  max-width: 358rpx;
}

.member-title {
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.2;
}

.member-banner.with-image .member-title {
  color: #ffffff;
  font-size: 36rpx;
  text-shadow: 0 4rpx 10rpx rgba(178, 62, 91, 0.24);
}

.member-date {
  margin-top: 18rpx;
  color: rgba(255, 255, 255, 0.72);
  font-size: 24rpx;
  font-weight: 800;
}

.member-banner.with-image .member-date {
  margin-top: 10rpx;
  color: rgba(255, 255, 255, 0.94);
  font-size: 23rpx;
  line-height: 1.28;
  text-shadow: 0 3rpx 8rpx rgba(173, 62, 92, 0.2);
}

.member-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 18rpx;
  max-width: 430rpx;
}

.member-tags text {
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 17rpx;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.94);
  font-size: 19rpx;
  font-weight: 900;
  line-height: 34rpx;
}

.member-banner.with-image .member-tags {
  gap: 8rpx;
  margin-top: 14rpx;
  max-width: 350rpx;
}

.member-banner.with-image .member-tags text {
  background: rgba(255, 255, 255, 0.72);
  color: #f06a82;
  box-shadow: inset 0 1rpx rgba(255, 255, 255, 0.9);
}

.member-banner-action {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132rpx;
  height: 44rpx;
  margin-top: 16rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.9);
  color: #f05f7b;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 44rpx;
  box-shadow: 0 10rpx 22rpx rgba(215, 69, 111, 0.18);
}

.gift-crown {
  position: relative;
  z-index: 1;
  width: 170rpx;
  height: 130rpx;
}

.gift-box {
  position: absolute;
  right: 0;
  bottom: 6rpx;
  width: 148rpx;
  height: 82rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #bfa9ff, #775aff);
  box-shadow: inset 0 -12rpx 0 rgba(65, 44, 200, 0.18);
}

.gift-box::before {
  position: absolute;
  left: 50%;
  top: 0;
  width: 22rpx;
  height: 82rpx;
  background: #ffc857;
  content: "";
  transform: translateX(-50%);
}

.crown {
  position: absolute;
  right: 18rpx;
  top: 8rpx;
  width: 118rpx;
  height: 72rpx;
  border-radius: 14rpx 14rpx 24rpx 24rpx;
  background: linear-gradient(180deg, #ffdf77, #ffc857);
  transform: rotate(-12deg);
}

.crown-point {
  position: absolute;
  top: -28rpx;
  width: 32rpx;
  height: 52rpx;
  border-radius: 18rpx 18rpx 0 0;
  background: #ffc857;
}

.crown-point.one { left: 0; transform: rotate(-22deg); }
.crown-point.two { left: 42rpx; top: -38rpx; }
.crown-point.three { right: 0; transform: rotate(22deg); }

.stats-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 34rpx;
  padding: 28rpx 8rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
  backdrop-filter: blur(16rpx);
}

.stat-item {
  min-width: 0;
  border-right: 1rpx solid rgba(103, 112, 149, 0.16);
  text-align: center;
}

.stat-item.tappable {
  position: relative;
}

.stat-item.tappable::after {
  content: '';
  display: block;
  width: 8rpx;
  height: 8rpx;
  margin: 8rpx auto 0;
  border-top: 2rpx solid #b6add8;
  border-right: 2rpx solid #b6add8;
  transform: rotate(45deg);
}

.stat-item:last-child {
  border-right: 0;
}

.stat-value {
  color: #7a5cff;
  font-size: 33rpx;
  font-weight: 900;
}

.stat-item:first-child .stat-value {
  color: #7a5cff;
  text-shadow: 0 8rpx 16rpx rgba(255, 200, 87, 0.18);
}

.stat-label {
  margin-top: 10rpx;
  color: #8b91aa;
  font-size: 20rpx;
  font-weight: 800;
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 4rpx 20rpx;
}

.section-title-soft {
  color: #252941;
  font-size: 30rpx;
  font-weight: 900;
}

.section-link {
  color: #8b91aa;
  font-size: 22rpx;
  font-weight: 800;
}

.creation-section-row {
  margin-top: 4rpx;
  margin-bottom: 14rpx;
}

.creation-all-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 44rpx;
  padding: 0 2rpx 0 16rpx;
  color: #8b91aa;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 44rpx;
}

.creation-all-link image {
  width: 20rpx;
  height: 20rpx;
  opacity: 0.68;
}

.creation-panel {
  position: relative;
  margin-bottom: 32rpx;
  padding: 18rpx 16rpx;
  border: 2rpx solid rgba(122, 92, 255, 0.06);
  border-radius: 28rpx;
  background: rgba(248, 250, 255, 0.84);
  box-shadow: 0 18rpx 42rpx rgba(91, 105, 160, 0.12);
  backdrop-filter: blur(16rpx);
}

.creation-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14rpx;
}

.creation-entry {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 166rpx;
  padding: 18rpx 8rpx 16rpx;
  border: 2rpx solid rgba(122, 92, 255, 0.1);
  border-radius: 24rpx;
  background:
    radial-gradient(circle at 70% 12%, rgba(255, 255, 255, 0.95), transparent 34%),
    linear-gradient(180deg, #f9f8ff 0%, #eef4ff 100%);
  color: #1f2437;
  text-align: center;
  box-shadow: 0 12rpx 26rpx rgba(88, 97, 142, 0.11);
  transform: translateZ(0);
  transition: transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out;
}

.creation-entry::before {
  position: absolute;
  top: 16rpx;
  left: 50%;
  width: 94rpx;
  height: 94rpx;
  border-radius: 30rpx;
  background: linear-gradient(145deg, rgba(244, 239, 255, 0.78), rgba(235, 245, 255, 0.56));
  box-shadow: 0 12rpx 24rpx rgba(118, 92, 255, 0.1);
  content: '';
  transform: translateX(-50%);
}

.creation-entry:active {
  border-color: rgba(122, 92, 255, 0.18);
  box-shadow: 0 8rpx 18rpx rgba(116, 125, 170, 0.14);
  transform: translateY(3rpx) scale(0.98);
}

.creation-entry-icon {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 102rpx;
  height: 102rpx;
  margin: 0 auto 12rpx;
}

.creation-icon-glow {
  position: absolute;
  inset: 8rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.46), transparent 28%),
    linear-gradient(135deg, rgba(122, 92, 255, 0.16), rgba(255, 122, 203, 0.13));
}

.creation-entry-svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 86rpx;
  height: 86rpx;
}

.creation-title {
  position: relative;
  z-index: 1;
  overflow: hidden;
  color: #1f2437;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creation-entry-image {
  border-color: rgba(126, 92, 255, 0.13);
  background:
    radial-gradient(circle at 74% 14%, rgba(255, 255, 255, 0.58), transparent 34%),
    linear-gradient(180deg, #f3edff 0%, #f8fbff 100%);
}

.creation-entry-video {
  border-color: rgba(72, 169, 255, 0.13);
  background:
    radial-gradient(circle at 74% 14%, rgba(255, 255, 255, 0.58), transparent 34%),
    linear-gradient(180deg, #ecf8ff 0%, #f8fbff 100%);
}

.creation-entry-manga {
  border-color: rgba(255, 122, 203, 0.14);
  background:
    radial-gradient(circle at 74% 14%, rgba(255, 255, 255, 0.58), transparent 34%),
    linear-gradient(180deg, #fff0fa 0%, #fbf7ff 100%);
}

.creation-entry-pointsDetail {
  border-color: rgba(255, 177, 65, 0.18);
  background:
    radial-gradient(circle at 74% 14%, rgba(255, 255, 255, 0.58), transparent 34%),
    linear-gradient(180deg, #fff6df 0%, #f9fbff 100%);
}

.task-panel {
  position: relative;
  overflow: hidden;
  margin-bottom: 28rpx;
  padding: 28rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.78);
  border-radius: 32rpx;
  background:
    radial-gradient(circle at 92% 8%, rgba(255, 200, 87, 0.24), transparent 24%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(232, 240, 255, 0.7));
  box-shadow: 0 24rpx 52rpx rgba(122, 92, 255, 0.14);
  backdrop-filter: blur(18rpx);
}

.task-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.task-panel-sub {
  margin-top: 10rpx;
  color: #8b91aa;
  font-size: 22rpx;
  font-weight: 800;
}

.task-orb {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 28%, #ffffff 0 12rpx, transparent 13rpx),
    linear-gradient(135deg, #ffc857, #ff7acb);
  box-shadow: inset -8rpx -10rpx 0 rgba(122, 92, 255, 0.1), 0 18rpx 30rpx rgba(255, 200, 87, 0.24);
}

.quick-task-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.task-feature-card {
  position: relative;
  overflow: hidden;
  min-height: 176rpx;
  padding: 28rpx 16rpx 20rpx 24rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.88);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 82% 20%, rgba(255, 255, 255, 0.78), transparent 20%),
    linear-gradient(135deg, rgba(255, 238, 250, 0.94), rgba(232, 240, 255, 0.92));
  box-shadow: 0 20rpx 38rpx rgba(122, 92, 255, 0.12);
}

.task-feature-card.points {
  background:
    radial-gradient(circle at 84% 20%, rgba(255, 255, 255, 0.82), transparent 20%),
    radial-gradient(circle at 76% 78%, rgba(255, 200, 87, 0.24), transparent 24%),
    linear-gradient(135deg, rgba(255, 249, 232, 0.96), rgba(232, 240, 255, 0.9));
}

.task-feature-card.free-image {
  background:
    radial-gradient(circle at 84% 20%, rgba(255, 255, 255, 0.82), transparent 20%),
    radial-gradient(circle at 76% 78%, rgba(122, 92, 255, 0.18), transparent 24%),
    linear-gradient(135deg, rgba(236, 250, 255, 0.96), rgba(255, 241, 250, 0.92));
}

.task-feature-card.checkin {
  background:
    radial-gradient(circle at 84% 20%, rgba(255, 255, 255, 0.78), transparent 20%),
    linear-gradient(135deg, rgba(240, 236, 255, 0.96), rgba(255, 241, 250, 0.92));
}

.task-feature-card.invite {
  background:
    radial-gradient(circle at 86% 18%, rgba(255, 255, 255, 0.8), transparent 20%),
    radial-gradient(circle at 72% 82%, rgba(255, 200, 87, 0.22), transparent 24%),
    linear-gradient(135deg, rgba(255, 246, 253, 0.96), rgba(232, 240, 255, 0.92));
}

.task-feature-card::before,
.task-feature-card::after {
  position: absolute;
  border-radius: 50%;
  content: "";
}

.task-feature-card::before {
  top: 22rpx;
  right: 52rpx;
  width: 18rpx;
  height: 18rpx;
  background: #b58dff;
}

.task-feature-card::after {
  top: 70rpx;
  right: 28rpx;
  width: 14rpx;
  height: 14rpx;
  background: #ff7acb;
}

.feature-copy {
  position: relative;
  z-index: 2;
  width: 58%;
}

.task-feature-card.points .feature-copy {
  width: 72%;
}

.feature-title {
  color: #252a3d;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.2;
}

.feature-sub {
  margin-top: 12rpx;
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.25;
}

.task-feature-card.points .feature-sub {
  white-space: nowrap;
}

.feature-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 94rpx;
  height: 40rpx;
  margin-top: 22rpx;
  padding: 0 16rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #7a5cff, #8d70ff);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  box-shadow: 0 10rpx 20rpx rgba(122, 92, 255, 0.24);
}

.feature-illus {
  position: absolute;
  right: 4rpx;
  bottom: 0;
  z-index: 1;
}

.feature-illus-img {
  width: 126rpx;
  height: 126rpx;
}

.menu-list {
  overflow: hidden;
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 86rpx;
  padding: 0 28rpx;
  border-bottom: 1rpx solid rgba(103, 112, 149, 0.1);
  border-radius: 0;
  background: transparent;
}

.menu-item:last-child {
  border-bottom: 0;
}

.menu-left,
.menu-right {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}

.menu-left {
  color: #414765;
  font-size: 25rpx;
  font-weight: 900;
}

.menu-right {
  flex-shrink: 0;
  color: #a0a7bd;
  font-size: 21rpx;
  font-weight: 800;
}

.menu-icon-svg {
  display: block;
  flex-shrink: 0;
  width: 36rpx;
  height: 36rpx;
}

.menu-arrow {
  display: block;
  flex-shrink: 0;
  width: 28rpx;
  height: 28rpx;
}

.phone-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 112rpx;
  margin-top: 26rpx;
  padding: 22rpx 24rpx;
  border: 2rpx solid rgba(122, 92, 255, 0.12);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 14rpx 34rpx rgba(122, 92, 255, 0.1);
  box-sizing: border-box;
}

.phone-copy {
  min-width: 0;
}

.phone-title {
  color: #252941;
  font-size: 27rpx;
  font-weight: 900;
}

.phone-sub {
  margin-top: 8rpx;
  color: #8b93aa;
  font-size: 22rpx;
  font-weight: 700;
}

.phone-bind-btn {
  flex-shrink: 0;
  min-width: 168rpx;
  height: 64rpx;
  padding: 0 22rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #6d5cff, #ff7acb);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 64rpx;
}

.login-card {
  display: grid;
  grid-template-columns: 154rpx minmax(0, 1fr) 176rpx;
  align-items: center;
  gap: 24rpx;
  min-height: 206rpx;
  margin-bottom: 34rpx;
  padding: 30rpx 30rpx 30rpx 26rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 86% 30%, rgba(255, 92, 184, 0.12), transparent 28%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(247, 244, 255, 0.92));
  box-shadow: 0 18rpx 38rpx rgba(122, 92, 255, 0.12);
  box-sizing: border-box;
}

.login-avatar {
  width: 154rpx;
  height: 154rpx;
}

.login-copy {
  min-width: 0;
}

.login-title {
  color: #1f2437;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.2;
}

.login-subtitle {
  margin-top: 18rpx;
  color: #6f76a0;
  font-size: 25rpx;
  font-weight: 800;
}

.login-benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 28rpx;
  color: #7a5cff;
  font-size: 21rpx;
  font-weight: 900;
}

.login-action {
  height: 68rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #6c4bff, #ff5cb8);
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 68rpx;
  box-shadow: 0 14rpx 28rpx rgba(122, 92, 255, 0.22);
}

.membership-offer-card {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-areas:
    "crown copy status"
    "crown benefits status";
  grid-template-columns: 214rpx minmax(0, 1fr) 176rpx;
  grid-template-rows: auto 1fr;
  gap: 14rpx 12rpx;
  min-height: 286rpx;
  margin-bottom: 34rpx;
  padding: 24rpx;
  border-radius: 28rpx;
  background:
    linear-gradient(158deg, rgba(255, 255, 255, 0.16) 0 1rpx, transparent 2rpx 100%),
    linear-gradient(118deg, #28077d 0%, #4a16b8 46%, #7b2bdc 100%);
  box-shadow: 0 24rpx 48rpx rgba(77, 34, 177, 0.25);
  box-sizing: border-box;
  color: #ffffff;
}

.membership-offer-card::before {
  position: absolute;
  right: -78rpx;
  bottom: -72rpx;
  width: 490rpx;
  height: 190rpx;
  border-radius: 50%;
  background: rgba(255, 93, 205, 0.18);
  content: '';
}

.membership-offer-card::after {
  position: absolute;
  top: 36rpx;
  right: 30rpx;
  width: 118rpx;
  height: 78rpx;
  border-radius: 999rpx 999rpx 18rpx 18rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.02));
  content: '';
}

.membership-offer-card:active {
  transform: translateY(3rpx) scale(0.992);
}

.membership-offer-image {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  opacity: 0.16;
}

.membership-crown-wrap {
  position: relative;
  z-index: 1;
  grid-area: crown;
  align-self: center;
  justify-self: center;
  width: 214rpx;
  height: 214rpx;
}

.membership-crown {
  width: 224rpx;
  height: 178rpx;
  margin-top: 4rpx;
  margin-left: -10rpx;
  filter: drop-shadow(0 16rpx 18rpx rgba(37, 5, 109, 0.28));
}

.membership-pro-badge {
  position: absolute;
  left: 50%;
  bottom: 8rpx;
  min-width: 112rpx;
  height: 50rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #ff8eff, #b54cff);
  box-shadow: inset 0 2rpx 0 rgba(255, 255, 255, 0.46), 0 10rpx 20rpx rgba(27, 4, 89, 0.18);
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 50rpx;
  text-align: center;
  transform: translateX(-50%);
}

.membership-offer-copy {
  position: relative;
  z-index: 1;
  grid-area: copy;
  align-self: end;
  min-width: 0;
}

.membership-title-line {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.membership-offer-title {
  overflow: hidden;
  min-width: 0;
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.membership-offer-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 132rpx;
  height: 40rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #fff4ff, #cbb4ff);
  color: #3a178e;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 40rpx;
}

.membership-offer-sub {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.88);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.32;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.membership-status-panel {
  position: relative;
  z-index: 1;
  grid-area: status;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding-left: 22rpx;
  border-left: 1rpx solid rgba(255, 255, 255, 0.22);
}

.membership-status-label {
  color: rgba(255, 255, 255, 0.86);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.2;
}

.membership-status-value {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  min-width: 0;
  margin-top: 12rpx;
}

.status-number {
  color: #ffffff;
  font-size: 54rpx;
  font-weight: 900;
  line-height: 1;
}

.status-unit {
  color: rgba(255, 255, 255, 0.86);
  font-size: 24rpx;
  font-weight: 800;
}

.membership-status-date {
  overflow: hidden;
  max-width: 100%;
  margin-top: 14rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 21rpx;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.membership-offer-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56rpx;
  margin-top: 18rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #fff7ed, #ffdce8);
  color: #6c22d7;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 56rpx;
  gap: 8rpx;
}

.membership-offer-action::after {
  flex-shrink: 0;
  width: 10rpx;
  height: 10rpx;
  border-top: 3rpx solid #6c22d7;
  border-right: 3rpx solid #6c22d7;
  content: '';
  transform: rotate(45deg);
}

.membership-benefit-row {
  position: relative;
  z-index: 1;
  grid-area: benefits;
  align-self: end;
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.membership-benefit {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.membership-benefit-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.16);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
}

.membership-benefit-icon image {
  width: 36rpx;
  height: 36rpx;
}

.profile-member-card {
  position: relative;
  overflow: hidden;
  margin-bottom: 34rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 84% 26%, rgba(255, 92, 184, 0.18), transparent 28%),
    radial-gradient(circle at 18% 10%, rgba(108, 75, 255, 0.13), transparent 26%),
    linear-gradient(135deg, #f1ecff, #fff3fb 68%, #ffe8f4);
  box-shadow: 0 20rpx 42rpx rgba(122, 92, 255, 0.14);
  box-sizing: border-box;
}

.profile-card-top {
  display: grid;
  grid-template-columns: 140rpx minmax(0, 1fr) 108rpx;
  gap: 22rpx;
  align-items: start;
}

.user-avatar {
  width: 132rpx;
  height: 132rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.86);
  border-radius: 50%;
  background: #f1ecff;
  box-shadow: 0 12rpx 26rpx rgba(122, 92, 255, 0.16);
}

.user-id-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  margin-top: 18rpx;
  color: #677095;
  font-size: 24rpx;
  font-weight: 800;
}

.user-id-row text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-id {
  flex-shrink: 0;
  height: 36rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: rgba(122, 92, 255, 0.1);
  color: #7a5cff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 36rpx;
}

.member-pill {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  max-width: 100%;
  height: 42rpx;
  margin-top: 18rpx;
  padding: 0 14rpx 0 8rpx;
  border-radius: 999rpx;
  background: #eef1f7;
  color: #5f687d;
  font-size: 22rpx;
  font-weight: 900;
  box-sizing: border-box;
}

.member-pill.standard {
  background: #efeaff;
  color: #6c4bff;
}

.member-pill.pro,
.member-pill.forever {
  background: #fff1d8;
  color: #9b5a11;
}

.member-pill image {
  flex-shrink: 0;
  width: 32rpx;
  height: 32rpx;
}

.member-pill text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-pill .pill-arrow {
  width: 22rpx;
  height: 22rpx;
}

.profile-card-actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 28rpx;
}

.member-crown-icon {
  width: 104rpx;
  height: 104rpx;
  opacity: 0.96;
}

.member-valid-card {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18rpx;
  min-height: 116rpx;
  margin-top: 26rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.72);
  box-sizing: border-box;
}

.valid-label,
.valid-start {
  color: #747b96;
  font-size: 23rpx;
  font-weight: 800;
}

.valid-date {
  margin-top: 10rpx;
  color: #11183a;
  font-size: 34rpx;
  font-weight: 900;
}

.valid-start {
  margin-top: 14rpx;
}

.days-pill {
  height: 42rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 92, 139, 0.12);
  color: #ff4f8f;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 42rpx;
}

.renew-btn {
  grid-column: 2;
  min-width: 142rpx;
  height: 62rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #6c4bff, #ff5cb8);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 62rpx;
}

.auth-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: rgba(31, 36, 55, 0.32);
  box-sizing: border-box;
}

.auth-dialog {
  width: 100%;
  max-width: 620rpx;
  padding: 42rpx 34rpx 30rpx;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 26rpx 60rpx rgba(31, 36, 55, 0.22);
  text-align: center;
  box-sizing: border-box;
}

.auth-avatar {
  width: 150rpx;
  height: 150rpx;
  margin-bottom: 18rpx;
}

.auth-title {
  color: #1f2437;
  font-size: 34rpx;
  font-weight: 900;
}

.auth-copy {
  margin: 14rpx auto 30rpx;
  color: #747b96;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 1.5;
}

.auth-primary,
.auth-secondary {
  height: 74rpx;
  border-radius: 999rpx;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 74rpx;
}

.auth-primary {
  background: linear-gradient(135deg, #6c4bff, #ff5cb8);
  color: #ffffff;
}

.auth-secondary {
  margin-top: 18rpx;
  background: #f3f0ff;
  color: #747b96;
}

</style>
