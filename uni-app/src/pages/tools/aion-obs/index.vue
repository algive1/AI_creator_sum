<template>
  <view class="obs-page">
    <AppTopbar class="app-nav-root" title="OBS遗物计算器" back transparent />

    <view class="summary-card">
      <view class="summary-head">
        <view class="summary-label">{{ summaryLabel }}</view>
        <view class="summary-pill">{{ activePanel === 'relic' ? '遗物换算' : '装备差额' }}</view>
      </view>
      <view class="summary-number">{{ formatNumber(summaryNumber) }}</view>
      <view class="summary-grid">
        <view class="metric">
          <text>据点兑换</text>
          <text>{{ formatNumber(relicTotal.baseAp) }}</text>
        </view>
        <view class="metric good">
          <text>深渊额外</text>
          <text>{{ formatNumber(relicTotal.extraAp) }}</text>
        </view>
        <view class="metric">
          <text>当前 OBS</text>
          <text>{{ formatNumber(currentObsNumber) }}</text>
        </view>
        <view class="metric">
          <text>{{ equipmentTotal.selectedCount ? `目标装备 ${equipmentTotal.selectedCount}件` : '目标装备' }}</text>
          <text>{{ equipmentTotal.ap ? formatNumber(equipmentTotal.ap) : '未选择' }}</text>
        </view>
      </view>
    </view>

    <view class="mode-switch">
      <button class="mode-button" :class="{ active: activePanel === 'relic' }" @tap="activePanel = 'relic'">
        <text>遗物换算</text>
      </button>
      <button class="mode-button" :class="{ active: activePanel === 'equipment' }" @tap="activePanel = 'equipment'">
        <text>目标装备</text>
      </button>
    </view>

    <view class="card">
      <view class="section-head">
        <view class="section-title">基础信息</view>
        <view class="section-sub">{{ selectedJob.name }}，{{ selectedJob.armor }}防具</view>
      </view>
      <view class="field-row">
        <view class="field">
          <view class="field-label">职业</view>
          <picker :range="jobLabels" :value="selectedJobIndex" @change="onJobChange">
            <view class="picker-field">{{ selectedJob.name }}（{{ selectedJob.armor }}）</view>
          </picker>
        </view>
        <view class="field">
          <view class="field-label">当前 OBS</view>
          <input v-model="currentObs" class="field-input" type="number" placeholder="0" />
        </view>
      </view>
      <view class="field-tip">职业只用于防具类型提示，兑换成本按守卫装备表计算。</view>
    </view>

    <view v-if="activePanel === 'relic'" class="panel">
      <view class="card">
        <view class="section-head">
          <view class="section-title">古代遗物</view>
          <view class="section-sub">4类 x 4品级</view>
        </view>
        <view class="artifact-tabs">
          <button
            v-for="relic in AION_RELICS"
            :key="relic.key"
            class="artifact-tab"
            :class="{ active: activeRelicKey === relic.key }"
            @tap="activeRelicKey = relic.key"
          >
            {{ relic.name.replace('古代', '') }}
          </button>
        </view>
        <view class="mini-metrics">
          <view>
            <text>当前类据点</text>
            <text>{{ formatNumber(activeRelicTotal.baseAp) }}</text>
          </view>
          <view>
            <text>当前类深渊</text>
            <text>{{ formatNumber(activeRelicTotal.abyssAp) }}</text>
          </view>
          <view>
            <text>额外 AP</text>
            <text>{{ formatNumber(activeRelicTotal.extraAp) }}</text>
          </view>
        </view>
        <view class="relic-list">
          <view v-for="grade in activeRelic.grades" :key="grade.key" class="relic-row">
            <view class="relic-top">
              <view>
                <view class="relic-name">{{ formatAionRelicLevelName(activeRelic.key, grade.key) }}</view>
                <view class="relic-meta">据点 {{ formatNumber(grade.baseAp) }} / 深渊 {{ formatNumber(grade.abyssAp) }}</view>
              </view>
              <view class="stepper">
                <button @tap="stepRelic(activeRelic.key, grade.key, -1)">-</button>
                <input
                  class="stepper-input"
                  type="number"
                  :value="relicCount(activeRelic.key, grade.key)"
                  @input="setRelicCount(activeRelic.key, grade.key, inputValue($event))"
                />
                <button @tap="stepRelic(activeRelic.key, grade.key, 1)">+</button>
              </view>
            </view>
            <view class="ap-grid">
              <view>
                <text>据点 AP</text>
                <text>{{ formatNumber(grade.baseAp) }}</text>
              </view>
              <view>
                <text>深渊 AP</text>
                <text>{{ formatNumber(grade.abyssAp) }}</text>
              </view>
              <view class="good">
                <text>额外 AP</text>
                <text>+{{ formatNumber(grade.abyssAp - grade.baseAp) }}</text>
              </view>
            </view>
          </view>
        </view>
        <button class="secondary-button" @tap="clearRelics">清空遗物数量</button>
      </view>

      <view class="card">
        <view class="section-head">
          <view class="section-title">换算明细</view>
          <view class="section-sub">不选装备也可用</view>
        </view>
        <view class="result-list">
          <view><text>当前 OBS + 据点兑换</text><text>{{ formatNumber(afterBaseObs) }}</text></view>
          <view><text>当前 OBS + 深渊兑换</text><text>{{ formatNumber(afterAbyssObs) }}</text></view>
          <view><text>深渊比据点多</text><text>{{ formatNumber(relicTotal.extraAp) }}</text></view>
        </view>
      </view>
    </view>

    <view v-else class="panel">
      <view class="card">
        <view class="section-head">
          <view class="section-title">目标装备</view>
          <view class="section-sub">已选 {{ equipmentTotal.selectedCount }} 件</view>
        </view>
        <scroll-view class="set-scroll" scroll-x>
          <button
            v-for="set in AION_EQUIPMENT_SETS"
            :key="set.key"
            class="set-tab"
            :class="{ active: selectedSetKey === set.key }"
            @tap="selectedSetKey = set.key"
          >
            {{ set.title }}
          </button>
        </scroll-view>
        <view class="set-summary">
          <view>{{ selectedSet.level }}级{{ selectedSet.elite ? '精锐' : '普通' }}守卫装备</view>
          <view>{{ selectedSet.medalType ? medalTypeLabel(selectedSet.medalType) : '无勋章' }}</view>
        </view>

        <view class="part-block">
          <view class="part-title">防具</view>
          <view class="part-grid">
            <button
              v-for="part in armorParts"
              :key="part.key"
              class="part-chip"
              :class="{ active: Boolean(equipmentSelection[part.key]) }"
              :disabled="!selectedSet.parts[part.key]"
              @tap="togglePart(part.key)"
            >
              <text>{{ part.label }}</text>
            </button>
          </view>
        </view>

        <view class="part-block">
          <view class="part-title">武器</view>
          <view class="part-grid">
            <button
              v-for="part in weaponParts"
              :key="part.key"
              class="part-chip"
              :class="{ active: Boolean(equipmentSelection[part.key]) }"
              :disabled="!selectedSet.parts[part.key]"
              @tap="togglePart(part.key)"
            >
              <text>{{ part.label }}</text>
            </button>
          </view>
        </view>

        <view class="part-block">
          <view class="part-title">首饰</view>
          <view class="part-grid">
            <button
              v-for="part in accessoryToggleParts"
              :key="part.key"
              class="part-chip"
              :class="{ active: Boolean(equipmentSelection[part.key]) }"
              :disabled="!selectedSet.parts[part.key]"
              @tap="togglePart(part.key)"
            >
              <text>{{ part.label }}</text>
            </button>
          </view>
          <view v-for="part in accessoryCountParts" :key="part.key" class="count-row" :class="{ disabled: !selectedSet.parts[part.key] }">
            <view>
              <view class="count-title">{{ part.label }}</view>
              <view class="count-meta">{{ equipmentPartCostLabel(part.key) }}</view>
            </view>
            <view class="stepper count-stepper">
              <button :disabled="!selectedSet.parts[part.key]" @tap="stepPartCount(part.key, -1)">-</button>
              <input
                class="stepper-input"
                type="number"
                :disabled="!selectedSet.parts[part.key]"
                :value="partCount(part.key)"
                @input="setPartCount(part.key, inputValue($event))"
              />
              <button :disabled="!selectedSet.parts[part.key]" @tap="stepPartCount(part.key, 1)">+</button>
            </view>
          </view>
        </view>

        <view class="selected-detail">
          <view class="selected-detail-head">
            <text>已选明细</text>
            <text>{{ equipmentTotal.selectedCount }} 件</text>
          </view>
          <view v-if="selectedEquipmentRows.length" class="selected-list">
            <view v-for="item in selectedEquipmentRows" :key="item.key">
              <text>{{ item.label }}</text>
              <text>{{ item.cost }}</text>
            </view>
          </view>
          <view v-else class="selected-empty">先选择目标装备，合计会同步显示 AP 和勋章。</view>
        </view>
      </view>

      <view class="card">
        <view class="section-head">
          <view class="section-title">装备合计</view>
          <view class="section-sub">AP 与勋章</view>
        </view>
        <view class="result-list">
          <view><text>目标装备 OBS</text><text>{{ formatNumber(equipmentTotal.ap) }}</text></view>
          <view><text>需要勋章</text><text>{{ formatAionMedals(equipmentTotal.medals) }}</text></view>
          <view><text>按深渊兑换后还差</text><text>{{ formatNumber(remainingObs) }}</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTopbar from '@/components/common/AppTopbar.vue';
