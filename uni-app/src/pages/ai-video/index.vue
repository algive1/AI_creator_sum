<template>
  <view class="flow-page create-flow-page video-create-page">
    <view class="content">
      <LegacyTopTabs v-model="videoMode" :items="videoModes" />

      <TemplateStrip
        :templates="videoTemplates"
        @select="openTemplate"
      />

      <block v-if="videoMode === '图生视频'">
        <LegacyAssetUploadCard
          title="上传素材"
          :types="videoUploadTypes"
          :uploaded-count="uploadedAssetCount"
          :max-uploads="maxUploads"
          @pick="pickAsset"
        />
        <LegacyAssetStrip
          :assets="assets"
          :max="maxUploads"
          @replace="replaceAsset"
          @remove="removeAsset"
          @hint="showUploadHint"
        />
      </block>
      <view v-else-if="videoMode === '首尾帧'" class="card frame-upload-card">
        <view class="upload-head">
          <view class="section-title">上传首尾帧</view>
          <view class="upload-count">已上传 {{ uploadedAssetCount }}/2</view>
        </view>
        <view class="frame-upload-grid">
          <view
            v-for="item in frameSlots"
            :key="item.type"
            class="frame-upload-slot"
            :class="{ filled: Boolean(item.asset) }"
            @tap="chooseAndSetImage(item.type, item.index)"
          >
            <block v-if="item.asset">
              <image class="frame-upload-image" :src="item.asset.path" mode="aspectFill" />
              <view class="frame-replace-mask">
                <text class="frame-replace-icon">↻</text>
                <text>替换</text>
              </view>
              <view class="frame-delete" @tap.stop="removeAsset(item.index)">×</view>
              <view class="frame-label">{{ item.label }}</view>
            </block>
            <block v-else>
              <view class="upload-line-icon frame-empty-icon">
                <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
                <text class="upload-line-plus">+</text>
              </view>
              <view class="frame-empty-title">{{ item.label }}</view>
              <view class="frame-empty-desc">{{ item.desc }}</view>
            </block>
          </view>
        </view>
      </view>
      <view v-else-if="videoMode === '视频编辑'" class="card video-source-card">
        <view class="upload-head">
          <view class="section-title">上传源视频</view>
          <view class="video-source-status">
            <view v-if="hasSourceVideo" class="video-source-actions">
              <view class="video-source-action" @tap.stop="replaceAsset(0)">替换</view>
              <view class="video-source-action danger" @tap.stop="removeAsset(0)">删除</view>
            </view>
            <view v-else class="upload-count">已上传 0/1</view>
          </view>
        </view>
        <view class="video-source-area" :class="{ filled: hasSourceVideo }" @tap="hasSourceVideo ? replaceAsset(0) : pickAsset('source_video')">
          <block v-if="sourceVideoPreviewPath">
            <video class="video-source-preview" :src="sourceVideoPreviewPath" controls object-fit="contain" @tap.stop />
          </block>
          <block v-else>
            <view class="upload-line-icon video-empty-icon">
              <image class="line-icon-img" src="/static/icons/icon_upload_video_line.svg" mode="aspectFit" />
              <text class="upload-line-plus">+</text>
            </view>
            <view class="video-empty-title">上传源视频</view>
            <view class="video-empty-desc">支持 MP4/MOV，上传后可在此查看</view>
          </block>
        </view>
      </view>

      <LegacyPromptComposer
        v-model="prompt"
        :expanded="promptExpanded"
        :placeholder="promptPlaceholder"
        @toggle-expanded="promptExpanded = !promptExpanded"
        @paste="pastePrompt"
        @select-all="selectAllPrompt"
        @clear="prompt = ''"
        @smart-fill="optimizePrompt"
      />

      <view class="card requirement-card video-creative-card">
        <view class="section-title">创作需求（可选）</view>
        <view class="requirement-list">
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_brand_line.svg" mode="aspectFit" /><text>品牌</text></view>
            <input class="requirement-input" v-model="form.brand" maxlength="20" placeholder="请输入品牌名称（如：Nike）" placeholder-class="requirement-placeholder" />
            <text class="requirement-count">{{ form.brand.length }}/20</text>
          </view>
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_point_line.svg" mode="aspectFit" /><text>卖点</text></view>
            <input class="requirement-input" v-model="form.sellingPoint" maxlength="50" placeholder="请输入产品核心卖点，突出优势" placeholder-class="requirement-placeholder" />
            <text class="requirement-count">{{ form.sellingPoint.length }}/50</text>
          </view>
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_scene_line.svg" mode="aspectFit" /><text>场景</text></view>
            <input class="requirement-input" v-model="form.scene" maxlength="30" placeholder="请输入视频使用场景（如：跑步）" placeholder-class="requirement-placeholder" />
            <text class="requirement-count">{{ form.scene.length }}/30</text>
          </view>
        </view>
      </view>

      <view class="card video-param-card">
        <view class="section-title">生成参数</view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频清晰度</text>
            <text class="param-block-tip">{{ selectedResolution }}</text>
          </view>
          <view class="param-option-grid resolution-grid">
            <button
              v-for="item in resolutionOptions"
              :key="item"
              class="param-option resolution-option"
              :class="{ active: selectedResolution === item }"
              @tap="selectedResolution = item"
            >
              <text class="param-option-title">{{ item }}</text>
              <text class="param-option-desc">输出分辨率</text>
            </button>
          </view>
        </view>
        <view v-if="videoMode !== '视频编辑'" class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频尺寸</text>
            <text class="param-block-tip">{{ selectedSizeMode === 'auto' ? '模型自动' : selectedRatio }}</text>
          </view>
          <view class="param-option-grid">
            <button
              v-for="item in sizeOptions"
              :key="item.key"
              class="param-option"
              :class="{ active: selectedSizeKey === item.key }"
              @tap="selectSizeOption(item)"
            >
              <text class="param-option-title">{{ item.label }}</text>
            </button>
          </view>
        </view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频时长</text>
            <text class="param-block-tip">{{ selectedDurationLabel }}</text>
          </view>
          <view class="param-option-grid duration-grid">
            <button
              v-for="item in durationOptions"
              :key="item"
              class="param-option duration-option"
              :class="{ active: selectedDuration === item }"
              @tap="selectedDuration = item"
            >
              <text class="param-option-title">{{ durationLabel(item) }}</text>
            </button>
          </view>
        </view>
        <view v-if="shouldShowAudioMode" class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">声音模式</text>
            <text class="param-block-tip">{{ selectedAudioModeLabel }}</text>
          </view>
          <view class="param-option-grid audio-mode-grid">
            <button
              v-for="item in audioModeOptions"
              :key="item.key"
              class="param-option audio-mode-option"
              :class="{ active: selectedAudioMode === item.key, locked: audioModeLocked }"
              :disabled="audioModeLocked"
              @tap="selectAudioMode(item.key)"
            >
              <text class="param-option-title">{{ item.label }}</text>
              <text class="param-option-desc">{{ item.desc }}</text>
            </button>
          </view>
          <view class="audio-mode-tip">{{ audioModeTip }}</view>
        </view>
        <view v-if="videoMode === '视频编辑'" class="param-block">
          <view class="sound-switch-card" :class="{ active: preserveAudio }" @tap="preserveAudio = !preserveAudio">
            <view class="sound-switch-copy">
              <view class="sound-switch-title">保留声音</view>
              <view class="sound-switch-desc">生成编辑结果时保留源视频原声</view>
            </view>
            <view class="enhance-switch" :class="{ active: preserveAudio }">
              <text class="enhance-switch-knob"></text>
            </view>
          </view>
        </view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">模型档位</text>
            <text class="param-block-tip">{{ selectedModelCostLabel }}</text>
          </view>
          <view class="param-option-grid model-tier-grid">
            <button
              v-for="(item, index) in modelOptions"
              :key="item.tierKey"
              class="param-option model-tier-option"
              :class="{ active: selectedModelIndex === index }"
              @tap="selectModel(index)"
            >
              <text class="param-option-title">{{ item.tierName }}</text>
              <text class="param-option-desc">
                <text v-if="item.memberDiscountApplied && item.basePointsCost > item.pointsCost" class="tier-base-cost">{{ item.basePointsCost }}</text>
                {{ item.pointsCost }} 创作点
              </text>
              <text v-if="item.memberDiscountApplied" class="tier-discount">{{ discountLabel(item.memberDiscountPercent) }}</text>
            </button>
          </view>
        </view>
      </view>
    </view>

    <GenerationActions
      title="生成视频"
      :cost="generationCostText"
      :loading="isSubmitting"
      :disabled="isSubmitting"
      @generate="submit"
    />
    <TemplatePreviewSheet
      :template="previewTemplate"
      @close="previewTemplate = null"
      @use="useTemplate"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import LegacyTopTabs from '@/components/legacy/LegacyTopTabs.vue';
