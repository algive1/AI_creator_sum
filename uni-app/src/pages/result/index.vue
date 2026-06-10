<template>
  <view class="flow-page result-page">
    <view class="result-tabs">
      <view class="result-tab-label">当前查看</view>
      <view :class="{ active: !isVideo }">图片结果</view>
      <view :class="{ active: isVideo }">视频结果</view>
    </view>

    <view class="result-status-card" :class="statusView.kind">
      <image class="status-art-thumb" :src="statusArtSource" mode="aspectFit" />
      <view class="status-copy">
        <view class="status-label">{{ statusView.label }}</view>
        <view class="status-title">{{ statusView.title }}</view>
        <view class="status-desc">{{ statusView.desc }}</view>
      </view>
      <view v-if="statusView.active" class="status-progress">
        <view class="status-progress-head">
          <text>{{ progressLabel }}</text>
          <text>{{ statusView.progress }}%</text>
        </view>
        <view class="status-progress-track">
          <view class="status-progress-fill" :style="{ width: `${statusView.progress}%` }"></view>
        </view>
      </view>
      <view v-if="statusView.active" class="status-step-row">
        <view v-for="item in statusSteps" :key="item.label" class="status-step" :class="item.state">
          <text class="status-step-dot"></text>
          <text>{{ item.label }}</text>
        </view>
      </view>
    </view>

    <view v-if="showCompletedResult && !isVideo" class="image-preview">
      <view class="preview-poster" :class="{ 'has-image': Boolean(currentOutput.image) }" :style="{ background: currentOutput.background }">
        <image v-if="currentOutput.image" class="result-main-image" :src="currentOutput.image" mode="aspectFill" lazy-load />
        <view class="preview-label">{{ currentOutput.name || task.style || '方案一' }}</view>
        <view class="preview-title">{{ currentOutput.title || taskTitleOf(task) }}</view>
        <view class="preview-subtitle">{{ currentOutput.subtitle || task.imageType || '高质量电商视觉素材' }}</view>
        <view class="preview-product"></view>
        <view class="preview-foot">{{ task.ratio || '1:1' }} · {{ task.quality || '高清' }} · {{ task.style || '写实' }}</view>
      </view>
    </view>

    <view v-else-if="showCompletedResult" class="video-preview">
      <view class="video-cover">
        <video
          v-if="currentOutput.video || currentOutput.url"
          class="result-video-player"
          :src="currentOutput.video || currentOutput.url"
          :poster="currentOutput.thumbnail || thumbnail"
          controls
          object-fit="contain"
        />
        <image v-else-if="currentOutput.thumbnail || thumbnail" class="video-cover-image" :src="currentOutput.thumbnail || thumbnail" mode="aspectFill" />
        <view class="play-mark">播</view>
        <view class="video-cover-title">{{ taskTitleOf(task) }}</view>
      </view>
      <view class="script-card">
        <view class="section-title">脚本摘要</view>
        <view class="muted">开头直击目标人群痛点，中段展示核心卖点，结尾引导下单或到店咨询。</view>
      </view>
      <view v-if="showFrameInputs" class="frame-input-card">
        <view class="section-title">首尾帧素材</view>
        <view class="frame-input-grid">
          <view v-for="item in frameInputAssets" :key="item.type" class="frame-input-item">
            <image v-if="item.path" class="frame-input-image" :src="item.path" mode="aspectFill" />
            <view v-else class="frame-input-empty">未上传</view>
            <view class="frame-input-label">{{ item.typeLabel }}</view>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="state-preview" :class="statusView.kind">
      <view class="state-art">
        <image class="state-art-image" :src="statusArtSource" mode="aspectFit" />
      </view>
      <view class="state-preview-title">{{ statusView.title }}</view>
      <view class="state-preview-desc">{{ statePreviewDesc }}</view>
      <view v-if="statusView.active" class="state-action-row">
        <button class="state-secondary" @tap="viewHistory">查看记录</button>
        <button class="state-primary" @tap="refreshTask">刷新状态</button>
      </view>
      <view v-if="waitHint" class="wait-hint">{{ waitHint }}</view>
      <view v-else class="state-action-row">
        <button class="state-secondary" @tap="viewHistory">查看记录</button>
        <button class="state-primary" @tap="regenerate">重新生成</button>
      </view>
    </view>

    <scroll-view v-if="showCompletedResult && outputs.length > 1" scroll-x class="thumb-scroll">
      <view class="thumb-row">
        <button
          v-for="(item, index) in outputs"
          :key="String(item.id || item.name || index)"
          class="output-thumb"
          :class="{ active: selectedOutput === index }"
          @tap="selectOutput(index)"
        >
          {{ item.name || `方案${index + 1}` }}
        </button>
      </view>
    </scroll-view>

    <view class="card">
      <view class="section-title">创作信息</view>
      <view class="info-row">
        <text>项目名称</text>
        <text>{{ taskTitleOf(task) }}</text>
      </view>
      <view class="info-row">
        <text>生成方式</text>
        <text>{{ generationMode }}</text>
      </view>
      <view class="info-row">
        <text>画面比例</text>
        <text>{{ task.ratio || task.duration || '自动' }}</text>
      </view>
      <view class="info-row">
        <text>任务状态</text>
        <text>{{ statusView.label }}</text>
      </view>
      <view class="info-row">
        <text>创建时间</text>
        <text>{{ task.createdAt || '刚刚' }}</text>
      </view>
      <view class="info-row">
        <text>创作风格</text>
        <text>{{ task.style || '写实' }}</text>
      </view>
    </view>

    <view v-if="isVideo && showCompletedResult" class="card">
      <view class="section-title">分镜结构</view>
      <view v-for="item in storyboard" :key="item.title" class="story-item">
        <view class="story-title">{{ item.title }}</view>
        <view class="muted">{{ item.desc }}</view>
      </view>
    </view>

    <view class="card">
      <view class="label-row">
        <text class="section-title">本次提示词</text>
        <button class="section-action" @tap="copyPrompt">复制</button>
      </view>
      <view class="prompt-display-card">
        <view class="prompt-display-title">主提示词</view>
        <view class="prompt-display-text">{{ taskPromptOf(task) || '未填写' }}</view>
      </view>
    </view>

    <view v-if="showCompletedResult" class="action-grid">
      <button @tap="showToast('编辑功能将返回创作页')">编辑</button>
      <button @tap="downloadCurrentOutput">下载</button>
      <button @tap="regenerate">再次生成</button>
      <button v-if="userTemplateShareEnabled" @tap="shareCurrentOutput">分享</button>
    </view>

    <view class="bottom-actions">
      <view v-if="showCompletedResult" class="two-actions">
        <button class="secondary-btn" @tap="copyPrompt">复制提示词</button>
        <button class="primary-btn" @tap="regenerate">再次生成</button>
      </view>
      <view v-else-if="statusView.active" class="two-actions">
        <button class="secondary-btn" @tap="viewHistory">查看记录</button>
        <button class="primary-btn" @tap="viewHistory">后台继续生成</button>
      </view>
      <view v-else class="two-actions">
        <button class="secondary-btn" @tap="viewHistory">返回记录</button>
        <button class="primary-btn" @tap="regenerate">重新生成</button>
      </view>
    </view>
    <AppDialogHost />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import { useTaskStore } from '@/stores/task';
