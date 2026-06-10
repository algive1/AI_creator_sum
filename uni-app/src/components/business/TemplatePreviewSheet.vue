<template>
  <view v-if="template" class="sheet-layer">
    <view class="sheet-mask" @tap="$emit('close')"></view>
    <view class="template-sheet">
      <view class="sheet-handle"></view>
      <button class="sheet-close" @tap="$emit('close')">×</button>

      <view class="template-title">{{ template.title }}</view>
      <view class="template-tags">
        <text v-for="tag in template.tags" :key="tag" class="template-tag">{{ tag }}</text>
      </view>

      <view class="prompt-box">提示词：{{ template.prompt }}</view>

      <view class="preview-frame" :class="{ 'preview-frame-video': template.mediaType === 'video' }">
        <video
          v-if="videoPreviewUrl"
          class="preview-media preview-media-video video-media"
          :src="videoPreviewUrl"
          :poster="template.coverUrl"
          controls
          object-fit="contain"
          @error="onVideoError"
        />
        <image v-else-if="template.coverUrl" class="preview-media" :src="template.coverUrl" mode="aspectFill" />
        <view v-else class="preview-media empty-preview">AI</view>
        <view v-if="template.mediaType === 'video' && !videoPreviewUrl" class="video-play">
          <view class="play-triangle"></view>
        </view>
        <view v-if="template.mediaType === 'video' && !videoPreviewUrl" class="video-unavailable">暂无视频预览</view>
      </view>

      <view class="sheet-actions">
        <button class="save-btn" @tap="saveMedia">{{ template.mediaType === 'video' ? '保存视频' : '保存图片' }}</button>
        <button class="use-btn" @tap="$emit('use', template)">使用提示词生成同款</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CreativeTemplate } from '@/utils/mock';
import { showMemberRequiredDialog } from '@/utils/app-dialog';

const props = defineProps<{
  template: CreativeTemplate | null;
}>();

defineEmits<{
  close: [];
  use: [template: CreativeTemplate];
}>();

const videoPreviewUrl = computed(() => {
  const template = props.template;
  if (!template || template.mediaType !== 'video') return '';
  const mediaUrl = String(template.mediaUrl || '').trim();
  const coverUrl = String(template.coverUrl || '').trim();
  return mediaUrl && mediaUrl !== coverUrl ? mediaUrl : '';
});

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
  if (template.mediaType === 'video') {
    const videoUrl = videoPreviewUrl.value;
    if (!videoUrl) {
      uni.showToast({ title: '视频素材待接入', icon: 'none' });
      return;
    }
    uni.downloadFile({
      url: videoUrl,
      success: (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          uni.showToast({ title: '视频下载失败', icon: 'none' });
          return;
        }
        uni.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
          fail: (error) => uni.showToast({ title: albumSaveErrorText(error), icon: 'none' })
        });
      },
      fail: () => uni.showToast({ title: '视频下载失败，请检查域名配置', icon: 'none' })
    });
    return;
  }

  uni.getImageInfo({
    src: template.mediaUrl || template.coverUrl,
    success: (res) => saveImage(res.path),
    fail: () => uni.showToast({ title: '图片加载失败，请检查图片地址', icon: 'none' })
  });
}

function saveImage(filePath: string) {
  uni.saveImageToPhotosAlbum({
    filePath,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
    fail: (error) => uni.showToast({ title: albumSaveErrorText(error), icon: 'none' })
  });
}

function onVideoError() {
  uni.showToast({ title: '视频无法播放，请检查视频域名或格式', icon: 'none' });
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

.preview-frame {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-height: 58vh;
  margin-top: 24rpx;
  border-radius: 18rpx;
  background: #eef2f8;
}

.preview-media {
  display: block;
  width: 100%;
  height: 640rpx;
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
  height: 430rpx;
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

.save-btn,
.use-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 44rpx;
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
</style>