import LegacyPromptComposer from '@/components/legacy/LegacyPromptComposer.vue';
import LegacyAssetUploadCard from '@/components/legacy/LegacyAssetUploadCard.vue';
import LegacyAssetStrip, { type LegacyAsset } from '@/components/legacy/LegacyAssetStrip.vue';
import GenerationActions from '@/components/legacy/GenerationActions.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import TemplateStrip from '@/components/business/TemplateStrip.vue';
import { createVideoTask, getVideoModels, optimizeVideoPrompt } from '@/api/ai-video';
import { uploadAsset } from '@/api/upload';
import { useAuthStore } from '@/stores/auth';
import { DEFAULT_DURATIONS, FEATURE_KEYS, PAGE_ROUTES } from '@/utils/constants';
import { assertPrompt } from '@/utils/validator';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { videoInspirationTemplates, type CreativeTemplate } from '@/utils/mock';
import { discountLabel } from '@/utils/member';

type SizeMode = 'auto' | 'ratio' | 'custom_pixels';
type VideoMode = '文生视频' | '图生视频' | '首尾帧' | '视频编辑';
type VideoSubType = 'text_to_video' | 'image_to_video' | 'first_last_frame_video' | 'video_edit';
type FormState = { brand: string; sellingPoint: string; scene: string };
type ModeState = {
  prompt: string;
  form: FormState;
  assets: Array<LegacyAsset | null>;
  uploadKeys: unknown[];
  fileIds: Array<number | undefined>;
};
type ModelCapabilities = {
  ratios?: string[];
  qualities?: string[];
  durations?: string[] | null;
  audioModes?: string[];
  supportedSizeModes?: string[];
  nativeSizes?: string[];
  defaultRatio?: string;
  defaultAudioMode?: string;
  maxReferenceImages?: number;
  maxDurationSeconds?: number;
};
type ModelTier = {
  tierKey: string;
  tierName: string;
  description: string;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};

