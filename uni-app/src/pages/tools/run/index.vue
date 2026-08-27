<template>
  <view class="flow-page create-flow-page tool-run-page">
    <AppTopbar class="app-nav-root" :title="activeTool?.title || '工具'" back transparent />

    <view class="content">
      <view v-if="!toolsEnabled" class="empty-panel">
        <view class="empty-title">工具功能维护中</view>
        <view class="empty-text">后台关闭了工具箱入口，请稍后再试。</view>
        <button class="empty-action" @tap="backToTools">返回工具页</button>
      </view>

      <template v-else-if="activeTool">
        <view v-if="shouldShowRunHead" class="run-head">
          <view class="run-copy">
            <view class="run-desc">{{ activeTool.description }}</view>
          </view>
          <view class="quota-pill">{{ usageLabel }}</view>
        </view>

        <view v-if="isPhoneFrameTool" class="phone-frame-editor">
          <view class="phone-stage-card">
            <view class="phone-shell">
              <view class="phone-dynamic-island"></view>
              <view class="phone-screen" @tap="chooseSource(0)">
                <image v-if="sourceImages[0]?.path" class="phone-screen-image" :src="sourceImages[0]?.path" mode="aspectFill" />
                <view v-else class="phone-screen-empty">
                  <view class="upload-line-icon phone-upload-icon">
                    <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
                    <text class="upload-line-plus">+</text>
                  </view>
                  <view class="phone-empty-title">点击上传截图</view>
                  <view class="phone-empty-desc">iPhone 17 Pro Max 正面屏幕预览</view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-else-if="requiresTwoImages" class="card frame-upload-card compare-upload-card">
          <view class="upload-head">
            <view class="section-title">上传图片</view>
            <view class="upload-count">已上传 {{ uploadedCount }}/2</view>
          </view>
          <view class="frame-upload-grid">
            <view
              v-for="slot in uploadSlots"
              :key="slot.index"
              class="frame-upload-slot"
              :class="{ filled: Boolean(sourceImages[slot.index]?.path) }"
              @tap="chooseSource(slot.index)"
            >
              <block v-if="sourceImages[slot.index]?.path">
                <image class="frame-upload-image" :src="sourceImages[slot.index]?.path" mode="aspectFill" />
                <view class="frame-replace-mask">
                  <text class="frame-replace-icon">↻</text>
                  <text>替换</text>
                </view>
                <view class="frame-delete" @tap.stop="removeSource(slot.index)">×</view>
                <view class="frame-label">{{ slot.title }}</view>
              </block>
              <block v-else>
                <view class="upload-line-icon frame-empty-icon">
                  <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
                  <text class="upload-line-plus">+</text>
                </view>
                <view class="frame-empty-title">{{ slot.title }}</view>
                <view class="frame-empty-desc">{{ slot.desc }}</view>
              </block>
            </view>
          </view>
        </view>

        <view v-else class="card video-source-card tool-upload-card">
          <view class="upload-head">
            <view class="section-title">{{ singleUploadTitle }}</view>
            <view class="video-source-status">
              <view v-if="sourceImages[0]?.path" class="video-source-actions">
                <view class="video-source-action" @tap.stop="chooseSource(0)">替换</view>
                <view class="video-source-action danger" @tap.stop="removeSource(0)">删除</view>
              </view>
              <view v-else class="upload-count">已上传 0/1</view>
            </view>
          </view>
          <view class="video-source-area image-source-area" :class="{ filled: Boolean(sourceImages[0]?.path) }" @tap="chooseSource(0)">
            <image v-if="sourceImages[0]?.path" class="image-source-preview" :src="sourceImages[0]?.path" mode="aspectFill" />
            <block v-else>
              <view class="upload-line-icon video-empty-icon">
                <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
                <text class="upload-line-plus">+</text>
              </view>
              <view class="video-empty-title">{{ singleUploadTitle }}</view>
              <view class="video-empty-desc">{{ uploadDesc(activeTool.key) }}</view>
            </block>
          </view>
        </view>

        <view v-if="hasParams" class="card tool-param-card">
          <view class="section-title">参数设置</view>

          <view v-if="activeTool.key === 'prompt_reverse'" class="param-block">
            <view class="param-block-head">
              <text class="param-block-title">主体描述</text>
              <text class="param-block-tip">可选</text>
            </view>
            <input v-model="params.scene" class="field-input" maxlength="40" placeholder="例如：赛博风少女、产品海报、室内空间" />
          </view>

          <view v-if="activeTool.key === 'image_compress'" class="param-block">
            <view class="param-block-head">
              <text class="param-block-title">压缩质量</text>
              <text class="param-block-tip">{{ params.quality }}</text>
            </view>
            <slider :value="Number(params.quality)" min="30" max="95" activeColor="#7a5cff" @change="setParamNumber('quality', $event.detail.value)" />
            <view class="param-option-grid quality-preset-grid">
              <button v-for="item in qualityPresets" :key="item.value" class="param-option" :class="{ active: Number(params.quality) === item.value }" @tap="params.quality = item.value">
                <text class="param-option-title">{{ item.label }}</text>
                <text class="param-option-desc">{{ item.desc }}</text>
              </button>
            </view>
          </view>

          <view v-if="activeTool.key === 'watermark'" class="param-block">
            <view class="param-block-head">
              <text class="param-block-title">水印文字</text>
              <text class="param-block-tip">{{ String(params.text).length }}/40</text>
            </view>
            <input v-model="params.text" class="field-input" maxlength="40" placeholder="输入水印文字" />
            <view class="param-block-head opacity-head">
              <text class="param-block-title">透明度</text>
              <text class="param-block-tip">{{ Math.round(Number(params.opacity) * 100) }}%</text>
            </view>
            <slider :value="Number(params.opacity) * 100" min="15" max="95" activeColor="#7a5cff" @change="setOpacity($event.detail.value)" />
          </view>

          <view v-if="activeTool.key === 'compare'" class="param-block">
            <view class="param-block-head">
              <text class="param-block-title">输出比例</text>
              <text class="param-block-tip">{{ params.width }} x {{ params.height }}</text>
            </view>
            <view class="param-option-grid">
              <button v-for="item in comparePresets" :key="item.key" class="param-option" :class="{ active: comparePreset === item.key }" @tap="applyComparePreset(item)">
                <text class="param-option-title">{{ item.label }}</text>
                <text class="param-option-desc">{{ item.desc }}</text>
              </button>
            </view>
          </view>

          <view v-if="activeTool.key === 'resize'" class="param-block">
            <view class="resize-meta">
              <view class="resize-meta-item">
                <text>原始宽度</text>
                <text class="resize-meta-value">{{ sourceImages[0]?.width || '--' }} px</text>
              </view>
              <view class="resize-meta-item">
                <text>原始高度</text>
                <text class="resize-meta-value">{{ sourceImages[0]?.height || '--' }} px</text>
              </view>
            </view>

            <view class="param-block-head">
              <text class="param-block-title">预设尺寸</text>
              <text class="param-block-tip">{{ resizeSummary }}</text>
            </view>
            <view class="param-option-grid resize-preset-grid">
              <button v-for="preset in resizePresets" :key="preset.key" class="param-option" :class="{ active: resizePreset === preset.key }" @tap="applyResizePreset(preset)">
                <text class="param-option-title">{{ preset.label }}</text>
                <text class="param-option-desc">{{ preset.desc || '常用尺寸' }}</text>
              </button>
            </view>

            <view class="size-row">
              <view class="field">
                <view class="field-label">宽度 W</view>
                <input :value="params.width" class="field-input" type="number" @input="onResizeDimensionInput('width', inputValue($event))" />
              </view>
              <view class="field">
                <view class="field-label">高度 H</view>
                <input :value="params.height" class="field-input" type="number" @input="onResizeDimensionInput('height', inputValue($event))" />
              </view>
            </view>

            <button class="ratio-lock" :class="{ active: lockResizeRatio }" @tap="lockResizeRatio = !lockResizeRatio">
              <image class="lock-icon-image" :src="`${TOOL_ICON_BASE}/${lockResizeRatio ? 'tool-lock.svg' : 'tool-unlock.svg'}`" mode="aspectFit" />
              <text>{{ lockResizeRatio ? '已锁定宽高比' : '自由输入宽高' }}</text>
            </button>

            <view class="param-block-head fit-head">
              <text class="param-block-title">填充方式</text>
              <text class="param-block-tip">{{ selectedFitLabel }}</text>
            </view>
            <view class="param-option-grid">
              <button v-for="item in resizeFitOptions" :key="item.key" class="param-option" :class="{ active: params.fit === item.key }" @tap="params.fit = item.key">
                <text class="param-option-title">{{ item.label }}</text>
                <text class="param-option-desc">{{ item.desc }}</text>
              </button>
            </view>
          </view>

          <view v-if="activeTool.key === 'cutout'" class="param-block">
            <view class="param-block-head">
              <text class="param-block-title">背景处理</text>
              <text class="param-block-tip">{{ selectedCutoutBgLabel }}</text>
            </view>
            <view class="param-option-grid">
              <button v-for="item in cutoutBackgrounds" :key="item.key" class="param-option" :class="{ active: params.background === item.key }" @tap="params.background = item.key">
                <text class="param-option-title">{{ item.label }}</text>
                <text class="param-option-desc">{{ item.desc }}</text>
              </button>
            </view>
            <view class="param-block-head tolerance-head">
              <text class="param-block-title">抠图容差</text>
              <text class="param-block-tip">{{ params.tolerance }}</text>
            </view>
            <slider :value="Number(params.tolerance)" min="12" max="96" activeColor="#7a5cff" @change="setParamNumber('tolerance', $event.detail.value)" />
          </view>
        </view>

        <view v-if="promptResult" class="card prompt-result-card">
          <view class="result-head">
            <view class="section-title">生成提示词</view>
            <button class="copy-button" @tap="copyPrompt">复制提示词</button>
          </view>
          <textarea class="prompt-result-textarea" :value="promptResult" disabled auto-height maxlength="-1" />
          <button class="use-prompt-button" @tap="usePromptForImage">去生图使用</button>
        </view>

        <view v-if="outputs.length" class="card result-card">
          <view class="result-head">
            <view class="section-title">处理结果</view>
            <button v-if="outputs.length === 1" class="copy-button" @tap="saveOutput(outputs[0].url)">保存到手机</button>
          </view>
          <view class="output-grid" :class="{ grid9: activeTool.key === 'grid_cut' }">
            <view v-for="item in outputs" :key="item.fileNo" class="output-card">
              <image class="output-image" :src="item.url" mode="aspectFill" />
              <view class="output-meta">{{ item.width }} x {{ item.height }}</view>
              <button v-if="outputs.length > 1" class="save-button" @tap="saveOutput(item.url)">保存</button>
            </view>
          </view>
        </view>

        <view v-if="bannerAdUnitId" class="tool-banner-ad">
          <ad :unit-id="bannerAdUnitId" />
        </view>

        <GenerationActions
          :title="processButtonText"
          loading-title="处理中..."
          :loading="processing"
          :disabled="processing || !canSubmit"
          @generate="submitTool"
        />
      </template>

      <view v-else class="empty-panel">
        <view class="empty-title">工具不可用</view>
        <view class="empty-text">该工具已被移出工具箱或暂无可用工具，请返回工具页查看最新入口。</view>
        <button class="empty-action" @tap="backToTools">返回工具页</button>
      </view>
    </view>
    <AppDialogHost />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import GenerationActions from '@/components/legacy/GenerationActions.vue';
