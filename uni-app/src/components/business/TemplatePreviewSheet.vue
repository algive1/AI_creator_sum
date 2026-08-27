<template>
  <view v-if="template" class="sheet-root">
    <view class="sheet-layer">
      <view class="sheet-mask" @tap="$emit('close')"></view>
      <view class="template-sheet">
        <view class="sheet-handle"></view>
        <button class="sheet-close" @tap="$emit('close')">×</button>

        <view class="template-title">{{ template.title }}</view>
        <view class="template-tags">
          <text v-for="tag in template.tags" :key="tag" class="template-tag">{{ tag }}</text>
        </view>

        <view class="prompt-box" :class="{ expanded: promptExpanded }" @tap="togglePromptExpanded">
          <view class="prompt-content">提示词：{{ template.prompt }}</view>
          <view v-if="promptExpandable" class="prompt-toggle">{{ promptExpanded ? '收起' : '展开' }}</view>
        </view>

        <view
          class="preview-frame"
          :class="{ 'preview-frame-video': isPreviewVideo, 'preview-frame-image': isPreviewImage }"
          :style="previewFrameStyle"
        >
          <video
            v-if="videoPreviewUrl"
            class="preview-media preview-media-video video-media"
            :src="videoPreviewUrl"
            :poster="template.coverUrl"
            controls
            object-fit="contain"
            style="width: 100%; height: 100%;"
            @loadedmetadata="onPreviewVideoLoadedMetadata"
            @error="onVideoError"
          />
          <image
            v-else-if="template.coverUrl"
            class="preview-media preview-media-image"
            :src="template.coverUrl"
            mode="aspectFit"
            :show-menu-by-longpress="false"
            @load="onPreviewImageLoad"
            @tap.stop="openImageViewer"
          />
          <view v-else class="preview-media empty-preview">AI</view>
          <view v-if="isPreviewVideo && !videoPreviewUrl" class="video-play">
            <view class="play-triangle"></view>
          </view>
          <view v-if="isPreviewVideo && !videoPreviewUrl" class="video-unavailable">暂无视频预览</view>
        </view>

        <view class="sheet-actions" :class="{ 'sheet-actions-favorite': favoriteAvailable }">
          <button class="save-btn" @tap="saveMedia">{{ isPreviewVideo ? '保存视频' : '保存图片' }}</button>
          <button
            v-if="favoriteAvailable"
            class="favorite-btn"
            :class="{ active: template.isFavorited }"
            hover-class="none"
            aria-label="收藏模板"
            @tap="$emit('favorite', template)"
          >
            <image
              :src="template.isFavorited ? '/static/icons/icon_favorite_filled.svg' : '/static/icons/icon_favorite_line.svg'"
              mode="aspectFit"
            />
          </button>
          <button class="use-btn" @tap="$emit('use', template)">使用提示词生成同款</button>
        </view>
      </view>
    </view>
    <ProtectedImageViewer
      :visible="imageViewerVisible"
      :src="imagePreviewUrl"
      :title="template.title"
      @close="imageViewerVisible = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import ProtectedImageViewer from '@/components/business/ProtectedImageViewer.vue';
import type { CreativeTemplate } from '@/utils/mock';
import { downloadFile as downloadRemoteFile } from '@/api/request';
import { showMemberRequiredDialog } from '@/utils/app-dialog';
import { enableSensitiveCaptureProtection } from '@/utils/capture-protection';
import { isOwnDownloadableMediaUrl, type MediaDownloadConfig } from '@/utils/media-url';
import { useConfigStore } from '@/stores/config';

const props = defineProps<{
  template: CreativeTemplate | null;
}>();
const configStore = useConfigStore();

defineEmits<{
  close: [];
  use: [template: CreativeTemplate];
  favorite: [template: CreativeTemplate];
}>();