import { PAGE_ROUTES } from '@/utils/constants';
import { createShareMessage, createShareTimeline, enableShareMenu } from '@/utils/share';
import {
  AION_EQUIPMENT_SETS,
  AION_RELICS,
  calculateAionObsEquipment,
  calculateAionObsRelics,
  formatAionMedals,
  formatAionRelicLevelName,
  type AionEquipmentPartKey,
  type AionEquipmentSelection,
  type AionEquipmentSetKey,
  type AionMedalType,
  type AionRelicCounts,
  type AionRelicGradeKey,
  type AionRelicKey,
} from '@/utils/aion-obs-calculator';

type JobOption = {
  name: string;
  armor: string;
};
type PartOption = {
  key: AionEquipmentPartKey;
  label: string;
};

const jobs: JobOption[] = [
  { name: '剑星', armor: '金属' },
  { name: '守护', armor: '金属' },
  { name: '杀星', armor: '皮甲' },
  { name: '弓星', armor: '皮甲' },
  { name: '魔道', armor: '布甲' },
  { name: '精灵', armor: '布甲' },
  { name: '治愈', armor: '锁甲' },
  { name: '护法', armor: '锁甲' },
];
const armorParts: PartOption[] = [
  { key: 'body', label: '上衣' },
  { key: 'legs', label: '下衣' },
  { key: 'shoulders', label: '护肩' },
  { key: 'hands', label: '手套' },
  { key: 'feet', label: '鞋子' },
];
const weaponParts: PartOption[] = [
  { key: 'mainWeapon', label: '主武器' },
  { key: 'shield', label: '盾牌' },
];
const accessoryToggleParts: PartOption[] = [
  { key: 'necklace', label: '项链' },
  { key: 'head', label: '头饰' },
  { key: 'waist', label: '腰带' },
];
const accessoryCountParts: PartOption[] = [
  { key: 'earring', label: '耳环' },
  { key: 'ring', label: '戒指' },
];

