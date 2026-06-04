<template>
  <view class="points-buy-page">
    <view class="content">
      <view class="hero-card">
        <view class="hero-copy">
          <view class="hero-title">积分可用于</view>
          <view class="hero-title">所有AI创作功能</view>
          <view class="hero-subtitle">文生图 · 图生图 · 视频生成 · 更多功能</view>
        </view>
        <view class="coin-stage">
          <view class="coin-orbit"></view>
          <view class="coin-main"><view class="coin-star"></view></view>
          <view class="hero-dot one"></view>
          <view class="hero-dot two"></view>
          <view class="hero-dot three"></view>
        </view>
      </view>

      <view class="balance-strip">
        <view class="balance-left">
          <view class="mini-coin"></view>
          <text class="balance-label">我的积分</text>
          <text class="balance-value">{{ balance }}</text>
          <text class="balance-unit">积分</text>
        </view>
        <view class="detail-link" @tap="goPointDetails">
          <text>积分明细</text>
          <text class="chevron">›</text>
        </view>
      </view>

      <view class="package-panel">
        <view class="section-head">
          <view class="section-title">选择积分套餐</view>
          <view class="section-pill">安全支付</view>
        </view>
        <view v-if="packages.length" class="package-grid">
          <view
            v-for="(pkg, index) in packages"
            :key="packageKey(pkg, index)"
            class="point-package-card"
            :class="{ active: selectedPackageId === packageId(pkg), fallback: isFallbackPackage(pkg) }"
            @tap="selectPackage(pkg)"
          >
            <view v-if="packageTag(pkg, index)" class="package-tag" :class="{ campaign: campaignLabel(pkg) }">{{ packageTag(pkg, index) }}</view>
            <view class="package-points">
              <text>{{ packagePoints(pkg) }}</text>
              <text>积分</text>
            </view>
            <view class="package-estimate">≈ {{ generationCount(pkg) }}次图片生成</view>
            <view class="package-price">￥{{ price(pkg) }}</view>
            <view class="package-unit">{{ unitPrice(pkg) }}元/次</view>
            <button class="package-buy" :loading="isPaying && selectedPackageId === packageId(pkg)" @tap.stop="buy(pkg)">{{ isFallbackPackage(pkg) ? '待配置' : '购买' }}</button>
          </view>
        </view>
        <view v-else class="empty-packages">暂无可购买套餐</view>
      </view>

      <view class="security-strip" @tap="openServiceConfirm">
        <image class="security-icon" src="/static/icons/icon_security_shield.svg" mode="aspectFit" />
        <view class="security-title">安全保障</view>
        <view class="security-copy">支付安全可靠，积分即时到账，充值问题可联系在线客服</view>
        <view class="chevron security-chevron">›</view>
      </view>

      <view class="intro-panel">
        <view class="intro-title">积分说明</view>
        <view class="intro-grid">
          <view class="intro-item">
            <image class="intro-icon" src="/static/icons/icon_intro_image.svg" mode="aspectFit" />
            <view class="intro-name">约{{ exampleGenerationCount }}次图片生成</view>
            <view class="intro-copy">{{ examplePackagePoints }}积分可生成{{ exampleGenerationCount }}次标准图片</view>
          </view>
          <view class="intro-item">
            <image class="intro-icon" src="/static/icons/icon_intro_time.svg" mode="aspectFit" />
            <view class="intro-name">长期有效</view>
            <view class="intro-copy">积分永久有效，可随时使用</view>
          </view>
          <view class="intro-item">
            <image class="intro-icon" src="/static/icons/icon_intro_stack.svg" mode="aspectFit" />
            <view class="intro-name">多功能通用</view>
            <view class="intro-copy">支持所有AI创作功能，不区分类型</view>
          </view>
        </view>
      </view>

      <view class="agreement-line">购买即代表同意《积分服务协议》</view>
    </view>

    <view v-if="showServiceConfirm" class="service-confirm-mask" @tap="closeServiceConfirm">
      <view class="service-confirm" @tap.stop>
        <view class="service-confirm-title">咨询客服</view>
        <view class="service-confirm-copy">是否联系在线客服处理充值或积分到账问题？</view>
        <view class="service-confirm-actions">
          <button class="service-confirm-btn ghost" @tap="closeServiceConfirm">暂不咨询</button>
          <button
            class="service-confirm-btn primary"
            open-type="contact"
            :session-from="String(customerService.sessionFrom || 'points')"
            :show-message-card="Boolean(customerService.showMessageCard)"
            :send-message-title="String(customerService.sendMessageTitle || 'AI创作助手客服咨询')"
            :send-message-path="String(customerService.sendMessagePath || PAGE_ROUTES.points)"
            :send-message-img="String(customerService.sendMessageImg || '')"
          >
            咨询客服
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getBalance, getPointPackages } from '@/api/points';
import { createOrder, payOrder } from '@/api/payment';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { PAGE_ROUTES } from '@/utils/constants';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';