import { useConfigStore } from '@/stores/config';
import { useUserStore } from '@/stores/user';
import { taskPoller } from '@/utils/task-poller';
import { PAGE_ROUTES } from '@/utils/constants';
import { isTaskCompleted, isTaskEnded, taskOutputList, taskPromptOf, taskStatusViewOf, taskThumbnailOf, taskTitleOf, taskTypeOf } from '@/utils/task-display';
import { confirmCompliance } from '@/api/config';
import { downloadFile } from '@/api/upload';
import { shareTemplate } from '@/api/template';
import { showHdSaveDialog } from '@/utils/app-dialog';

interface OutputItem {
  id?: string | number;
  name?: string;
  url?: string;
  image?: string;
  video?: string;
  thumbnail?: string;
  background?: string;
  title?: string;
  subtitle?: string;
}
interface InputAssetItem {
  type: string;
  typeLabel: string;
  path: string;
}

const taskStore = useTaskStore();
const configStore = useConfigStore();
const userStore = useUserStore();
const task = ref<Record<string, unknown>>({});
const resultMeta = ref<Record<string, unknown>>({});
const routeType = ref('image');
const selectedOutput = ref(0);
const outputs = ref<OutputItem[]>([]);
const pollCount = ref(0);
const pollStartTime = ref(0);
let pollTaskId = 0;
const isVideo = computed(() => taskTypeOf(task.value || { type: routeType.value }) === 'video');
const thumbnail = computed(() => taskThumbnailOf(task.value));
const statusView = computed(() => taskStatusViewOf(task.value));
const showCompletedResult = computed(() => isTaskCompleted(task.value));
const userTemplateShareEnabled = computed(() => configStore.publicConfig?.['template.user_share_enabled'] !== false);
const membershipEnabled = computed(() => configStore.publicConfig?.membershipEnabled !== false);
const generationMode = computed(() => generationModeOf(task.value, resultMeta.value, isVideo.value));
const progressLabel = computed(() => {
  if (statusView.value.kind === 'queued') return '排队进度';
  if (statusView.value.kind === 'processing') return '处理进度';
  return '生成进度';
});
const statusArtSource = computed(() => {
  if (statusView.value.kind === 'completed') return '/static/visuals/result/status_success_3d.png';
  if (statusView.value.kind === 'failed' || statusView.value.kind === 'cancelled') return '/static/visuals/result/status_failed_3d.png';
  if (statusView.value.kind === 'queued') return '/static/visuals/result/status_queued_3d.png';
  return '/static/visuals/result/status_generating_3d.png';
});
const statusSteps = computed(() => {
  const order = ['queued', 'generating', 'processing', 'completed'];
  const labels = ['任务排队中', '正在生成', '保存处理中', '处理完成'];
  const current = Math.max(0, order.indexOf(statusView.value.kind));
  return labels.map((label, index) => ({
    label,
    state: index < current ? 'done' : index === current ? 'active' : 'pending'
  }));
});
const statePreviewDesc = computed(() => {
  if (statusView.value.kind === 'queued') return '预计很快开始生成，你可以先去记录页查看其他作品。';
  if (statusView.value.kind === 'generating') return 'AI 正在创作中，精彩即将出现。';
  if (statusView.value.kind === 'processing') return '作品正在保存和处理，请不要重复提交同一任务。';
  if (statusView.value.kind === 'cancelled') return '你可以修改描述后重新生成，或返回记录页。';
  if (statusView.value.kind === 'failed') return task.value.errorMessage || task.value.failReason || '换个描述再试一次，通常能解决模型繁忙或参数不匹配的问题。';
  return '暂无可展示的生成结果。';
});
const waitSeconds = computed(() => pollStartTime.value ? Math.floor((Date.now() - pollStartTime.value) / 1000) : 0);
const waitHint = computed(() => {
  if (!statusView.value.active) return '';
  const sec = waitSeconds.value;
  if (isVideo.value && sec > 180) return '视频生成通常需要2-5分钟，可先去记录页查看，任务会在后台继续。';
  if (isVideo.value && sec > 90) return '视频生成中，请耐心等待…也可先去记录页。';
  if (!isVideo.value && sec > 120) return '生成时间较长，可先去记录页查看，任务在后台继续处理。';
  if (!isVideo.value && sec > 60) return '正在努力生成中，请稍候…';
  return '';
});
const isFirstLastFrame = computed(() => ['first_last_frame', 'first_last_frame_video'].includes(String(task.value.subType || resultMeta.value.subType || ''))
  || ['首尾帧', '收尾帧视频'].includes(String(task.value.videoMode || resultMeta.value.videoMode || resultMeta.value.videoModeLabel || '')));
