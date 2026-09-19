<template>
  <view class="flow-page result-page">
    <view v-if="initialLoading" class="loading-panel">
      <image class="state-art" src="/static/visuals/result/status_generating_3d.png" mode="aspectFit" />
      <view class="state-title">正在读取作品</view>
      <view class="state-desc">正在同步任务详情，请稍候。</view>
    </view>

    <template v-else>
      <view v-if="showCompletedResult" class="result-preview">
        <view
          class="media-stage"
          :class="{ empty: !displayOutputs.length, image: currentOutputIsImage }"
          :style="resultMediaFrameStyle"
        >
          <template v-if="displayOutputs.length === 1">
            <video
              v-if="isOutputVideo(singleDisplayOutput)"
              class="main-video"
              :src="mediaUrlOf(singleDisplayOutput)"
              :poster="singleDisplayOutput.thumbnail || thumbnail"
              controls
              object-fit="contain"
              style="width: 100%; height: 100%;"
              @loadedmetadata="onResultVideoLoadedMetadata(singleDisplayOutput, $event)"
              @fullscreenchange="handleVideoFullscreenChange"
            />
            <image
              v-else
              class="main-image"
              :src="mediaUrlOf(singleDisplayOutput)"
              mode="aspectFit"
              lazy-load
              @load="onResultImageLoad(singleDisplayOutput, $event)"
              @tap.stop="openImageViewer(0)"
            />
          </template>
          <swiper
            v-else-if="displayOutputs.length > 1"
            class="media-swiper"
            :current="selectedOutput"
            :circular="displayOutputs.length > 1"
            @change="handleMediaChange"
          >
            <swiper-item
              v-for="(item, index) in displayOutputs"
              :key="String(item.id || item.name || index)"
              class="media-slide"
            >
              <video
                v-if="isOutputVideo(item)"
                class="main-video"
                :src="mediaUrlOf(item)"
                :poster="item.thumbnail || thumbnail"
                controls
                object-fit="contain"
                style="width: 100%; height: 100%;"
                @loadedmetadata="onResultVideoLoadedMetadata(item, $event)"
                @fullscreenchange="handleVideoFullscreenChange"
              />
              <image
                v-else
                class="main-image"
                :src="mediaUrlOf(item)"
                mode="aspectFit"
                lazy-load
                @load="onResultImageLoad(item, $event)"
                @tap.stop="openImageViewer(index)"
              />
            </swiper-item>
          </swiper>
          <view v-else class="preview-empty">{{ isVideo ? '暂无视频' : '暂无图片' }}</view>
          <view v-if="displayOutputs.length > 1 && !isVideoFullscreen" class="media-count">{{ mediaCountText }}</view>
        </view>

        <view class="result-summary">
          <view class="summary-title">{{ taskTitleOf(task) }}</view>
          <view class="summary-meta">{{ generationMode }} · {{ task.ratio || task.duration || '自动比例' }}</view>
          <view class="summary-status">
            <text>{{ statusView.desc }}</text>
          </view>
        </view>

        <view class="quick-actions">
          <button class="quick-action" @tap="copyPrompt">复制提示词</button>
          <button class="quick-action" open-type="share">发给好友</button>
          <button v-if="userTemplateShareEnabled" class="quick-action" @tap="shareCurrentOutput">发布到灵感库</button>
        </view>
      </view>

      <view v-else class="state-panel" :class="statusView.kind">
        <image class="state-art" :src="statusArtSource" mode="aspectFit" />
        <view class="state-label">{{ statusView.label }}</view>
        <view class="state-title">{{ statusView.title }}</view>
        <view class="state-desc">{{ statePreviewDesc }}</view>
        <view v-if="statusView.active" class="progress-block">
          <view class="progress-head">
            <text>{{ progressLabel }}</text>
            <text>{{ statusView.progress }}%</text>
          </view>
          <view class="progress-track">
            <view class="progress-fill" :style="{ width: `${statusView.progress}%` }"></view>
          </view>
        </view>
        <view v-if="waitHint" class="wait-hint">{{ waitHint }}</view>
      </view>

      <view v-if="showFrameInputs" class="info-card">
        <view class="card-title">首尾帧素材</view>
        <view class="frame-grid">
          <view v-for="item in frameInputAssets" :key="item.type" class="frame-item">
            <image v-if="item.path" class="frame-image" :src="item.path" mode="aspectFill" />
            <view v-else class="frame-empty">未上传</view>
            <view class="frame-label">{{ item.typeLabel }}</view>
          </view>
        </view>
      </view>

      <view class="info-card">
        <view class="card-head">
          <view class="card-title">创作信息</view>
          <button class="card-link" @tap="copyPrompt">复制</button>
        </view>
        <view class="info-row">
          <text>生成方式</text>
          <text>{{ generationMode }}</text>
        </view>
        <view class="info-row">
          <text>创建时间</text>
          <text>{{ formattedCreatedAt }}</text>
        </view>
        <view class="info-row">
          <text>创作规格</text>
          <text>{{ task.ratio || task.duration || task.size || '自动' }}</text>
        </view>
        <view class="info-row">
          <text>图片分辨率</text>
          <text>{{ outputResolutionLabel }}</text>
        </view>
        <view class="info-row">
          <text>图片大小</text>
          <text>{{ outputFileSizeLabel }}</text>
        </view>
        <view class="prompt-box">{{ taskPromptOf(task) || '未记录提示词' }}</view>
      </view>
    </template>

    <view v-if="!isVideoFullscreen" class="bottom-actions">
      <view v-if="initialLoading" class="two-actions">
        <button class="secondary-btn" @tap="viewHistory">返回作品库</button>
        <button class="primary-btn" @tap="refreshTask">刷新</button>
      </view>
      <view v-else-if="showCompletedResult" class="two-actions">
        <button class="secondary-btn" @tap="downloadCurrentOutput">保存</button>
        <button class="primary-btn" @tap="regenerate">再次生成</button>
      </view>
      <view v-else-if="statusView.active" class="two-actions">
        <button class="secondary-btn" @tap="viewHistory">去作品库</button>
        <button class="primary-btn" @tap="refreshTask">刷新状态</button>
      </view>
      <view v-else class="two-actions">
        <button class="secondary-btn" @tap="viewHistory">返回作品库</button>
        <button class="primary-btn" @tap="regenerate">重新生成</button>
      </view>
    </view>

    <AppDialogHost />
    <view v-if="showProfileNicknameDialog" class="profile-nickname-mask" @tap="cancelShareNickname">
      <view class="profile-nickname-dialog" @tap.stop>
        <view class="profile-nickname-title">设置分享昵称</view>
        <view class="profile-nickname-copy">分享模板前需要一个可展示的作者昵称。</view>
        <input
          v-model="shareNicknameInput"
          class="profile-nickname-input"
          maxlength="24"
          placeholder="请输入昵称"
          placeholder-class="profile-nickname-placeholder"
        />
        <view class="profile-nickname-actions">
          <button class="profile-nickname-secondary" @tap="cancelShareNickname">取消</button>
          <button class="profile-nickname-primary" :loading="savingShareNickname" @tap="saveShareNickname">保存并分享</button>
        </view>
      </view>
    </view>
    <ProtectedImageViewer
      :visible="imageViewerVisible"
      :src="imageViewerSrc"
      :title="taskTitleOf(task)"
      @close="imageViewerVisible = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import ProtectedImageViewer from '@/components/business/ProtectedImageViewer.vue';
