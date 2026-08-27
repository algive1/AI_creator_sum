<template>
  <view class="flow-page agreement-page">
    <view class="content">
      <view class="card intro-card">
        <view class="section-title">{{ pageTitle }}</view>
        <view class="intro-copy">{{ introCopy }}</view>
        <view v-if="!isHelpMode && documents.length" class="intro-hint">完整协议默认收起，需要时可点击展开查看。</view>
      </view>

      <block v-if="isHelpMode">
        <view v-if="helpDetailItem" class="card help-detail-card">
          <button class="help-back-btn" hover-class="none" @tap="backToHelpList">返回帮助列表</button>
          <view class="section-title">{{ helpDetailItem.title }}</view>
          <view v-if="helpDetailItem.subtitle" class="help-subtitle">{{ helpDetailItem.subtitle }}</view>
          <rich-text v-if="helpDetailItem.contentHtml" class="article" :nodes="helpDetailItem.contentHtml" />
          <view v-if="helpDetailItem.mediaUrl" class="help-media-frame" :style="helpMediaFrameStyle(helpDetailItem)">
            <image
              v-if="helpDetailItem.mediaType === 'image'"
              class="help-media"
              :src="helpDetailItem.mediaUrl"
              mode="aspectFit"
            />
            <video
              v-else-if="helpDetailItem.mediaType === 'video'"
              class="help-media"
              :src="helpDetailItem.mediaUrl"
              controls
              object-fit="contain"
            />
          </view>
          <view v-if="helpDetailItem.copyText" class="help-code-block" @tap="copyHelpText(helpDetailItem.copyText)">
            <text class="help-code-text" selectable>{{ helpDetailItem.copyText }}</text>
            <button class="help-copy-btn" hover-class="none" @tap.stop="copyHelpText(helpDetailItem.copyText)">
              {{ helpDetailItem.copyLabel || '复制' }}
            </button>
          </view>
        </view>
        <block v-else>
          <view
            v-for="item in helpItems"
            :key="item.id"
            class="card help-item-card"
            @tap="openHelpItem(item)"
          >
            <view class="help-card-copy">
              <view class="section-title">{{ item.title }}</view>
              <view v-if="item.subtitle" class="help-subtitle">{{ item.subtitle }}</view>
            </view>
            <view class="help-card-arrow">
              <view class="help-card-chevron"></view>
            </view>
          </view>
          <view v-if="!helpItems.length" class="card empty-card">暂无帮助内容</view>
        </block>
      </block>
      <view v-else-if="documents.length === 0" class="card empty-card">暂无可阅读协议</view>
      <view
        v-for="doc in isHelpMode ? [] : documents"
        :key="documentKey(doc)"
        class="card doc-card"
        :class="{ expanded: isDocumentExpanded(doc) }"
      >
        <view class="doc-head" @tap="toggleDocument(doc)">
          <view class="doc-title-wrap">
            <view class="section-title">{{ doc.title }}</view>
            <view class="doc-tip">{{ isDocumentExpanded(doc) ? '正在查看完整协议' : '点击展开完整协议' }}</view>
          </view>
          <view class="doc-side">
            <view class="doc-version">v{{ doc.version }}</view>
            <view class="doc-toggle">{{ isDocumentExpanded(doc) ? '收起' : '展开' }}</view>
          </view>
        </view>
        <view v-if="!isDocumentExpanded(doc)" class="doc-preview">
          为保障你的账号、积分、会员、作品保存和内容合规权益，完整条款已收起。
        </view>
        <rich-text v-else class="article" :nodes="doc.content" />
      </view>

      <button
        v-if="!isHelpMode"
        class="primary-btn agreement-accept-btn"
        :class="{ disabled: documents.length === 0 }"
        :disabled="documents.length === 0"
        @tap="accept"
      >
        我已阅读并同意
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { acceptLegalDocuments, getLegalDocuments } from '@/api/config';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { STORAGE_KEYS } from '@/utils/constants';

interface LegalDocument {
  docType: string;
  title: string;
  version: string;
  content: string;
}

interface HelpItem {
  id: string;
  title: string;
  subtitle: string;
  contentHtml: string;
  mediaType: 'image' | 'video' | '';
  mediaUrl: string;
  mediaRatio: string;
  copyText: string;
  copyLabel: string;
}