const inputAssets = computed(() => normalizeInputAssets(taskInputAssets(task.value) || taskInputAssets(resultMeta.value)));
const frameInputAssets = computed<InputAssetItem[]>(() => {
  const startFrame = inputAssets.value.find((item) => item.type === 'start_frame');
  const endFrame = inputAssets.value.find((item) => item.type === 'end_frame');
  return [
    startFrame || { type: 'start_frame', typeLabel: '开始帧', path: '' },
    endFrame || { type: 'end_frame', typeLabel: '结束帧', path: '' }
  ];
});
const showFrameInputs = computed(() => isVideo.value && isFirstLastFrame.value);
const currentOutput = computed<OutputItem>(() => outputs.value[selectedOutput.value] || outputs.value[0] || {
  id: 'empty-output',
  name: '暂无结果',
  url: '',
  image: thumbnail.value,
  video: '',
  thumbnail: thumbnail.value,
  background: 'linear-gradient(135deg, #7a5cff, #ff7acb)',
  title: taskTitleOf(task.value),
  subtitle: '任务暂无可展示输出'
});
const storyboard = [
  { title: '镜头 1', desc: '前三秒展示痛点，用强提示文案吸引注意。' },
  { title: '镜头 2', desc: '中段展示产品主体和核心卖点，镜头保持清晰。' },
  { title: '镜头 3', desc: '结尾露出品牌和行动引导，适合投流转化。' }
];