import { downloadFile, uploadAsset } from '@/api/upload';
import {
  claimToolAdUnlock,
  createToolAdSession,
  getToolsConfig,
  processTool,
  type ToolItem,
  type ToolKey,
  type ToolOutput
} from '@/api/tools';
import { RequestError } from '@/api/request';
import { useAuthStore } from '@/stores/auth';
import { PAGE_ROUTES } from '@/utils/constants';
import { createShareMessage, createShareTimeline, enableShareMenu, withQuery } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';

type SourceImage = { path: string; fileId: number; width?: number; height?: number };
type ResizePreset = {
  key: string;
  label: string;
  desc?: string;
  width?: number;
  height?: number;
};
type UploadSlot = {
  index: number;
  title: string;
  desc: string;
};
type OptionItem = {
  key: string;
  label: string;
  desc: string;
  width?: number;
  height?: number;
};

const auth = useAuthStore();
const TOOL_ICON_BASE = '/static/icons/tools';
const resizePresets: ResizePreset[] = [
  { key: 'original', label: '原始', desc: '跟随原图' },
  { key: '1_1', label: '1:1', desc: '头像/方图', width: 1080, height: 1080 },
  { key: '16_9', label: '16:9', desc: '横版封面', width: 1920, height: 1080 },
  { key: '4_3', label: '4:3', desc: '常规横图', width: 1600, height: 1200 },
  { key: '3_4', label: '3:4', desc: '小红书竖图', width: 1200, height: 1600 },
  { key: '9_16', label: '9:16', desc: '竖屏故事', width: 1080, height: 1920 }
];
const comparePresets: OptionItem[] = [
  { key: 'square', label: '方图', desc: '1200 x 1200', width: 1200, height: 1200 },
  { key: 'landscape', label: '横版', desc: '1600 x 900', width: 1600, height: 900 },
  { key: 'portrait', label: '竖版', desc: '1080 x 1440', width: 1080, height: 1440 }
];
const resizeFitOptions: OptionItem[] = [
  { key: 'cover', label: '裁剪填充', desc: '铺满画面' },
  { key: 'contain', label: '留白填充', desc: '保留完整' },
  { key: 'fill', label: '拉伸适配', desc: '强制尺寸' }
];
const cutoutBackgrounds: OptionItem[] = [
  { key: 'transparent', label: '透明', desc: 'PNG 背景' },
  { key: 'white', label: '白底', desc: '商品图' },
  { key: 'soft', label: '浅灰', desc: '预览背景' }
];
const qualityPresets = [
  { label: '清晰', desc: '质量 85', value: 85 },
  { label: '均衡', desc: '质量 75', value: 75 },
  { label: '小体积', desc: '质量 55', value: 55 }
];
const toolsEnabled = ref(true);
const tools = ref<ToolItem[]>([]);
const usage = ref<Record<string, { usedToday: number; freeQuota: number; remainingFree: number; unlocked: boolean }>>({});
const adUnitId = ref('');
const bannerAdUnitId = ref('');
const activeKey = ref<ToolKey>('prompt_reverse');
const sourceImages = ref<Array<SourceImage | undefined>>([]);
const outputs = ref<ToolOutput[]>([]);
const promptResult = ref('');
const processing = ref(false);
const resizePreset = ref('original');
const comparePreset = ref('landscape');
const lockResizeRatio = ref(true);
const params = reactive<Record<string, string | number>>({
  scene: '',
  quality: 75,
  text: 'AI艺术生成工坊',
  opacity: 0.36,
  width: 1200,
  height: 900,
  tolerance: 38,
  fit: 'cover',
  background: 'transparent'
});

