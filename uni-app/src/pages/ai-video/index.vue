<template>
  <view class="flow-page create-flow-page video-create-page">
    <view class="content">
      <LegacyTopTabs :model-value="videoMode" :items="videoModes" :labels="videoModeLabels" @select="selectVideoMode" />

      <TemplateStrip
        :templates="videoTemplates"
        @select="openTemplate"
      />

      <view v-if="isFirstFrameVideoMode" class="card video-source-card single-image-source-card">
        <view class="upload-head">
          <view class="section-title">上传首图</view>
          <view class="video-source-status">
            <view v-if="hasFirstFrameImage" class="video-source-actions">
              <view class="video-source-action" @tap.stop="replaceAsset(0)">替换</view>
              <view class="video-source-action danger" @tap.stop="removeAsset(0)">删除</view>
            </view>
            <view v-else class="upload-count">已上传 0/1</view>
          </view>
        </view>
        <view class="video-source-area image-source-area" :class="{ filled: hasFirstFrameImage }" @tap="handleFirstFrameSourceTap">
          <block v-if="firstFramePreviewPath">
            <image class="image-source-preview" :src="firstFramePreviewPath" mode="aspectFill" />
          </block>
          <block v-else>
            <view class="upload-line-icon video-empty-icon">
              <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
              <text class="upload-line-plus">+</text>
            </view>
            <view class="video-empty-title">上传首图</view>
            <view class="video-empty-desc">上传 1 张首帧参考图，生成时作为视频起始画面</view>
          </block>
        </view>
      </view>
      <view v-else-if="showDynamicMediaUpload && visibleMediaUploadCards.length" class="reference-video-upload-section">
        <view class="card media-upload-card video-source-card" :class="mediaUploadLayoutClass">
          <view class="upload-head">
            <view class="section-title">{{ isMultiSourceVideoMode ? '上传源视频' : '上传素材' }}</view>
            <view class="upload-count">{{ mediaUploadTotalText }}</view>
          </view>
          <view
            v-if="visibleMediaUploadCards.length === 1"
            class="video-source-area media-upload-source-area"
            :class="{ full: visibleMediaUploadCards[0].full }"
            @tap="openMediaAction(visibleMediaUploadCards[0].mediaType)"
          >
            <view class="upload-line-icon video-empty-icon">
              <image class="line-icon-img" :src="visibleMediaUploadCards[0].icon" mode="aspectFit" />
              <text class="upload-line-plus">+</text>
            </view>
            <view class="video-empty-title">{{ visibleMediaUploadCards[0].title }}</view>
            <view class="video-empty-desc">{{ visibleMediaUploadCards[0].countText }}</view>
          </view>
          <view v-else class="frame-upload-grid media-upload-grid" :class="mediaUploadGridClass">
            <view
              v-for="card in visibleMediaUploadCards"
              :key="card.mediaType"
              class="frame-upload-slot media-upload-frame-slot"
              :class="{ full: card.full }"
              @tap="openMediaAction(card.mediaType)"
            >
              <view class="upload-line-icon frame-empty-icon">
                <image class="line-icon-img" :src="card.icon" mode="aspectFit" />
                <text class="upload-line-plus">+</text>
              </view>
              <view class="frame-empty-title">{{ card.title }}</view>
              <view class="frame-empty-desc">{{ card.countText }}</view>
            </view>
          </view>
        </view>
        <LegacyAssetStrip
          :assets="assets"
          :max="mediaAssetLimit"
          @replace="replaceAsset"
          @remove="removeAsset"
          @hint="showUploadHint"
        />
      </view>
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
        <view class="video-source-area" :class="{ filled: hasSourceVideo }" @tap="handleSourceVideoTap">
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
        :show-smart-fill="promptOptimizeEnabled"
        :smart-loading="promptOptimizing"
        :show-help-button="showPromptGuide"
        @toggle-expanded="promptExpanded = !promptExpanded"
        @help="openPromptGuide"
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
        <view v-if="resolutionOptions.length" class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频清晰度</text>
            <text class="param-block-tip">{{ selectedResolution }}</text>
          </view>
          <view class="param-option-grid resolution-grid">
            <button
              v-for="item in resolutionOptions"
              :key="item"
              class="param-option resolution-option"
              :class="{ active: selectedResolution === item, locked: resolutionLocked }"
              :disabled="resolutionLocked"
              @tap="selectResolution(item)"
            >
              <text class="param-option-title">{{ item }}</text>
              <text class="param-option-desc">输出分辨率</text>
            </button>
          </view>
        </view>
        <view v-if="videoMode !== '视频编辑' && sizeOptions.length" class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频尺寸</text>
            <text class="param-block-tip">{{ selectedSizeMode === 'auto' ? '模型自动' : selectedRatio }}</text>
          </view>
          <view class="param-option-grid">
            <button
              v-for="item in sizeOptions"
              :key="item.key"
              class="param-option"
              :class="{ active: selectedSizeKey === item.key, locked: sizeLocked }"
              :disabled="sizeLocked"
              @tap="selectSizeOption(item)"
            >
              <text class="param-option-title">{{ item.label }}</text>
              <text class="param-option-desc">{{ item.desc }}</text>
            </button>
          </view>
        </view>
        <view v-if="durationOptions.length" class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">视频时长</text>
            <text class="param-block-tip">{{ selectedDurationLabel }}</text>
          </view>
          <view class="param-option-grid duration-grid">
            <button
              v-for="item in durationOptions"
              :key="item"
              class="param-option duration-option"
              :class="{ active: selectedDuration === item, locked: durationLocked }"
              :disabled="durationLocked"
              @tap="selectDuration(item)"
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
        <view v-if="shouldShowAdvancedParams" class="param-block advanced-param-block">
          <view class="advanced-param-toggle" @tap="advancedExpanded = !advancedExpanded">
            <view class="advanced-param-copy">
              <text class="advanced-param-title">高级参数</text>
              <text class="advanced-param-desc">{{ advancedParamSummary }}</text>
            </view>
            <text class="advanced-param-state">{{ advancedExpanded ? '收起' : '展开' }}</text>
          </view>
          <view v-if="advancedExpanded" class="advanced-param-panel">
            <view v-if="supportsAdvancedParam('seed')" class="advanced-param-row">
              <text class="advanced-param-label">随机种子</text>
              <input
                class="advanced-param-input"
                v-model="advancedSeed"
                type="number"
                maxlength="20"
                placeholder="可选"
                placeholder-class="advanced-param-placeholder"
              />
            </view>
            <view v-if="supportsAdvancedParam('fps')" class="advanced-param-row">
              <text class="advanced-param-label">帧率</text>
              <input
                class="advanced-param-input"
                v-model="advancedFps"
                type="number"
                maxlength="3"
                placeholder="模型默认"
                placeholder-class="advanced-param-placeholder"
              />
            </view>
            <view v-if="supportsAdvancedParam('audioUrl')" class="advanced-param-row">
              <text class="advanced-param-label">音频URL</text>
              <input
                class="advanced-param-input"
                v-model="advancedAudioUrl"
                maxlength="500"
                placeholder="可选"
                placeholder-class="advanced-param-placeholder"
              />
            </view>
          </view>
        </view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">入口档位</text>
            <text class="param-block-tip">{{ selectedModelCostLabel }}</text>
          </view>
          <view class="entry-tier-note">切换入口档位后，比例参数和参考图数量会随当前档位变化</view>
          <view class="param-option-grid model-tier-grid">
            <button
              v-for="(item, index) in modelOptions"
              :key="item.tierKey"
              class="param-option model-tier-option"
              :class="{ active: selectedModelIndex === index }"
              @tap="selectModel(index)"
            >
              <text class="param-option-title">{{ shortTierName(item.tierName) }}</text>
              <text class="param-option-desc">
                <text v-if="item.memberDiscountApplied && item.basePointsCost > item.pointsCost" class="tier-base-cost">{{ item.basePointsCost }}</text>
                {{ item.pointsCost }} 创作点
              </text>
              <text v-if="item.memberDiscountApplied" class="tier-discount">{{ discountLabel(item.memberDiscountPercent) }}</text>
            </button>
          </view>
          <view v-if="!modelTiersLoading && !modelOptions.length" class="tier-empty">当前功能暂无可用入口档位</view>
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
    <AppDialogHost />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { readPersistentCache, writePersistentCache } from '@/utils/persistent-cache';
import { onLoad, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import LegacyTopTabs from '@/components/legacy/LegacyTopTabs.vue';
import LegacyPromptComposer from '@/components/legacy/LegacyPromptComposer.vue';
import LegacyAssetStrip, { type LegacyAsset } from '@/components/legacy/LegacyAssetStrip.vue';
import GenerationActions from '@/components/legacy/GenerationActions.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import TemplateStrip from '@/components/business/TemplateStrip.vue';
import { createVideoTask, getVideoModels, optimizeVideoPrompt } from '@/api/ai-video';
import { getTemplates, useTemplate as useContentTemplate } from '@/api/template';
import { uploadAsset } from '@/api/upload';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { DEFAULT_DURATIONS, FEATURE_KEYS, PAGE_ROUTES } from '@/utils/constants';
import { assertPrompt } from '@/utils/validator';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { videoInspirationTemplates, type CreativeTemplate } from '@/utils/mock';
import { discountLabel } from '@/utils/member';
import { normalizeBackendMediaUrl } from '@/utils/media-url';
import { showAppDialog, showMemberRequiredDialog } from '@/utils/app-dialog';
import { getPromptGuide, hasPromptGuideDialog, type PromptGuideModeKey } from '@/utils/prompt-guide';
import { buildSupportedAdvancedVideoParams, hasVisibleVideoAdvancedParams, normalizeVideoAdvancedParams, type VideoAdvancedParamKey } from '@/utils/video-advanced-params';
import { createShareMessage, createShareTimeline, enableShareMenu, withQuery } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';

type SizeMode = 'auto' | 'ratio' | 'custom_pixels';
type VideoMode = '文生视频' | '图生视频' | '参考生视频' | '首尾帧' | '视频编辑';
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
  inputMediaTypes?: Array<'image' | 'video' | 'audio'>;
  maxVideoUrls?: number;
  maxAudioUrls?: number;
  supportedSizeModes?: string[];
  nativeSizes?: string[];
  defaultRatio?: string;
  defaultAudioMode?: string;
  maxReferenceImages?: number;
  maxDurationSeconds?: number;
  inputMode?: string;
  minReferenceImages?: number;
  referenceUploadMode?: 'none' | 'first_frame' | 'first_last' | 'reference_images' | 'source_video';
  requiredReference?: boolean;
  advancedParams?: VideoAdvancedParamKey[];
};
type ModelTier = {
  tierKey: string;
  tierName: string;
  description: string;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  pricing?: TierPricing | null;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};