onLoad((query) => {
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  userStore.hydrate().catch(() => undefined);
  const id = String(query?.id || '');
  routeType.value = String(query?.type || 'image');
  resultMeta.value = readResultMeta(id);
  task.value = { id, type: routeType.value, status: 'queued', progress: 3, createdAt: new Date().toISOString(), ...resultMeta.value };
  buildOutputs();
  if (id) {
    refreshTask();
    startPolling();
  }
});

onUnload(() => stopPolling());

function buildOutputs() {
  outputs.value = taskOutputList(task.value).map((item, index) => ({
    id: item.id as string | number,
    name: String(item.name || `结果${index + 1}`),
    url: String(item.url || item.video || item.image || ''),
    image: String(item.image || item.thumbnail || item.url || ''),
    video: String(item.video || (item.type === 'video' ? item.url : '') || ''),
    thumbnail: String(item.thumbnail || item.image || ''),
    background: 'linear-gradient(135deg, #7a5cff, #ff7acb)',
    title: String(item.title || taskTitleOf(task.value)),
    subtitle: String(item.subtitle || item.prompt || '')
  }));
}

function selectOutput(index: number) {
  selectedOutput.value = index;
}

function startPolling() {
  stopPolling();
  if (!task.value.id || isTaskEnded(task.value)) return;
  pollCount.value = 0;
  pollStartTime.value = Date.now();
  pollTaskId = Number(task.value.id || 0);
  taskPoller.add(pollTaskId, handlePolledTask);
  taskPoller.pollNow().catch(() => undefined);
}

function stopPolling() {
  if (pollTaskId) taskPoller.removeListener(pollTaskId, handlePolledTask);
  pollTaskId = 0;
}

function refreshTask() {
  const id = Number(task.value.id || 0);
  if (!id) return;
  taskStore.loadTask(id).then((res) => {
    task.value = { ...resultMeta.value, ...res };
    buildOutputs();
    if (isTaskEnded(task.value)) stopPolling();
  }).catch(() => {
    outputs.value = [];
  });
}

function handlePolledTask(res: Record<string, unknown>) {
  pollCount.value++;
  task.value = { ...resultMeta.value, ...res };
  buildOutputs();
  if (isTaskEnded(task.value)) stopPolling();
}

function copyPrompt() {
  const content = [
    `主提示词：${taskPromptOf(task.value)}`
  ].join('\n');
  uni.setClipboardData({ data: content });
}