const activeTool = computed(() => tools.value.find(item => item.key === activeKey.value) || null);
const activeUsage = computed(() => usage.value[activeTool.value?.key || ''] || { usedToday: 0, freeQuota: 0, remainingFree: 0, unlocked: false });
const isPhoneFrameTool = computed(() => activeTool.value?.key === 'phone_frame');
const requiresTwoImages = computed(() => activeTool.value?.key === 'compare');
const uploadedCount = computed(() => sourceImages.value.filter(Boolean).length);
const shouldShowRunHead = computed(() => Boolean(activeTool.value && !requiresTwoImages.value && !isPhoneFrameTool.value));
const hasParams = computed(() => Boolean(activeTool.value && !['grid_cut', 'phone_frame'].includes(activeTool.value.key)));
const usageLabel = computed(() => {
  if (activeUsage.value.freeQuota > 0) return `剩余 ${activeUsage.value.remainingFree}/${activeUsage.value.freeQuota}`;
  if (activeUsage.value.unlocked) return '已解锁 1 次';
  if (activeTool.value?.pointsEnabled && activeTool.value.pointsCost > 0) return `${activeTool.value.pointsCost} 积分/次`;
  return '看广告使用';
});
const canSubmit = computed(() => {
  if (!activeTool.value) return false;
  return requiresTwoImages.value ? Boolean(sourceImages.value[0] && sourceImages.value[1]) : Boolean(sourceImages.value[0]);
});
const processButtonText = computed(() => {
  if (activeUsage.value.remainingFree > 0 || activeUsage.value.unlocked) return activeTool.value?.key === 'phone_frame' ? '生成正面展示图' : '开始处理';
  if (activeTool.value?.pointsEnabled && activeTool.value.pointsCost > 0) return `${activeTool.value.pointsCost} 积分处理`;
  return activeTool.value?.adUnlockEnabled ? '看广告后使用' : '开始处理';
});
const uploadSlots = computed<UploadSlot[]>(() => [
  { index: 0, title: '图一', desc: '左侧图片' },
  { index: 1, title: '图二', desc: '右侧图片' }
]);
const singleUploadTitle = computed(() => {
  if (!activeTool.value) return '上传素材';
  if (activeTool.value.key === 'prompt_reverse') return '上传参考图';
  if (activeTool.value.key === 'resize') return '上传原图';
  return '上传图片';
});
const resizeSummary = computed(() => `${params.width} x ${params.height}`);
const selectedFitLabel = computed(() => resizeFitOptions.find(item => item.key === params.fit)?.label || '裁剪填充');
const selectedCutoutBgLabel = computed(() => cutoutBackgrounds.find(item => item.key === params.background)?.label || '透明');
const sharePath = computed(() => withQuery(PAGE_ROUTES.toolRun, { key: activeTool.value?.key || activeKey.value }));
const shareTitle = computed(() => activeTool.value?.title ? `AI 工具：${activeTool.value.title}` : 'AI 创作工具箱');