import { useTaskStore } from '@/stores/task';
import { useConfigStore } from '@/stores/config';
import { useUserStore } from '@/stores/user';
import { taskPoller } from '@/utils/task-poller';
import { PAGE_ROUTES } from '@/utils/constants';
import { formatUserDateTime, isTaskCompleted, isTaskEnded, taskCreatedAtOf, taskOutputList, taskPromptOf, taskStatusViewOf, taskThumbnailOf, taskTitleOf, taskTypeOf } from '@/utils/task-display';
import { confirmCompliance } from '@/api/config';
import { downloadFile } from '@/api/upload';
import { shareTemplate } from '@/api/template';
import { updateMe } from '@/api/user';
import { showHdSaveDialog } from '@/utils/app-dialog';
import { isPurchaseEnabled } from '@/utils/purchase-guard';
import { createShareMessage, enableShareMenu } from '@/utils/share';

interface OutputItem {
  [key: string]: unknown;
  id?: string | number;
  name?: string;
  sourceIndex?: number;
  type?: string;
  url?: string;
  image?: string;
  video?: string;
  thumbnail?: string;
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
const outputImageSizes = ref<Record<string, { width: number; height: number }>>({});
const outputVideoSizes = ref<Record<string, { width: number; height: number }>>({});
const pollStartTime = ref(0);
const imageViewerVisible = ref(false);
const imageViewerSrc = ref('');
const initialLoading = ref(true);
const isVideoFullscreen = ref(false);
const showProfileNicknameDialog = ref(false);
const shareNicknameInput = ref('');
const savingShareNickname = ref(false);
let pendingShareResolver: ((value: boolean) => void) | null = null;
let pollTaskId = 0;
let stopTaskPolling: (() => void) | null = null;

const isVideo = computed(() => taskTypeOf(task.value || { type: routeType.value }) === 'video');
const thumbnail = computed(() => taskThumbnailOf(task.value));
const statusView = computed(() => taskStatusViewOf(task.value));
const showCompletedResult = computed(() => isTaskCompleted(task.value));
const userTemplateShareEnabled = computed(() => configStore.publicConfig?.['template.user_share_enabled'] !== false);
const membershipEnabled = computed(() => configStore.publicConfig?.membershipEnabled !== false);
const purchaseEnabled = computed(() => isPurchaseEnabled(configStore.publicConfig));
const generationMode = computed(() => generationModeOf(task.value, resultMeta.value, isVideo.value));
const displayOutputs = computed(() => outputs.value.filter((item) => mediaUrlOf(item)));
const singleDisplayOutput = computed<OutputItem>(() => displayOutputs.value[0] || currentOutput.value);
const formattedCreatedAt = computed(() => formatUserDateTime(taskCreatedAtOf(task.value), '刚刚'));
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
const statePreviewDesc = computed(() => {
  if (statusView.value.kind === 'queued') return '任务已提交，后台会继续推进。你可以先去作品库查看其他作品。';
  if (statusView.value.kind === 'generating') return 'AI 正在生成内容，请稍候。';
  if (statusView.value.kind === 'processing') return '作品正在保存和处理，请不要重复提交同一任务。';
  if (statusView.value.kind === 'cancelled') return '本次任务已取消，可以修改描述后重新生成。';
  if (statusView.value.kind === 'failed') return String(task.value.errorMessage || task.value.failReason || statusView.value.desc);
  return '暂无可展示的生成结果。';
});
const waitSeconds = computed(() => pollStartTime.value ? Math.floor((Date.now() - pollStartTime.value) / 1000) : 0);
const waitHint = computed(() => {
  if (!statusView.value.active) return '';
  const sec = waitSeconds.value;
  if (isVideo.value && sec > 180) return '视频生成通常需要 2-5 分钟，可先去作品库，任务会在后台继续。';
  if (isVideo.value && sec > 90) return '视频还在生成中，可先去作品库。';
  if (!isVideo.value && sec > 120) return '生成时间较长，可先去作品库，任务会继续处理。';
  return '';
});
const currentOutput = computed<OutputItem>(() => displayOutputs.value[selectedOutput.value] || displayOutputs.value[0] || {
  id: 'empty-output',
  name: '暂无结果',
  url: '',
  image: thumbnail.value,
  video: '',
  thumbnail: thumbnail.value,
  title: taskTitleOf(task.value),
  subtitle: '任务暂无可展示输出'
});
const currentMediaUrl = computed(() => mediaUrlOf(currentOutput.value));
const currentOutputIsImage = computed(() => Boolean(displayOutputs.value.length && !isOutputVideo(currentOutput.value)));
const resultImageFrameStyle = computed(() => {
  if (!currentOutputIsImage.value) return '';
  const size = outputImageSizes.value[currentMediaUrl.value];
  if (!size?.width || !size.height) return '';
  return imageFrameStyle(size.width, size.height, 694);
});
const resultVideoFrameStyle = computed(() => {
  if (!isOutputVideo(currentOutput.value)) return '';
  const size = outputVideoSizes.value[currentMediaUrl.value] || videoSizeFromOutput(currentOutput.value);
  return imageFrameStyle(size.width, size.height, 694);
});
const resultMediaFrameStyle = computed(() => {
  if (isOutputVideo(currentOutput.value)) return resultVideoFrameStyle.value;
  return resultImageFrameStyle.value;
});
const outputResolutionLabel = computed(() => {
  const output = currentOutput.value as Record<string, unknown>;
  const size = outputImageSizes.value[currentMediaUrl.value];
  return resolutionLabelOf(task.value, resultMeta.value, output, size) || '暂无';
});
const outputFileSizeLabel = computed(() => {
  const output = currentOutput.value as Record<string, unknown>;
  return fileSizeLabelOf(task.value, resultMeta.value, output) || '暂无';
});
const mediaCountText = computed(() => {
  const total = displayOutputs.value.length;
  const index = Math.min(selectedOutput.value + 1, total);
  return `${index}/${total}${isOutputVideo(currentOutput.value) ? '个视频' : '张图片'}`;
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

onLoad((query) => {
  enableShareMenu(false);
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  userStore.hydrate().catch(() => undefined);
  const id = String(query?.id || '');
  routeType.value = String(query?.type || 'image');
  resultMeta.value = readResultMeta(id);
  const snapshot = readResultSnapshot(id);
  if (snapshot.id || snapshot.taskId || snapshot.status || taskOutputList(snapshot).length) {
    task.value = { id, type: routeType.value, ...resultMeta.value, ...snapshot };
    initialLoading.value = false;
  } else {
    task.value = { id, type: routeType.value, ...resultMeta.value };
    initialLoading.value = true;
  }
  buildOutputs();
  if (id) refreshTask(true);
});

onUnload(() => stopPolling());

onShareAppMessage(() => createShareMessage({
  title: `我用 AI 生成了「${taskTitleOf(task.value)}」`,
  path: PAGE_ROUTES.inspiration,
  imageUrl: currentOutput.value.thumbnail || currentOutput.value.image || thumbnail.value || ''
}));

function buildOutputs() {
  outputs.value = taskOutputList(task.value).map((item, index) => ({
    ...item,
    id: item.id as string | number,
    name: String(item.name || `结果${index + 1}`),
    sourceIndex: index,
    type: String(item.type || taskTypeOf(task.value)),
    url: String(item.url || item.video || item.image || item.thumbnail || ''),
    image: String(item.image || (!isOutputVideo(item as OutputItem) ? item.url : '') || ''),
    video: String(item.video || (item.type === 'video' ? item.url : '') || ''),
    thumbnail: String(item.thumbnail || item.image || ''),
    title: String(item.title || taskTitleOf(task.value)),
    subtitle: String(item.subtitle || item.prompt || '')
  }));
  if (selectedOutput.value >= outputs.value.length) selectedOutput.value = 0;
}

function handleMediaChange(event: { detail?: { current?: number } }) {
  const index = Number(event.detail?.current || 0);
  selectedOutput.value = Number.isFinite(index) ? index : 0;
}

function handleVideoFullscreenChange(event: Event) {
  const detail = (event as Event & { detail?: { fullScreen?: boolean } }).detail;
  isVideoFullscreen.value = Boolean(detail?.fullScreen);
}

function onResultImageLoad(output: OutputItem, event: any) {
  const url = mediaUrlOf(output);
  const width = Number(event.detail?.width || 0);
  const height = Number(event.detail?.height || 0);
  if (!url || width <= 0 || height <= 0) return;
  outputImageSizes.value = {
    ...outputImageSizes.value,
    [url]: { width, height }
  };
}

function onResultVideoLoadedMetadata(output: OutputItem, event: any) {
  const url = mediaUrlOf(output);
  const detail = event?.detail || {};
  const width = firstPositiveNumber(detail.width, detail.videoWidth, detail.naturalWidth);
  const height = firstPositiveNumber(detail.height, detail.videoHeight, detail.naturalHeight);
  if (!url || width <= 0 || height <= 0) return;
  outputVideoSizes.value = {
    ...outputVideoSizes.value,
    [url]: { width, height }
  };
}

function openImageViewer(index = selectedOutput.value) {
  const output = displayOutputs.value[index] || currentOutput.value;
  const url = mediaUrlOf(output);
  if (isOutputVideo(output) || !url) return;
  imageViewerSrc.value = url;
  imageViewerVisible.value = true;
}

function startPolling() {
  stopPolling();
  if (!task.value.id || isTaskEnded(task.value)) return;
  pollStartTime.value = Date.now();
  pollTaskId = Number(task.value.id || 0);
  stopTaskPolling = taskPoller.add(pollTaskId, handlePolledTask);
  taskPoller.pollNow().catch(() => undefined);
}

function stopPolling() {
  stopTaskPolling?.();
  stopTaskPolling = null;
  pollTaskId = 0;
}

function refreshTask(startAfter = false) {
  const id = Number(task.value.id || 0);
  if (!id) {
    initialLoading.value = false;
    return;
  }
  taskStore.loadTask(id).then((res) => {
    task.value = { ...resultMeta.value, ...res };
    cacheResultSnapshot(id, task.value);
    buildOutputs();
    initialLoading.value = false;
    if (isTaskEnded(task.value)) stopPolling();
    else if (startAfter) startPolling();
  }).catch(() => {
    initialLoading.value = false;
    if (startAfter) startPolling();
  });
}

function handlePolledTask(res: Record<string, unknown>) {
  task.value = { ...resultMeta.value, ...res };
  cacheResultSnapshot(Number(task.value.id || task.value.taskId || 0), task.value);
  buildOutputs();
  initialLoading.value = false;
  if (isTaskEnded(task.value)) stopPolling();
}

function copyPrompt() {
  const prompt = taskPromptOf(task.value);
  if (!prompt) {
    showToast('暂无提示词可复制');
    return;
  }
  uni.setClipboardData({ data: prompt });
}

function regenerate() {
  const source = task.value.id ? `?sourceId=${encodeURIComponent(String(task.value.id))}` : '';
  const target = isVideo.value ? PAGE_ROUTES.aiVideo : taskTypeOf(task.value) === 'comic' ? PAGE_ROUTES.comic : PAGE_ROUTES.aiImage;
  uni.navigateTo({ url: `${target}${source}` });
}

function viewHistory() {
  uni.reLaunch({ url: PAGE_ROUTES.history });
}

function showToast(title: string) {
  uni.showToast({ title, icon: 'none' });
}

function mediaUrlOf(output: OutputItem) {
  if (isOutputVideo(output)) return output.video || output.url || output.image || output.thumbnail || thumbnail.value;
  return output.image || output.url || output.thumbnail || thumbnail.value;
}

function isOutputVideo(output: OutputItem) {
  const type = String((output as Record<string, unknown>).type || taskTypeOf(task.value)).toLowerCase();
  return Boolean(output.video || type.includes('video') || isVideoUrl(output.url || ''));
}

function isVideoUrl(value: string) {
  return /\.(mp4|mov|m4v|webm|avi)(?:[?#].*)?$/i.test(value);
}

function imageFrameStyle(width: number, height: number, frameWidthRpx: number) {
  const ratio = clampRatio(width / height);
  const frameHeight = Math.round(frameWidthRpx / ratio);
  return `width: ${frameWidthRpx}rpx; height: ${frameHeight}rpx;`;
}

function videoSizeFromOutput(output: OutputItem) {
  const direct = sizeFromRatio(firstText(output.ratio, task.value.ratio, resultMeta.value.ratio));
  if (direct) return direct;
  const aspectRatio = Number(firstText(output.aspectRatio, output.aspect_ratio, task.value.aspectRatio, task.value.aspect_ratio, resultMeta.value.aspectRatio, resultMeta.value.aspect_ratio));
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) return { width: aspectRatio, height: 1 };
  return { width: 16, height: 9 };
}

function sizeFromRatio(value: string) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function clampRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.25, Math.min(value, 4));
}

function resolutionLabelOf(
  taskInfo: Record<string, unknown>,
  meta: Record<string, unknown>,
  output: Record<string, unknown>,
  loadedSize?: { width: number; height: number }
) {
  const direct = firstText(
    output.resolution,
    output.sizeLabel,
    output.size_label,
    taskInfo.resolution,
    taskInfo.sizeLabel,
    taskInfo.size_label,
    meta.resolution,
    meta.sizeLabel,
    meta.size_label
  );
  const normalized = normalizeResolutionText(direct);
  if (normalized) return normalized;
  const width = firstPositiveNumber(
    output.width,
    output.w,
    output.imageWidth,
    output.image_width,
    taskInfo.width,
    taskInfo.w,
    taskInfo.imageWidth,
    taskInfo.image_width,
    meta.width,
    meta.w,
    meta.imageWidth,
    meta.image_width,
    loadedSize?.width
  );
  const height = firstPositiveNumber(
    output.height,
    output.h,
    output.imageHeight,
    output.image_height,
    taskInfo.height,
    taskInfo.h,
    taskInfo.imageHeight,
    taskInfo.image_height,
    meta.height,
    meta.h,
    meta.imageHeight,
    meta.image_height,
    loadedSize?.height
  );
  return width && height ? `${width} x ${height}` : '';
}

function fileSizeLabelOf(taskInfo: Record<string, unknown>, meta: Record<string, unknown>, output: Record<string, unknown>) {
  const direct = firstText(
    output.fileSizeLabel,
    output.file_size_label,
    taskInfo.fileSizeLabel,
    taskInfo.file_size_label,
    meta.fileSizeLabel,
    meta.file_size_label
  );
  if (/^\d+(?:\.\d+)?\s*(?:kb|mb|gb)$/i.test(direct)) return direct.replace(/\s+/g, '').toUpperCase();
  const bytes = firstPositiveNumber(
    output.fileSize,
    output.file_size,
    output.sizeBytes,
    output.size_bytes,
    output.bytes,
    taskInfo.fileSize,
    taskInfo.file_size,
    taskInfo.sizeBytes,
    taskInfo.size_bytes,
    taskInfo.bytes,
    meta.fileSize,
    meta.file_size,
    meta.sizeBytes,
    meta.size_bytes,
    meta.bytes
  );
  return formatBytes(bytes);
}

function normalizeResolutionText(value: string) {
  const match = String(value || '').match(/(\d{2,5})\s*[xX*×]\s*(\d{2,5})/);
  if (!match) return '';
  return `${Number(match[1])} x ${Number(match[2])}`;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value || 0);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return 0;
}

function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${trimNumber(bytes / 1024 / 1024 / 1024)}GB`;
  if (bytes >= 1024 * 1024) return `${trimNumber(bytes / 1024 / 1024)}MB`;
  if (bytes >= 1024) return `${trimNumber(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function trimNumber(value: number) {
  if (value >= 10) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, '');
}

async function downloadCurrentOutput() {
  const url = currentMediaUrl.value;
  if (!url) {
    showToast('暂无可保存内容');
    return;
  }
  const currentIsVideo = isOutputVideo(currentOutput.value);
  if (!currentIsVideo && purchaseEnabled.value && membershipEnabled.value && !userStore.isMember) {
    const choice = await showHdSaveDialog({ isMember: false });
    if (choice !== 'secondary') return;
  }
  let stage: 'confirm' | 'download' | 'album' = 'confirm';
  try {
    await confirmCompliance({ scene: 'export_save', confirmationText: '我确认', taskId: task.value.id });
    stage = 'download';
    const tempFilePath = await downloadFile(url, { loading: '下载中' });
    stage = 'album';
    if (currentIsVideo) {
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
    showToast('发布功能已关闭');
    return;
  }
  const nicknameReady = await ensureShareNickname();
  if (!nicknameReady) return;
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
    ...(outputId ? { outputId } : { outputIndex: output.sourceIndex ?? selectedOutput.value }),
    title: taskTitleOf(task.value),
    prompt: taskPromptOf(task.value),
    coverUrl: output.thumbnail || output.image || thumbnail.value,
    templateType: isOutputVideo(output) ? 'video' : 'image'
  });
  showToast('已提交审核');
}

async function ensureShareNickname() {
  const current = shareNicknameOf();
  if (hasShareNickname(current)) return true;
  shareNicknameInput.value = current && !isDefaultShareNickname(current) ? current : '';
  showProfileNicknameDialog.value = true;
  return new Promise<boolean>((resolve) => {
    pendingShareResolver = resolve;
  });
}

function shareNicknameOf() {
  const user = userStore.user || {};
  return String(user.nickname || user.nickName || '').trim();
}

function hasShareNickname(value: string) {
  const text = String(value || '').trim();
  return Boolean(text) && !isDefaultShareNickname(text);
}

function isDefaultShareNickname(value: string) {
  const text = String(value || '').replace(/^@+/, '').trim().toLowerCase();
  return ['用户', '微信用户', '创意小助手', 'ai用户', 'ai创作用户'].includes(text);
}

function cancelShareNickname() {
  showProfileNicknameDialog.value = false;
  pendingShareResolver?.(false);
  pendingShareResolver = null;
}

async function saveShareNickname() {
  const nickname = shareNicknameInput.value.trim();
  if (!hasShareNickname(nickname)) {
    showToast('请填写昵称');
    return;
  }
  if (savingShareNickname.value) return;
  savingShareNickname.value = true;
  try {
    const user = await updateMe<Record<string, unknown>>({ nickname });
    userStore.profile = {
      ...(userStore.profile || {}),
      user
    };
    showProfileNicknameDialog.value = false;
    pendingShareResolver?.(true);
    pendingShareResolver = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    showToast(message || '昵称保存失败');
  } finally {
    savingShareNickname.value = false;
  }
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
  if (/auth|authorize|scope\.writePhotosAlbum|permission|deny|denied/i.test(message)) return '保存失败，请在设置中允许相册权限';
  if (/file|path|not found|no such|invalid/i.test(message)) return '保存失败，下载文件无效，请重新生成后再试';
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

function readResultSnapshot(id: string) {
  if (!id) return {};
  try {
    const value = uni.getStorageSync(`ai_result_route_snapshot:${id}`);
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function cacheResultSnapshot(id: number, value: Record<string, unknown>) {
  if (!id) return;
  try {
    uni.setStorageSync(`ai_result_route_snapshot:${id}`, value);
  } catch {
    // 快照只是为了减少详情页闪烁，失败不影响任务详情。
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
  padding: 24rpx 28rpx calc(240rpx + env(safe-area-inset-bottom));
  background:
    linear-gradient(180deg, #f7f8ff 0%, #ffffff 54%, #f6fbff 100%);
}

.loading-panel,
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 560rpx;
  margin-bottom: 22rpx;
  padding: 36rpx 30rpx;
  border: 1rpx solid rgba(116, 128, 154, 0.1);
  border-radius: 28rpx;
  background: #fff;
  text-align: center;
  box-shadow: 0 14rpx 32rpx rgba(31, 42, 75, 0.07);
}

.state-art {
  width: 250rpx;
  height: 190rpx;
  margin-bottom: 20rpx;
}

.state-label {
  height: 42rpx;
  margin-bottom: 12rpx;
  padding: 0 18rpx;
  border-radius: 21rpx;
  background: #f1edff;
  color: #7a5cff;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 42rpx;
}

.state-panel.failed .state-label,
.state-panel.cancelled .state-label {
  background: #fff1f3;
  color: #e11d48;
}

.state-title {
  color: #172033;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.25;
}

.state-desc {
  width: 500rpx;
  max-width: 100%;
  margin-top: 12rpx;
  color: #64748b;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.5;
}

.progress-block {
  width: 100%;
  margin-top: 28rpx;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
  color: #273149;
  font-size: 22rpx;
  font-weight: 900;
}

.progress-track {
  overflow: hidden;
  height: 14rpx;
  border-radius: 7rpx;
  background: #edf0f7;
}

.progress-fill {
  height: 100%;
  border-radius: 7rpx;
  background: linear-gradient(90deg, #7a5cff, #ff78b6);
  transition: width 0.3s ease;
}

.wait-hint {
  margin-top: 20rpx;
  padding: 16rpx 22rpx;
  border-radius: 16rpx;
  background: #fff7e7;
  color: #b45309;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.45;
}

.result-preview {
  margin-bottom: 22rpx;
}

.media-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 660rpx;
  margin-right: auto;
  margin-left: auto;
  overflow: hidden;
  border-radius: 22rpx;
  background: #111827;
}

.media-stage.image {
  background: #f2f5fb;
}

.media-stage.empty {
  background: linear-gradient(135deg, #eef2ff, #fff0f7);
}

.media-swiper,
.media-slide {
  width: 100%;
  height: 100%;
}

.main-image,
.main-video {
  width: 100%;
  height: 100%;
}

.preview-empty {
  color: #7a5cff;
  font-size: 28rpx;
  font-weight: 900;
}

.media-count {
  position: absolute;
  right: 18rpx;
  bottom: 18rpx;
  height: 42rpx;
  padding: 0 18rpx;
  border-radius: 21rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #fff;
  font-size: 21rpx;
  font-weight: 900;
  line-height: 42rpx;
}

.result-summary,
.info-card {
  margin-top: 18rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.14);
  border-radius: 18rpx;
  background: #fff;
  box-shadow: 0 16rpx 34rpx rgba(40, 44, 70, 0.06);
}

.summary-title {
  color: #172033;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.3;
}

.summary-meta {
  margin-top: 8rpx;
  color: #7c879e;
  font-size: 23rpx;
  font-weight: 800;
}

.summary-status {
  margin-top: 16rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: #f6f8ff;
  color: #42516a;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.45;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.quick-action {
  height: 58rpx;
  padding: 0 20rpx;
  border-radius: 18rpx;
  background: #fff;
  color: #273149;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 58rpx;
  box-shadow: 0 8rpx 18rpx rgba(31, 42, 75, 0.05);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 18rpx;
}

.card-title {
  color: #172033;
  font-size: 28rpx;
  font-weight: 900;
}

.card-link {
  color: #7a5cff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 1.2;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 56rpx;
  color: #64748b;
  font-size: 23rpx;
  font-weight: 800;
}

.info-row text:last-child {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #172033;
  font-weight: 900;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-box {
  margin-top: 18rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: #f6f8ff;
  color: #34435c;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.55;
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 18rpx;
}

.frame-item {
  position: relative;
  overflow: hidden;
  height: 210rpx;
  border-radius: 18rpx;
  background: #f6f8ff;
}

.frame-image {
  width: 100%;
  height: 100%;
}

.frame-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #91a3ad;
  font-size: 24rpx;
  font-weight: 900;
}

.frame-label {
  position: absolute;
  left: 12rpx;
  bottom: 12rpx;
  height: 36rpx;
  padding: 0 14rpx;
  border-radius: 18rpx;
  background: rgba(15, 23, 42, 0.66);
  color: #fff;
  font-size: 20rpx;
  font-weight: 900;
  line-height: 36rpx;
}

.bottom-actions {
  position: fixed;
  right: 28rpx;
  bottom: calc(22rpx + env(safe-area-inset-bottom));
  left: 28rpx;
  z-index: 40;
}

.two-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.secondary-btn,
.primary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 86rpx;
  border-radius: 22rpx;
  font-size: 27rpx;
  font-weight: 900;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.96);
  color: #273149;
  box-shadow: 0 12rpx 28rpx rgba(31, 42, 75, 0.1);
}

.primary-btn {
  background: linear-gradient(90deg, #7a5cff, #bd63ff);
  color: #fff;
  box-shadow: 0 18rpx 34rpx rgba(122, 92, 255, 0.24);
}

.profile-nickname-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  background: rgba(15, 23, 42, 0.58);
}

.profile-nickname-dialog {
  width: 620rpx;
  max-width: 100%;
  padding: 34rpx 30rpx 30rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 28rpx 80rpx rgba(15, 23, 42, 0.22);
}

.profile-nickname-title {
  color: #172033;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.25;
}

.profile-nickname-copy {
  margin-top: 10rpx;
  color: #64748b;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.5;
}

.profile-nickname-input {
  height: 82rpx;
  margin-top: 24rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(122, 92, 255, 0.22);
  border-radius: 18rpx;
  background: #f8f9ff;
  color: #172033;
  font-size: 27rpx;
  font-weight: 800;
}

.profile-nickname-placeholder {
  color: #9aa3b5;
}

.profile-nickname-actions {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 16rpx;
  margin-top: 26rpx;
}

.profile-nickname-secondary,
.profile-nickname-primary {
  height: 78rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 78rpx;
}

.profile-nickname-secondary {
  background: #f2f5fb;
  color: #475569;
}

.profile-nickname-primary {
  background: linear-gradient(90deg, #7a5cff, #bd63ff);
  color: #fff;
}
</style>