function regenerate() {
  const source = task.value.id ? `?sourceId=${encodeURIComponent(String(task.value.id))}` : '';
  uni.navigateTo({ url: `${isVideo.value ? PAGE_ROUTES.aiVideo : PAGE_ROUTES.aiImage}${source}` });
}

function viewHistory() {
  uni.reLaunch({ url: PAGE_ROUTES.history });
}

function showToast(title: string) {
  uni.showToast({ title, icon: 'none' });
}

function mediaUrlOf(output: OutputItem) {
  if (isVideo.value) return output.video || output.url || output.image || thumbnail.value;
  return output.image || output.url || thumbnail.value;
}

async function downloadCurrentOutput() {
  const url = mediaUrlOf(currentOutput.value);
  if (!url) {
    showToast('暂无可下载内容');
    return;
  }
  if (!isVideo.value && membershipEnabled.value && !userStore.isMember) {
    const choice = await showHdSaveDialog({ isMember: false });
    if (choice !== 'secondary') return;
  }
  let stage: 'confirm' | 'download' | 'album' = 'confirm';
  try {
    await confirmCompliance({ scene: 'export_save', confirmationText: '我确认', taskId: task.value.id });
    stage = 'download';
    const tempFilePath = await downloadFile(url, { loading: '下载中' });
    stage = 'album';
    if (isVideo.value) {
      await saveVideo(tempFilePath);
    } else {
      await saveImage(tempFilePath);
    }
    showToast('已保存');
  } catch (error) {
    if (stage === 'album') showToast(albumSaveErrorText(error));
  }
}

async function shareCurrentOutput() {
  if (!userTemplateShareEnabled.value) {
    showToast('模板分享功能已关闭');
    return;
  }
  const output = currentOutput.value;
  const rawOutputId = Number(output.id || 0);
  const outputId = Number.isFinite(rawOutputId) && rawOutputId > 0 ? rawOutputId : undefined;
  const taskId = Number(task.value.id || 0);
  if (!taskId) {
    showToast('缺少任务信息');
    return;
  }
  await confirmCompliance({ scene: 'public_template', confirmationText: 'checked', taskId });
  await shareTemplate({
    taskId,
    ...(outputId ? { outputId } : { outputIndex: selectedOutput.value }),
    title: taskTitleOf(task.value),
    prompt: taskPromptOf(task.value),
    coverUrl: output.thumbnail || output.image || thumbnail.value,
    templateType: isVideo.value ? 'video' : 'image'
  });
  showToast('已提交分享审核');
}

function saveImage(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    uni.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject });
  });
}

function saveVideo(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    uni.saveVideoToPhotosAlbum({ filePath, success: () => resolve(), fail: reject });
  });
}

function albumSaveErrorText(error: unknown) {
  const message = String((error as { errMsg?: string; message?: string })?.errMsg || (error as { message?: string })?.message || '');
  if (/auth|authorize|scope\.writePhotosAlbum|permission|deny|denied/i.test(message)) {
    return '保存失败，请在设置中允许相册权限';
  }
  if (/file|path|not found|no such|invalid/i.test(message)) {
    return '保存失败，下载文件无效，请重新生成后再试';
  }
  return '保存失败，请稍后重试';
}