type PointPackage = Record<string, unknown>;

const balance = ref(0);
const packages = ref<PointPackage[]>([]);
const selectedPackageId = ref('');
const isPaying = ref(false);
const showServiceConfirm = ref(false);
const configStore = useConfigStore();
const authStore = useAuthStore();
const customerService = computed(() => configStore.customerService);
const fallbackPointPackages: PointPackage[] = [
  { id: 'dev_60', points: 60, priceCents: 600, description: '示例', __fallback: true },
  { id: 'dev_180', points: 180, priceCents: 1800, description: '热门', __fallback: true },
  { id: 'dev_600', points: 600, priceCents: 5800, description: '推荐', __fallback: true },
  { id: 'dev_1280', points: 1280, priceCents: 10800, __fallback: true },
  { id: 'dev_3000', points: 3000, priceCents: 22800, __fallback: true },
  { id: 'dev_6480', points: 6480, priceCents: 44800, __fallback: true }
];

const examplePackagePoints = computed(() => packagePoints(packages.value[0]) || 60);
const exampleGenerationCount = computed(() => Math.max(1, Math.floor(examplePackagePoints.value / 2)));

onShow(() => {
  uni.setNavigationBarTitle({ title: '积分购买' });
  authStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  loadPageData();
});

function loadPageData() {
  if (authStore.isLoggedIn) {
    getBalance<Record<string, unknown>>()
      .then((res) => { balance.value = Number(res.balance || 0); })
      .catch(() => undefined);
  } else {
    balance.value = 0;
  }

  getPointPackages<{ list?: PointPackage[]; records?: PointPackage[] } | PointPackage[]>()
    .then((res) => {
      const list = Array.isArray(res) ? res : (Array.isArray(res.list) ? res.list : res.records || []);
      setPackages(list, 'empty point package list');
    })
    .catch(() => { setPackages([], 'point package api failed'); });
}

function setPackages(list: PointPackage[], fallbackReason: string) {
  if (list.length) {
    packages.value = list;
  } else if (isDevFallbackEnabled) {
    warnDevFallback('points-package', fallbackReason);
    packages.value = fallbackPointPackages;
  } else {
    packages.value = [];
  }
  if (!selectedPackageId.value && packages.value.length) selectedPackageId.value = packageId(packages.value[0]);
}

function packageKey(pkg: PointPackage, index: number) {
  return packageId(pkg) || `${index}`;
}

function packageId(pkg: PointPackage) {
  return String(pkg?.id || pkg?.packageId || '');
}

function isFallbackPackage(pkg: PointPackage) {
  return Boolean(pkg.__fallback);
}

function packagePoints(pkg?: PointPackage) {
  return Number(pkg?.points || pkg?.pointsAmount || pkg?.points_amount || 0);
}

function packageTag(pkg: PointPackage, index: number) {
  const campaign = campaignLabel(pkg);
  if (campaign) return campaign;
  const description = String(pkg.description || '').trim();
  if (description && description.length <= 6) return description;
  if (index === 1) return '热门';
  if (index === 2) return '推荐';
  return '';
}

function firstPurchaseBonusType(pkg: PointPackage) {
  const type = String(pkg.firstPurchaseBonusType || pkg.first_purchase_bonus_type || 'none');
  return type === 'double' || type === 'fixed' ? type : 'none';
}

function firstPurchaseBonusPoints(pkg: PointPackage) {
  return Math.max(0, Number(pkg.firstPurchaseBonusPoints || pkg.first_purchase_bonus_points || 0));
}

function campaignLabel(pkg: PointPackage) {
  const type = firstPurchaseBonusType(pkg);
  if (type === 'double') return '首充双倍';
  if (type === 'fixed' && firstPurchaseBonusPoints(pkg) > 0) return '首充赠送';
  return '';
}