const authStore = useAuthStore();
const configStore = useConfigStore();
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
type TierPricingMode = 'fixed' | 'matrix' | 'per_second_matrix' | 'token_preauth';
type TierPricingRule = {
  conditions?: Record<string, unknown>;
  pointsCost?: number;
  unitPoints?: number;
  preauthPoints?: number;
  label?: string;
};
type TierPricing = {
  mode?: TierPricingMode;
  unit?: 'points';
  defaultParams?: Record<string, unknown>;
  rules?: TierPricingRule[];
  defaultPointsCost?: number;
  defaultUnitPoints?: number;
  preauthPoints?: number;
  memberDiscountPercent?: number;
  memberDiscountApplied?: boolean;
};
type InputAssetMeta = {
  type: string;
  typeLabel: string;
  path: string;
  url?: string;
  sourceType?: 'upload' | 'url';
  uploadKey?: unknown;
  fileId?: number;
  fileNo?: string;
  mediaType?: 'image' | 'video' | 'audio';
};
type InputMediaType = 'image' | 'video' | 'audio';
type MediaUploadCard = {
  mediaType: InputMediaType;
  title: string;
  countText: string;
  icon: string;
  full: boolean;
};
type FrameSlot = {
  type: 'start_frame' | 'end_frame';
  label: string;
  desc: string;
  index: number;
  asset: LegacyAsset | null;
};

const videoModes: VideoMode[] = ['文生视频', '图生视频', '参考生视频', '首尾帧', '视频编辑'];
const videoModeLabels: Partial<Record<VideoMode, string>> = {
  图生视频: '首图视频',
  参考生视频: '图生视频'
};
const VIDEO_DRAFT_KEY = 'ai_creator_video_task_draft';
const videoMode = ref<VideoMode>('图生视频');
const selectedTemplate = ref('');
const previewTemplate = ref<CreativeTemplate | null>(null);
const backendVideoTemplates = ref<CreativeTemplate[]>([]);
const videoTemplates = computed(() => {
  const feature = videoFeatureForMode();
  const list = backendVideoTemplates.value.filter((item) => templateMatchesVideoFeature(item, feature));
  if (list.length) return sortTemplatesForFeature(list, feature);
  if (!isDevFallbackEnabled) return [];
  const fallback = (videoInspirationTemplates as CreativeTemplate[]).filter((item) => templateMatchesVideoFeature(item, feature));
  return fallback.length ? fallback : videoInspirationTemplates as CreativeTemplate[];
});
const videoStates = reactive<Record<VideoMode, ModeState>>({
  文生视频: createModeState(),
  图生视频: createModeState(),
  参考生视频: createModeState(),
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
const displayedUploadedAssetCount = computed(() => Math.min(uploadedAssetCount.value, maxUploads.value));
const firstFrameVideoAsset = computed(() => assets.value[0] || null);
const firstFramePreviewPath = computed(() => firstFrameVideoAsset.value?.path || '');
const hasFirstFrameImage = computed(() => Boolean(firstFramePreviewPath.value || currentState.value.uploadKeys[0]));
const startFrameAsset = computed(() => assets.value[0] || null);
const endFrameAsset = computed(() => assets.value[1] || null);
const sourceVideoAsset = computed(() => assets.value[0] || null);
const sourceVideoPreviewPath = computed(() => sourceVideoAsset.value?.path || '');
const hasSourceVideo = computed(() => Boolean(sourceVideoPreviewPath.value || currentState.value.uploadKeys[0]));
const promptExpanded = ref(false);
const promptOptimizing = ref(false);
const promptOptimizeEnabled = computed(() => configStore.features.promptOptimize !== false);
const selectedSizeMode = ref<SizeMode>('ratio');
const selectedRatio = ref('9:16');
const selectedDuration = ref('5s');
const selectedResolution = ref('720p');
const selectedAudioMode = ref('silent');
const preserveAudio = ref(true);
const advancedExpanded = ref(false);
const advancedSeed = ref('');
const advancedFps = ref('');
const advancedAudioUrl = ref('');
const isSubmitting = ref(false);
let draftTimer: ReturnType<typeof setTimeout> | null = null;
const models = ref<Record<string, unknown>[]>([]);
const selectedModelIndex = ref(1);
const modelTiersLoading = ref(false);
const modelTiersLoaded = ref(false);
let videoModelRequestToken = 0;
const MODEL_CACHE_TTL_MS = 5 * 60_000;
const MODEL_PERSISTENT_CACHE_TTL_MS = 24 * 60 * 60_000;
const TEMPLATE_CACHE_TTL_MS = 60_000;
const videoModelCache = new Map<string, { list: Record<string, unknown>[]; loadedAt: number }>();
const videoTemplateCache = new Map<string, { list: CreativeTemplate[]; loadedAt: number }>();
const videoTemplatePromises = new Map<string, Promise<CreativeTemplate[]>>();
const DEFAULT_MAX_REFERENCE_IMAGES = 4;
const videoRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];

const fallbackCapabilities: ModelCapabilities = {
  ratios: videoRatios,
  qualities: ['720p', '1080p'],
  durations: [...DEFAULT_DURATIONS],
  supportedSizeModes: ['ratio'],
  nativeSizes: ['auto'],
  defaultRatio: '9:16',
  maxReferenceImages: DEFAULT_MAX_REFERENCE_IMAGES,
  inputMediaTypes: ['image'],
  maxVideoUrls: 0,
  maxAudioUrls: 0,
  inputMode: 'first_frame',
  minReferenceImages: 0,
  referenceUploadMode: 'first_frame',
  requiredReference: false,
  advancedParams: [],
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

const promptGuideKey = computed<PromptGuideModeKey>(() => {
  if (videoMode.value === '文生视频') return 'ai_video.text2video';
  if (videoMode.value === '参考生视频') return 'ai_video.reference';
  if (videoMode.value === '首尾帧') return 'ai_video.first_last_frame';
  if (videoMode.value === '视频编辑') return 'ai_video.edit';
  return 'ai_video.img2video';
});
const defaultPromptPlaceholder = computed(() => {
  if (videoMode.value === '视频编辑') return '描述你想如何编辑源视频，例如裁剪节奏、换场景或增强画质';
  if (videoMode.value === '参考生视频') return '描述多张参考图希望如何融合，包含主体、动作、镜头和风格';
  if (videoMode.value === '首尾帧') return '描述从首帧过渡到尾帧的镜头运动、节奏和氛围';
  return '写点什么... 输入完成1秒后自动保存，最多2000字';
});
const currentPromptGuide = computed(() => getPromptGuide(configStore.publicConfig, promptGuideKey.value, defaultPromptPlaceholder.value));
const promptPlaceholder = computed(() => currentPromptGuide.value.placeholder);
const showPromptGuide = computed(() => hasPromptGuideDialog(currentPromptGuide.value));
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
    pricing: normalizePricing(item.pricing),
    capabilities: normalizeCapabilities(item.capabilities),
    isDefault: Boolean(item.isDefault)
  })).filter((item) => modelMatchesVideoMode(item.capabilities));
  if (source.length) return source;
  if (isDevFallbackEnabled && modelTiersLoaded.value) return fallbackModels.filter((item) => modelMatchesVideoMode(item.capabilities));
  return [];
});
const selectedModel = computed(() => modelOptions.value[selectedModelIndex.value] || modelOptions.value[0]);
const selectedModelName = computed(() => selectedModel.value?.tierName || '标准生视频');
const selectedModelDescription = computed(() => selectedModel.value?.description || '');
const selectedModelCost = computed(() => estimateSelectedModelCost(selectedModel.value));
const selectedModelCostLabel = computed(() => modelTiersLoading.value ? '加载中' : selectedModel.value ? `${selectedModelCost.value} 创作点` : '未配置');
const selectedCapabilities = computed(() => selectedModel.value?.capabilities || fallbackCapabilities);
const maxUploads = computed(() => normalizeMaxReferenceImages(selectedCapabilities.value.maxReferenceImages));
const maxVideoUrls = computed(() => normalizeMediaLimit(selectedCapabilities.value.maxVideoUrls));
const maxAudioUrls = computed(() => normalizeMediaLimit(selectedCapabilities.value.maxAudioUrls));
const minReferenceImages = computed(() => normalizeMinReferenceImages(selectedCapabilities.value.minReferenceImages));
const referenceUploadMode = computed(() => selectedCapabilities.value.referenceUploadMode || inferReferenceUploadMode(videoMode.value));
const isFirstFrameVideoMode = computed(() => videoMode.value === '图生视频');
const isReferenceVideoMode = computed(() => videoMode.value === '参考生视频');
const isMultiSourceVideoMode = computed(() => videoMode.value === '视频编辑' && maxVideoUrls.value > 1);
// Capability-driven media input: reference-video and video-edit models render
// exactly the media types declared by the bound upstream model. This avoids
// falling back to the legacy single-video form when an edit model accepts
// image/audio references in addition to source video.
const showDynamicMediaUpload = computed(() => isReferenceVideoMode.value || (videoMode.value === '视频编辑' && maxVideoUrls.value > 0));
const supportedInputMediaTypes = computed<InputMediaType[]>(() => normalizeInputMediaTypes(selectedCapabilities.value));
const mediaUploadCards = computed<MediaUploadCard[]>(() => supportedInputMediaTypes.value.map((mediaType) => {
  const count = countAssetsByMediaType(mediaType);
  const max = maxForMediaType(mediaType);
  return {
    mediaType,
    title: uploadTitleForMediaType(mediaType),
    countText: `${count}/${max}`,
    icon: uploadIconForMediaType(mediaType),
    full: max > 0 && count >= max,
  };
}).filter((card) => maxForMediaType(card.mediaType) > 0));
const visibleMediaUploadCards = computed<MediaUploadCard[]>(() => mediaUploadCards.value);
const visibleUploadedAssetCount = computed(() => {
  const mediaTypes = new Set(visibleMediaUploadCards.value.map((card) => card.mediaType));
  return assets.value.filter((asset) => mediaTypes.has(normalizeAssetMediaType(asset) as InputMediaType)).length;
});
const mediaUploadGridClass = computed(() => `cols-${Math.min(3, Math.max(1, visibleMediaUploadCards.value.length))}`);
const mediaUploadLayoutClass = computed(() => ({
  single: visibleMediaUploadCards.value.length === 1,
  pair: visibleMediaUploadCards.value.length === 2,
  triple: visibleMediaUploadCards.value.length >= 3,
}));
const mediaAssetLimit = computed(() => visibleMediaUploadCards.value.reduce((total, card) => total + maxForMediaType(card.mediaType), 0));
const mediaUploadTotalText = computed(() => `已添加 ${visibleUploadedAssetCount.value}/${mediaAssetLimit.value}`);
const referenceUploadFull = computed(() => uploadedAssetCount.value >= maxUploads.value);
const referenceUploadCountText = computed(() => `已上传 ${displayedUploadedAssetCount.value}/${maxUploads.value}`);
const referenceUploadTitle = computed(() => {
  if (referenceUploadFull.value) return '参考图已满';
  return uploadedAssetCount.value > 0 ? '继续上传参考图' : '上传参考图';
});
const referenceUploadDesc = computed(() => (
  referenceUploadFull.value
    ? '可在下方预览区替换或删除'
    : `上传生成视频参考画面，最多 ${maxUploads.value} 张`
));
const hasBoundModel = computed(() => Boolean(selectedModel.value));
const supportedRatios = computed(() => {
  const modelRatios = selectedCapabilities.value.ratios?.length ? selectedCapabilities.value.ratios : [];
  if (modelRatios.length) return uniqueStrings(modelRatios);
  return hasBoundModel.value ? [] : videoRatios;
});
const resolutionOptions = computed<string[]>(() => {
  const values = selectedCapabilities.value.qualities?.length ? selectedCapabilities.value.qualities : [];
  if (values.length) return uniqueStrings(values);
  return hasBoundModel.value ? [] : uniqueStrings(fallbackCapabilities.qualities || []);
});
const supportsAutoSize = computed(() => (selectedCapabilities.value.supportedSizeModes || ['ratio']).includes('auto'));
const selectedSizeKey = computed(() => selectedSizeMode.value === 'auto' ? 'auto' : selectedRatio.value);
const sizeOptions = computed<SizeOption[]>(() => {
  const options: SizeOption[] = [];
  if (supportsAutoSize.value) {
    options.push({ key: 'auto', label: '自动', desc: '模型推荐', mode: 'auto' });
  }
  supportedRatios.value.forEach((item) => {
    options.push({ key: item, label: ratioOptionLabel(item), desc: ratioOptionDesc(item), mode: 'ratio', ratio: item });
  });
  return options;
});
const durationOptions = computed<string[]>(() => {
  const values = selectedCapabilities.value.durations?.length ? selectedCapabilities.value.durations : [];
  if (values.length) return uniqueStrings(values);
  return hasBoundModel.value ? [] : uniqueStrings([...DEFAULT_DURATIONS]);
});
const resolutionLocked = computed(() => resolutionOptions.value.length <= 1);
const sizeLocked = computed(() => sizeOptions.value.length <= 1);
const durationLocked = computed(() => durationOptions.value.length <= 1);
const selectedDurationLabel = computed(() => durationOptions.value.length ? durationLabel(selectedDuration.value) : '模型默认');
const audioModeKeys = computed(() => {
  if (videoMode.value === '视频编辑') return [];
  return uniqueStrings((selectedCapabilities.value.audioModes || []).map(normalizeAudioMode).filter(Boolean));
});
const defaultAudioModeKey = computed(() => normalizeAudioMode(selectedCapabilities.value.defaultAudioMode || 'silent'));
const audioModeOptions = computed<AudioModeOption[]>(() => {
  const keys = audioModeKeys.value;
  const locked = keys.length <= 1;
  const defaultKey = defaultAudioModeKey.value;
  return keys.map((key) => ({
    key,
    label: audioModeLabel(key),
    desc: audioModeOptionDesc(key, locked, defaultKey)
  }));
});
const shouldShowAudioMode = computed(() => audioModeKeys.value.length > 0);
const audioModeLocked = computed(() => audioModeKeys.value.length <= 1);
const selectedAudioModeLabel = computed(() => audioModeLabel(selectedAudioMode.value));
const advancedParamKeys = computed(() => normalizeVideoAdvancedParams(selectedCapabilities.value.advancedParams));
const shouldShowAdvancedParams = computed(() => hasVisibleVideoAdvancedParams(advancedParamKeys.value));
const supportsAdvancedParam = (key: VideoAdvancedParamKey) => advancedParamKeys.value.includes(key);
const hasAdvancedParams = computed(() => Object.keys(buildAdvancedVideoParams()).length > 0);
const advancedParamSummary = computed(() => hasAdvancedParams.value ? '已填写' : '可选');
const audioModeTip = computed(() => {
  if (!shouldShowAudioMode.value) return '';
  if (audioModeLocked.value) return `当前模型仅支持${selectedAudioModeLabel.value}`;
  const defaultLabel = audioModeKeys.value.includes(defaultAudioModeKey.value)
    ? audioModeLabel(defaultAudioModeKey.value)
    : audioModeLabel('silent');
  return `默认${defaultLabel}，当前选择${selectedAudioModeLabel.value}`;
});
const generationCostText = computed(() => modelTiersLoading.value
  ? `预计生成${selectedDurationLabel.value} · 入口档位加载中`
  : selectedModel.value
    ? `预计生成${selectedDurationLabel.value} · 消耗 ${selectedModelCost.value} 创作点`
    : `预计生成${selectedDurationLabel.value} · 请先配置入口档位`);