const HELP_MEDIA_WIDTH_RPX = 642;
const documents = ref<LegalDocument[]>([]);
const mode = ref('');
const selectedHelpId = ref('');
const authStore = useAuthStore();
const configStore = useConfigStore();
const isHelpMode = computed(() => mode.value === 'help');
const help = computed(() => {
  const value = configStore.publicConfig.help;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const pageTitle = computed(() => isHelpMode.value ? String(help.value.title || '使用帮助') : '用户协议');
const introCopy = computed(() => isHelpMode.value ? '查看小程序使用说明和常见问题。' : '请阅读并同意以下协议后继续使用平台服务。');
const helpContent = computed(() => String(help.value.contentHtml || help.value.content || '暂无帮助内容'));
const helpItems = computed(() => {
  const items = Array.isArray(help.value.items)
    ? help.value.items.map((item, index) => normalizeHelpItem(item as Record<string, unknown>, index)).filter(hasHelpItemContent)
    : [];
  if (items.length) return items;
  const contentHtml = helpContent.value.trim();
  return contentHtml ? [normalizeHelpItem({ title: help.value.title || '使用帮助', contentHtml }, 0)] : [];
});
const helpDetailItem = computed(() => {
  const id = selectedHelpId.value.trim();
  return id ? helpItems.value.find((item) => item.id === id) || null : null;
});
const expandedDocs = ref<Record<string, boolean>>({});

onLoad((query) => {
  mode.value = String(query?.type || '');
  selectedHelpId.value = decodeHelpId(query?.helpId);
});

onShow(() => {
  authStore.hydrate();
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  if (isHelpMode.value) return;
  getLegalDocuments<Record<string, unknown>>().then((res) => {
    const docs = (res.documents || res.list || []) as Record<string, unknown>[];
    documents.value = docs.map(normalizeDocument).filter((item) => item.docType && item.version && item.content);
    expandedDocs.value = {};
  }).catch(() => {
    documents.value = [];
    expandedDocs.value = {};
  });
});

async function accept() {
  if (!documents.value.length) {
    uni.showToast({ title: '暂无可同意协议', icon: 'none' });
    return;
  }
  const acceptedDocuments = documents.value.map((item) => ({ docType: item.docType, version: item.version }));
  await authStore.hydrate();
  if (authStore.isLoggedIn) await acceptLegalDocuments(acceptedDocuments, 'profile_agreement');
  uni.setStorageSync(STORAGE_KEYS.legalConsent, legalSignature());
  uni.showToast({ title: '已同意', icon: 'success' });
}

function legalSignature() {
  return documents.value.map((item) => `${item.docType}:${item.version}`).join('|');
}

function documentKey(doc: LegalDocument) {
  return `${doc.docType}:${doc.version}`;
}

function isDocumentExpanded(doc: LegalDocument) {
  return Boolean(expandedDocs.value[documentKey(doc)]);
}

function toggleDocument(doc: LegalDocument) {
  const key = documentKey(doc);
  expandedDocs.value = {
    ...expandedDocs.value,
    [key]: !expandedDocs.value[key]
  };
}

function normalizeDocument(row: Record<string, unknown>): LegalDocument {
  return {
    docType: String(row.docType || row.doc_type || row.documentKey || row.key || ''),
    title: String(row.title || '用户协议'),
    version: String(row.version || ''),
    content: String(row.content || '')
  };
}

function normalizeHelpItem(row: Record<string, unknown>, index: number): HelpItem {
  const mediaType = normalizeHelpMediaType(row.mediaType || row.media_type);
  return {
    id: String(row.id || `help_${index}`),
    title: String(row.title || `帮助 ${index + 1}`),
    subtitle: String(row.subtitle || row.subTitle || row.description || ''),
    contentHtml: String(row.contentHtml || row.content_html || row.content || ''),
    mediaType,
    mediaUrl: String(row.mediaUrl || row.media_url || ''),
    mediaRatio: normalizeHelpRatio(String(row.mediaRatio || row.media_ratio || '16:9')),
    copyText: String(row.copyText || row.copy_text || ''),
    copyLabel: String(row.copyLabel || row.copy_label || '复制')
  };
}

function hasHelpItemContent(item: HelpItem) {
  return Boolean(item.subtitle || item.contentHtml || item.mediaUrl || item.copyText);
}

function decodeHelpId(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function openHelpItem(item: HelpItem) {
  const id = encodeURIComponent(item.id);
  uni.navigateTo({ url: `/pages/agreement/index?type=help&helpId=${id}` });
}

function backToHelpList() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  selectedHelpId.value = '';
  uni.redirectTo({ url: '/pages/agreement/index?type=help' });
}

function normalizeHelpMediaType(value: unknown): HelpItem['mediaType'] {
  const type = String(value || '').toLowerCase();
  return type === 'image' || type === 'video' ? type : '';
}

function normalizeHelpRatio(value: string) {
  const text = value.trim();
  return /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text) ? text : '16:9';
}

function helpMediaFrameStyle(item: HelpItem) {
  const [width, height] = item.mediaRatio.split(':').map((part) => Number(part));
  const ratio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : 16 / 9;
  return { height: `${Math.round(HELP_MEDIA_WIDTH_RPX / ratio)}rpx` };
}

function copyHelpText(value: string) {
  const text = String(value || '').trim();
  if (!text) return;
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'success' })
  });
}
</script>