onLoad((query) => {
  const key = String(query?.key || '');
  if (isToolKey(key)) activeKey.value = key;
});

onShow(async () => {
  enableShareMenu();
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' });
    const loggedIn = await ensureLoggedIn({
      title: '登录后使用工具',
      subtitle: '登录并授权手机号后，可处理图片并保存结果。'
    });
    if (!loggedIn) return;
  }
  loadTools();
});

onShareAppMessage(() => createShareMessage({
  title: shareTitle.value,
  path: sharePath.value
}));

onShareTimeline(() => createShareTimeline({
  title: shareTitle.value,
  path: sharePath.value
}));

async function loadTools() {
  try {
    const config = await getToolsConfig();
    toolsEnabled.value = config.enabled;
    tools.value = config.tools || [];
    usage.value = config.usage || {};
    adUnitId.value = config.adUnitId || '';
    bannerAdUnitId.value = config.bannerAdUnitId || '';
    if (!tools.value.find(item => item.key === activeKey.value) && tools.value[0]) activeKey.value = tools.value[0].key;
  } catch {
    uni.showToast({ title: '工具配置加载失败', icon: 'none' });
  }
}

function backToTools() {
  uni.redirectTo({ url: PAGE_ROUTES.tools });
}

function chooseSource(index: number) {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed', 'original'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const path = res.tempFilePaths?.[0];
      if (!path) return;
      try {
        const imageInfo = await getLocalImageInfo(path);
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'tool_source', 'private');
        const fileId = Number(uploaded.fileId || uploaded.id || uploaded.file_id || 0);
        if (!fileId) throw new Error('上传成功但没有返回文件 ID');
        const next = [...sourceImages.value];
        next[index] = { path, fileId, width: imageInfo.width, height: imageInfo.height };
        sourceImages.value = next;
        if (index === 0 && activeTool.value?.key === 'resize') applyResizePreset(resizePresets[0], next[0]);
        outputs.value = [];
        promptResult.value = '';
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '图片上传失败';
        uni.showToast({ title: message, icon: 'none' });
      }
    }
  });
}