function readResultMeta(id: string) {
  if (!id) return {};
  try {
    const value = uni.getStorageSync(`ai_video_result_meta:${id}`);
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function generationModeOf(source: Record<string, unknown>, meta: Record<string, unknown>, video: boolean) {
  const sourceSnapshot = objectValue(source.priceSnapshot || source.price_snapshot);
  const metaSnapshot = objectValue(meta.priceSnapshot || meta.price_snapshot);
  const value = firstText(
    source.generationMode,
    source.tierName,
    source.tier_name,
    meta.generationMode,
    meta.tierName,
    meta.tier_name,
    sourceSnapshot.tierName,
    sourceSnapshot.tier_name,
    metaSnapshot.tierName,
    metaSnapshot.tier_name
  );
  return value || (video ? 'AI视频生成' : 'AI生图');
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function taskInputAssets(source: Record<string, unknown>) {
  if (Array.isArray(source.inputAssets)) return source.inputAssets;
  const params = source.params;
  if (params && typeof params === 'object' && Array.isArray((params as Record<string, unknown>).inputAssets)) {
    return (params as Record<string, unknown>).inputAssets;
  }
  return undefined;
}

function normalizeInputAssets(value: unknown): InputAssetItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      type: String(source.type || ''),
      typeLabel: String(source.typeLabel || source.label || ''),
      path: String(source.path || source.url || source.fileUrl || source.thumbnail || '')
    };
  }).filter((item) => item.type && item.path);
}
</script>

<style scoped lang="scss">
.result-page {
  min-height: 100vh;
  padding-top: 24rpx;
  padding-bottom: calc(150rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 14% 8%, rgba(122, 92, 255, 0.14), transparent 28%),
    radial-gradient(circle at 90% 10%, rgba(255, 122, 203, 0.13), transparent 26%),
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 100%);
}

.result-status-card {
  position: relative;
  overflow: hidden;
  margin-bottom: 22rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.18);
  border-radius: 24rpx;
  background:
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.62), transparent 22%),
    linear-gradient(135deg, #ece8ff 0%, #ffe1f1 100%);
  box-shadow: 0 18rpx 42rpx rgba(122, 92, 255, 0.12);
}

.result-status-card.processing {
  border-color: rgba(245, 158, 11, 0.24);
  background:
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.66), transparent 22%),
    linear-gradient(135deg, #fff1d6 0%, #ffe1c7 100%);
}

.result-status-card.completed {
  border-color: rgba(34, 197, 94, 0.24);
  background:
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.66), transparent 22%),
    linear-gradient(135deg, #dffbea 0%, #f4fff9 100%);
}

.result-status-card.failed {
  border-color: rgba(244, 63, 94, 0.2);
  background:
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.66), transparent 22%),
    linear-gradient(135deg, #ffe1e9 0%, #fff2f5 100%);
}

.result-status-card.cancelled {
  border-color: rgba(148, 163, 184, 0.24);
  background:
    radial-gradient(circle at 86% 16%, rgba(255, 255, 255, 0.66), transparent 22%),
    linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%);
}

.status-art-thumb {
  position: absolute;
  top: 20rpx;
  right: 18rpx;
  width: 176rpx;
  height: 124rpx;
  border-radius: 22rpx;
  opacity: 0.96;
}

.status-copy {
  position: relative;
  z-index: 2;
  width: calc(100% - 172rpx);
  min-height: 116rpx;
}

.status-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42rpx;
  margin-bottom: 12rpx;
  padding: 0 20rpx;
  border-radius: 21rpx;
  background: rgba(122, 92, 255, 0.12);
  color: #6d4cff;
  font-size: 22rpx;
  font-weight: 900;
}

.result-status-card.processing .status-label {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.result-status-card.completed .status-label {
  background: rgba(34, 197, 94, 0.14);
  color: #16a34a;
}

.result-status-card.failed .status-label {
  background: rgba(244, 63, 94, 0.14);
  color: #e11d48;
}

.result-status-card.cancelled .status-label {
  background: rgba(100, 116, 139, 0.14);
  color: #64748b;
}

.status-title {
  color: #172033;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.2;
}

.status-desc {
  margin-top: 10rpx;
  color: #334155;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.45;
}

.status-progress {
  position: relative;
  z-index: 2;
  margin-top: 24rpx;
}

.status-progress-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
  color: #172033;
  font-size: 23rpx;
  font-weight: 900;
}

.status-progress-track {
  overflow: hidden;
  height: 16rpx;
  border-radius: 8rpx;
  background: rgba(122, 92, 255, 0.12);
}