const activePanel = ref<'relic' | 'equipment'>('relic');
const selectedJobIndex = ref(0);
const currentObs = ref('0');
const activeRelicKey = ref<AionRelicKey>('crown');
const selectedSetKey = ref<AionEquipmentSetKey>('guardian_squad_leader_30');
const relicCounts = reactive<AionRelicCounts>({});
const equipmentSelection = reactive<AionEquipmentSelection>({});

const jobLabels = computed(() => jobs.map((job) => `${job.name}（${job.armor}）`));
const selectedJob = computed(() => jobs[selectedJobIndex.value] || jobs[0]);
const currentObsNumber = computed(() => positiveInt(currentObs.value));
const activeRelic = computed(() => AION_RELICS.find((item) => item.key === activeRelicKey.value) || AION_RELICS[0]);
const selectedSet = computed(() => AION_EQUIPMENT_SETS.find((item) => item.key === selectedSetKey.value) || AION_EQUIPMENT_SETS[0]);
const relicTotal = computed(() => calculateAionObsRelics(relicCounts));
const activeRelicTotal = computed(() => calculateAionObsRelics({ [activeRelicKey.value]: relicCounts[activeRelicKey.value] || {} }));
const equipmentTotal = computed(() => calculateAionObsEquipment(selectedSetKey.value, equipmentSelection));
const afterBaseObs = computed(() => currentObsNumber.value + relicTotal.value.baseAp);
const afterAbyssObs = computed(() => currentObsNumber.value + relicTotal.value.abyssAp);
const remainingObs = computed(() => Math.max(0, equipmentTotal.value.ap - afterAbyssObs.value));
const summaryLabel = computed(() => activePanel.value === 'equipment' && equipmentTotal.value.ap > 0 ? '按深渊兑换估算仍需 OBS' : '深渊兑换后可获得 OBS');
const summaryNumber = computed(() => activePanel.value === 'equipment' && equipmentTotal.value.ap > 0 ? remainingObs.value : relicTotal.value.abyssAp);