function removeSource(index: number) {
  const next = [...sourceImages.value];
  next[index] = undefined;
  sourceImages.value = next;
  outputs.value = [];
  promptResult.value = '';
}

function setParamNumber(key: string, value: number) {
  params[key] = Math.round(Number(value || 0));
}

function inputValue(event: unknown) {
  return (event as { detail?: { value?: string | number } })?.detail?.value ?? '';
}

function applyComparePreset(item: OptionItem) {
  comparePreset.value = item.key;
  params.width = item.width || 1200;
  params.height = item.height || 900;
}

function applyResizePreset(preset: ResizePreset, image = sourceImages.value[0]) {
  resizePreset.value = preset.key;
  if (preset.key === 'original') {
    params.width = image?.width || 1080;
    params.height = image?.height || 1080;
    return;
  }
  params.width = preset.width || 1080;
  params.height = preset.height || 1080;
}

function onResizeDimensionInput(key: 'width' | 'height', value: string | number) {
  const next = Math.max(1, Math.round(Number(value || 0)));
  params[key] = next;
  resizePreset.value = 'custom';
  if (!lockResizeRatio.value) return;
  const ratio = currentResizeRatio();
  if (!ratio) return;
  if (key === 'width') params.height = Math.max(1, Math.round(next / ratio));
  if (key === 'height') params.width = Math.max(1, Math.round(next * ratio));
}

function currentResizeRatio() {
  const preset = resizePresets.find(item => item.key === resizePreset.value);
  if (preset?.width && preset.height) return preset.width / preset.height;
  const image = sourceImages.value[0];
  if (image?.width && image.height) return image.width / image.height;
  const width = Number(params.width || 0);
  const height = Number(params.height || 0);
  return width > 0 && height > 0 ? width / height : 1;
}

function getLocalImageInfo(path: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    uni.getImageInfo({
      src: path,
      success: (info) => resolve({ width: Number(info.width || 0), height: Number(info.height || 0) }),
      fail: () => resolve({ width: 0, height: 0 })
    });
  });
}

function setOpacity(value: number) {
  params.opacity = Math.round(Number(value || 0)) / 100;
}

async function submitTool() {
  if (!activeTool.value || processing.value) return;
  if (!canSubmit.value) {
    uni.showToast({ title: requiresTwoImages.value ? '请上传图一和图二' : '请先上传图片', icon: 'none' });
    return;
  }
  processing.value = true;
  try {
    const result = await processTool({
      toolKey: activeTool.value.key,
      fileIds: currentFileIds(),
      params: buildParams(activeTool.value.key)
    });
    outputs.value = result.outputs || [];
    promptResult.value = result.prompt || '';
    await loadTools();
    uni.showToast({ title: '处理完成', icon: 'success' });
  } catch (error: any) {
    const needAd = error instanceof RequestError && (error.response as any)?.data?.needAd;
    if (needAd && activeTool.value.adUnlockEnabled) {
      await unlockByAdAndRetry();
      return;
    }
    const message = error instanceof Error && error.message ? error.message : '处理失败';
    uni.showToast({ title: message, icon: 'none' });
  } finally {
    processing.value = false;
  }
}

async function unlockByAdAndRetry() {
  if (!activeTool.value) return;
  if (!adUnitId.value) {
    uni.showToast({ title: '广告位未配置', icon: 'none' });
    return;
  }
  const session = await createToolAdSession(activeTool.value.key);
  const completed = await playRewardedVideo(session.adUnitId);
  if (!completed) {
    claimToolAdUnlock(activeTool.value.key, session.sessionId, false).catch(() => undefined);
    uni.showToast({ title: '完整观看广告后才能使用', icon: 'none' });
    return;
  }
  const unlocked = await claimToolAdUnlock(activeTool.value.key, session.sessionId, true);
  if (!unlocked.unlocked) {
    uni.showToast({ title: unlocked.message || '广告解锁失败', icon: 'none' });
    return;
  }
  await loadTools();
  const result = await processTool({
    toolKey: activeTool.value.key,
    fileIds: currentFileIds(),
    params: buildParams(activeTool.value.key)
  });
  outputs.value = result.outputs || [];
  promptResult.value = result.prompt || '';
  await loadTools();
  uni.showToast({ title: '处理完成', icon: 'success' });
}

