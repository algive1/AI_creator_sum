<template>
  <view class="flow-page agreement-page">
    <view class="content">
      <view class="card intro-card">
        <view class="section-title">{{ pageTitle }}</view>
        <view class="intro-copy">{{ introCopy }}</view>
      </view>

      <view v-if="isHelpMode" class="card">
        <view class="article">{{ helpContent }}</view>
      </view>
      <view v-else-if="documents.length === 0" class="card empty-card">暂无可阅读协议</view>
      <view v-for="doc in isHelpMode ? [] : documents" :key="`${doc.docType}-${doc.version}`" class="card">
        <view class="doc-head">
          <view class="section-title">{{ doc.title }}</view>
          <view class="doc-version">v{{ doc.version }}</view>
        </view>
        <view class="article">{{ doc.content }}</view>
      </view>

      <button v-if="!isHelpMode" class="primary-btn" :disabled="documents.length === 0" @tap="accept">我已阅读并同意</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { acceptLegalDocuments, getLegalDocuments } from '@/api/config';
import { useConfigStore } from '@/stores/config';

interface LegalDocument {
  docType: string;
  title: string;
  version: string;
  content: string;
}

const documents = ref<LegalDocument[]>([]);
const mode = ref('');
const configStore = useConfigStore();
const isHelpMode = computed(() => mode.value === 'help');
const help = computed(() => {
  const value = configStore.publicConfig.help;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const pageTitle = computed(() => isHelpMode.value ? String(help.value.title || '使用帮助') : '用户协议');
const introCopy = computed(() => isHelpMode.value ? '查看小程序使用说明和常见问题。' : '请阅读并同意以下协议后继续使用平台服务。');
const helpContent = computed(() => String(help.value.contentHtml || help.value.content || '暂无帮助内容'));

onLoad((query) => {
  mode.value = String(query?.type || '');
});

onShow(() => {
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  if (isHelpMode.value) return;
  getLegalDocuments<Record<string, unknown>>().then((res) => {
    const docs = (res.documents || res.list || []) as Record<string, unknown>[];
    documents.value = docs.map(normalizeDocument).filter((item) => item.docType && item.version && item.content);
  }).catch(() => {
    documents.value = [];
  });
});

async function accept() {
  if (!documents.value.length) {
    uni.showToast({ title: '暂无可同意协议', icon: 'none' });
    return;
  }
  await acceptLegalDocuments(
    documents.value.map((item) => ({ docType: item.docType, version: item.version })),
    'profile_agreement'
  );
  uni.showToast({ title: '已同意', icon: 'success' });
}

function normalizeDocument(row: Record<string, unknown>): LegalDocument {
  return {
    docType: String(row.docType || row.doc_type || row.documentKey || row.key || ''),
    title: String(row.title || '用户协议'),
    version: String(row.version || ''),
    content: String(row.content || '')
  };
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
}

.intro-copy {
  margin-top: 12rpx;
  color: #7e879a;
  font-size: 24rpx;
  font-weight: 800;
}

.empty-card {
  padding: 40rpx 24rpx;
  color: #8b91aa;
  font-size: 25rpx;
  font-weight: 800;
  text-align: center;
}

.doc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
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

.article {
  margin-top: 18rpx;
  color: #4d586b;
  font-size: 25rpx;
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