const videoPreviewUrl = computed(() => {
  const template = props.template;
  if (!template || !isPreviewVideo.value) return '';
  const mediaUrl = String(template.mediaUrl || '').trim();
  const coverUrl = String(template.coverUrl || '').trim();
  return mediaUrl && mediaUrl !== coverUrl ? mediaUrl : '';
});
const isPreviewVideo = computed(() => props.template?.mediaType === 'video');
const isPreviewImage = computed(() => props.template?.mediaType === 'image');
const favoriteAvailable = computed(() => {
  const template = props.template;
  return Boolean(template && (typeof template.isFavorited === 'boolean' || typeof template.favoriteCount === 'number'));
});
const promptExpanded = ref(false);
const promptExpandable = computed(() => String(props.template?.prompt || '').length > 88);

const imageViewerVisible = ref(false);
const imagePreviewSize = ref({ width: 0, height: 0 });
const videoPreviewSize = ref({ width: 16, height: 9 });
const imagePreviewUrl = computed(() => {
  const template = props.template;
  if (!template || !isPreviewImage.value) return '';
  return String(template.mediaUrl || template.coverUrl || '').trim();
});
const imagePreviewFrameStyle = computed(() => {
  if (!imagePreviewSize.value.width || !imagePreviewSize.value.height) return '';
  return imageFrameStyle(imagePreviewSize.value.width, imagePreviewSize.value.height, 694);
});
const videoPreviewFrameStyle = computed(() => {
  return imageFrameStyle(videoPreviewSize.value.width, videoPreviewSize.value.height, 694);
});
const previewFrameStyle = computed(() => {
  if (isPreviewVideo.value) return videoPreviewFrameStyle.value;
  if (isPreviewImage.value) return imagePreviewFrameStyle.value;
  return '';
});
const mediaDownloadConfig = computed(() => {
  return (configStore.publicConfig?.mediaDownload || {}) as MediaDownloadConfig;
});

let stopCaptureProtection: (() => void) | null = null;

watch(
  () => Boolean(props.template),
  (active) => {
    if (active) {
      promptExpanded.value = false;
      startCaptureProtection();
      return;
    }
    imageViewerVisible.value = false;
    stopCaptureProtection?.();
    stopCaptureProtection = null;
  },
  { immediate: true }
);

watch(
  imagePreviewUrl,
  (url) => {
    imagePreviewSize.value = { width: 0, height: 0 };
    if (url) loadPreviewImageInfo(url);
  },
  { immediate: true }
);

watch(
  () => [videoPreviewUrl.value, props.template?.ratio, props.template?.aspectRatio],
  () => {
    videoPreviewSize.value = videoSizeFromTemplate(props.template);
  },
  { immediate: true }
);

onUnmounted(() => {
  stopCaptureProtection?.();
  stopCaptureProtection = null;
});

function startCaptureProtection() {
  if (stopCaptureProtection) return;
  stopCaptureProtection = enableSensitiveCaptureProtection();
}

function openImageViewer() {
  if (!imagePreviewUrl.value) return;
  imageViewerVisible.value = true;
}

function loadPreviewImageInfo(src: string) {
  uni.getImageInfo({
    src,
    success: (info) => updateImagePreviewSize(info.width, info.height),
    fail: () => undefined
  });
}

function onPreviewImageLoad(event: any) {
  updateImagePreviewSize(event.detail?.width, event.detail?.height);
}

function onPreviewVideoLoadedMetadata(event: any) {
  const detail = event?.detail || {};
  updateVideoPreviewSize(
    firstPositiveNumber(detail.width, detail.videoWidth, detail.naturalWidth),
    firstPositiveNumber(detail.height, detail.videoHeight, detail.naturalHeight)
  );
}

function updateImagePreviewSize(width?: number, height?: number) {
  const nextWidth = Number(width || 0);
  const nextHeight = Number(height || 0);
  if (nextWidth > 0 && nextHeight > 0) {
    imagePreviewSize.value = { width: nextWidth, height: nextHeight };
  }
}

function updateVideoPreviewSize(width?: number, height?: number) {
  const nextWidth = Number(width || 0);
  const nextHeight = Number(height || 0);
  if (nextWidth > 0 && nextHeight > 0) {
    videoPreviewSize.value = { width: nextWidth, height: nextHeight };
  }
}