const authStore = useAuthStore();
type SizeOption = {
  key: string;
  label: string;
  desc: string;
  mode: SizeMode;
  ratio?: string;
};
type AudioModeOption = {
  key: string;
  label: string;
  desc: string;
};
type InputAssetMeta = {
  type: string;
  typeLabel: string;
  path: string;
  uploadKey?: unknown;
  fileId?: number;
  mediaType?: 'image' | 'video';
};
type FrameSlot = {
  type: 'start_frame' | 'end_frame';
  label: string;
  desc: string;
  index: number;
  asset: LegacyAsset | null;
};

const videoModes: VideoMode[] = ['文生视频', '图生视频', '首尾帧', '视频编辑'];
const videoMode = ref<VideoMode>('图生视频');
const selectedTemplate = ref('');
const previewTemplate = ref<CreativeTemplate | null>(null);
const videoTemplates = videoInspirationTemplates as CreativeTemplate[];
const videoStates = reactive<Record<VideoMode, ModeState>>({
  文生视频: createModeState(),
  图生视频: createModeState(),
  首尾帧: createModeState(),
  视频编辑: createModeState()
});
const currentState = computed(() => videoStates[videoMode.value]);
const prompt = computed({
  get: () => currentState.value.prompt,
  set: (value: string) => { currentState.value.prompt = value; }
});
const form = computed(() => currentState.value.form);
const assets = computed(() => currentState.value.assets);
const uploadedAssetCount = computed(() => assets.value.filter(Boolean).length);
const startFrameAsset = computed(() => assets.value[0] || null);
const endFrameAsset = computed(() => assets.value[1] || null);
const sourceVideoAsset = computed(() => assets.value[0] || null);
const sourceVideoPreviewPath = computed(() => sourceVideoAsset.value?.path || '');
const hasSourceVideo = computed(() => Boolean(sourceVideoPreviewPath.value || currentState.value.uploadKeys[0]));
const promptExpanded = ref(false);
const selectedSizeMode = ref<SizeMode>('ratio');
const selectedRatio = ref('9:16');
const selectedDuration = ref('5s');
const selectedResolution = ref('720p');
const selectedAudioMode = ref('silent');
const preserveAudio = ref(true);
const isSubmitting = ref(false);
const models = ref<Record<string, unknown>[]>([]);
const selectedModelIndex = ref(1);
let videoModelRequestToken = 0;
const DEFAULT_MAX_REFERENCE_IMAGES = 4;
const videoRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
const videoUploadTypes = [
  { type: 'product', label: '产品图', desc: '支持 JPG/PNG/WEBP', hint: '建议≤10MB' },
  { type: 'reference', label: '参考图（可选）', desc: '支持 JPG/PNG', hint: '建议≤10MB' }
];

const fallbackCapabilities: ModelCapabilities = {
  ratios: videoRatios,
  qualities: ['720p', '1080p'],
  durations: [...DEFAULT_DURATIONS],
  supportedSizeModes: ['auto', 'ratio'],
  nativeSizes: ['auto'],
  defaultRatio: '9:16',
  maxReferenceImages: DEFAULT_MAX_REFERENCE_IMAGES
};
const fallbackModels: ModelTier[] = [
  {
    tierKey: 'video_standard',
    tierName: '标准生视频',
    description: '适合短视频和产品展示',
    basePointsCost: 5,
    pointsCost: 5,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: false
  },
  {
    tierKey: 'video_pro',
    tierName: '专业生视频',
    description: '更稳定的视频生成质量',
    basePointsCost: 15,
    pointsCost: 15,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: true
  },
  {
    tierKey: 'video_top',
    tierName: '顶级生视频',
    description: '高质量长视频或复杂运镜',
    basePointsCost: 25,
    pointsCost: 25,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: false
  }
];