onLoad((query) => {
  restoreDraft();
  if (query?.prompt) prompt.value = decodeURIComponent(String(query.prompt));
});

onShow(() => {
  enableShareMenu();
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  authStore.hydrate();
  loadVideoModelsForMode();
  loadVideoTemplates();
});

onShareAppMessage(() => createShareMessage({
  title: 'AI 视频生成，让创意动起来',
  path: withQuery(PAGE_ROUTES.aiVideo, { mode: videoMode.value })
}));

onShareTimeline(() => createShareTimeline({
  title: 'AI 视频生成，让创意动起来',
  path: withQuery(PAGE_ROUTES.aiVideo, { mode: videoMode.value })
}));

watch(videoMode, () => {
  loadVideoModelsForMode();
  loadVideoTemplates();
  scheduleDraftSave();
});

watch(() => maxUploads.value, () => {
  trimCurrentAssetsToMaxUploads();
});

watch([
  () => maxVideoUrls.value,
  () => maxAudioUrls.value,
  () => supportedInputMediaTypes.value.join(','),
], () => {
  trimCurrentAssetsToMaxUploads();
});

watch([
  () => videoMode.value,
  () => selectedSizeMode.value,
  () => selectedRatio.value,
  () => selectedDuration.value,
  () => selectedResolution.value,
  () => selectedAudioMode.value,
  () => preserveAudio.value,
  () => advancedExpanded.value,
  () => advancedSeed.value,
  () => advancedFps.value,
  () => advancedAudioUrl.value,
  () => videoStates.文生视频.prompt,
  () => videoStates.图生视频.prompt,
  () => videoStates.参考生视频.prompt,
  () => videoStates.首尾帧.prompt,
  () => videoStates.视频编辑.prompt,
  () => videoStates.文生视频.form,
  () => videoStates.图生视频.form,
  () => videoStates.参考生视频.form,
  () => videoStates.首尾帧.form,
  () => videoStates.视频编辑.form,
], scheduleDraftSave, { deep: true });