onShow(() => {
  enableShareMenu();
});

onShareAppMessage(() => createShareMessage({
  title: '永恒之塔 OBS 遗物计算器',
  path: PAGE_ROUTES.aionObsCalculator,
}));

onShareTimeline(() => createShareTimeline({
  title: '永恒之塔 OBS 遗物计算器',
  path: PAGE_ROUTES.aionObsCalculator,
}));

function onJobChange(event: { detail: { value: number | string } }) {
  selectedJobIndex.value = Number(event.detail.value || 0);
}

function relicCount(relicKey: AionRelicKey, gradeKey: AionRelicGradeKey) {
  return positiveInt(relicCounts[relicKey]?.[gradeKey]);
}

function setRelicCount(relicKey: AionRelicKey, gradeKey: AionRelicGradeKey, value: unknown) {
  const bucket = relicCounts[relicKey] || {};
  bucket[gradeKey] = positiveInt(value);
  relicCounts[relicKey] = bucket;
}

function stepRelic(relicKey: AionRelicKey, gradeKey: AionRelicGradeKey, delta: number) {
  setRelicCount(relicKey, gradeKey, Math.max(0, relicCount(relicKey, gradeKey) + delta));
}

function clearRelics() {
  AION_RELICS.forEach((relic) => {
    relicCounts[relic.key] = {};
  });
}

function togglePart(part: AionEquipmentPartKey) {
  if (!selectedSet.value.parts[part]) return;
  equipmentSelection[part] = !equipmentSelection[part];
}

const selectedEquipmentRows = computed(() => {
  const rows: Array<{ key: string; label: string; cost: string }> = [];
  allPartOptions.forEach((part) => {
    const count = partCount(part.key);
    const cost = selectedSet.value.parts[part.key];
    if (!cost || count <= 0) return;
    rows.push({
      key: part.key,
      label: count > 1 ? `${part.label} x${count}` : part.label,
      cost: equipmentPartCostLabel(part.key, count),
    });
  });
  return rows;
});

const allPartOptions = [
  ...armorParts,
  ...weaponParts,
  ...accessoryToggleParts,
  ...accessoryCountParts,
];

function setPartCount(part: AionEquipmentPartKey, count: unknown) {
  if (!selectedSet.value.parts[part]) return;
  equipmentSelection[part] = Math.min(2, positiveInt(count));
}

function stepPartCount(part: AionEquipmentPartKey, delta: number) {
  setPartCount(part, partCount(part) + delta);
}