const promptPlaceholder = computed(() => {
  if (videoMode.value === '视频编辑') return '描述你想如何编辑源视频，例如裁剪节奏、换场景或增强画质';
  if (videoMode.value === '首尾帧') return '描述从首帧过渡到尾帧的镜头运动、节奏和氛围';
  return '写点什么... 输入完成1秒后自动保存，最多2000字';
});
const frameSlots = computed<FrameSlot[]>(() => [
  { type: 'start_frame', label: '开始帧', desc: '上传视频开头画面', index: 0, asset: startFrameAsset.value },
  { type: 'end_frame', label: '结束帧', desc: '上传视频结尾画面', index: 1, asset: endFrameAsset.value }
]);
const modelOptions = computed<ModelTier[]>(() => {
  const source: ModelTier[] = models.value.map((item) => ({
    tierKey: String(item.tierKey || 'video_standard'),
    tierName: String(item.tierName || '标准生视频'),
    description: String(item.description || ''),
    basePointsCost: Number(item.basePointsCost || item.pointsCost || 5),
    pointsCost: Number(item.pointsCost || 5),
    memberDiscountPercent: Number(item.memberDiscountPercent || 100),
    memberDiscountApplied: Boolean(item.memberDiscountApplied),
    capabilities: normalizeCapabilities(item.capabilities),
    isDefault: Boolean(item.isDefault)
  }));
  if (source.length) return source;
  return fallbackModels;
});
const modelTiersReady = computed(() => models.value.length > 0);
const selectedModel = computed(() => modelOptions.value[selectedModelIndex.value] || modelOptions.value[0]);
const selectedModelCost = computed(() => selectedModel.value?.pointsCost || 0);
const selectedModelCostLabel = computed(() => modelTiersReady.value ? `${selectedModelCost.value} 创作点` : '加载中');
const selectedCapabilities = computed(() => selectedModel.value?.capabilities || fallbackCapabilities);
const maxUploads = computed(() => normalizeMaxReferenceImages(selectedCapabilities.value.maxReferenceImages));
const supportedRatios = computed(() => {
  const modelRatios = selectedCapabilities.value.ratios?.length ? selectedCapabilities.value.ratios : [];
  return uniqueStrings([...modelRatios, ...videoRatios]);
});
const resolutionOptions = computed<string[]>(() => {
  const values = selectedCapabilities.value.qualities?.length ? selectedCapabilities.value.qualities : fallbackCapabilities.qualities || [];
  return uniqueStrings(values);
});
const supportsAutoSize = computed(() => (selectedCapabilities.value.supportedSizeModes || ['auto', 'ratio']).includes('auto'));
const selectedSizeKey = computed(() => selectedSizeMode.value === 'auto' ? 'auto' : selectedRatio.value);
const sizeOptions = computed<SizeOption[]>(() => {
  const options: SizeOption[] = [];
  if (supportsAutoSize.value) {
    options.push({ key: 'auto', label: '自动', desc: '模型推荐', mode: 'auto' });
  }
  supportedRatios.value.forEach((item) => {
    options.push({ key: item, label: item, desc: '视频比例', mode: 'ratio', ratio: item });
  });
  return options;
});
const durationOptions = computed<string[]>(() => {
  const values = selectedCapabilities.value.durations?.length ? selectedCapabilities.value.durations : [...DEFAULT_DURATIONS];
  return uniqueStrings(values);
});
const selectedDurationLabel = computed(() => durationLabel(selectedDuration.value));
const audioModeKeys = computed(() => {
  if (videoMode.value === '视频编辑') return [];
  return uniqueStrings((selectedCapabilities.value.audioModes || []).map(normalizeAudioMode).filter(Boolean));
});
const defaultAudioModeKey = computed(() => normalizeAudioMode(selectedCapabilities.value.defaultAudioMode || 'silent'));
const audioModeOptions = computed<AudioModeOption[]>(() => audioModeKeys.value.map((key) => ({
  key,
  label: audioModeLabel(key),
  desc: audioModeOptionDesc(key)
})));
const shouldShowAudioMode = computed(() => audioModeKeys.value.includes('audio'));
const audioModeLocked = computed(() => audioModeOptions.value.length <= 1);
const selectedAudioModeLabel = computed(() => audioModeLabel(selectedAudioMode.value));
const audioModeTip = computed(() => {
  if (!shouldShowAudioMode.value) return '';
  if (audioModeLocked.value) return `当前模型仅支持${selectedAudioModeLabel.value}`;
  const defaultLabel = audioModeKeys.value.includes(defaultAudioModeKey.value)
    ? audioModeLabel(defaultAudioModeKey.value)
    : audioModeLabel('silent');
  return `默认${defaultLabel}，当前选择${selectedAudioModeLabel.value}`;
});
const generationCostText = computed(() => modelTiersReady.value
  ? `预计生成${selectedDurationLabel.value} · 消耗 ${selectedModelCost.value} 创作点`
  : `预计生成${selectedDurationLabel.value} · 模型档位加载中`);

onLoad((query) => {
  if (query?.prompt) prompt.value = decodeURIComponent(String(query.prompt));
});

onShow(() => {
  authStore.hydrate();
  loadVideoModelsForMode();
});

watch(videoMode, () => {
  loadVideoModelsForMode();
});

function loadVideoModelsForMode() {
  const featureKey = videoFeatureKey();
  const requestToken = ++videoModelRequestToken;
  models.value = [];
  selectedModelIndex.value = defaultModelIndex();
  normalizeVideoParams();
  getVideoModels(featureKey).then((res) => {
    if (requestToken !== videoModelRequestToken || featureKey !== videoFeatureKey()) return;
    const list = Array.isArray(res.list) ? res.list as Record<string, unknown>[] : [];
    if (!list.length && isDevFallbackEnabled) warnDevFallback('video-tiers', `GET /public/model-tiers?feature=${featureKey} returned empty list`);
    models.value = list;
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
  }).catch(() => {
    if (requestToken !== videoModelRequestToken || featureKey !== videoFeatureKey()) return;
    if (isDevFallbackEnabled) warnDevFallback('video-tiers', `GET /public/model-tiers?feature=${featureKey} failed`);
    models.value = [];
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
  });
}