function currentFileIds() {
  return sourceImages.value.filter((item): item is SourceImage => Boolean(item)).map(item => item.fileId);
}

function buildParams(toolKey: ToolKey) {
  if (toolKey === 'prompt_reverse') return { scene: params.scene };
  if (toolKey === 'image_compress') return { quality: Number(params.quality) };
  if (toolKey === 'watermark') return { text: params.text, opacity: Number(params.opacity) };
  if (toolKey === 'compare') return { width: Number(params.width), height: Number(params.height) };
  if (toolKey === 'resize') return { width: Number(params.width), height: Number(params.height), fit: params.fit };
  if (toolKey === 'cutout') return { tolerance: Number(params.tolerance), background: params.background };
  if (toolKey === 'phone_frame') return {};
  return {};
}

function playRewardedVideo(unitId: string): Promise<boolean> {
  const wxApi = (globalThis as unknown as { wx?: any }).wx;
  if (typeof wxApi?.createRewardedVideoAd !== 'function') {
    return Promise.reject(new Error('当前平台不支持激励视频广告'));
  }

  const videoAd = wxApi.createRewardedVideoAd({ adUnitId: unitId });
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (typeof videoAd.offClose === 'function') videoAd.offClose(onClose);
      if (typeof videoAd.offError === 'function') videoAd.offError(onError);
    };
    const finish = (handler: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };
    const onClose = (res: { isEnded?: boolean }) => finish(resolve, res?.isEnded !== false);
    const onError = (err: { errMsg?: string }) => finish(reject, new Error(err?.errMsg || '激励视频广告加载失败'));

    videoAd.onClose(onClose);
    videoAd.onError(onError);
    Promise.resolve(videoAd.load())
      .then(() => Promise.resolve(videoAd.show()))
      .catch((error) => finish(reject, error));
  });
}

function copyPrompt() {
  if (!promptResult.value) return;
  uni.setClipboardData({ data: promptResult.value });
}

function usePromptForImage() {
  if (!promptResult.value) return;
  uni.navigateTo({ url: `${PAGE_ROUTES.aiImage}?prompt=${encodeURIComponent(promptResult.value)}` });
}

async function saveOutput(url: string) {
  try {
    const tempFilePath = await downloadFile(url, { loading: '下载中' });
    await new Promise<void>((resolve, reject) => {
      uni.saveImageToPhotosAlbum({ filePath: tempFilePath, success: () => resolve(), fail: reject });
    });
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch {
    uni.showToast({ title: '保存失败，请检查相册权限', icon: 'none' });
  }
}

function uploadDesc(toolKey?: ToolKey) {
  if (toolKey === 'prompt_reverse') return '上传参考图，生成可复制提示词';
  if (toolKey === 'grid_cut') return '上传后切成九宫格';
  if (toolKey === 'image_compress') return '压缩体积，保留清晰度';
  if (toolKey === 'watermark') return '添加文字水印';
  if (toolKey === 'cutout') return '快速移除简单背景';
  if (toolKey === 'resize') return '选择预设或自定义尺寸';
  if (toolKey === 'phone_frame') return '上传截图，展示在 iPhone 17 Pro Max 正面屏幕';
  return '上传需要处理的图片';
}

function isToolKey(key: string): key is ToolKey {
  return [
    'prompt_reverse',
    'grid_cut',
    'image_compress',
    'watermark',
    'compare',
    'cutout',
    'resize',
    'phone_frame'
  ].includes(key);
}
</script>

<style scoped lang="scss">
.tool-run-page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(172rpx + env(safe-area-inset-bottom));
}

.content {
  position: relative;
  z-index: 1;
}

.run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 20rpx;
}

.run-copy {
  min-width: 0;
}

.run-desc {
  color: #64748b;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.35;
}

.quota-pill {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: #f2efff;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
}

.card,
.empty-panel {
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  margin-bottom: 24rpx;
  padding: 24rpx 22rpx 22rpx;
  border: 1rpx solid #dce8f6;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(28, 43, 82, 0.07);
}

.empty-panel {
  margin-top: 22rpx;
  text-align: center;
}

.empty-title {
  color: #172033;
  font-size: 30rpx;
  font-weight: 900;
}

.empty-text {
  margin-top: 10rpx;
  color: #64748b;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1.45;
}

.empty-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180rpx;
  height: 66rpx;
  margin-top: 18rpx;
  border-radius: 16rpx;
  background: #7a5cff;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
}

.upload-head,
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.section-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  color: #172033;
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

.upload-count {
  flex-shrink: 0;
  color: #91a3ad;
  font-size: 24rpx;
  font-weight: 700;
}