function loadVideoModelsForMode() {
  const featureKey = videoFeatureKey();
  const configModels = configModelTiers(featureKey);
  if (configModels.length) {
    models.value = configModels;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
    videoModelCache.set(featureKey, { list: configModels, loadedAt: Date.now() });
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
    return;
  }
  const cached = videoModelCache.get(featureKey);
  if (cached && Date.now() - cached.loadedAt < MODEL_CACHE_TTL_MS) {
    models.value = cached.list;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
    return;
  }
  const requestToken = ++videoModelRequestToken;
  models.value = [];
  modelTiersLoading.value = true;
  modelTiersLoaded.value = false;
  selectedModelIndex.value = defaultModelIndex();
  normalizeVideoParams();
  getVideoModels(featureKey).then((res) => {
    if (requestToken !== videoModelRequestToken || featureKey !== videoFeatureKey()) return;
    const list = Array.isArray(res.list) ? res.list as Record<string, unknown>[] : [];
    if (!list.length && isDevFallbackEnabled) warnDevFallback('video-tiers', `GET /public/model-tiers?feature=${featureKey} returned empty list`);
    videoModelCache.set(featureKey, { list, loadedAt: Date.now() });
    writePersistentCache('ai_creator_video_models_' + featureKey, list);
    models.value = list;
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
  }).catch(() => {
    if (requestToken !== videoModelRequestToken || featureKey !== videoFeatureKey()) return;
    if (isDevFallbackEnabled) warnDevFallback('video-tiers', `GET /public/model-tiers?feature=${featureKey} failed`);
    models.value = [];
    selectedModelIndex.value = defaultModelIndex();
    normalizeVideoParams();
  }).finally(() => {
    if (requestToken !== videoModelRequestToken || featureKey !== videoFeatureKey()) return;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
  });
}

function selectVideoMode(value: string) {
  if (!videoModes.includes(value as VideoMode)) return;
  videoMode.value = value as VideoMode;
}

function loadVideoTemplates() {
  const feature = videoFeatureForMode();
  const cached = videoTemplateCache.get(feature);
  if (cached && Date.now() - cached.loadedAt < TEMPLATE_CACHE_TTL_MS) {
    backendVideoTemplates.value = cached.list;
    return;
  }
  let request = videoTemplatePromises.get(feature);
  if (!request) {
    request = getTemplates<{ list?: Record<string, unknown>[] }>({ templateType: 'video', targetFeature: feature, page: 1, pageSize: 24 })
      .then((res) => {
        const list = (Array.isArray(res.list) ? res.list : [])
          .map(normalizeCreativeTemplate)
          .filter((item): item is CreativeTemplate => Boolean(item));
        videoTemplateCache.set(feature, { list, loadedAt: Date.now() });
        return list;
      });
    videoTemplatePromises.set(feature, request);
    request.finally(() => {
      if (videoTemplatePromises.get(feature) === request) videoTemplatePromises.delete(feature);
    }).catch(() => undefined);
  }
  if (feature === videoFeatureForMode()) backendVideoTemplates.value = [];
  request
    .then((list) => {
      if (feature === videoFeatureForMode()) backendVideoTemplates.value = list;
    })
    .catch(() => {
      if (feature === videoFeatureForMode()) backendVideoTemplates.value = [];
      if (isDevFallbackEnabled) warnDevFallback('video-templates', 'GET /templates?templateType=video&targetFeature=... failed');
    });
}

function configModelTiers(featureKey: string) {
  const tiers = configStore.publicConfig?.modelTiers;
  if (!tiers || typeof tiers !== 'object') return [];
  const list = (tiers as Record<string, unknown>)[featureKey];
  return Array.isArray(list) ? list as Record<string, unknown>[] : [];
}

function openTemplate(item: CreativeTemplate) {
  previewTemplate.value = item;
}

async function useTemplate(item: CreativeTemplate) {
  if (item.canUse === false) {
    showMemberRequiredDialog({
      title: '开通会员使用模板',
      message: item.lockReason || '该模板需开通会员后使用。'
    });
    return;
  }
  const backendTemplateId = numericTemplateId(item.id);
  if (backendTemplateId) {
    try {
      await useContentTemplate(backendTemplateId);
    } catch {
      return;
    }
  }
  selectedTemplate.value = item.title;
  const targetMode: VideoMode = item.usageType === 'first_last_frame'
    ? '首尾帧'
    : item.usageType === 'reference'
      ? '参考生视频'
      : item.mode === 'img2video'
        ? '图生视频'
        : '文生视频';
  videoMode.value = targetMode;
  const targetState = videoStates[targetMode];
  selectedDuration.value = durationOptions.value.includes(item.duration || '') ? item.duration as string : selectedDuration.value;
  targetState.prompt = item.prompt;
  previewTemplate.value = null;
}