function openTemplate(item: CreativeTemplate) {
  previewTemplate.value = item;
}

function useTemplate(item: CreativeTemplate) {
  selectedTemplate.value = item.title;
  const targetMode: VideoMode = item.mode === 'img2video' ? '图生视频' : '文生视频';
  videoMode.value = targetMode;
  const targetState = videoStates[targetMode];
  selectedDuration.value = durationOptions.value.includes(item.duration || '') ? item.duration as string : selectedDuration.value;
  targetState.prompt = item.prompt;
  previewTemplate.value = null;
}

function pickAsset(type: string) {
  if (type === 'source_video') {
    chooseAndSetVideo();
    return;
  }
  chooseAndSetImage(type);
}

function replaceAsset(slotIndex: number) {
  const current = assets.value[slotIndex];
  if (videoMode.value === '视频编辑') {
    chooseAndSetVideo();
    return;
  }
  chooseAndSetImage(current?.type || frameTypeBySlot(slotIndex) || 'reference', slotIndex);
}

function chooseAndSetImage(type: string, replaceIndex?: number) {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset: LegacyAsset = { path, type, typeLabel: imageTypeLabel(type), mediaType: 'image' };
      const state = currentState.value;
      const slotIndex = typeof replaceIndex === 'number' ? replaceIndex : fixedAssetSlot(type);
      let assetIndex: number;
      if (typeof slotIndex === 'number') {
        assetIndex = slotIndex;
        state.assets[slotIndex] = asset;
      } else if (uploadedAssetCount.value < maxUploads.value) {
        assetIndex = state.assets.length;
        state.assets.push(asset);
      } else {
        uni.showToast({ title: `最多上传${maxUploads.value}张素材`, icon: 'none' });
        return;
      }
      state.uploadKeys[assetIndex] = undefined;
      state.fileIds[assetIndex] = undefined;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image');
        const fileId = extractFileId(uploaded);
        const key = isFrameUploadType(type) ? (fileId || uploaded.fileNo || uploaded.url) : (uploaded.fileNo || fileId || uploaded.url);
        state.uploadKeys[assetIndex] = key;
        state.fileIds[assetIndex] = fileId;
      } catch {
        // 上传失败时仍保留本地预览，方便用户继续调整。
      }
    }
  });
}

function chooseAndSetVideo() {
  uni.chooseVideo({
    sourceType: ['album', 'camera'],
    compressed: false,
    success: async (res) => {
      const path = res.tempFilePath;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'source_video', typeLabel: '源视频', mediaType: 'video' };
      const state = currentState.value;
      state.assets[0] = asset;
      state.uploadKeys[0] = undefined;
      state.fileIds[0] = undefined;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_video');
        const fileId = extractFileId(uploaded);
        state.fileIds[0] = fileId;
        state.uploadKeys[0] = fileId || uploaded.fileNo || uploaded.url;
      } catch {
        // 上传失败时仍保留本地预览，方便用户继续调整。
      }
    }
  });
}

function removeAsset(slotIndex: number) {
  const state = currentState.value;
  if (videoMode.value === '首尾帧' || videoMode.value === '视频编辑') {
    state.assets[slotIndex] = null;
    state.uploadKeys[slotIndex] = undefined;
    state.fileIds[slotIndex] = undefined;
    return;
  }
  state.assets.splice(slotIndex, 1);
  state.uploadKeys.splice(slotIndex, 1);
  state.fileIds.splice(slotIndex, 1);
}

function showUploadHint() {
  uni.showToast({ title: '请点击上方上传素材卡片', icon: 'none' });
}

function pastePrompt() {
  uni.getClipboardData({ success: (res) => { prompt.value = res.data || prompt.value; } });
}

function selectAllPrompt() {
  uni.setClipboardData({ data: prompt.value, success: () => uni.showToast({ title: '已复制全部提示词', icon: 'none' }) });
}

async function optimizePrompt() {
  if (!assertPrompt(prompt.value)) return;
  const result = await optimizeVideoPrompt<Record<string, unknown>>({
    featureKey: videoFeatureKey(),
    prompt: prompt.value,
    ratio: videoMode.value !== '视频编辑' && selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined,
    duration: selectedDuration.value,
    resolution: selectedResolution.value
  });
  prompt.value = String(result.optimizedPrompt || result.optimized_prompt || prompt.value);
}