.status-progress-fill {
  height: 100%;
  border-radius: 8rpx;
  background: linear-gradient(90deg, #7a5cff, #ff7acb);
  transition: width 0.3s ease;
}

.result-status-card.processing .status-progress-fill {
  background: linear-gradient(90deg, #f59e0b, #f97316);
}

.status-step-row {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx 18rpx;
  margin-top: 22rpx;
}

.status-step {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: #64748b;
  font-size: 22rpx;
  font-weight: 800;
}

.status-step-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #cbd5e1;
}

.status-step.done,
.status-step.active {
  color: #172033;
}

.status-step.done .status-step-dot,
.status-step.active .status-step-dot {
  background: #22c55e;
}

.status-step.active .status-step-dot {
  box-shadow: 0 0 0 8rpx rgba(122, 92, 255, 0.12);
  background: #7a5cff;
}

.state-preview {
  overflow: hidden;
  margin-bottom: 22rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.14);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
  box-shadow: 0 16rpx 42rpx rgba(28, 43, 82, 0.08);
}

.state-art {
  position: relative;
  overflow: hidden;
  height: 380rpx;
  border-radius: 20rpx;
  background: #f8f8ff;
}

.state-art-image {
  width: 100%;
  height: 100%;
}

.state-preview-title {
  margin-top: 26rpx;
  color: #172033;
  font-size: 32rpx;
  font-weight: 900;
}

.state-preview-desc {
  margin-top: 12rpx;
  color: #64748b;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.45;
}

.state-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 26rpx;
}

.state-secondary,
.state-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 76rpx;
  border-radius: 18rpx;
  font-size: 26rpx;
  font-weight: 900;
}

.state-secondary {
  border: 1rpx solid rgba(122, 92, 255, 0.18);
  background: #ffffff;
  color: #252941;
}

.state-primary {
  background: linear-gradient(100deg, #7a5cff, #ff7acb);
  color: #ffffff;
  box-shadow: 0 14rpx 28rpx rgba(122, 92, 255, 0.18);
}

.wait-hint {
  margin-top: 20rpx;
  padding: 18rpx 26rpx;
  border-radius: 14rpx;
  background: rgba(245, 158, 11, 0.08);
  border: 1rpx solid rgba(245, 158, 11, 0.18);
  color: #b45309;
  font-size: 24rpx;
  font-weight: 800;
  text-align: center;
}

.result-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 24rpx;
  padding: 8rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 36rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 42rpx rgba(28, 43, 82, 0.08);
}

.result-tab-label {
  position: absolute;
  top: -28rpx;
  left: 50%;
  transform: translateX(-50%);
  padding: 4rpx 18rpx;
  border-radius: 14rpx;
  background: rgba(122, 92, 255, 0.12);
  color: #6d4cff;
  font-size: 20rpx;
  font-weight: 800;
  white-space: nowrap;
}

.result-tabs view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 70rpx;
  border-radius: 30rpx;
  color: #475569;
  font-weight: 900;
}

.result-tabs .active {
  background: linear-gradient(90deg, #ff7acb, #8b5cf6);
  color: #ffffff;
  box-shadow: 0 10rpx 24rpx rgba(139, 92, 246, 0.18);
}

.image-preview,
.video-preview {
  margin-bottom: 22rpx;
}

.preview-poster {
  position: relative;
  overflow: hidden;
  min-height: 620rpx;
  padding: 34rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.18);
  border-radius: 22rpx;
  color: #ffffff;
}

.result-main-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.preview-poster.has-image::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(20, 24, 42, 0.12), rgba(20, 24, 42, 0.62));
  content: "";
}

.preview-label {
  position: relative;
  z-index: 2;
  display: inline-flex;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 24rpx;
  font-weight: 900;
}

.preview-title {
  position: relative;
  z-index: 2;
  width: 70%;
  margin-top: 30rpx;
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1.15;
}

.preview-subtitle {
  position: relative;
  z-index: 2;
  width: 72%;
  margin-top: 18rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 28rpx;
  line-height: 1.5;
}