<style scoped lang="scss">
.agreement-page {
  padding-top: 24rpx;
}

.intro-card {
  background:
    radial-gradient(circle at 92% 16%, rgba(255, 122, 203, 0.16), transparent 24%),
    linear-gradient(135deg, #ffffff, #f3f0ff);
  text-align: center;
}

.intro-copy {
  margin-top: 12rpx;
  color: #7e879a;
  font-size: 24rpx;
  font-weight: 800;
}

.intro-hint {
  margin: 18rpx auto 0;
  padding: 14rpx 18rpx;
  border-radius: 18rpx;
  background: rgba(122, 92, 255, 0.08);
  color: #6953d6;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 1.5;
}

.empty-card {
  padding: 40rpx 24rpx;
  color: #8b91aa;
  font-size: 25rpx;
  font-weight: 800;
  text-align: center;
}

.doc-card {
  transition: background 0.18s ease, border-color 0.18s ease;
}

.doc-card.expanded {
  border-color: rgba(122, 92, 255, 0.22);
  background: #ffffff;
}

.doc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.doc-title-wrap {
  flex: 1;
  min-width: 0;
}

.doc-title-wrap .section-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-tip {
  margin-top: 8rpx;
  color: #8b91aa;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.3;
}

.doc-side {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  flex-direction: column;
  gap: 10rpx;
}

.doc-version {
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

.doc-toggle {
  min-width: 76rpx;
  height: 42rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, rgba(122, 92, 255, 0.12), rgba(255, 122, 203, 0.12));
  color: #5e45d9;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 42rpx;
  text-align: center;
}

.doc-preview {
  margin-top: 22rpx;
  padding: 22rpx;
  border-radius: 20rpx;
  background: rgba(247, 249, 255, 0.9);
  color: #68758a;
  font-size: 24rpx;
  font-weight: 750;
  line-height: 1.6;
  text-align: center;
}

.article {
  margin-top: 18rpx;
  color: #4d586b;
  font-size: 25rpx;
  line-height: 1.7;
  white-space: pre-wrap;
}

.help-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  background: #ffffff;
}

.help-card-copy {
  flex: 1;
  min-width: 0;
}

.help-card-copy .section-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help-subtitle {
  margin-top: 10rpx;
  color: #7e879a;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.45;
}

.help-card-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 42rpx;
  height: 42rpx;
  border-radius: 999rpx;
  background: rgba(122, 92, 255, 0.1);
  color: #6a4dff;
}

.help-card-chevron {
  width: 14rpx;
  height: 14rpx;
  border-top: 4rpx solid currentColor;
  border-right: 4rpx solid currentColor;
  transform: rotate(45deg);
}

.help-detail-card {
  background: #ffffff;
}

.help-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 188rpx;
  height: 54rpx;
  margin: 0 0 22rpx;
  padding: 0;
  border-radius: 14rpx;
  background: rgba(122, 92, 255, 0.1);
  color: #5e45d9;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 54rpx;
}

.help-media-frame {
  overflow: hidden;
  width: 100%;
  max-width: 100%;
  margin-top: 20rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: #f2f4fb;
}

.help-media {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 100%;
}

.help-code-block {
  display: flex;
  align-items: stretch;
  gap: 14rpx;
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: #172033;
}

.help-code-text {
  flex: 1;
  min-width: 0;
  color: #eef4ff;
  font-size: 24rpx;
  line-height: 1.5;
  word-break: break-all;
}

.help-copy-btn {
  flex-shrink: 0;
  width: 96rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border-radius: 12rpx;
  background: #ffffff;
  color: #172033;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 52rpx;
}

.agreement-accept-btn {
  margin-top: 10rpx;
}

.agreement-accept-btn.disabled {
  background: linear-gradient(100deg, #c6ccd8, #d6dbe4);
  color: rgba(255, 255, 255, 0.86);
  box-shadow: none;
}
</style>