function videoSizeFromTemplate(template: CreativeTemplate | null) {
  const ratioSize = sizeFromRatio(String(template?.ratio || ''));
  if (ratioSize) return ratioSize;
  const aspectRatio = Number(template?.aspectRatio || 0);
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return { width: aspectRatio, height: 1 };
  }
  return { width: 16, height: 9 };
}

function sizeFromRatio(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function firstPositiveNumber(...values: unknown[]) {
  return values.map((value) => Number(value || 0)).find((value) => value > 0) || 0;
}

function imageFrameStyle(width: number, height: number, frameWidthRpx: number) {
  const ratio = clampRatio(width / height);
  const frameHeight = Math.round(frameWidthRpx / ratio);
  return `width: ${frameWidthRpx}rpx; height: ${frameHeight}rpx;`;
}

function clampRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.25, Math.min(value, 4));
}

function togglePromptExpanded() {
  if (!promptExpandable.value) return;
  promptExpanded.value = !promptExpanded.value;
}

function saveMedia() {
  const template = props.template;
  if (!template) return;
  if (template.canSave === false || template.canUse === false) {
    showMemberRequiredDialog({
      title: '开通会员保存模板素材',
      message: template.lockReason || '该模板需开通会员后保存。'
    });
    return;
  }
  if (isPreviewVideo.value) {
    const videoUrl = videoPreviewUrl.value;
    if (!videoUrl) {
      uni.showToast({ title: '视频素材待接入', icon: 'none' });
      return;
    }
    if (!isOwnDownloadableMediaUrl(videoUrl, mediaDownloadConfig.value)) {
      showExternalSeedMediaNotice();
      return;
    }
    downloadRemoteFile(videoUrl, { loading: '下载中' })
      .then((filePath) => saveVideo(filePath))
      .catch(() => undefined);
    return;
  }

  const imageUrl = imagePreviewUrl.value;
  if (!imageUrl) {
    uni.showToast({ title: '暂无可保存图片', icon: 'none' });
    return;
  }
  if (!isOwnDownloadableMediaUrl(imageUrl, mediaDownloadConfig.value)) {
    showExternalSeedMediaNotice();
    return;
  }
  if (/^(wxfile|file):\/\//i.test(imageUrl)) {
    saveImage(imageUrl);
    return;
  }
  downloadRemoteFile(imageUrl, { loading: '下载中' })
    .then((filePath) => saveImage(filePath))
    .catch(() => undefined);
}

function saveImage(filePath: string) {
  uni.saveImageToPhotosAlbum({
    filePath,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
    fail: (error) => uni.showToast({ title: albumSaveErrorText(error), icon: 'none' })
  });
}

function saveVideo(filePath: string) {
  uni.saveVideoToPhotosAlbum({
    filePath,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
    fail: (error) => uni.showToast({ title: albumSaveErrorText(error), icon: 'none' })
  });
}

function onVideoError() {
  uni.showToast({ title: '视频无法播放，请检查视频域名或格式', icon: 'none' });
}

function showExternalSeedMediaNotice() {
  uni.showModal({
    title: '暂不支持保存',
    content: '外部示例素材仅供灵感参考，请使用提示词生成同款后保存。',
    showCancel: false,
    confirmText: '知道了'
  });
}

function albumSaveErrorText(error: unknown) {
  const message = String((error as { errMsg?: string; message?: string })?.errMsg || (error as { message?: string })?.message || '');
  if (/auth|authorize|scope\.writePhotosAlbum|permission|deny|denied/i.test(message)) {
    return '保存失败，请在设置中允许相册权限';
  }
  if (/file|path|not found|no such|invalid/i.test(message)) {
    return '保存失败，文件无效，请重新打开后再试';
  }
  return '保存失败，请稍后重试';
}
</script>

<style scoped lang="scss">
.sheet-root {
  position: relative;
  z-index: 200;
}