.video-source-card,
.frame-upload-card,
.tool-param-card,
.result-card {
  padding: 24rpx 22rpx 22rpx;
}

.video-source-status {
  display: flex;
  min-width: 168rpx;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
}

.video-source-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10rpx;
}

.video-source-action {
  display: flex;
  min-width: 78rpx;
  height: 42rpx;
  align-items: center;
  justify-content: center;
  padding: 0 14rpx;
  border: 1rpx solid #dce8f6;
  border-radius: 21rpx;
  background: #f8fbff;
  color: #64748b;
  font-size: 22rpx;
  font-weight: 900;
}

.video-source-action.danger {
  border-color: rgba(255, 122, 139, 0.28);
  background: #fff1f2;
  color: #e11d48;
}

.video-source-area {
  position: relative;
  display: flex;
  overflow: hidden;
  min-height: 420rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 22rpx;
  border: 2rpx dashed #cfd9e8;
  border-radius: 20rpx;
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.94), rgba(241, 245, 249, 0.94));
}

.video-source-area.filled {
  border-style: solid;
  border-color: rgba(122, 92, 255, 0.22);
  background: #ffffff;
}

.image-source-preview {
  width: 100%;
  height: 420rpx;
}

.upload-line-icon {
  position: relative;
  display: flex;
  width: 66rpx;
  height: 66rpx;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14rpx;
  border-radius: 20rpx;
  background: #e9ecff;
}

.line-icon-img {
  width: 42rpx;
  height: 42rpx;
}

.upload-line-plus {
  position: absolute;
  right: -7rpx;
  bottom: -8rpx;
  display: flex;
  width: 32rpx;
  height: 32rpx;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  background: #7a5cff;
  color: #ffffff;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 32rpx;
}

.video-empty-title,
.frame-empty-title,
.phone-empty-title {
  color: #2f3848;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.25;
  text-align: center;
}

.video-empty-desc,
.frame-empty-desc,
.phone-empty-desc {
  margin-top: 10rpx;
  padding: 0 18rpx;
  color: #7d8797;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.frame-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 22rpx;
}

.frame-upload-slot {
  position: relative;
  display: flex;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #cfd9e8;
  border-radius: 18rpx;
  background: #f8fbff;
}

.frame-upload-slot.filled {
  border-style: solid;
  border-color: rgba(122, 92, 255, 0.22);
  background: #ffffff;
}

.frame-upload-image {
  width: 100%;
  height: 100%;
}

.frame-replace-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background: rgba(15, 23, 42, 0.38);
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
  opacity: 0;
}

.frame-upload-slot:active .frame-replace-mask {
  opacity: 1;
}

.frame-replace-icon {
  font-size: 34rpx;
}

.frame-delete {
  position: absolute;
  z-index: 3;
  top: 12rpx;
  right: 12rpx;
  display: flex;
  width: 44rpx;
  height: 44rpx;
  align-items: center;
  justify-content: center;
  border-radius: 22rpx;
  background: rgba(255, 122, 139, 0.94);
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 6rpx 16rpx rgba(255, 122, 139, 0.28);
}

.frame-label {
  position: absolute;
  z-index: 2;
  left: 12rpx;
  bottom: 12rpx;
  padding: 6rpx 14rpx;
  border-radius: 18rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
}

.param-block {
  margin-top: 22rpx;
}

.param-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 14rpx;
}

.opacity-head,
.fit-head,
.tolerance-head {
  margin-top: 22rpx;
}

.param-block-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
}

.param-block-tip {
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 800;
}

.param-option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.quality-preset-grid {
  margin-top: 12rpx;
}

.resize-preset-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.param-option {
  display: flex;
  min-height: 78rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10rpx 8rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
}

.param-option.active {
  border-color: #8b5cf6;
  background: #f2efff;
  box-shadow: inset 0 0 0 1rpx rgba(139, 92, 246, 0.16);
}

.param-option-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.1;
}

.param-option-desc {
  margin-top: 8rpx;
  color: #64748b;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.1;
}

.param-option.active .param-option-title,
.param-option.active .param-option-desc {
  color: #6d4cff;
}

.field-label {
  margin: 18rpx 0 10rpx;
  color: #4b5167;
  font-size: 22rpx;
  font-weight: 900;
}

.field-input {
  box-sizing: border-box;
  width: 100%;
  height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.18);
  border-radius: 14rpx;
  background: #f8f9ff;
  color: #202537;
  font-size: 24rpx;
  font-weight: 700;
  text-align: center;
}

.size-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 18rpx;
}

.resize-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2rpx;
  overflow: hidden;
  margin-bottom: 18rpx;
  border-radius: 16rpx;
  background: #e8ebf4;
}

.resize-meta-item {
  padding: 20rpx 12rpx;
  background: #f8f9ff;
  text-align: center;
}