.preview-product {
  position: absolute;
  right: 60rpx;
  bottom: 72rpx;
  width: 230rpx;
  height: 230rpx;
  border-radius: 34rpx;
  background: #ffffff;
  box-shadow: -44rpx 36rpx 0 rgba(255, 200, 87, 0.72);
}

.preview-poster.has-image .preview-product {
  display: none;
}

.preview-foot {
  position: absolute;
  z-index: 2;
  right: 34rpx;
  bottom: 34rpx;
  left: 34rpx;
  color: rgba(255, 255, 255, 0.86);
  font-size: 24rpx;
  font-weight: 900;
}

.video-cover {
  position: relative;
  overflow: hidden;
  min-height: 420rpx;
  padding: 34rpx;
  border-radius: 22rpx;
  background:
    radial-gradient(circle at 78% 18%, rgba(255, 200, 87, 0.22), transparent 28%),
    linear-gradient(135deg, #7a5cff, #ff7acb);
  color: #ffffff;
}

.video-cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.48;
}

.result-video-player {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.play-mark {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 94rpx;
  height: 94rpx;
  border-radius: 47rpx;
  background: rgba(255, 255, 255, 0.2);
  font-weight: 900;
}

.result-video-player ~ .play-mark {
  display: none;
}

.video-cover-title {
  position: absolute;
  right: 34rpx;
  bottom: 34rpx;
  left: 34rpx;
  z-index: 2;
  font-size: 42rpx;
  font-weight: 900;
}

.script-card,
.prompt-display-card {
  margin-top: 18rpx;
  padding: 26rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 16rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 42rpx rgba(28, 43, 82, 0.08);
}

.frame-input-card {
  margin-top: 18rpx;
  padding: 26rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 16rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 42rpx rgba(28, 43, 82, 0.08);
}

.frame-input-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 20rpx;
}

.frame-input-item {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  border-radius: 16rpx;
  background: #f8fbff;
}

.frame-input-image {
  width: 100%;
  height: 100%;
}

.frame-input-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #91a3ad;
  font-size: 24rpx;
  font-weight: 900;
}

.frame-input-label {
  position: absolute;
  left: 12rpx;
  bottom: 12rpx;
  padding: 6rpx 14rpx;
  border-radius: 18rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
}

.thumb-scroll {
  width: 100%;
  overflow: hidden;
  margin-bottom: 22rpx;
  white-space: nowrap;
}

.thumb-row {
  display: inline-flex;
  gap: 16rpx;
}

.output-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 164rpx;
  height: 88rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 14rpx;
  background: #ffffff;
  color: #172033;
  font-weight: 900;
  box-shadow: 0 10rpx 24rpx rgba(28, 43, 82, 0.07);
}

.output-thumb.active {
  border-color: #ff7acb;
  background: #fff1f2;
  color: #be123c;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  min-height: 58rpx;
  color: #334155;
  font-size: 24rpx;
  font-weight: 800;
}

.info-row text:last-child {
  max-width: 430rpx;
  overflow: hidden;
  color: #172033;
  font-weight: 900;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid rgba(134, 216, 255, 0.12);
}

.story-item:last-child {
  border-bottom: 0;
}

.story-title,
.prompt-display-title {
  margin-bottom: 8rpx;
  color: #172033;
  font-weight: 900;
}

.prompt-display-text {
  color: #334155;
  font-size: 24rpx;
  line-height: 1.55;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.action-grid button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 84rpx;
  border: 1rpx solid #bfdbfe;
  border-radius: 14rpx;
  background: #ffffff;
  color: #172033;
  font-weight: 900;
  box-shadow: 0 10rpx 24rpx rgba(28, 43, 82, 0.07);
}

.bottom-actions {
  position: fixed;
  right: 28rpx;
  bottom: calc(20rpx + env(safe-area-inset-bottom));
  left: 28rpx;
  z-index: 40;
}

.two-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.secondary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.18);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.94);
  color: #252941;
  font-size: 28rpx;
  font-weight: 900;
}
</style>