.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.sheet-mask {
  position: absolute;
  inset: 0;
  background: rgba(14, 20, 36, 0.42);
}

.template-sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  max-height: 88vh;
  overflow-y: auto;
  padding: 22rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  border-radius: 28rpx 28rpx 0 0;
  background: #ffffff;
  box-shadow: 0 -18rpx 48rpx rgba(25, 33, 56, 0.18);
}

.sheet-handle {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 24rpx;
  border-radius: 4rpx;
  background: #d8deea;
}

.sheet-close {
  position: absolute;
  top: 58rpx;
  right: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62rpx;
  height: 62rpx;
  border-radius: 31rpx;
  background: #f2f5fb;
  color: #9aa3b5;
  font-size: 42rpx;
  font-weight: 300;
  line-height: 62rpx;
}

.template-title {
  width: calc(100% - 78rpx);
  color: #1f2433;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.25;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
}

.template-tag {
  height: 34rpx;
  padding: 0 12rpx;
  border-radius: 10rpx;
  background: rgba(112, 91, 255, 0.12);
  color: #705bff;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 34rpx;
}

.prompt-box {
  margin-top: 28rpx;
  padding: 24rpx 26rpx;
  border-radius: 14rpx;
  background: #f5f7fb;
  color: #6e7585;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1.5;
}

.prompt-content {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.prompt-box.expanded .prompt-content {
  display: block;
  overflow: visible;
  text-overflow: clip;
  -webkit-line-clamp: unset;
}

.prompt-toggle {
  margin-top: 12rpx;
  color: #735cff;
  font-size: 24rpx;
  font-weight: 900;
}

.preview-frame {
  position: relative;
  overflow: hidden;
  width: 100%;
  margin-top: 24rpx;
  margin-right: auto;
  margin-left: auto;
  border-radius: 18rpx;
  background: #101729;
}

.preview-frame-image {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f5fb;
}

.preview-frame-video {
  background: #101729;
}

.preview-media {
  display: block;
  width: 100%;
  height: 100%;
}

.preview-media-image {
  height: 100%;
}

.empty-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #705bff, #ff7acb);
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 900;
}

.preview-media-video {
  height: 100%;
}

.video-play {
  position: absolute;
  top: 44%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: rgba(16, 23, 42, 0.46);
  transform: translate(-50%, -50%);
}

.play-triangle {
  width: 0;
  height: 0;
  margin-left: 7rpx;
  border-top: 18rpx solid transparent;
  border-bottom: 18rpx solid transparent;
  border-left: 28rpx solid #ffffff;
}

.video-media {
  background: #101729;
}

.video-unavailable {
  position: absolute;
  right: 20rpx;
  bottom: 18rpx;
  left: 20rpx;
  min-height: 48rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  background: rgba(16, 23, 42, 0.58);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 48rpx;
  text-align: center;
}

.sheet-actions {
  display: grid;
  grid-template-columns: 0.78fr 1.22fr;
  gap: 18rpx;
  margin-top: 24rpx;
}

.sheet-actions-favorite {
  grid-template-columns: minmax(0, 0.78fr) 88rpx minmax(0, 1.22fr);
  gap: 14rpx;
}

.save-btn,
.use-btn,
.favorite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 44rpx;
}

.save-btn,
.use-btn {
  font-size: 28rpx;
  font-weight: 900;
}

.save-btn {
  border: 2rpx solid #735cff;
  background: #ffffff;
  color: #735cff;
}

.use-btn {
  background: linear-gradient(135deg, #6f63ff, #9a5cff);
  color: #ffffff;
  box-shadow: 0 16rpx 30rpx rgba(112, 91, 255, 0.24);
}

.favorite-btn {
  width: 88rpx;
  padding: 0;
  border: 2rpx solid rgba(124, 91, 255, 0.18);
  background: #f7f2ff;
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.74);
}

.favorite-btn.active {
  border-color: rgba(139, 92, 255, 0.32);
  background: #efe8ff;
}

.favorite-btn image {
  width: 38rpx;
  height: 38rpx;
}
</style>