.resize-meta-item text {
  display: block;
  color: #8b91a8;
  font-size: 21rpx;
  font-weight: 800;
}

.resize-meta-value {
  margin-top: 6rpx;
  color: #55617a;
  font-size: 24rpx;
  font-weight: 900;
}

.ratio-lock {
  display: flex;
  min-height: 58rpx;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  margin-top: 12rpx;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: transparent;
  color: #5f6f91;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 1.35;
  text-align: center;
}

.ratio-lock.active {
  color: #2f6cff;
}

.lock-icon-image {
  width: 32rpx;
  height: 32rpx;
  flex: 0 0 auto;
}

.phone-frame-editor {
  margin-top: 6rpx;
}

.phone-stage-card {
  display: flex;
  justify-content: center;
  margin-bottom: 24rpx;
  padding: 28rpx 0 18rpx;
}

.phone-shell {
  position: relative;
  overflow: visible;
  width: 408rpx;
  height: 836rpx;
  border: 2rpx solid #3b3b3b;
  border-radius: 92rpx;
  background:
    linear-gradient(90deg, #080808 0%, #2d2d2d 4%, #060606 12%, #030303 88%, #303030 96%, #080808 100%);
  box-shadow:
    0 24rpx 52rpx rgba(15, 23, 42, 0.22),
    inset 0 0 0 8rpx #050505,
    inset 0 0 0 12rpx rgba(255, 255, 255, 0.08);
}

.phone-shell::before {
  position: absolute;
  inset: 8rpx;
  z-index: 1;
  border: 1rpx solid rgba(255, 255, 255, 0.14);
  border-radius: 84rpx;
  background: transparent;
  content: "";
  pointer-events: none;
}

.phone-shell::after {
  position: absolute;
  top: 238rpx;
  right: -8rpx;
  width: 8rpx;
  height: 138rpx;
  border-radius: 0 8rpx 8rpx 0;
  background: #343434;
  content: "";
}

.phone-dynamic-island {
  position: absolute;
  z-index: 4;
  top: 28rpx;
  left: 50%;
  width: 128rpx;
  height: 34rpx;
  border-radius: 999rpx;
  background: #020202;
  box-shadow:
    inset 0 0 0 2rpx rgba(255, 255, 255, 0.03),
    0 0 12rpx rgba(0, 0, 0, 0.45);
  transform: translateX(-50%);
}

.phone-dynamic-island::before,
.phone-dynamic-island::after {
  position: absolute;
  top: 50%;
  border-radius: 50%;
  content: "";
  transform: translateY(-50%);
}

.phone-dynamic-island::before {
  right: -20rpx;
  width: 8rpx;
  height: 8rpx;
  background: #18d263;
}

.phone-dynamic-island::after {
  right: -48rpx;
  width: 14rpx;
  height: 14rpx;
  background: radial-gradient(circle at 58% 42%, #17327a 0 34%, #071338 52%, #020409 100%);
  box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.04);
}

.phone-screen {
  position: absolute;
  z-index: 2;
  top: 22rpx;
  right: 18rpx;
  bottom: 22rpx;
  left: 18rpx;
  overflow: hidden;
  border: 0;
  border-radius: 76rpx;
  background: #020202;
  box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.04);
}

.phone-screen-image {
  width: 100%;
  height: 100%;
}

.phone-screen-empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #050505;
  color: #ffffff;
}

.prompt-result-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 210rpx;
  margin-top: 18rpx;
  padding: 20rpx;
  border: 1rpx solid rgba(124, 128, 154, 0.18);
  border-radius: 16rpx;
  background: #f8f9ff;
  color: #2b3145;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.65;
}

.copy-button,
.save-button,
.use-prompt-button {
  display: flex;
  min-width: 132rpx;
  height: 62rpx;
  align-items: center;
  justify-content: center;
  padding: 0 18rpx;
  border-radius: 16rpx;
  background: #f2efff;
  color: #6d4cff;
  font-size: 22rpx;
  font-weight: 900;
}

.use-prompt-button {
  width: 100%;
  margin-top: 16rpx;
}

.output-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 18rpx;
}

.output-grid.grid9 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8rpx;
}

.output-card {
  overflow: hidden;
  padding: 12rpx;
  border-radius: 16rpx;
  background: #f8f9ff;
}

.output-grid.grid9 .output-card {
  padding: 6rpx;
  border-radius: 12rpx;
}

.output-image {
  width: 100%;
  height: 220rpx;
  border-radius: 12rpx;
}

.output-grid.grid9 .output-image {
  height: 142rpx;
  border-radius: 8rpx;
}

.output-meta {
  margin-top: 10rpx;
  color: #7c8297;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
}

.save-button {
  width: 100%;
  margin-top: 12rpx;
}

.tool-banner-ad {
  overflow: hidden;
  margin: 4rpx 0 24rpx;
  border-radius: 16rpx;
}
</style>