function generationCount(pkg: PointPackage) {
  return Math.max(1, Math.floor(packagePoints(pkg) / 2));
}

function price(pkg: PointPackage) {
  const cents = Number(pkg.priceCents || pkg.price_cents || 0);
  if (cents) return formatMoney(cents / 100);
  const rawPrice = Number(pkg.price || 0);
  return rawPrice ? formatMoney(rawPrice) : '0';
}

function unitPrice(pkg: PointPackage) {
  const cents = Number(pkg.priceCents || pkg.price_cents || 0);
  const amount = cents ? cents / 100 : Number(pkg.price || 0);
  const count = generationCount(pkg);
  if (!amount || !count) return '0.00';
  return (amount / count).toFixed(2);
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function selectPackage(pkg: PointPackage) {
  selectedPackageId.value = packageId(pkg);
}

async function buy(pkg: PointPackage) {
  if (isFallbackPackage(pkg)) {
    uni.showToast({ title: '请先在后台配置套餐', icon: 'none' });
    return;
  }
  const productId = Number(pkg.id || pkg.packageId);
  if (!productId) {
    uni.showToast({ title: '套餐数据异常', icon: 'none' });
    return;
  }
  if (isPaying.value) return;
  if (!authStore.isLoggedIn) {
    uni.navigateTo({ url: `${PAGE_ROUTES.login}?redirect=${encodeURIComponent(PAGE_ROUTES.points)}` });
    return;
  }
  selectedPackageId.value = packageId(pkg);
  isPaying.value = true;
  try {
    const order = await createOrder<Record<string, unknown>>('points', productId);
    const orderNo = String(order.orderNo || '');
    if (orderNo) {
      await payOrder(orderNo);
      loadPageData();
    }
  } finally {
    isPaying.value = false;
  }
}

function goPointDetails() {
  if (!authStore.isLoggedIn) {
    uni.navigateTo({ url: `${PAGE_ROUTES.login}?redirect=${encodeURIComponent(PAGE_ROUTES.pointsDetail)}` });
    return;
  }
  uni.navigateTo({ url: PAGE_ROUTES.pointsDetail });
}

function openServiceConfirm() {
  if (customerService.value.enabled === false) {
    uni.showToast({ title: '客服暂未开启', icon: 'none' });
    return;
  }
  showServiceConfirm.value = true;
}

function closeServiceConfirm() {
  showServiceConfirm.value = false;
}
</script>

<style scoped lang="scss">
.points-buy-page {
  min-height: 100vh;
  overflow-x: hidden;
  padding: 24rpx 24rpx calc(44rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 14% 8%, rgba(122, 92, 255, 0.12), transparent 28%),
    radial-gradient(circle at 86% 4%, rgba(255, 200, 87, 0.12), transparent 26%),
    linear-gradient(180deg, #f8f8ff 0%, #ffffff 48%, #f5f3ff 100%);
  color: #20263a;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.hero-card {
  position: relative;
  overflow: hidden;
  min-height: 220rpx;
  padding: 34rpx 30rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 96% 82%, rgba(255, 200, 87, 0.5), transparent 12%),
    radial-gradient(circle at 62% 42%, rgba(255, 200, 87, 0.5), transparent 8%),
    linear-gradient(135deg, #735cff 0%, #8c66ff 48%, #ff70bc 100%);
  box-shadow: 0 22rpx 48rpx rgba(122, 92, 255, 0.24);
}

.hero-copy {
  position: relative;
  z-index: 2;
  max-width: 410rpx;
}

.hero-title {
  color: #ffffff;
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.26;
  text-shadow: 0 8rpx 20rpx rgba(87, 52, 210, 0.22);
}

.hero-subtitle {
  margin-top: 20rpx;
  color: rgba(255, 255, 255, 0.92);
  font-size: 23rpx;
  font-weight: 800;
  line-height: 1.4;
}

.coin-stage {
  position: absolute;
  right: 26rpx;
  top: 26rpx;
  width: 220rpx;
  height: 180rpx;
}

.coin-orbit {
  position: absolute;
  left: 10rpx;
  top: 92rpx;
  width: 184rpx;
  height: 48rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.38);
  border-radius: 50%;
  transform: rotate(-13deg);
}

.coin-main {
  position: absolute;
  right: 24rpx;
  top: 28rpx;
  width: 112rpx;
  height: 112rpx;
  border: 8rpx solid rgba(255, 239, 184, 0.9);
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.42), transparent 18%),
    linear-gradient(145deg, #ffd778 0%, #ffc24c 55%, #f59a28 100%);
  box-shadow: inset -10rpx -12rpx 0 rgba(181, 105, 12, 0.14), 0 18rpx 32rpx rgba(112, 62, 220, 0.26);
}

