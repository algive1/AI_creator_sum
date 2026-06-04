<template>
  <view class="points-detail-page">
    <view class="content">
      <view class="summary-card">
        <view class="summary-copy">
          <view class="summary-label">当前积分</view>
          <view class="summary-balance">{{ formatNumber(balance) }}</view>
          <view class="summary-estimate">
            <text>≈ 可生成约 {{ imageCount }} 次图片</text>
            <text class="help-dot">?</text>
          </view>
        </view>

        <view class="summary-art">
          <view class="art-orbit"></view>
          <view class="paper-board">
            <view class="paper-head"><view class="paper-star"></view></view>
            <view class="paper-line long"></view>
            <view class="paper-line"></view>
            <view class="paper-line short"></view>
          </view>
          <view class="art-coin coin-a"><view class="coin-star"></view></view>
          <view class="art-coin coin-b"><view class="coin-star"></view></view>
          <view class="art-coin coin-c"><view class="coin-star"></view></view>
          <view class="spark one"></view>
          <view class="spark two"></view>
        </view>

        <view class="summary-stats">
          <view class="stat-item">
            <text class="stat-label">累计获得</text>
            <text class="stat-value">{{ formatNumber(totalEarned) }}</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-label">累计消耗</text>
            <text class="stat-value">{{ formatNumber(totalSpent) }}</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-label">今日变动</text>
            <text class="stat-value today" :class="{ minus: todayDelta < 0 }">{{ signedNumber(todayDelta) }}</text>
          </view>
        </view>
      </view>

      <view class="tab-panel">
        <view class="tabs">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="tab-item"
            :class="{ active: activeTab === tab.value }"
            @tap="switchTab(tab.value)"
          >
            <text>{{ tab.label }}</text>
          </view>
        </view>
        <view class="filter-button" :class="{ active: activeCategory !== 'all' }" @tap="openFilter">
          <text>{{ selectedFilterText }}</text>
          <view class="filter-icon"></view>
        </view>
      </view>

      <view class="transaction-card">
        <view v-if="transactions.length">
          <view
            v-for="item in transactions"
            :key="transactionKey(item)"
            class="transaction-row"
          >
            <view class="tx-icon" :class="iconClass(item)">
              <text>{{ iconText(item) }}</text>
            </view>
            <view class="tx-main">
              <view class="tx-title-line">
                <text class="tx-title">{{ transactionTitle(item) }}</text>
                <text v-if="tagText(item)" class="tx-tag">{{ tagText(item) }}</text>
              </view>
              <view class="tx-time">{{ transactionTime(item) }}</view>
            </view>
            <view class="tx-side">
              <view class="tx-amount" :class="{ minus: transactionAmount(item) < 0 }">
                <text>{{ transactionAmountText(item) }}</text>
                <text class="tx-unit">积分</text>
              </view>
              <view class="tx-balance">余额：{{ formatNumber(transactionBalance(item)) }}</view>
            </view>
            <view class="row-chevron">›</view>
          </view>
        </view>
        <view v-else class="empty-list">暂无积分流水</view>
      </view>

      <view class="no-more">{{ loading ? '加载中...' : (hasMore ? '上拉加载更多' : '没有更多了') }}</view>
    </view>

    <view v-if="filterVisible" class="filter-mask" @tap="closeFilter">
      <view class="filter-panel" @tap.stop>
        <view class="filter-head">
          <text>来源筛选</text>
          <text class="filter-close" @tap="closeFilter">×</text>
        </view>
        <view class="filter-options">
          <view
            v-for="option in filterOptions"
            :key="option.value"
            class="filter-option"
            :class="{ active: activeCategory === option.value }"
            @tap="selectCategory(option.value)"
          >
            <text>{{ option.label }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { getBalance, getTransactions } from '@/api/points';

type TransactionItem = Record<string, unknown>;
type TabValue = 'all' | 'income' | 'expense';

interface TransactionResponse {
  list?: TransactionItem[];
  records?: TransactionItem[];
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

const balance = ref(0);
const totalEarned = ref(0);
const totalSpent = ref(0);
const todayDelta = ref(0);
const transactions = ref<TransactionItem[]>([]);
const activeTab = ref<TabValue>('all');
const activeCategory = ref('all');
const filterVisible = ref(false);
const loading = ref(false);
const hasMore = ref(false);
const page = ref(1);
const pageSize = 20;

const tabs: Array<{ label: string; value: TabValue }> = [
  { label: '全部', value: 'all' },
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
];

const filterOptions = [
  { label: '全部来源', value: 'all' },
  { label: '积分购买', value: 'recharge' },
  { label: '任务消耗', value: 'task' },
  { label: '签到奖励', value: 'signin' },
  { label: '广告奖励', value: 'ad' },
  { label: '邀请奖励', value: 'invite' },
  { label: '会员赠送', value: 'membership' },
];

const imageCount = computed(() => Math.max(0, Math.floor(balance.value / 2)));
const selectedFilterText = computed(() => {
  const current = filterOptions.find((item) => item.value === activeCategory.value);
  return activeCategory.value === 'all' ? '筛选' : current?.label || '筛选';
});

onShow(() => {
  uni.setNavigationBarTitle({ title: '积分明细' });
  refreshAll();
});

onPullDownRefresh(async () => {
  await refreshAll();
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  if (!loading.value && hasMore.value) loadTransactions(false);
});

async function refreshAll() {
  await Promise.all([
    loadBalance().catch(() => undefined),
    loadTodayDelta().catch(() => undefined),
    loadTransactions(true).catch(() => undefined),
  ]);
}

async function loadBalance() {
  const data = await getBalance<Record<string, unknown>>();
  balance.value = Number(data.balance || 0);
  totalEarned.value = Number(data.totalEarned || data.total_earned || 0);
  totalSpent.value = Number(data.totalSpent || data.total_spent || 0);
}

async function loadTodayDelta() {
  const data = await getTransactions<TransactionResponse>({ page: 1, pageSize: 100 });
  const todayKey = formatDateKey(new Date());
  const list = extractList(data);
  todayDelta.value = list.reduce((sum, item) => {
    const createdAt = String(item.createdAt || item.created_at || '');
    if (createdAt.slice(0, 10) !== todayKey) return sum;
    return sum + transactionAmount(item);
  }, 0);
}

async function loadTransactions(reset: boolean) {
  if (loading.value) return;
  loading.value = true;
  const nextPage = reset ? 1 : page.value + 1;
  const params: Record<string, unknown> = { page: nextPage, pageSize };
  if (activeTab.value !== 'all') params.direction = activeTab.value;
  if (activeCategory.value !== 'all') params.category = activeCategory.value;

  try {
    const data = await getTransactions<TransactionResponse>(params);
    const list = extractList(data);
    transactions.value = reset ? list : transactions.value.concat(list);
    page.value = nextPage;
    const totalPages = Number(data.pagination?.totalPages || 0);
    hasMore.value = totalPages > 0 ? nextPage < totalPages : list.length >= pageSize;
  } catch (error) {
    if (reset) {
      transactions.value = [];
      hasMore.value = false;
    }
    throw error;
  } finally {
    loading.value = false;
  }
}

function extractList(data: TransactionResponse | TransactionItem[] | undefined) {
  if (Array.isArray(data)) return data;
  const list = data?.list || data?.records || [];
  return Array.isArray(list) ? list : [];
}

function switchTab(value: TabValue) {
  if (activeTab.value === value) return;
  activeTab.value = value;
  loadTransactions(true);
}

function openFilter() {
  filterVisible.value = true;
}

function closeFilter() {
  filterVisible.value = false;
}

function selectCategory(value: string) {
  if (activeCategory.value !== value) {
    activeCategory.value = value;
    loadTransactions(true);
  }
  closeFilter();
}

function transactionKey(item: TransactionItem) {
  return String(item.id || item.refId || item.ref_id || item.createdAt || item.created_at);
}

function transactionTitle(item: TransactionItem) {
  const title = String(item.title || '').trim();
  if (title) return title;
  const category = resolveCategory(item);
  const matched = filterOptions.find((option) => option.value === category);
  return matched?.label || '积分变动';
}

function transactionTime(item: TransactionItem) {
  const raw = String(item.createdAt || item.created_at || item.time || '');
  return raw ? raw.replace('T', ' ').slice(0, 19) : '';
}

function transactionAmount(item: TransactionItem) {
  return Number(item.points || item.amount || 0);
}

function transactionAmountText(item: TransactionItem) {
  return signedNumber(transactionAmount(item));
}

function transactionBalance(item: TransactionItem) {
  return Number(item.balanceAfter || item.balance_after || balance.value || 0);
}

function resolveCategory(item: TransactionItem) {
  const source = String(item.source || '');
  const refType = String(item.refType || item.ref_type || '');
  if (source === 'wechat_pay' && refType === 'order_recharge') return 'recharge';
  if (source === 'task_spend' || source === 'task_refund' || refType.startsWith('ai_task_')) return 'task';
  if (['signin', 'signin_normal', 'signin_super', 'signin_makeup'].includes(source)) return 'signin';
  if (source === 'ad' || source === 'ad_reward') return 'ad';
  if (source === 'invite_use_reward' || source === 'invite_member_purchase_reward') return 'invite';
  if (source === 'membership_monthly' || refType === 'member_purchase_bonus') return 'membership';
  return 'all';
}

function tagText(item: TransactionItem) {
  const category = resolveCategory(item);
  if (category === 'all') return '';
  const matched = filterOptions.find((option) => option.value === category);
  return matched?.label.replace('奖励', '').replace('赠送', '') || '';
}

function iconClass(item: TransactionItem) {
  return `type-${resolveCategory(item)}`;
}

function iconText(item: TransactionItem) {
  const category = resolveCategory(item);
  if (category === 'recharge') return '¥';
  if (category === 'task') return 'AI';
  if (category === 'signin') return '✓';
  if (category === 'ad') return '▶';
  if (category === 'invite') return '礼';
  if (category === 'membership') return 'V';
  return '分';
}

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

function formatNumber(value: number) {
  const numericValue = Number(value) || 0;
  const integerValue = numericValue < 0 ? Math.ceil(numericValue) : Math.floor(numericValue);
  return integerValue.toLocaleString('en-US');
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const monthValue = date.getMonth() + 1;
  const dayValue = date.getDate();
  const month = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
  const day = dayValue < 10 ? `0${dayValue}` : `${dayValue}`;
  return `${year}-${month}-${day}`;
}
</script>

<style scoped lang="scss">
.points-detail-page {
  min-height: 100vh;
  overflow-x: hidden;
  padding: 24rpx 24rpx calc(46rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 12% 7%, rgba(122, 92, 255, 0.1), transparent 30%),
    radial-gradient(circle at 88% 24%, rgba(255, 112, 188, 0.12), transparent 26%),
    linear-gradient(180deg, #f8f8ff 0%, #ffffff 48%, #f4f2ff 100%);
  color: #161d3d;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.summary-card {
  position: relative;
  overflow: hidden;
  min-height: 386rpx;
  padding: 44rpx 34rpx 28rpx;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 92% 84%, rgba(255, 200, 87, 0.48), transparent 13%),
    radial-gradient(circle at 62% 20%, rgba(255, 255, 255, 0.34), transparent 9%),
    linear-gradient(135deg, #745bff 0%, #875dff 46%, #ff6fab 100%);
  box-shadow: 0 24rpx 54rpx rgba(122, 92, 255, 0.24);
}

.summary-copy {
  position: relative;
  z-index: 2;
  max-width: 430rpx;
}

.summary-label {
  color: rgba(255, 255, 255, 0.94);
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.2;
}

.summary-balance {
  margin-top: 22rpx;
  color: #ffffff;
  font-size: 82rpx;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.95;
  text-shadow: 0 14rpx 28rpx rgba(75, 41, 190, 0.22);
}

.summary-estimate {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 28rpx;
  color: rgba(255, 255, 255, 0.92);
  font-size: 27rpx;
  font-weight: 800;
  line-height: 1.25;
}

.help-dot {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #765dff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 26rpx;
  text-align: center;
}

.summary-art {
  position: absolute;
  right: 42rpx;
  top: 56rpx;
  width: 256rpx;
  height: 210rpx;
}

.art-orbit {
  position: absolute;
  left: 6rpx;
  top: 104rpx;
  width: 222rpx;
  height: 58rpx;
  border: 4rpx solid rgba(255, 235, 172, 0.46);
  border-radius: 50%;
  transform: rotate(-14deg);
}

.paper-board {
  position: absolute;
  right: 34rpx;
  top: 30rpx;
  width: 126rpx;
  height: 148rpx;
  border-radius: 18rpx;
  background: linear-gradient(160deg, #fff3df 0%, #ffe4d8 100%);
  box-shadow: 22rpx 12rpx 0 rgba(117, 90, 255, 0.34), 0 18rpx 32rpx rgba(69, 49, 171, 0.22);
  transform: rotate(8deg);
}

.paper-head {
  position: absolute;
  left: 28rpx;
  top: -24rpx;
  width: 80rpx;
  height: 46rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #b292ff, #795cff);
  box-shadow: 0 10rpx 18rpx rgba(78, 54, 190, 0.2);
}

.paper-star {
  position: absolute;
  left: 27rpx;
  top: 10rpx;
  width: 26rpx;
  height: 26rpx;
  background: #ffffff;
  clip-path: polygon(50% 0, 62% 34%, 98% 34%, 68% 56%, 80% 92%, 50% 70%, 20% 92%, 32% 56%, 2% 34%, 38% 34%);
}

.paper-line {
  position: absolute;
  left: 26rpx;
  top: 82rpx;
  width: 70rpx;
  height: 8rpx;
  border-radius: 8rpx;
  background: #d3a7ff;
}

.paper-line.long {
  top: 54rpx;
  width: 88rpx;
}

.paper-line.short {
  top: 110rpx;
  width: 54rpx;
}

.art-coin {
  position: absolute;
  width: 56rpx;
  height: 56rpx;
  border: 6rpx solid rgba(255, 239, 184, 0.95);
  border-radius: 50%;
  background: linear-gradient(145deg, #ffd978, #f9a938);
  box-shadow: inset -5rpx -6rpx 0 rgba(161, 84, 13, 0.12), 0 12rpx 20rpx rgba(89, 54, 203, 0.18);
}

.art-coin .coin-star {
  position: absolute;
  left: 13rpx;
  top: 13rpx;
  width: 24rpx;
  height: 24rpx;
  background: #fff2bd;
  clip-path: polygon(50% 0, 62% 34%, 98% 34%, 68% 56%, 80% 92%, 50% 70%, 20% 92%, 32% 56%, 2% 34%, 38% 34%);
}

.coin-a {
  left: 28rpx;
  top: 72rpx;
}

.coin-b {
  right: 4rpx;
  top: 12rpx;
}

.coin-c {
  right: 8rpx;
  bottom: 22rpx;
}

.spark {
  position: absolute;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
}

.spark.one {
  right: 56rpx;
  top: 20rpx;
}

.spark.two {
  right: 0;
  top: 104rpx;
}

.summary-stats {
  position: absolute;
  left: 34rpx;
  right: 34rpx;
  bottom: 28rpx;
  z-index: 3;
  display: grid;
  grid-template-columns: 1fr 2rpx 1fr 2rpx 1fr;
  align-items: center;
  min-height: 102rpx;
  padding: 12rpx 14rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18rpx 38rpx rgba(66, 46, 169, 0.14);
}

.stat-item {
  min-width: 0;
  text-align: center;
}

.stat-label,
.stat-value {
  display: block;
}

.stat-label {
  color: #29304d;
  font-size: 23rpx;
  font-weight: 800;
}

.stat-value {
  margin-top: 8rpx;
  color: #11183a;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.05;
}

.stat-value.today {
  color: #6f50ff;
}

.stat-value.today.minus {
  color: #ff4f91;
}

.stat-divider {
  width: 2rpx;
  height: 66rpx;
  background: rgba(114, 100, 164, 0.14);
}

.tab-panel,
.transaction-card {
  border: 2rpx solid rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18rpx 42rpx rgba(34, 42, 74, 0.07);
}

.tab-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 94rpx;
  padding: 0 26rpx;
  border-radius: 24rpx;
}

.tabs {
  display: flex;
  align-items: stretch;
  align-self: stretch;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 112rpx;
  height: 94rpx;
  color: #7d849b;
  font-size: 30rpx;
  font-weight: 900;
}

.tab-item.active {
  color: #10183a;
}

.tab-item.active::after {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  bottom: 0;
  height: 5rpx;
  border-radius: 5rpx 5rpx 0 0;
  background: linear-gradient(90deg, #765cff, #9c6bff);
  content: "";
}

.filter-button {
  display: flex;
  align-items: center;
  gap: 10rpx;
  max-width: 176rpx;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 26rpx;
  background: #f5f3ff;
  color: #11183a;
  font-size: 25rpx;
  font-weight: 900;
}

.filter-button text {
  overflow: hidden;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.filter-button.active {
  color: #6f50ff;
}

.filter-icon {
  position: relative;
  flex-shrink: 0;
  width: 24rpx;
  height: 20rpx;
  border: 4rpx solid currentColor;
  border-top: 0;
  border-radius: 0 0 8rpx 8rpx;
}

.filter-icon::before {
  position: absolute;
  left: -7rpx;
  top: -10rpx;
  width: 30rpx;
  height: 4rpx;
  border-radius: 4rpx;
  background: currentColor;
  content: "";
}

.transaction-card {
  overflow: hidden;
  border-radius: 26rpx;
}

.transaction-row {
  position: relative;
  display: grid;
  grid-template-columns: 76rpx minmax(0, 1fr) 174rpx 24rpx;
  align-items: center;
  min-height: 112rpx;
  gap: 18rpx;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid rgba(122, 92, 255, 0.08);
}

.transaction-row:last-child {
  border-bottom: 0;
}

.tx-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
  box-shadow: 0 14rpx 24rpx rgba(111, 80, 255, 0.15);
}

.tx-icon.type-recharge,
.tx-icon.type-all {
  background: linear-gradient(135deg, #718bff, #586fff);
}

.tx-icon.type-task {
  background: linear-gradient(135deg, #ffc857, #ff9b43);
}

.tx-icon.type-signin,
.tx-icon.type-membership {
  background: linear-gradient(135deg, #9f72ff, #765cff);
}

.tx-icon.type-ad,
.tx-icon.type-invite {
  background: linear-gradient(135deg, #ff8cc9, #ff5eaa);
}

.tx-main {
  min-width: 0;
}

.tx-title-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.tx-title {
  overflow: hidden;
  min-width: 0;
  color: #11183a;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.25;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tx-tag {
  flex-shrink: 0;
  max-width: 92rpx;
  height: 30rpx;
  padding: 0 12rpx;
  border-radius: 15rpx;
  background: #f0e9ff;
  color: #765cff;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 30rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-time {
  margin-top: 8rpx;
  color: #8790a8;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.2;
}

.tx-side {
  min-width: 0;
  text-align: right;
}

.tx-amount {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 6rpx;
  color: #6f50ff;
  font-weight: 900;
  line-height: 1.05;
}

.tx-amount text:first-child {
  overflow: hidden;
  min-width: 0;
  font-size: 31rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-amount.minus {
  color: #ff4f91;
}

.tx-unit {
  flex-shrink: 0;
  font-size: 20rpx;
}

.tx-balance {
  margin-top: 10rpx;
  color: #8790a8;
  font-size: 22rpx;
  font-weight: 700;
  white-space: nowrap;
}

.row-chevron {
  color: #b7bdd1;
  font-size: 42rpx;
  line-height: 1;
  text-align: right;
}

.empty-list {
  padding: 80rpx 0;
  color: #99a1b6;
  font-size: 25rpx;
  font-weight: 800;
  text-align: center;
}

.no-more {
  color: #adb4c7;
  font-size: 25rpx;
  font-weight: 800;
  line-height: 54rpx;
  text-align: center;
}

.filter-mask {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 24rpx;
  background: rgba(18, 22, 46, 0.36);
}

.filter-panel {
  width: 100%;
  padding: 26rpx 24rpx calc(28rpx + env(safe-area-inset-bottom));
  border-radius: 28rpx 28rpx 20rpx 20rpx;
  background: #ffffff;
  box-shadow: 0 -18rpx 42rpx rgba(24, 28, 58, 0.14);
}

.filter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #11183a;
  font-size: 30rpx;
  font-weight: 900;
}

.filter-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #f5f3ff;
  color: #7d849b;
  font-size: 40rpx;
  line-height: 48rpx;
  text-align: center;
}

.filter-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-top: 24rpx;
}

.filter-option {
  height: 72rpx;
  border: 2rpx solid #eef0fa;
  border-radius: 18rpx;
  background: #fbfcff;
  color: #515a74;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 72rpx;
  text-align: center;
}

.filter-option.active {
  border-color: rgba(118, 92, 255, 0.42);
  background: #f1ecff;
  color: #6f50ff;
}
</style>