async function submit() {
  if (isSubmitting.value) return;
  if (!authStore.isLoggedIn) {
    uni.navigateTo({ url: `${PAGE_ROUTES.login}?redirect=${encodeURIComponent(PAGE_ROUTES.aiVideo)}` });
    return;
  }
  if (!assertPrompt(prompt.value)) return;
  if (!modelTiersReady.value) {
    uni.showToast({ title: '模型档位加载中，请稍后再生成', icon: 'none' });
    loadVideoModelsForMode();
    return;
  }
  if (!selectedModel.value) {
    uni.showToast({ title: '请先在后台配置模型档位', icon: 'none' });
    return;
  }
  const state = currentState.value;
  if (videoMode.value === '图生视频' && !state.assets.some(Boolean)) {
    uni.showToast({ title: '请先上传产品图或参考图', icon: 'none' });
    return;
  }
  if (videoMode.value === '首尾帧' && (!state.assets[0] || !state.assets[1])) {
    uni.showToast({ title: '请上传开始帧和结束帧', icon: 'none' });
    return;
  }
  if (videoMode.value === '视频编辑' && !state.assets[0]) {
    uni.showToast({ title: '请先上传源视频', icon: 'none' });
    return;
  }
  const firstFrameFileId = videoMode.value === '首尾帧' ? state.fileIds[0] : undefined;
  const lastFrameFileId = videoMode.value === '首尾帧' ? state.fileIds[1] : undefined;
  const videoFileId = videoMode.value === '视频编辑' ? state.fileIds[0] : undefined;
  if (videoMode.value === '首尾帧' && (!firstFrameFileId || !lastFrameFileId)) {
    uni.showToast({ title: '首尾帧未拿到文件ID，请重新上传', icon: 'none' });
    return;
  }
  if (videoMode.value === '视频编辑' && !videoFileId) {
    uni.showToast({ title: '源视频未拿到文件ID，请重新上传', icon: 'none' });
    return;
  }
  const subType = videoSubType();
  const featureKey = videoFeatureKey();
  const inputAssets = buildInputAssets(state);
  const audioMode = shouldShowAudioMode.value ? selectedAudioMode.value : undefined;
  const params = {
    resolution: selectedResolution.value,
    preserveAudio: videoMode.value === '视频编辑' ? preserveAudio.value : undefined,
    videoFileId,
    audioMode,
    inputAssets
  };
  isSubmitting.value = true;
  try {
  const result = await createVideoTask<Record<string, unknown>>({
    featureKey,
    subType,
    videoMode: subType,
    prompt: buildFinalPrompt(prompt.value, state.form),
    tierKey: selectedModel.value.tierKey,
    firstFrameFileId,
    lastFrameFileId,
    videoFileId,
    ...(videoMode.value !== '视频编辑' ? {
      sizeMode: selectedSizeMode.value,
      ratio: selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined
    } : {}),
    duration: selectedDuration.value,
    audioMode,
    style: state.form.scene,
    quality: selectedResolution.value,
    autoScript: true,
    formData: { ...state.form },
    params,
    uploadKeys: state.uploadKeys.filter((item) => item !== undefined && item !== null && item !== '')
  });
  const id = Number(result.id || result.taskId);
  if (!Number.isInteger(id) || id <= 0) {
    uni.showToast({ title: 'Task submit failed', icon: 'none' });
    return;
  }
  cacheResultMeta(id, {
    subType,
    videoMode: subType,
    videoModeLabel: videoMode.value,
    ratio: videoMode.value !== '视频编辑' ? selectedRatio.value : undefined,
    duration: selectedDuration.value,
    resolution: selectedResolution.value,
    audioMode,
    firstFrameFileId,
    lastFrameFileId,
    videoFileId,
    inputAssets,
    params
  });
  uni.redirectTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=video` });
  } finally {
    isSubmitting.value = false;
  }
}

function selectModel(index: number) {
  selectedModelIndex.value = index;
  normalizeVideoParams();
}

function middleModelIndex() {
  return Math.min(1, Math.max(0, modelOptions.value.length - 1));
}

function defaultModelIndex() {
  const index = modelOptions.value.findIndex((item) => item.isDefault);
  return index >= 0 ? index : middleModelIndex();
}

function selectSizeOption(item: SizeOption) {
  selectedSizeMode.value = item.mode;
  if (item.ratio) selectedRatio.value = item.ratio;
}

function selectAudioMode(value: string) {
  if (audioModeLocked.value || !audioModeKeys.value.includes(value)) return;
  selectedAudioMode.value = value;
}

function normalizeVideoParams() {
  const caps = selectedCapabilities.value;
  const modes = caps.supportedSizeModes?.length ? caps.supportedSizeModes : ['auto', 'ratio'];
  if (selectedSizeMode.value === 'auto' && !modes.includes('auto')) {
    selectedSizeMode.value = 'ratio';
  }
  if (selectedSizeMode.value !== 'auto' && !supportedRatios.value.includes(selectedRatio.value)) {
    selectedRatio.value = caps.defaultRatio && supportedRatios.value.includes(caps.defaultRatio) ? caps.defaultRatio : supportedRatios.value[0];
  }
  if (!durationOptions.value.includes(selectedDuration.value)) {
    selectedDuration.value = durationOptions.value[0];
  }
  if (resolutionOptions.value.length && !resolutionOptions.value.includes(selectedResolution.value)) {
    selectedResolution.value = resolutionOptions.value[0];
  }
  if (audioModeKeys.value.length && !audioModeKeys.value.includes(selectedAudioMode.value)) {
    const defaultAudioMode = normalizeAudioMode(caps.defaultAudioMode || '');
    selectedAudioMode.value = audioModeKeys.value.includes(defaultAudioMode)
      ? defaultAudioMode
      : audioModeKeys.value.includes('silent')
        ? 'silent'
        : audioModeKeys.value[0];
  }
  if (!audioModeKeys.value.length) {
    selectedAudioMode.value = 'silent';
  }
}

function createModeState(): ModeState {
  return {
    prompt: '',
    form: { brand: '', sellingPoint: '', scene: '' },
    assets: [],
    uploadKeys: [],
    fileIds: []
  };
}

function normalizeCapabilities(value: unknown): ModelCapabilities {
  const caps = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ratios: stringArray(caps.ratios, fallbackCapabilities.ratios),
    qualities: stringArray(caps.qualities, fallbackCapabilities.qualities),
    durations: stringArray(caps.durations, fallbackCapabilities.durations || []),
    audioModes: stringArray(caps.audioModes || caps.audio_modes, []),
    supportedSizeModes: stringArray(caps.supportedSizeModes, fallbackCapabilities.supportedSizeModes),
    nativeSizes: stringArray(caps.nativeSizes, fallbackCapabilities.nativeSizes),
    defaultRatio: String(caps.defaultRatio || fallbackCapabilities.defaultRatio || '9:16'),
    defaultAudioMode: String(caps.defaultAudioMode || caps.default_audio_mode || 'silent'),
    maxReferenceImages: normalizeMaxReferenceImages(caps.maxReferenceImages),
    maxDurationSeconds: Number(caps.maxDurationSeconds || fallbackCapabilities.maxDurationSeconds || 0)
  };
}

function normalizeMaxReferenceImages(value: unknown) {
  const count = Math.floor(Number(value || DEFAULT_MAX_REFERENCE_IMAGES));
  return Number.isFinite(count) && count > 0 ? count : DEFAULT_MAX_REFERENCE_IMAGES;
}

function stringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

function uniqueStrings(values: string[]) {
  return values.filter((item, index) => Boolean(item) && values.indexOf(item) === index);
}

function durationLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d+)(?:s)?$/i);
  return match ? `${match[1]}秒` : text;
}

function normalizeAudioMode(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (['silent', 'mute', 'muted', 'no_audio', 'no-audio', 'off', '无声', '静音'].includes(text)) return 'silent';
  if (['audio', 'sound', 'with_audio', 'with-audio', 'on', '有声', '声音', '音频'].includes(text)) return 'audio';
  return '';
}

function audioModeLabel(value: string) {
  if (value === 'audio') return '有声';
  if (value === 'silent') return '无声';
  return value || '无声';
}

function audioModeOptionDesc(value: string) {
  if (audioModeLocked.value) return '当前模型仅支持';
  if (value === defaultAudioModeKey.value) return '默认选项';
  return value === 'silent' ? '关闭声音' : '生成音频';
}

function imageTypeLabel(type: string) {
  if (type === 'product') return '产品图';
  if (type === 'start_frame') return '开始帧';
  if (type === 'end_frame') return '结束帧';
  return '参考图';
}

function fixedAssetSlot(type: string) {
  if (type === 'start_frame') return 0;
  if (type === 'end_frame') return 1;
  if (type === 'source_video') return 0;
  return undefined;
}

function isFrameUploadType(type: string) {
  return type === 'start_frame' || type === 'end_frame';
}

function extractFileId(uploaded: Record<string, unknown>) {
  const value = uploaded.fileId || uploaded.id || uploaded.file_id;
  const fileId = Number(value);
  return Number.isFinite(fileId) && fileId > 0 ? fileId : undefined;
}

function frameTypeBySlot(slotIndex: number) {
  if (videoMode.value !== '首尾帧') return '';
  return slotIndex === 0 ? 'start_frame' : 'end_frame';
}

function videoSubType(): VideoSubType {
  if (videoMode.value === '图生视频') return 'image_to_video';
  if (videoMode.value === '首尾帧') return 'first_last_frame_video';
  if (videoMode.value === '视频编辑') return 'video_edit';
  return 'text_to_video';
}

function videoFeatureKey() {
  if (videoMode.value === '图生视频') return FEATURE_KEYS.imageToVideo;
  if (videoMode.value === '首尾帧') return FEATURE_KEYS.firstLastFrameVideo;
  if (videoMode.value === '视频编辑') return FEATURE_KEYS.videoEdit;
  return FEATURE_KEYS.video;
}

function buildFinalPrompt(basePrompt: string, data: FormState) {
  const parts = [
    data.brand ? `品牌：${data.brand}` : '',
    data.sellingPoint ? `卖点：${data.sellingPoint}` : '',
    data.scene ? `场景：${data.scene}` : ''
  ].filter(Boolean);
  return [basePrompt.trim(), parts.length ? `创作需求：${parts.join('；')}` : ''].filter(Boolean).join('\n');
}

function buildInputAssets(state: ModeState): InputAssetMeta[] {
  return state.assets.reduce<InputAssetMeta[]>((items, asset, index) => {
    if (!asset) return items;
    items.push({
      type: asset.type,
      typeLabel: asset.typeLabel,
      path: asset.path,
      uploadKey: state.uploadKeys[index],
      fileId: state.fileIds[index],
      mediaType: asset.mediaType
    });
    return items;
  }, []);
}

function cacheResultMeta(id: number, meta: Record<string, unknown>) {
  try {
    uni.setStorageSync(`ai_video_result_meta:${id}`, meta);
  } catch {
    // 本地缓存失败不影响提交。
  }
}
</script>

<style scoped lang="scss">
.video-create-page {
  padding-top: 24rpx;
  padding-bottom: 170rpx;
}

.content {
  position: relative;
  z-index: 1;
}

.card {
  width: 100%;
  overflow: hidden;
  margin-bottom: 24rpx;
  padding: 28rpx;
  border: 1rpx solid #dce8f6;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(28, 43, 82, 0.07);
}

.upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.upload-count {
  flex-shrink: 0;
  color: #91a3ad;
  font-size: 24rpx;
  font-weight: 700;
}

.frame-upload-card,
.video-source-card {
  padding: 24rpx 22rpx 22rpx;
}

.frame-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 22rpx;
}

.frame-upload-slot {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1 / 1;
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
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border-radius: 22rpx;
  background: rgba(255, 122, 139, 0.94);
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 6rpx 16rpx rgba(255, 122, 139, 0.28);
}

.video-source-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 180rpx;
}

.video-source-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10rpx;
}

.video-source-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 78rpx;
  height: 42rpx;
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

.frame-label {
  position: absolute;
  left: 12rpx;
  bottom: 12rpx;
  z-index: 2;
  padding: 6rpx 14rpx;
  border-radius: 18rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
}

.upload-line-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66rpx;
  height: 66rpx;
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
  align-items: center;
  justify-content: center;
  width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background: #7a5cff;
  color: #ffffff;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 32rpx;
}

.frame-empty-title,
.video-empty-title {
  color: #2f3848;
  font-size: 28rpx;
  font-weight: 900;
  text-align: center;
}

.frame-empty-desc,
.video-empty-desc {
  margin-top: 10rpx;
  padding: 0 18rpx;
  color: #7d8797;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.frame-upload-slot:not(.filled) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.video-source-area {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 420rpx;
  margin-top: 22rpx;
  border: 2rpx dashed #cfd9e8;
  border-radius: 20rpx;
  background:
    linear-gradient(180deg, rgba(248, 251, 255, 0.94), rgba(241, 245, 249, 0.94));
}

.video-source-area.filled {
  border-style: solid;
  border-color: rgba(122, 92, 255, 0.22);
  background: #111827;
}

.video-source-preview {
  width: 100%;
  height: 420rpx;
  background: #111827;
}

.video-creative-card,
.video-param-card {
  padding: 24rpx 22rpx 22rpx;
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

.resolution-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.audio-mode-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.duration-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.param-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 78rpx;
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

.param-option.locked {
  opacity: 1;
}

.resolution-option,
.audio-mode-option,
.model-tier-option {
  min-height: 92rpx;
}

.duration-option {
  min-height: 64rpx;
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

.audio-mode-tip {
  margin-top: 10rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
}

.tier-base-cost {
  margin-right: 6rpx;
  color: #9aa4b3;
  text-decoration: line-through;
}

.tier-discount {
  margin-top: 8rpx;
  padding: 3rpx 10rpx;
  border-radius: 999rpx;
  background: #fff1cc;
  color: #d97706;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 1.2;
}

.sound-switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 92rpx;
  padding: 16rpx 18rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
}

.sound-switch-card.active {
  background: #f2efff;
}

.sound-switch-copy {
  min-width: 0;
}

.sound-switch-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
}

.sound-switch-desc {
  margin-top: 8rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
}

.enhance-switch {
  position: relative;
  flex-shrink: 0;
  width: 82rpx;
  height: 44rpx;
  border-radius: 22rpx;
  background: #cbd5e1;
}

.enhance-switch.active {
  background: linear-gradient(90deg, #ff7acb, #8b5cf6);
}

.enhance-switch-knob {
  position: absolute;
  top: 5rpx;
  left: 5rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 17rpx;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.18);
}

.enhance-switch.active .enhance-switch-knob {
  left: 43rpx;
}

.section-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  color: #172033;
  font-size: 30rpx;
  font-weight: 900;
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

.requirement-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 22rpx;
}

.requirement-row {
  display: grid;
  grid-template-columns: 160rpx minmax(0, 1fr) 74rpx;
  align-items: center;
  min-height: 70rpx;
  padding: 0 16rpx;
  border: 1rpx solid #dce8f6;
  border-radius: 14rpx;
  background: #f8fbff;
}

.requirement-label {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  color: #2f3848;
  font-size: 26rpx;
  font-weight: 900;
  white-space: nowrap;
}

.requirement-icon {
  flex-shrink: 0;
  width: 30rpx;
  height: 30rpx;
}

.requirement-input {
  width: 100%;
  min-width: 0;
  height: 70rpx;
  padding: 0 12rpx;
  color: #2f3848;
  font-size: 25rpx;
}

.requirement-placeholder {
  color: #9aa4b3;
}

.requirement-count {
  color: #8d97a8;
  font-size: 24rpx;
  text-align: right;
  white-space: nowrap;
}
</style>