function normalizeCreativeTemplate(raw: Record<string, unknown>): CreativeTemplate | null {
  const id = String(raw.id || raw.templateId || '');
  const promptText = String(raw.prompt || raw.promptTemplate || '');
  if (!id || !promptText) return null;
  const targetFeature = normalizeTemplateFeature(raw.targetFeature || raw.target_feature || '');
  const usageType = String(raw.usageType || raw.usage_type || '');
  const displayConfig = normalizeDisplayConfig(raw.displayConfig || raw.display_config);
  const params = raw.paramsJson && typeof raw.paramsJson === 'object' ? raw.paramsJson as Record<string, unknown> : {};
  const tagsValue = raw.tagsJson || raw.tags;
  const tags = Array.isArray(tagsValue)
    ? tagsValue.map((item) => String(item)).filter(Boolean)
    : String(tagsValue || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  const duration = String(raw.duration || params.duration || params.durationSeconds || '');
  const coverUrl = normalizeBackendMediaUrl(raw.coverUrl || raw.cover_url);
  const previewUrl = normalizeBackendMediaUrl(raw.previewUrl || raw.preview_url);
  return {
    id,
    title: String(raw.title || raw.name || '视频模板'),
    tags,
    prompt: promptText,
    mediaType: 'video',
    coverUrl,
    mediaUrl: previewUrl,
    mode: videoTemplateMode(targetFeature, usageType),
    category: String(raw.category || raw.scene || raw.style || ''),
    duration: duration ? durationLabel(duration) : '',
    targetFeature,
    usageType,
    displayConfig,
    createdAt: String(raw.createdAt || raw.created_at || raw.updatedAt || raw.updated_at || ''),
    canUse: raw.canUse !== false,
    canSave: raw.canSave !== false && raw.canUse !== false,
    lockReason: String(raw.lockReason || '')
  };
}

function videoFeatureForMode() {
  if (videoMode.value === '图生视频') return 'image_to_video';
  if (videoMode.value === '参考生视频') return 'image_to_video';
  if (videoMode.value === '首尾帧') return 'first_last_frame_video';
  if (videoMode.value === '视频编辑') return 'video_edit';
  return 'text_to_video';
}

function numericTemplateId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function templateMatchesVideoFeature(item: CreativeTemplate, feature: string) {
  const config = item.displayConfig;
  if (config && typeof config === 'object' && config[feature]) return true;
  const targetFeature = normalizeTemplateFeature(item.targetFeature || '');
  if (targetFeature === feature) return true;
  if (targetFeature) return false;
  const usageFeature = videoFeatureFromUsage(item.usageType || '');
  if (usageFeature) return usageFeature === feature;
  if (item.mode === 'img2video') return feature === 'image_to_video';
  if (item.mode === 'text2video') return feature === 'text_to_video';
  return false;
}

function sortTemplatesForFeature(list: CreativeTemplate[], feature: string) {
  return [...list].sort((a, b) => {
    const aPin = templatePinMeta(a, feature);
    const bPin = templatePinMeta(b, feature);
    if (aPin.pinned !== bPin.pinned) return bPin.pinned - aPin.pinned;
    if (aPin.pinOrder !== bPin.pinOrder) return bPin.pinOrder - aPin.pinOrder;
    const createdDiff = templateCreatedValue(b) - templateCreatedValue(a);
    return createdDiff || numericTemplateId(b.id) - numericTemplateId(a.id);
  });
}

function templateCreatedValue(item: CreativeTemplate) {
  const time = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function templatePinMeta(item: CreativeTemplate, feature: string) {
  const config = item.displayConfig && typeof item.displayConfig === 'object'
    ? item.displayConfig[feature] as Record<string, unknown> | undefined
    : undefined;
  return {
    pinned: config?.pinned ? 1 : 0,
    pinOrder: Number(config?.pinOrder || 0)
  };
}

function videoTemplateMode(targetFeature: string, usageType = '') {
  if (/reference|first_last_frame/i.test(usageType)) return 'img2video';
  if (/image_to_video|first_last_frame/i.test(targetFeature)) return 'img2video';
  return 'text2video';
}

function videoFeatureFromUsage(value: string) {
  if (value === 'reference') return 'image_to_video';
  if (value === 'first_last_frame') return 'first_last_frame_video';
  if (value === 'video_edit') return 'video_edit';
  if (value === 'generate') return 'text_to_video';
  return '';
}

function normalizeTemplateFeature(value: unknown) {
  const text = String(value || '').trim();
  if (text === 'video_create') return 'text_to_video';
  return text;
}

function normalizeDisplayConfig(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function pickAsset(type: string) {
  if (type === 'source_video') {
    chooseAndSetVideo();
    return;
  }
  chooseAndSetImage(type);
}

function handleFirstFrameSourceTap() {
  if (hasFirstFrameImage.value) {
    replaceAsset(0);
    return;
  }
  pickAsset('product');
}

function pickReferenceAsset() {
  openMediaAction('image');
}

function openMediaAction(mediaType: InputMediaType, replaceIndex?: number) {
  const count = countAssetsByMediaType(mediaType);
  const max = maxForMediaType(mediaType);
  if (typeof replaceIndex !== 'number' && max > 0 && count >= max) {
    uni.showToast({ title: `${uploadTitleForMediaType(mediaType)}已达上限`, icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: ['本地上传', '粘贴链接'],
    success: (res) => {
      if (res.tapIndex === 0) chooseAndSetMedia(mediaType, replaceIndex);
      if (res.tapIndex === 1) pasteMediaUrl(mediaType, replaceIndex);
    },
  });
}

function chooseAndSetMedia(mediaType: InputMediaType, replaceIndex?: number) {
  if (mediaType === 'image') {
    chooseAndSetReferenceImage(replaceIndex);
    return;
  }
  if (mediaType === 'video') {
    chooseAndSetReferenceVideo(replaceIndex);
    return;
  }
  chooseAndSetAudio(replaceIndex);
}

function handleSourceVideoTap() {
  if (hasSourceVideo.value) {
    replaceAsset(0);
    return;
  }
  pickAsset('source_video');
}

function replaceAsset(slotIndex: number) {
  const current = assets.value[slotIndex];
  if (isReferenceVideoMode.value || isMultiSourceVideoMode.value) {
    const mediaType = normalizeAssetMediaType(current) || 'image';
    openMediaAction(mediaType, slotIndex);
    return;
  }
  if (videoMode.value === '视频编辑') {
    chooseAndSetVideo();
    return;
  }
  chooseAndSetImage(current?.type || frameTypeBySlot(slotIndex) || defaultUploadAssetType(slotIndex), slotIndex);
}

function chooseAndSetReferenceImage(replaceIndex?: number) {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'reference', typeLabel: '图片', mediaType: 'image', sourceType: 'upload' };
      const assetIndex = setMediaAsset(asset, replaceIndex);
      if (assetIndex < 0) return;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
        applyUploadedMeta(assetIndex, uploaded);
      } catch {
        uni.showToast({ title: '图片上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function chooseAndSetReferenceVideo(replaceIndex?: number) {
  uni.chooseVideo({
    sourceType: ['album', 'camera'],
    compressed: false,
    success: async (res) => {
      const path = res.tempFilePath;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'reference_video', typeLabel: '视频', mediaType: 'video', sourceType: 'upload' };
      const assetIndex = setMediaAsset(asset, replaceIndex);
      if (assetIndex < 0) return;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_video', 'public');
        applyUploadedMeta(assetIndex, uploaded);
      } catch {
        uni.showToast({ title: '视频上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function chooseAndSetAudio(replaceIndex?: number) {
  const chooseFile = (uni as unknown as {
    chooseMessageFile?: (options: Record<string, unknown>) => void;
  }).chooseMessageFile;
  if (!chooseFile) {
    uni.showToast({ title: '当前环境不支持选择音频文件', icon: 'none' });
    return;
  }
  chooseFile({
    count: 1,
    type: 'file',
    extension: ['mp3', 'wav', 'm4a', 'aac', 'ogg'],
    success: async (res: any) => {
      const file = Array.isArray(res.tempFiles) ? res.tempFiles[0] : null;
      const path = file?.path || file?.tempFilePath;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'reference_audio', typeLabel: '音频', mediaType: 'audio', sourceType: 'upload' };
      const assetIndex = setMediaAsset(asset, replaceIndex);
      if (assetIndex < 0) return;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_audio', 'public');
        applyUploadedMeta(assetIndex, uploaded);
      } catch {
        uni.showToast({ title: '音频上传失败，请重试', icon: 'none' });
      }
    },
  });
}

function pasteMediaUrl(mediaType: InputMediaType, replaceIndex?: number) {
  (uni as unknown as {
    showModal: (options: Record<string, unknown>) => void;
  }).showModal({
    title: `粘贴${uploadTitleForMediaType(mediaType)}链接`,
    editable: true,
    placeholderText: 'https://example.com/file',
    success: (res: any) => {
      if (!res.confirm) return;
      const url = String(res.content || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        uni.showToast({ title: '链接必须以 http 或 https 开头', icon: 'none' });
        return;
      }
      const asset: LegacyAsset = {
        path: url,
        url,
        type: mediaType === 'image' ? 'reference' : mediaType === 'video' ? 'reference_video' : 'reference_audio',
        typeLabel: mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频',
        mediaType,
        sourceType: 'url',
      };
      setMediaAsset(asset, replaceIndex);
    },
  });
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
      } else {
        assetIndex = nextAvailableAssetSlot(state, type);
        if (assetIndex >= 0) {
          state.assets[assetIndex] = asset;
        } else {
          uni.showToast({ title: `最多上传${maxUploads.value}张素材`, icon: 'none' });
          return;
        }
      }
      state.uploadKeys[assetIndex] = undefined;
      state.fileIds[assetIndex] = undefined;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
        const fileId = extractFileId(uploaded);
        const key = isFrameUploadType(type) ? (fileId || uploaded.fileNo || uploaded.url) : (uploaded.fileNo || fileId || uploaded.url);
        state.uploadKeys[assetIndex] = key;
        state.fileIds[assetIndex] = fileId;
      } catch {
        // 上传失败时仍保留本地预览，方便用户继续调整。
        uni.showToast({ title: '素材上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function chooseAndSetVideo() {
  if (isMultiSourceVideoMode.value) {
    chooseAndSetReferenceVideo();
    return;
  }
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
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_video', 'public');
        const fileId = extractFileId(uploaded);
        state.fileIds[0] = fileId;
        state.uploadKeys[0] = fileId || uploaded.fileNo || uploaded.url;
      } catch {
        // 上传失败时仍保留本地预览，方便用户继续调整。
        uni.showToast({ title: '视频上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function setMediaAsset(asset: LegacyAsset, replaceIndex?: number) {
  const mediaType = normalizeAssetMediaType(asset);
  const state = currentState.value;
  const isReplace = typeof replaceIndex === 'number';
  if (!isReplace && mediaType && countAssetsByMediaType(mediaType) >= maxForMediaType(mediaType)) {
    uni.showToast({ title: `${uploadTitleForMediaType(mediaType)}已达上限`, icon: 'none' });
    return -1;
  }
  const index = isReplace ? replaceIndex : nextAvailableMixedAssetSlot(state);
  state.assets[index] = asset;
  state.uploadKeys[index] = asset.url || undefined;
  state.fileIds[index] = undefined;
  return index;
}

function applyUploadedMeta(assetIndex: number, uploaded: Record<string, unknown>) {
  const fileId = extractFileId(uploaded);
  const fileNo = extractFileNo(uploaded);
  const key = fileNo || fileId || uploaded.url;
  const state = currentState.value;
  const asset = state.assets[assetIndex];
  state.fileIds[assetIndex] = fileId;
  state.uploadKeys[assetIndex] = key;
  if (asset) {
    asset.uploadKey = key;
    asset.fileId = fileId;
    asset.fileNo = fileNo;
    asset.url = String(uploaded.url || uploaded.deliveryUrl || uploaded.publicUrl || asset.url || asset.path || '');
  }
}

function removeAsset(slotIndex: number) {
  const state = currentState.value;
  if (isReferenceVideoMode.value || isMultiSourceVideoMode.value) {
    state.assets.splice(slotIndex, 1);
    state.uploadKeys.splice(slotIndex, 1);
    state.fileIds.splice(slotIndex, 1);
    return;
  }
  if (videoMode.value === '图生视频' || videoMode.value === '首尾帧' || videoMode.value === '视频编辑') {
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

function openPromptGuide() {
  const guide = currentPromptGuide.value;
  if (!hasPromptGuideDialog(guide)) return;
  showAppDialog({
    variant: 'generic',
    title: guide.title,
    subtitle: guide.subtitle,
    hideVisual: true,
    richContent: guide.contentHtml || undefined,
    content: guide.contentHtml ? undefined : guide.copyText,
    primaryLabel: '我知道了',
    secondaryLabel: '查看完整帮助',
    minorLabel: guide.copyText ? guide.copyLabel : undefined,
    closeOnMinor: false,
    onMinor: () => {
      if (!guide.copyText) return false;
      uni.setClipboardData({ data: guide.copyText, success: () => uni.showToast({ title: '已复制示例', icon: 'success' }) });
      return false;
    },
    onSecondary: () => {
      const helpId = guide.helpId ? `&helpId=${encodeURIComponent(guide.helpId)}` : '';
      uni.navigateTo({ url: `/pages/agreement/index?type=help${helpId}` });
    }
  });
}

function pastePrompt() {
  uni.getClipboardData({ success: (res) => { prompt.value = res.data || prompt.value; } });
}

function selectAllPrompt() {
  uni.setClipboardData({ data: prompt.value, success: () => uni.showToast({ title: '已复制全部提示词', icon: 'none' }) });
}

async function optimizePrompt() {
  if (promptOptimizing.value) return;
  if (!promptOptimizeEnabled.value) {
    uni.showToast({ title: '智能优化功能已关闭', icon: 'none' });
    return;
  }
  if (!assertPrompt(prompt.value)) return;
  promptOptimizing.value = true;
  try {
    const result = await optimizeVideoPrompt<Record<string, unknown>>({
    featureKey: videoFeatureKey(),
    prompt: prompt.value,
    ratio: videoMode.value !== '视频编辑' && sizeOptions.value.length > 0 && selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined,
    duration: durationOptions.value.length > 0 ? selectedDuration.value : undefined,
    resolution: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    usage: 'deep_completion',
    context: {
      feature: 'video',
      mode: videoMode.value,
      referenceMode: referenceUploadMode.value,
      scene: form.value.scene,
      brand: form.value.brand,
      sellingPoint: form.value.sellingPoint,
      sizeMode: selectedSizeMode.value,
      ratio: selectedRatio.value,
      duration: selectedDuration.value,
      resolution: selectedResolution.value,
      audioMode: selectedAudioMode.value,
      preserveAudio: preserveAudio.value,
      hasFirstFrame: hasFirstFrameImage.value,
      hasLastFrame: videoMode.value === '首尾帧' && Boolean(currentState.value.assets[1] || currentState.value.uploadKeys[1]),
      hasSourceVideo: hasSourceVideo.value,
      inputAssets: buildInputAssets(currentState.value),
      tierName: selectedModelName.value,
      tierDescription: selectedModelDescription.value,
    },
  });
    prompt.value = String(result.optimizedPrompt || result.optimized_prompt || prompt.value);
  } finally {
    promptOptimizing.value = false;
  }
}

async function submit() {
  if (isSubmitting.value) return;
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后提交视频任务',
      subtitle: '登录并授权手机号后，可提交生成任务并同步作品。'
    });
    if (!loggedIn) return;
  }
  if (!assertPrompt(prompt.value)) return;
  if (modelTiersLoading.value) {
    uni.showToast({ title: '入口档位加载中，请稍后再生成', icon: 'none' });
    return;
  }
  if (!selectedModel.value) {
    uni.showToast({ title: '请先在后台配置可用入口档位', icon: 'none' });
    return;
  }
  const state = currentState.value;
  const requiredImageCount = Math.max(
    videoMode.value === '图生视频' ? 1 : 0,
    videoMode.value === '参考生视频' ? Math.max(1, minReferenceImages.value) : 0,
  );
  const uploadedImageCount = countFilledAssetsByMediaType(state, 'image');
  const uploadedImageKeys = countUploadedKeysByMediaType(state, 'image');
  if ((videoMode.value === '图生视频' || videoMode.value === '参考生视频') && uploadedImageCount < requiredImageCount) {
    uni.showToast({ title: videoMode.value === '参考生视频' ? `请至少上传 ${requiredImageCount} 张参考图` : '请先上传首图', icon: 'none' });
    return;
  }
  if ((videoMode.value === '图生视频' || videoMode.value === '参考生视频') && uploadedImageKeys < requiredImageCount) {
    uni.showToast({ title: '素材未上传成功，请重新上传', icon: 'none' });
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
  const firstVideoAsset = state.assets.find((asset) => normalizeAssetMediaType(asset) === 'video');
  const firstVideoHasReference = Boolean(videoFileId || firstVideoAsset?.url || state.uploadKeys[0]);
  if (videoMode.value === '视频编辑' && (!isMultiSourceVideoMode.value ? !videoFileId : !firstVideoHasReference)) {
    uni.showToast({ title: '源视频未拿到文件ID，请重新上传', icon: 'none' });
    return;
  }
  const subType = videoSubType();
  const featureKey = videoFeatureKey();
  const inputAssets = buildInputAssets(state);
  const audioMode = shouldShowAudioMode.value ? selectedAudioMode.value : undefined;
  const advancedParams = buildAdvancedVideoParams();
  const params = {
    resolution: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    preserveAudio: videoMode.value === '视频编辑' ? preserveAudio.value : undefined,
    videoFileId,
    audioMode,
    referenceMode: referenceUploadMode.value,
    inputAssets,
    ...advancedParams
  };
  isSubmitting.value = true;
  try {
  const result = await createVideoTask<Record<string, unknown>>({
    featureKey,
    subType,
    videoMode: subType,
    referenceMode: referenceUploadMode.value,
    prompt: buildFinalPrompt(prompt.value, state.form),
    tierKey: selectedModel.value.tierKey,
    firstFrameFileId,
    lastFrameFileId,
    videoFileId,
    ...(videoMode.value !== '视频编辑' ? {
      sizeMode: selectedSizeMode.value,
      ratio: sizeOptions.value.length > 0 && selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined
    } : {}),
    duration: durationOptions.value.length > 0 ? selectedDuration.value : undefined,
    audioMode,
    style: state.form.scene,
    quality: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    ...advancedParams,
    autoScript: true,
    formData: { ...state.form },
    params,
    // 图生/参考生视频以 inputAssets 作为唯一素材来源，避免与旧 uploadKeys
    // 同时提交后被后端重复计数；首尾帧仍由专用 fileId 字段提交。
    uploadKeys: subType === 'image_to_video' ? [] : buildLegacyImageUploadKeys(state)
  });
  const id = Number(result.id || result.taskId);
  if (!Number.isInteger(id) || id <= 0) {
    uni.showToast({ title: '任务提交失败，请稍后重试', icon: 'none' });
    return;
  }
  cacheResultMeta(id, {
    subType,
    videoMode: subType,
    videoModeLabel: videoMode.value,
    ratio: videoMode.value !== '视频编辑' ? selectedRatio.value : undefined,
    duration: durationOptions.value.length > 0 ? selectedDuration.value : undefined,
    resolution: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    audioMode,
    firstFrameFileId,
    lastFrameFileId,
    videoFileId,
    inputAssets,
    params
  });
  clearDraft();
  uni.redirectTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=video` });
  } catch {
    // 请求层已展示错误提示，这里只避免页面产生未处理异常。
  } finally {
    isSubmitting.value = false;
  }
}

function selectModel(index: number) {
  selectedModelIndex.value = index;
  const removedAssetCount = normalizeVideoParams();
  if (removedAssetCount > 0) {
    uni.showToast({ title: `已按当前档位移除 ${removedAssetCount} 个不兼容素材`, icon: 'none' });
  }
}

function middleModelIndex() {
  return Math.min(1, Math.max(0, modelOptions.value.length - 1));
}

function defaultModelIndex() {
  const index = modelOptions.value.findIndex((item) => item.isDefault);
  return index >= 0 ? index : middleModelIndex();
}

function selectSizeOption(item: SizeOption) {
  if (sizeLocked.value) return;
  selectedSizeMode.value = item.mode;
  if (item.ratio) selectedRatio.value = item.ratio;
}

function selectResolution(value: string) {
  if (resolutionLocked.value) return;
  selectedResolution.value = value;
}

function selectDuration(value: string) {
  if (durationLocked.value) return;
  selectedDuration.value = value;
}

function selectAudioMode(value: string) {
  if (audioModeLocked.value || !audioModeKeys.value.includes(value)) return;
  selectedAudioMode.value = value;
}

function normalizeVideoParams() {
  const caps = selectedCapabilities.value;
  const modes = caps.supportedSizeModes?.length ? caps.supportedSizeModes : ['ratio'];
  if (selectedSizeMode.value === 'auto' && !modes.includes('auto')) {
    selectedSizeMode.value = 'ratio';
  }
  if (selectedSizeMode.value !== 'auto' && supportedRatios.value.length > 0 && !supportedRatios.value.includes(selectedRatio.value)) {
    selectedRatio.value = caps.defaultRatio && supportedRatios.value.includes(caps.defaultRatio) ? caps.defaultRatio : supportedRatios.value[0];
  }
  if (durationOptions.value.length > 0 && !durationOptions.value.includes(selectedDuration.value)) {
    selectedDuration.value = durationOptions.value[0];
  }
  if (resolutionOptions.value.length > 0 && !resolutionOptions.value.includes(selectedResolution.value)) {
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
  return trimCurrentAssetsToMaxUploads();
}

function trimCurrentAssetsToMaxUploads() {
  if (!showDynamicMediaUpload.value || !selectedModel.value) return 0;
  const state = currentState.value;
  const supportedMediaTypes = isMultiSourceVideoMode.value
    ? (['video'] as InputMediaType[])
    : supportedInputMediaTypes.value;
  const hasOnlyImageAssets = state.assets.every((asset) => !asset || normalizeAssetMediaType(asset) === 'image');

  if (supportedMediaTypes.length === 1 && supportedMediaTypes[0] === 'image' && hasOnlyImageAssets) {
    const removedAssetCount = state.assets.slice(maxUploads.value).filter(Boolean).length;
    state.assets.splice(maxUploads.value);
    state.uploadKeys.splice(maxUploads.value);
    state.fileIds.splice(maxUploads.value);
    return removedAssetCount;
  }

  const counts: Record<InputMediaType, number> = { image: 0, video: 0, audio: 0 };
  const removalIndexes: number[] = [];
  for (let index = 0; index < state.assets.length; index += 1) {
    const mediaType = normalizeAssetMediaType(state.assets[index]);
    if (!mediaType) continue;
    if (!supportedMediaTypes.includes(mediaType) || counts[mediaType] >= maxForMediaType(mediaType)) {
      removalIndexes.push(index);
      continue;
    }
    counts[mediaType] += 1;
  }
  for (let index = removalIndexes.length - 1; index >= 0; index -= 1) {
    const removalIndex = removalIndexes[index];
    state.assets.splice(removalIndex, 1);
    state.uploadKeys.splice(removalIndex, 1);
    state.fileIds.splice(removalIndex, 1);
  }
  return removalIndexes.length;
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

function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 500);
}

function saveDraft() {
  const draft = {
    videoMode: videoMode.value,
    selectedSizeMode: selectedSizeMode.value,
    selectedRatio: selectedRatio.value,
    selectedDuration: selectedDuration.value,
    selectedResolution: selectedResolution.value,
    selectedAudioMode: selectedAudioMode.value,
    preserveAudio: preserveAudio.value,
    advancedExpanded: advancedExpanded.value,
    advancedSeed: advancedSeed.value,
    advancedFps: advancedFps.value,
    advancedAudioUrl: advancedAudioUrl.value,
    states: Object.fromEntries(Object.entries(videoStates).map(([key, state]) => [key, {
      prompt: state.prompt,
      form: { ...state.form },
    }])),
  };
  uni.setStorageSync(VIDEO_DRAFT_KEY, draft);
}

function restoreDraft() {
  const draft = uni.getStorageSync(VIDEO_DRAFT_KEY) as any;
  if (!draft || typeof draft !== 'object') return;
  const restoredMode = normalizeVideoModeKey(draft.videoMode);
  if (restoredMode) videoMode.value = restoredMode;
  selectedSizeMode.value = draft.selectedSizeMode || selectedSizeMode.value;
  selectedRatio.value = draft.selectedRatio || selectedRatio.value;
  selectedDuration.value = draft.selectedDuration || selectedDuration.value;
  selectedResolution.value = draft.selectedResolution || selectedResolution.value;
  selectedAudioMode.value = draft.selectedAudioMode || selectedAudioMode.value;
  preserveAudio.value = draft.preserveAudio !== false;
  advancedExpanded.value = Boolean(draft.advancedExpanded);
  advancedSeed.value = String(draft.advancedSeed || '');
  advancedFps.value = String(draft.advancedFps || '');
  advancedAudioUrl.value = String(draft.advancedAudioUrl || '');
  Object.entries(draft.states || {}).forEach(([key, value]) => {
    const modeKey = normalizeVideoModeKey(key);
    if (!modeKey) return;
    const item = value as any;
    videoStates[modeKey].prompt = String(item.prompt || '');
    videoStates[modeKey].form = { ...videoStates[modeKey].form, ...(item.form || {}) };
  });
}

function normalizeVideoModeKey(value: unknown): VideoMode | '' {
  if (value === '首图视频') return '图生视频';
  return videoModes.includes(value as VideoMode) ? value as VideoMode : '';
}

function shortTierName(value: unknown) {
  return String(value || '').slice(0, 5);
}

function clearDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  uni.removeStorageSync(VIDEO_DRAFT_KEY);
}

function normalizeCapabilities(value: unknown): ModelCapabilities {
  const caps = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ratios: stringArray(caps.ratios, fallbackCapabilities.ratios),
    qualities: stringArray(caps.qualities, fallbackCapabilities.qualities),
    durations: stringArray(caps.durations, fallbackCapabilities.durations || []),
    audioModes: stringArray(caps.audioModes || caps.audio_modes, []),
    inputMediaTypes: normalizeInputMediaTypes(caps),
    maxVideoUrls: normalizeMediaLimit(caps.maxVideoUrls ?? caps.max_video_urls),
    maxAudioUrls: normalizeMediaLimit(caps.maxAudioUrls ?? caps.max_audio_urls),
    supportedSizeModes: stringArray(caps.supportedSizeModes, fallbackCapabilities.supportedSizeModes),
    nativeSizes: stringArray(caps.nativeSizes, fallbackCapabilities.nativeSizes),
    defaultRatio: String(caps.defaultRatio || fallbackCapabilities.defaultRatio || '9:16'),
    defaultAudioMode: String(caps.defaultAudioMode || caps.default_audio_mode || 'silent'),
    maxReferenceImages: normalizeMaxReferenceImages(caps.maxReferenceImages),
    maxDurationSeconds: Number(caps.maxDurationSeconds || fallbackCapabilities.maxDurationSeconds || 0),
    inputMode: String(caps.inputMode || fallbackCapabilities.inputMode || 'first_frame'),
    minReferenceImages: normalizeMinReferenceImages(caps.minReferenceImages),
    referenceUploadMode: normalizeReferenceUploadMode(caps.referenceUploadMode || fallbackCapabilities.referenceUploadMode || 'first_frame'),
    requiredReference: Boolean(caps.requiredReference),
    advancedParams: normalizeVideoAdvancedParams(caps.advancedParams || caps.advanced_params),
  };
}

function normalizeInputMediaTypes(value: unknown): InputMediaType[] {
  const objectValue = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const source = Object.keys(objectValue).length
    ? (objectValue.inputMediaTypes || objectValue.input_media_types)
    : value;
  if (!Array.isArray(source)) {
    const uploadMode = String(objectValue.referenceUploadMode || objectValue.reference_upload_mode || objectValue.inputMode || objectValue.input_mode || '').trim();
    if (uploadMode === 'source_video') return ['video'];
    if (uploadMode && uploadMode !== 'none') return ['image'];
    return [];
  }
  const normalized = source.map((item) => String(item || '').trim().toLowerCase()).filter((item): item is InputMediaType => (
    item === 'image' || item === 'video' || item === 'audio'
  ));
  return uniqueStrings(normalized) as InputMediaType[];
}

function normalizeMediaLimit(value: unknown) {
  const count = Math.floor(Number(value || 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function maxForMediaType(mediaType: InputMediaType) {
  if (mediaType === 'image') return maxUploads.value;
  if (mediaType === 'video') return maxVideoUrls.value;
  return maxAudioUrls.value;
}

function countAssetsByMediaType(mediaType: InputMediaType) {
  return assets.value.filter((asset) => normalizeAssetMediaType(asset) === mediaType).length;
}

function normalizeAssetMediaType(asset?: LegacyAsset | null): InputMediaType | '' {
  if (!asset) return '';
  if (asset.mediaType === 'video' || asset.type === 'source_video') return 'video';
  if (asset.mediaType === 'audio' || asset.type === 'reference_audio') return 'audio';
  if (asset.mediaType === 'image' || !asset.mediaType) return 'image';
  return '';
}

function uploadTitleForMediaType(mediaType: InputMediaType) {
  if (mediaType === 'video') return '参考视频';
  if (mediaType === 'audio') return '参考音频';
  return '参考图片';
}

function uploadIconForMediaType(mediaType: InputMediaType) {
  return mediaType === 'video'
    ? '/static/icons/icon_upload_video_line.svg'
    : '/static/icons/icon_upload_image_line.svg';
}

function normalizePricing(value: unknown): TierPricing | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const mode = String(source.mode || 'fixed') as TierPricingMode;
  return {
    mode: ['fixed', 'matrix', 'per_second_matrix', 'token_preauth'].includes(mode) ? mode : 'fixed',
    unit: 'points',
    defaultParams: source.defaultParams && typeof source.defaultParams === 'object' ? source.defaultParams as Record<string, unknown> : {},
    rules: Array.isArray(source.rules) ? source.rules as TierPricingRule[] : [],
    defaultPointsCost: numberOrUndefined(source.defaultPointsCost),
    defaultUnitPoints: numberOrUndefined(source.defaultUnitPoints),
    preauthPoints: numberOrUndefined(source.preauthPoints),
    memberDiscountPercent: numberOrUndefined(source.memberDiscountPercent),
    memberDiscountApplied: Boolean(source.memberDiscountApplied),
  };
}

function estimateSelectedModelCost(model?: ModelTier): number {
  if (!model) return 0;
  const pricing = model.pricing;
  if (!pricing || pricing.mode === 'fixed') return Math.max(0, Number(model.pointsCost || 0));
  const params = normalizePricingParams(mergePricingParams(pricing.defaultParams || {}, {
    duration: durationOptions.value.length > 0 ? selectedDuration.value : undefined,
    quality: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    resolution: resolutionOptions.value.length > 0 ? selectedResolution.value : undefined,
    audioMode: shouldShowAudioMode.value ? selectedAudioMode.value : undefined,
  }));
  const rule = findPricingRule(pricing.rules || [], params);
  const discountPercent = Number(pricing.memberDiscountPercent ?? model.memberDiscountPercent ?? 100);
  if (pricing.mode === 'matrix') {
    const base = numberOrFallback(rule?.pointsCost ?? pricing.defaultPointsCost, model.basePointsCost || model.pointsCost || 0);
    return applyMemberDiscount(base, discountPercent);
  }
  if (pricing.mode === 'per_second_matrix') {
    const seconds = parseDurationSeconds(params.duration);
    const unit = numberOrFallback(rule?.unitPoints ?? pricing.defaultUnitPoints, 0);
    if (seconds > 0 && unit > 0) return applyMemberDiscount(seconds * unit, discountPercent);
    return Math.max(0, Number(model.pointsCost || 0));
  }
  if (pricing.mode === 'token_preauth') {
    const base = numberOrFallback(rule?.preauthPoints ?? pricing.preauthPoints, model.basePointsCost || model.pointsCost || 0);
    return applyMemberDiscount(base, discountPercent);
  }
  return Math.max(0, Number(model.pointsCost || 0));
}

function normalizePricingParams(params: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = normalizePricingValue(key, value);
  });
  if (!out.quality && out.resolution) out.quality = out.resolution;
  if (!out.resolution && out.quality) out.resolution = out.quality;
  if (!out.duration && out.durationSeconds) out.duration = `${parseDurationSeconds(out.durationSeconds)}s`;
  return out;
}

function mergePricingParams(defaultParams: Record<string, unknown>, params: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...(defaultParams || {}) };
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    merged[key] = value;
  });
  return merged;
}

function findPricingRule(rules: TierPricingRule[], params: Record<string, unknown>): TierPricingRule | null {
  let best: TierPricingRule | null = null;
  let bestScore = -1;
  for (const source of rules) {
    const conditions = normalizePricingParams(source.conditions || {});
    const entries = Object.entries(conditions);
    if (!entries.length) continue;
    const matched = entries.every(([key, value]) => normalizePricingValue(key, params[key]) === normalizePricingValue(key, value));
    if (matched && entries.length > bestScore) {
      best = source;
      bestScore = entries.length;
    }
  }
  return best;
}

function normalizePricingValue(key: string, value: unknown): unknown {
  if (key === 'duration' || key === 'durationRaw' || key === 'durationText') return `${parseDurationSeconds(value)}s`;
  if (key === 'durationSeconds') return parseDurationSeconds(value);
  if (key === 'audioMode') return normalizeAudioMode(String(value || ''));
  if (['quality', 'resolution', 'mode', 'generationMode', 'generation_mode', 'version'].includes(key)) return String(value || '').trim().toLowerCase();
  if (typeof value === 'string') return value.trim();
  return value;
}

function parseDurationSeconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
}

function numberOrUndefined(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : undefined;
}

function numberOrFallback(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.trunc(numberValue)) : Math.max(0, Math.trunc(Number(fallback) || 0));
}

function applyMemberDiscount(basePoints: number, discountPercent: number) {
  const base = Math.max(0, Math.trunc(Number(basePoints) || 0));
  if (base <= 0) return 0;
  const percent = Math.min(100, Math.max(1, Number(discountPercent) || 100));
  if (percent >= 100) return base;
  return Math.max(1, Math.round(base * percent / 100));
}

function normalizeMaxReferenceImages(value: unknown) {
  if (value === undefined || value === null || value === '') return DEFAULT_MAX_REFERENCE_IMAGES;
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 0 ? count : DEFAULT_MAX_REFERENCE_IMAGES;
}

function normalizeMinReferenceImages(value: unknown) {
  const count = Math.floor(Number(value || 0));
  return Number.isFinite(count) && count >= 0 ? count : 0;
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
  if (text.toLowerCase() === 'auto') return '自动';
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

function audioModeOptionDesc(value: string, locked = audioModeKeys.value.length <= 1, defaultKey = defaultAudioModeKey.value) {
  if (locked) return '当前模型仅支持';
  if (value === defaultKey) return '默认选项';
  return value === 'silent' ? '关闭声音' : '生成音频';
}

function modelMatchesVideoMode(caps: ModelCapabilities) {
  const uploadMode = normalizeReferenceUploadMode(caps.referenceUploadMode || caps.inputMode || inferReferenceUploadMode(videoMode.value));
  const maxReferenceImages = Number(caps.maxReferenceImages || 0);
  const maxVideoUrls = Number(caps.maxVideoUrls || 0);
  if (videoMode.value === '图生视频') return uploadMode === 'first_frame' && maxReferenceImages > 0;
  if (videoMode.value === '参考生视频') return uploadMode === 'reference_images' && maxReferenceImages > 0;
  if (videoMode.value === '首尾帧') return uploadMode === 'first_last' && maxReferenceImages >= 2;
  if (videoMode.value === '视频编辑') return uploadMode === 'source_video' && maxVideoUrls > 0;
  return true;
}

function normalizeReferenceUploadMode(value: unknown) {
  const text = String(value || '').trim().toLowerCase();
  if (['first_frame', 'single_image', 'image_to_video'].includes(text)) return 'first_frame';
  if (['first_last', 'first_last_frame', 'first_last_frame_video'].includes(text)) return 'first_last';
  if (['reference_images', 'reference', 'reference_to_video'].includes(text)) return 'reference_images';
  if (['source_video', 'video', 'video_edit'].includes(text)) return 'source_video';
  if (['none', 'text'].includes(text)) return 'none';
  return 'first_frame';
}

function inferReferenceUploadMode(mode: VideoMode) {
  if (mode === '图生视频') return 'first_frame';
  if (mode === '参考生视频') return 'reference_images';
  if (mode === '首尾帧') return 'first_last';
  if (mode === '视频编辑') return 'source_video';
  return 'none';
}

function ratioOptionLabel(value: string) {
  if (value === 'adaptive') return '跟随素材';
  if (value === 'auto') return '自动';
  return value;
}

function ratioOptionDesc(value: string) {
  if (value === 'adaptive') return '按素材比例生成';
  if (value === 'auto') return '模型自动选择';
  return '视频比例';
}

function defaultUploadAssetType(slotIndex = -1) {
  if (videoMode.value === '图生视频') return 'product';
  return 'reference';
}

function countFilledAssets(state: ModeState) {
  return state.assets.filter(Boolean).length;
}

function countUploadedKeys(state: ModeState) {
  return state.uploadKeys.filter((item) => item !== undefined && item !== null && item !== '').length;
}

function countFilledAssetsByMediaType(state: ModeState, mediaType: InputMediaType) {
  return state.assets.filter((asset) => normalizeAssetMediaType(asset) === mediaType).length;
}

function countUploadedKeysByMediaType(state: ModeState, mediaType: InputMediaType) {
  return state.uploadKeys.filter((item, index) => (
    item !== undefined && item !== null && item !== '' && normalizeAssetMediaType(state.assets[index]) === mediaType
  )).length;
}

function buildLegacyImageUploadKeys(state: ModeState) {
  return state.uploadKeys.filter((item, index) => (
    item !== undefined && item !== null && item !== '' && normalizeAssetMediaType(state.assets[index]) === 'image'
  ));
}

function imageTypeLabel(type: string) {
  if (type === 'product') return videoMode.value === '图生视频' ? '首图' : '主图';
  if (type === 'start_frame') return '开始帧';
  if (type === 'end_frame') return '结束帧';
  return '参考图';
}

function fixedAssetSlot(type: string) {
  if (type === 'product' && videoMode.value === '图生视频') return 0;
  if (type === 'start_frame') return 0;
  if (type === 'end_frame') return 1;
  if (type === 'source_video') return 0;
  return undefined;
}

function nextAvailableAssetSlot(state: ModeState, type: string) {
  for (let index = 0; index < maxUploads.value; index += 1) {
    if (!state.assets[index]) return index;
  }
  return -1;
}

function nextAvailableMixedAssetSlot(state: ModeState) {
  const emptyIndex = state.assets.findIndex((asset) => !asset);
  return emptyIndex >= 0 ? emptyIndex : state.assets.length;
}

function isFrameUploadType(type: string) {
  return type === 'start_frame' || type === 'end_frame';
}

function extractFileId(uploaded: Record<string, unknown>) {
  const value = uploaded.fileId || uploaded.id || uploaded.file_id;
  const fileId = Number(value);
  return Number.isFinite(fileId) && fileId > 0 ? fileId : undefined;
}

function extractFileNo(uploaded: Record<string, unknown>) {
  const value = String(uploaded.fileNo || uploaded.file_no || '').trim();
  return value || undefined;
}

function frameTypeBySlot(slotIndex: number) {
  if (videoMode.value !== '首尾帧') return '';
  return slotIndex === 0 ? 'start_frame' : 'end_frame';
}

function videoSubType(): VideoSubType {
  if (videoMode.value === '图生视频') return 'image_to_video';
  if (videoMode.value === '参考生视频') return 'image_to_video';
  if (videoMode.value === '首尾帧') return 'first_last_frame_video';
  if (videoMode.value === '视频编辑') return 'video_edit';
  return 'text_to_video';
}

function videoFeatureKey() {
  if (videoMode.value === '图生视频') return FEATURE_KEYS.imageToVideo;
  if (videoMode.value === '参考生视频') return FEATURE_KEYS.imageToVideo;
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
      url: asset.url,
      sourceType: asset.sourceType || (asset.url && !state.uploadKeys[index] ? 'url' : 'upload'),
      uploadKey: state.uploadKeys[index],
      fileId: state.fileIds[index],
      fileNo: asset.fileNo,
      mediaType: asset.mediaType
    });
    return items;
  }, []);
}

function buildAdvancedVideoParams() {
  return buildSupportedAdvancedVideoParams(advancedParamKeys.value, {
    seed: advancedSeed.value,
    fps: advancedFps.value,
    audioUrl: advancedAudioUrl.value,
  });
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

.single-image-source-card {
  margin-bottom: 24rpx;
}

.media-upload-card {
  padding: 24rpx 22rpx 22rpx;
}

.media-upload-card.single {
  margin-bottom: 0;
}

.media-upload-source-area {
  min-height: 420rpx;
}

.media-upload-source-area:active {
  border-color: rgba(122, 92, 255, 0.5);
  background: #f3f1ff;
}

.media-upload-source-area.full {
  border-style: solid;
  border-color: #dfe5ee;
  background: #f1f4f9;
  color: #91a3ad;
}

.media-upload-grid {
  display: grid;
  gap: 16rpx;
  margin-top: 22rpx;
}

.media-upload-grid.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.media-upload-grid.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.media-upload-frame-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 16rpx;
  color: #637083;
  text-align: center;
}

.media-upload-frame-slot:active {
  border-color: #8b7cff;
  background: #f3f1ff;
}

.media-upload-frame-slot.full {
  border-style: solid;
  border-color: #dfe5ee;
  background: #f1f4f9;
  color: #91a3ad;
}

.media-upload-grid.cols-3 .media-upload-frame-slot {
  padding: 16rpx 8rpx;
}

.media-upload-grid.cols-3 .upload-line-icon {
  width: 58rpx;
  height: 58rpx;
  margin-bottom: 12rpx;
  border-radius: 18rpx;
}

.media-upload-grid.cols-3 .line-icon-img {
  width: 36rpx;
  height: 36rpx;
}

.media-upload-grid.cols-3 .frame-empty-title {
  font-size: 24rpx;
}

.media-upload-grid.cols-3 .frame-empty-desc {
  margin-top: 8rpx;
  padding: 0;
  font-size: 19rpx;
}

.reference-video-upload-section {
  width: 100%;
}

.reference-image-source-card {
  margin-bottom: 16rpx;
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

.reference-image-source-area {
  min-height: 420rpx;
}

.reference-image-source-area:active {
  border-color: rgba(122, 92, 255, 0.5);
  background: #f3f1ff;
}

.reference-image-source-area.full {
  border-style: solid;
  border-color: #e2e8f0;
  background: #f8fbff;
}

.image-source-area.filled {
  background: #ffffff;
}

.image-source-preview {
  width: 100%;
  height: 420rpx;
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

.entry-tier-note {
  margin: -4rpx 0 14rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.4;
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

.tier-empty {
  margin-top: 14rpx;
  padding: 18rpx;
  border: 2rpx dashed #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
  color: #64748b;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.35;
  text-align: center;
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

.advanced-param-block {
  border-top: 1rpx solid #edf2f8;
  padding-top: 20rpx;
}

.advanced-param-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 74rpx;
}

.advanced-param-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.advanced-param-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.2;
}

.advanced-param-desc {
  margin-top: 6rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.2;
}

.advanced-param-state {
  flex-shrink: 0;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
}

.advanced-param-panel {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 12rpx;
}

.advanced-param-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 76rpx;
  padding: 0 18rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
}

.advanced-param-label {
  flex-shrink: 0;
  width: 128rpx;
  color: #172033;
  font-size: 23rpx;
  font-weight: 900;
}

.advanced-param-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  color: #172033;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 72rpx;
}

.advanced-param-placeholder {
  color: #9aa8b8;
  font-weight: 700;
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