function partCount(part: AionEquipmentPartKey) {
  return positiveInt(equipmentSelection[part]);
}

function equipmentPartCostLabel(part: AionEquipmentPartKey, multiplier = 1) {
  const cost = selectedSet.value.parts[part];
  if (!cost) return '暂无兑换';
  const count = Math.max(1, positiveInt(multiplier));
  const medal = cost.medalType && cost.medals ? ` + ${formatNumber(cost.medals * count)}${medalTypeLabel(cost.medalType)}` : '';
  return `${formatNumber(cost.ap * count)} OBS${medal}`;
}

function medalTypeLabel(type: AionMedalType) {
  return type === 'gold' ? '金勋章' : '银勋章';
}

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | null;
  return target?.value || '';
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function positiveInt(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}
</script>

<style scoped lang="scss">
.obs-page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(48rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 18% 4%, rgba(114, 88, 255, 0.13), transparent 28%),
    linear-gradient(180deg, #f7f8ff 0%, #eef3fa 100%);
}

.summary-card,
.card {
  box-sizing: border-box;
  border: 1rpx solid #dce8f6;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(28, 43, 82, 0.07);
}

.summary-card {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 28rpx;
}

.summary-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.summary-label,
.section-sub {
  color: #667085;
  font-size: 22rpx;
  font-weight: 800;
}

.summary-pill {
  flex: 0 0 auto;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: #eef7f3;
  color: #21735a;
  font-size: 21rpx;
  font-weight: 900;
}

.summary-number {
  margin-top: 14rpx;
  color: #121827;
  font-size: 58rpx;
  font-weight: 900;
  line-height: 1.1;
}

.summary-grid,
.mini-metrics,
.ap-grid {
  display: grid;
  gap: 14rpx;
}

.summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 20rpx;
}

.metric,
.mini-metrics > view,
.ap-grid > view {
  min-width: 0;
  padding: 16rpx;
  border-radius: 14rpx;
  background: #f5f7fb;
}

.metric text,
.mini-metrics text,
.ap-grid text {
  display: block;
}

.metric text:first-child,
.mini-metrics text:first-child,
.ap-grid text:first-child {
  color: #6b7280;
  font-size: 20rpx;
  font-weight: 800;
}

.metric text:last-child,
.mini-metrics text:last-child,
.ap-grid text:last-child {
  margin-top: 6rpx;
  color: #202737;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.15;
}

.good text:last-child {
  color: #197a57;
}

.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 18rpx;
  padding: 8rpx;
  border: 1rpx solid rgba(49, 67, 94, 0.08);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.94);
}

.mode-button {
  display: flex;
  min-height: 84rpx;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 14rpx;
  background: transparent;
  color: #5f697a;
  text-align: center;
  line-height: 1.1;
}

.mode-button text {
  display: block;
  font-size: 29rpx;
  font-weight: 800;
}

.mode-button.active {
  background: #7258ff;
  color: #fff;
}

.card {
  margin-top: 18rpx;
  padding: 24rpx;
}

.section-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  color: #1a2130;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.2;
}

.section-title::before {
  display: inline-block;
  width: 8rpx;
  height: 34rpx;
  border-radius: 4rpx;
  background: linear-gradient(180deg, #ff7acb, #35c2ff);
  box-shadow: 0 4rpx 10rpx rgba(255, 122, 203, 0.14);
  content: "";
}

.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 20rpx;
}

.field-label {
  margin-bottom: 10rpx;
  color: #667085;
  font-size: 22rpx;
  font-weight: 800;
}

.picker-field,
.field-input {
  display: flex;
  height: 78rpx;
  align-items: center;
  width: 100%;
  padding: 0 20rpx;
  border: 1rpx solid #d8deea;
  border-radius: 14rpx;
  background: #fff;
  color: #222b3c;
  font-size: 25rpx;
  font-weight: 800;
}

.field-tip {
  margin-top: 16rpx;
  color: #6b7280;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.45;
}

.artifact-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 20rpx;
}