.coin-star {
  position: absolute;
  left: 29rpx;
  top: 27rpx;
  width: 54rpx;
  height: 54rpx;
  background: #fff1bd;
  clip-path: polygon(50% 0, 62% 34%, 98% 34%, 68% 55%, 80% 90%, 50% 68%, 20% 90%, 32% 55%, 2% 34%, 38% 34%);
}

.hero-dot {
  position: absolute;
  border-radius: 50%;
}

.hero-dot.one {
  right: 4rpx;
  bottom: 18rpx;
  width: 38rpx;
  height: 38rpx;
  background: rgba(255, 200, 87, 0.78);
}

.hero-dot.two {
  right: 70rpx;
  top: 0;
  width: 22rpx;
  height: 22rpx;
  background: rgba(255, 255, 255, 0.86);
}

.hero-dot.three {
  left: 10rpx;
  top: 72rpx;
  width: 28rpx;
  height: 28rpx;
  background: #ffc857;
}

.balance-strip,
.package-panel,
.security-strip,
.intro-panel {
  border: 2rpx solid rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18rpx 42rpx rgba(34, 42, 74, 0.07);
}

.balance-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 82rpx;
  padding: 0 28rpx;
  border-radius: 22rpx;
}

.balance-left,
.detail-link,
.security-strip {
  display: flex;
  align-items: center;
}

.balance-left {
  min-width: 0;
  gap: 10rpx;
}

.mini-coin {
  position: relative;
  flex-shrink: 0;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: linear-gradient(145deg, #ffd977, #ffa629);
  box-shadow: inset -4rpx -4rpx 0 rgba(165, 83, 0, 0.12);
}

.mini-coin::after {
  position: absolute;
  inset: 9rpx;
  border-radius: 50%;
  background: #fff0b8;
  content: "";
}

.balance-label {
  color: #4d556d;
  font-size: 24rpx;
  font-weight: 800;
}

.balance-value {
  color: #20263a;
  font-size: 34rpx;
  font-weight: 900;
}

.balance-unit {
  color: #4d556d;
  font-size: 22rpx;
  font-weight: 800;
}

.detail-link {
  flex-shrink: 0;
  gap: 8rpx;
  color: #596177;
  font-size: 23rpx;
  font-weight: 800;
}

.chevron {
  font-size: 34rpx;
  line-height: 1;
}

.empty-packages {
  padding: 36rpx 0;
  color: #9098aa;
  font-size: 24rpx;
  font-weight: 800;
  text-align: center;
}

.package-panel {
  padding: 24rpx 18rpx 22rpx;
  border-radius: 26rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 22rpx;
  padding: 0 2rpx;
}

.section-title {
  color: #20263a;
  font-size: 30rpx;
  font-weight: 900;
}

.section-pill {
  height: 36rpx;
  padding: 0 18rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #ff7acb, #ff5eaa);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 36rpx;
}

.package-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18rpx;
}

.point-package-card {
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 244rpx;
  padding: 26rpx 14rpx 14rpx;
  border-radius: 20rpx;
  background: transparent;
  text-align: center;
  transform: translateY(0);
  transition: transform 0.24s ease;
}

.point-package-card::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 2rpx solid rgba(229, 233, 244, 0.92);
  border-radius: 20rpx;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
  box-shadow: 0 16rpx 34rpx rgba(31, 36, 55, 0.08);
  content: "";
  transform: scale(1);
  transform-origin: center center;
  transition: transform 0.24s ease, border-color 0.24s ease, background 0.24s ease, box-shadow 0.24s ease;
}

.point-package-card > view,
.point-package-card > button {
  position: relative;
  z-index: 1;
}

.point-package-card.active {
  transform: translateY(-6rpx);
  z-index: 2;
}