.artifact-tab,
.set-tab {
  display: flex;
  height: 64rpx;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #d8deea;
  border-radius: 14rpx;
  background: #fff;
  color: #4e596b;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
}

.artifact-tab.active,
.set-tab.active {
  border-color: #7258ff;
  background: #7258ff;
  color: #fff;
}

.mini-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 16rpx;
}

.mini-metrics text:last-child,
.ap-grid text:last-child {
  font-size: 23rpx;
}

.relic-list {
  display: grid;
  gap: 14rpx;
  margin-top: 16rpx;
}

.relic-row {
  padding: 20rpx;
  border: 1rpx solid #edf0f6;
  border-radius: 16rpx;
  background: #fff;
}

.relic-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14rpx;
  align-items: center;
}

.relic-name {
  color: #1d2433;
  font-size: 27rpx;
  font-weight: 900;
}

.relic-meta,
.count-meta {
  margin-top: 6rpx;
  color: #768196;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 1.35;
}

.stepper {
  display: grid;
  grid-template-columns: 54rpx 78rpx 54rpx;
  height: 58rpx;
  overflow: hidden;
  border: 1rpx solid #d7deeb;
  border-radius: 999rpx;
  background: #fff;
}

.stepper button,
.stepper-input {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: #fff;
  color: #1d2433;
  text-align: center;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1;
}

.stepper-input {
  border-left: 1rpx solid #e2e6f0;
  border-right: 1rpx solid #e2e6f0;
}

.ap-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 16rpx;
}

.secondary-button {
  display: flex;
  width: 100%;
  height: 76rpx;
  align-items: center;
  justify-content: center;
  margin-top: 20rpx;
  border: 1rpx solid #d8deea;
  border-radius: 14rpx;
  background: #fff;
  color: #536074;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.1;
}

.result-list {
  display: grid;
  gap: 16rpx;
  margin-top: 18rpx;
}

.result-list > view {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  color: #586273;
  font-size: 24rpx;
  font-weight: 800;
}

.result-list text:last-child {
  color: #1d2433;
  font-weight: 900;
  text-align: right;
}

.set-scroll {
  width: 100%;
  margin-top: 18rpx;
  white-space: nowrap;
}

.set-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 172rpx;
  margin-right: 10rpx;
  padding: 0 20rpx;
}

.set-summary {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: 14rpx;
  background: #f6f8fc;
  color: #5f697a;
  font-size: 22rpx;
  font-weight: 800;
}

.part-block {
  margin-top: 20rpx;
}

.part-title {
  margin-bottom: 12rpx;
  color: #667085;
  font-size: 23rpx;
  font-weight: 900;
}

.part-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.part-chip {
  display: flex;
  min-width: 150rpx;
  min-height: 64rpx;
  align-items: center;
  justify-content: center;
  padding: 0 18rpx;
  border: 1rpx solid #d8deea;
  border-radius: 999rpx;
  background: #fff;
  color: #394356;
  text-align: center;
  line-height: 1.1;
}

.part-chip text {
  font-size: 26rpx;
  font-weight: 900;
}

.part-chip.active {
  border-color: #7258ff;
  background: #7258ff;
  color: #fff;
}

.part-chip[disabled],
.count-row.disabled {
  opacity: 0.48;
}

.count-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14rpx;
  align-items: center;
  margin-top: 12rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: #f6f8fc;
}

.count-title {
  color: #222b3c;
  font-size: 24rpx;
  font-weight: 900;
}

.count-stepper {
  flex: 0 0 auto;
}

.selected-detail {
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: #f6f8fc;
}

.selected-detail-head,
.selected-list > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.selected-detail-head {
  color: #667085;
  font-size: 22rpx;
  font-weight: 900;
}

.selected-list {
  display: grid;
  gap: 12rpx;
  margin-top: 14rpx;
}

.selected-list > view {
  color: #1d2433;
  font-size: 23rpx;
  font-weight: 800;
}

.selected-list text:last-child {
  color: #536074;
  text-align: right;
}

.selected-empty {
  margin-top: 12rpx;
  color: #7a8394;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.45;
}
</style>