.point-package-card.active::before {
  border-color: #ffb84d;
  background: linear-gradient(180deg, #fff9ed 0%, #ffffff 62%);
  box-shadow: 0 18rpx 40rpx rgba(255, 184, 77, 0.15);
  transform: scale(1.035);
}

.package-tag {
  position: absolute;
  right: 0;
  top: 0;
  max-width: 122rpx;
  height: 34rpx;
  padding: 0 14rpx;
  border-radius: 0 18rpx 0 18rpx;
  background: linear-gradient(135deg, #ff7acb, #ff5eaa);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 34rpx;
  white-space: nowrap;
  z-index: 2;
}

.package-tag.campaign {
  background: linear-gradient(135deg, #ff7acb, #ff4ba0);
}

.package-points {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6rpx;
  color: #20263a;
}

.package-points text:first-child {
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1;
}

.package-points text:last-child {
  font-size: 21rpx;
  font-weight: 800;
}

.package-estimate {
  min-height: 30rpx;
  margin-top: 10rpx;
  color: #6858ff;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.25;
}

.package-price {
  margin-top: 8rpx;
  color: #20263a;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.1;
}

.package-unit {
  margin-top: 6rpx;
  color: #8d96aa;
  font-size: 19rpx;
  font-weight: 800;
}

.package-buy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 154rpx;
  height: 42rpx;
  margin: 14rpx auto 0;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #20263a, #151b2c);
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 42rpx;
  box-shadow: 0 12rpx 20rpx rgba(24, 31, 52, 0.18);
}

.point-package-card.active .package-buy {
  background: linear-gradient(135deg, #6c4bff 0%, #ff5cb8 100%);
  box-shadow: 0 12rpx 24rpx rgba(108, 75, 255, 0.22);
}

.point-package-card.fallback .package-buy {
  background: #c7cedd;
  box-shadow: none;
}

.security-strip {
  gap: 16rpx;
  min-height: 74rpx;
  padding: 0 22rpx;
  border-radius: 20rpx;
  background:
    radial-gradient(circle at 0 50%, rgba(122, 92, 255, 0.14), transparent 30%),
    rgba(245, 241, 255, 0.92);
}

.security-icon {
  flex-shrink: 0;
  width: 34rpx;
  height: 34rpx;
}

.security-title {
  flex-shrink: 0;
  color: #6858ff;
  font-size: 23rpx;
  font-weight: 900;
}

.security-copy {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #7a8298;
  font-size: 22rpx;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.security-chevron {
  flex-shrink: 0;
  color: #6c4bff;
}

.service-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 24rpx calc(34rpx + env(safe-area-inset-bottom));
  background: rgba(17, 24, 39, 0.32);
}

.service-confirm {
  width: 100%;
  padding: 30rpx 28rpx 24rpx;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 22rpx 56rpx rgba(17, 24, 39, 0.2);
}

.service-confirm-title {
  color: #20263a;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 40rpx;
  text-align: center;
}

.service-confirm-copy {
  margin-top: 12rpx;
  color: #7a8298;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 36rpx;
  text-align: center;
}

.service-confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-top: 28rpx;
}

.service-confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 78rpx;
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 78rpx;
}

.service-confirm-btn.ghost {
  background: #f3f5fb;
  color: #596177;
}

.service-confirm-btn.primary {
  background: linear-gradient(135deg, #6c4bff 0%, #ff5cb8 100%);
  color: #ffffff;
  box-shadow: 0 14rpx 26rpx rgba(108, 75, 255, 0.2);
}

.intro-panel {
  padding: 26rpx 24rpx 28rpx;
  border-radius: 24rpx;
}

.intro-title {
  color: #20263a;
  font-size: 26rpx;
  font-weight: 900;
}

.intro-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 24rpx;
}

.intro-item {
  min-width: 0;
  text-align: center;
}

.intro-icon {
  display: block;
  width: 64rpx;
  height: 64rpx;
  margin: 0 auto 14rpx;
}

.intro-name {
  color: #20263a;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 1.25;
}

.intro-copy {
  margin-top: 8rpx;
  color: #7e879a;
  font-size: 19rpx;
  font-weight: 700;
  line-height: 1.35;
}

.agreement-line {
  color: #8f97aa;
  font-size: 20rpx;
  font-weight: 800;
  text-align: center;
}
</style>
