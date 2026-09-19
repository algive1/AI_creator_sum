<template>
  <view class="flow-page create-flow-page image-create-page">
    <view class="content">
      <LegacyTopTabs :model-value="imageType" :items="imageTypes" @select="selectImageType" />

      <TemplateStrip
        :templates="activeTemplates"
        @select="openTemplate"
      />

      <block v-if="imageType === '图生图'">
        <LegacyAssetUploadCard
          :types="uploadTypes"
          :uploaded-count="displayedUploadedAssetCount"
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
      <view v-else-if="imageType === '图片编辑'" class="image-edit-upload-section">
        <view class="card image-edit-upload-card">
          <view class="upload-head">
            <view class="section-title">上传待编辑图</view>
            <view class="image-edit-upload-status">
              <view class="upload-count">已上传 {{ displayedUploadedAssetCount }}/{{ maxUploads }}</view>
              <view v-if="hasEditImage" class="image-edit-upload-actions">
                <view v-if="canAddEditImage" class="image-edit-upload-action" @tap.stop="pickEditImage">继续上传</view>
                <view class="image-edit-upload-action" @tap.stop="replaceEditImage">替换</view>
                <view class="image-edit-upload-action danger" @tap.stop="removeEditImage">删除</view>
              </view>
            </view>
          </view>
          <view class="image-edit-upload-area" :class="{ filled: hasEditImage }" @tap="hasEditImage ? replaceEditImage() : pickEditImage()">
            <block v-if="editImagePreviewPath">
              <image class="image-edit-upload-preview" :src="editImagePreviewPath" mode="aspectFill" />
            </block>
            <block v-else>
              <view class="upload-line-icon image-edit-empty-icon">
                <image class="line-icon-img" src="/static/icons/icon_upload_image_line.svg" mode="aspectFit" />
                <text class="upload-line-plus">+</text>
              </view>
              <view class="image-edit-empty-title">上传待编辑图</view>
              <view class="image-edit-empty-desc">支持 JPG/PNG/WEBP，最多 {{ maxUploads }} 张，上传后可替换或删除</view>
            </block>
          </view>
        </view>
        <LegacyAssetStrip
          :assets="assets"
          :max="maxUploads"
          tip="预览图区域可继续添加、替换或删除"
          @replace="replaceAsset"
          @remove="removeAsset"
          @hint="pickEditImage"
        />
      </view>

      <LegacyPromptComposer
        v-model="prompt"
        :expanded="promptExpanded"
        :placeholder="promptPlaceholder"
        smart-label="✨ 智能补全"
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

      <view v-if="imageType !== '图片编辑'" class="card requirement-card">
        <view class="section-title">创作需求（可选）</view>
        <view class="requirement-list">
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_brand_line.svg" mode="aspectFit" /><text>品牌</text></view>
            <input class="requirement-input" v-model="form.brand" maxlength="20" placeholder="请输入品牌名称（如：极光科技）" placeholder-class="requirement-placeholder" />
            <text class="requirement-count">{{ form.brand.length }}/20</text>
          </view>
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_point_line.svg" mode="aspectFit" /><text>卖点</text></view>
            <input class="requirement-input" v-model="form.sellingPoint" maxlength="50" placeholder="请输入产品核心卖点，突出优势" placeholder-class="requirement-placeholder" />
            <text class="requirement-count">{{ form.sellingPoint.length }}/50</text>
          </view>
          <view class="requirement-row">
            <view class="requirement-label"><image class="requirement-icon" src="/static/icons/icon_requirement_scene_line.svg" mode="aspectFit" /><text>场景</text></view>
            <picker class="scene-picker" :range="sceneOptions" @change="selectScene">
              <view class="scene-picker-value">{{ form.scene || '请选择或输入目标使用场景' }}</view>
            </picker>
            <text class="requirement-count">›</text>
          </view>
        </view>
      </view>

      <view v-if="imageType === '图片编辑'" class="card edit-tool-card">
        <view class="section-title">一键编辑</view>
        <view class="edit-tool-grid">
          <button v-for="tool in editTools" :key="tool" class="edit-tool" :class="{ active: editTool === tool }" @tap="selectEditTool(tool)">{{ tool }}</button>
        </view>
      </view>

      <view class="card generation-param-card">
        <view class="section-title">生成参数</view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">比例</text>
            <text class="param-block-tip">{{ ratioLabel(selectedRatio) }}</text>
          </view>
          <view class="param-option-grid">
            <button
              v-for="item in visibleRatioOptions"
              :key="item.key"
              class="param-option"
              :class="{ active: selectedRatio === item.key }"
              @tap="selectRatioOption(item)"
            >
              <text class="param-option-title">{{ item.label }}</text>
            </button>
          </view>
          <button
            v-if="ratioOptionsCollapsible"
            class="ratio-toggle"
            @tap="toggleRatioOptionsExpanded"
          >
            {{ ratioOptionsExpanded ? '收起比例' : `展开全部 ${ratioOptions.length} 个比例` }}
          </button>
        </view>
        <view class="param-block">
          <view class="param-block-head">
            <text class="param-block-title">分辨率</text>
            <text class="param-block-tip">{{ selectedResolution.label }}</text>
          </view>
          <view class="param-option-grid quality-grid">
            <button
              v-for="item in resolutionOptions"
              :key="item.key"
              class="param-option quality-option"
              :class="{ active: selectedResolutionPreset === item.key }"
              @tap="selectResolutionOption(item)"
            >
              <text class="param-option-title">{{ item.label }}</text>
            </button>
          </view>
        </view>
        <view class="param-block">
          <view class="image-count-card">
            <view class="image-count-copy">
              <view class="image-count-title">生成数量</view>
              <view class="image-count-desc">{{ imageCountTip }}</view>
            </view>
            <view v-if="maxImageCount > 1" class="image-count-stepper">
              <button
                class="count-stepper-btn"
                :class="{ disabled: selectedImageCount <= 1 }"
                :disabled="selectedImageCount <= 1"
                @tap="decreaseImageCount"
              >-</button>
              <view class="count-stepper-value">
                <text class="count-stepper-number">{{ selectedImageCount }}</text>
                <text class="count-stepper-unit">张</text>
              </view>
              <button
                class="count-stepper-btn"
                :class="{ disabled: selectedImageCount >= maxImageCount }"
                :disabled="selectedImageCount >= maxImageCount"
                @tap="increaseImageCount"
              >+</button>
            </view>
            <view v-else class="image-count-fixed">
              <text class="count-stepper-number">1</text>
              <text class="count-stepper-unit">张</text>
            </view>
          </view>
          <view v-if="freeQuotaInfoVisible" class="free-quota-card" :class="freeQuotaInfoClass">
            <view class="free-quota-copy">
              <view class="free-quota-title">免费生图额度</view>
              <view class="free-quota-desc">{{ freeQuotaInfoText }}</view>
            </view>
            <view class="free-quota-badge">{{ freeQuotaBadgeText }}</view>
          </view>
        </view>
        <view v-if="shouldShowPlatformWatermarkCard" class="param-block">
          <view
            class="platform-watermark-card"
            :class="{ off: !platformWatermarkEnabled }"
            @tap="togglePlatformWatermark"
          >
            <view class="platform-watermark-copy">
              <view class="platform-watermark-title">平台水印</view>
              <view class="platform-watermark-desc">{{ platformWatermarkDesc }}</view>
            </view>
            <view class="enhance-switch" :class="{ active: platformWatermarkEnabled }">
              <text class="enhance-switch-knob"></text>
            </view>
          </view>
        </view>
        <view v-if="modelOptions.length > 1 || !modelTiersLoading && !modelOptions.length" class="param-block">
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
                <text v-if="modelTierHasDiscount(item)" class="tier-base-cost">{{ modelTierBaseCost(item) }}</text>
                {{ modelTierUnitCost(item) }} 创作点
              </text>
              <text v-if="item.memberDiscountApplied" class="tier-discount">{{ discountLabel(item.memberDiscountPercent) }}</text>
            </button>
          </view>
          <view v-if="!modelTiersLoading && !modelOptions.length" class="tier-empty">当前功能暂无可用入口档位</view>
        </view>
      </view>
    </view>

    <GenerationActions
      title="✦ 立即生成"
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
import { onLoad, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import LegacyTopTabs from '@/components/legacy/LegacyTopTabs.vue';
import LegacyPromptComposer from '@/components/legacy/LegacyPromptComposer.vue';
import LegacyAssetUploadCard from '@/components/legacy/LegacyAssetUploadCard.vue';
import LegacyAssetStrip, { type LegacyAsset } from '@/components/legacy/LegacyAssetStrip.vue';
import GenerationActions from '@/components/legacy/GenerationActions.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import TemplatePreviewSheet from '@/components/business/TemplatePreviewSheet.vue';
import TemplateStrip from '@/components/business/TemplateStrip.vue';
import { createImageTask, getImageModels, optimizeImagePrompt } from '@/api/ai-image';
import { confirmCompliance } from '@/api/config';
import { getMyFreeImageQuota, type FreeImageQuotaStatus } from '@/api/free-image-quota';
import { getTemplates, useTemplate as useContentTemplate } from '@/api/template';
import { updateMe } from '@/api/user';
import { uploadAsset } from '@/api/upload';
import { DEFAULT_RATIOS, FEATURE_KEYS, PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';
import { assertPrompt } from '@/utils/validator';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { discountLabel } from '@/utils/member';
import { normalizeBackendMediaUrl } from '@/utils/media-url';
import { getVisibleRatioOptions, shouldCollapseRatioOptions } from '@/utils/ratio-options';
import { normalizeTierPricing, resolveTierPriceEstimate, type TierPricing } from '@/utils/tier-pricing';
import { showAppDialog, showFreeQuotaInsufficientDialog, showMemberRequiredDialog } from '@/utils/app-dialog';
import {
  buildFreeImageQuotaCostText,
  canUseFreeImageQuotaForSelection,
  getFreeImageQuotaRemainingImages,
  isGptImage2FreeQuotaModel,
  isFreeImageQuotaTierAllowed,
  resolveFreeQuotaReductionCount
} from '@/utils/free-image-quota';
import { getPromptGuide, hasPromptGuideDialog, type PromptGuideModeKey } from '@/utils/prompt-guide';
import { createShareMessage, createShareTimeline, enableShareMenu, withQuery } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';
import { useUserStore } from '@/stores/user';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import {
  imageEditTemplates,
  imageToImageTemplates,
  sceneOptions,
  textImageTemplates,
  uploadTypes,
  type CreativeTemplate
} from '@/utils/mock';

type SizeMode = 'auto' | 'ratio' | 'custom_pixels';
type ImageMode = '文生图' | '图生图' | '图片编辑';
type FormState = { brand: string; sellingPoint: string; scene: string };
type ModeState = {
  prompt: string;
  form: FormState;
  assets: Array<LegacyAsset | null>;
  uploadKeys: unknown[];
  editTool: string;
};
type ModelCapabilities = {
  ratios?: string[];
  qualities?: string[];
  resolutionPresets?: string[];
  sizeOptions?: BackendSizeOption[];
  defaultSizeKey?: string;
  durations?: string[] | null;
  supportedSizeModes?: string[];
  nativeSizes?: string[];
  defaultRatio?: string;
  maxImages?: number;
  maxReferenceImages?: number;
};
type ModelTier = {
  tierKey: string;
  tierName: string;
  description: string;
  modelName: string;
  displayName: string;
  apiModelName: string;
  upstreamModelCode: string;
  providerType: string;
  freeImageQuotaModelEligible: boolean;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  pricing?: TierPricing | null;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};
type BackendSizeOption = {
  key: string;
  ratio: string;
  resolutionPreset: string;
  label: string;
  upstreamSize?: string;
  isAuto?: boolean;
};
type RatioOption = {
  key: string;
  label: string;
};
type ResolutionOption = {
  key: string;
  label: string;
  optionKey: string;
};

const imageTypes: ImageMode[] = ['文生图', '图生图', '图片编辑'];
const configStore = useConfigStore();
const imageType = ref<ImageMode>('文生图');
const imageStates = reactive<Record<ImageMode, ModeState>>({
  文生图: createModeState(),
  图生图: createModeState(),
  图片编辑: createModeState()
});
const currentState = computed(() => imageStates[imageType.value]);
const prompt = computed({
  get: () => currentState.value.prompt,
  set: (value: string) => { currentState.value.prompt = value; }
});
const form = computed(() => currentState.value.form);
const assets = computed(() => currentState.value.assets);
const uploadedAssetCount = computed(() => assets.value.filter(Boolean).length);
const displayedUploadedAssetCount = computed(() => Math.min(uploadedAssetCount.value, maxUploads.value));
const editImageState = computed(() => imageStates['图片编辑']);
const editImageAsset = computed(() => editImageState.value.assets[0] || null);
const editImagePreviewPath = computed(() => editImageAsset.value?.path || '');
const promptOptimizeEnabled = computed(() => configStore.features.promptOptimize !== false);
const promptGuideKey = computed<PromptGuideModeKey>(() => {
  if (imageType.value === '图生图') return 'ai_image.img2img';
  if (imageType.value === '图片编辑') return 'ai_image.edit';
  return 'ai_image.text2img';
});
const defaultPromptPlaceholder = computed(() => imageType.value === '图片编辑'
  ? '点击下方一键编辑，或写下你想怎么编辑图片'
  : '写点什么... 输入完成1秒后自动保存，最多2000字');
const currentPromptGuide = computed(() => getPromptGuide(configStore.publicConfig, promptGuideKey.value, defaultPromptPlaceholder.value));
const promptPlaceholder = computed(() => currentPromptGuide.value.placeholder);
const showPromptGuide = computed(() => hasPromptGuideDialog(currentPromptGuide.value));
const hasEditImage = computed(() => Boolean(editImagePreviewPath.value || editImageState.value.uploadKeys[0]));
const canAddEditImage = computed(() => uploadedAssetCount.value < maxUploads.value);
const editTool = computed({
  get: () => currentState.value.editTool,
  set: (value: string) => { currentState.value.editTool = value; }
});
const promptExpanded = ref(false);
const promptOptimizing = ref(false);
const selectedSizeMode = ref<SizeMode>('auto');
const selectedRatio = ref('auto');
const selectedResolutionPreset = ref('auto');
const selectedSizeKey = ref('');
const selectedImageCount = ref(1);
const ratioOptionsExpanded = ref(false);
const editTools = ['换背景', '去水印', '局部重绘', '扩图', '提升清晰度', '改风格'];
const models = ref<Record<string, unknown>[]>([]);
const selectedModelIndex = ref(1);
const modelTiersLoading = ref(false);
const modelTiersLoaded = ref(false);
let imageModelRequestToken = 0;
const DEFAULT_MAX_REFERENCE_IMAGES = 4;
const previewTemplate = ref<CreativeTemplate | null>(null);
const backendTemplates = ref<CreativeTemplate[]>([]);
const userStore = useUserStore();
const authStore = useAuthStore();
const platformWatermarkEnabled = ref(true);
const platformWatermarkOffConfirmed = ref(false);
const isSubmitting = ref(false);
const freeQuotaStatus = ref<FreeImageQuotaStatus | null>(null);
const IMAGE_DRAFT_KEY = 'ai_creator_image_task_draft';
let draftTimer: ReturnType<typeof setTimeout> | null = null;
const fallbackCapabilities: ModelCapabilities = {
  ratios: ['auto', ...DEFAULT_RATIOS],
  qualities: ['auto', '1K', '2K', '4K'],
  resolutionPresets: ['auto', '1K', '2K', '4K'],
  sizeOptions: [
    { key: 'auto', ratio: 'auto', resolutionPreset: 'auto', label: '自动', isAuto: true },
    { key: '1:1_1K', ratio: '1:1', resolutionPreset: '1K', label: '1K 1:1' },
    { key: '16:9_1K', ratio: '16:9', resolutionPreset: '1K', label: '1K 16:9' },
    { key: '9:16_1K', ratio: '9:16', resolutionPreset: '1K', label: '1K 9:16' }
  ],
  defaultSizeKey: 'auto',
  supportedSizeModes: ['auto', 'ratio'],
  nativeSizes: ['auto'],
  defaultRatio: 'auto',
  maxImages: 1,
  maxReferenceImages: DEFAULT_MAX_REFERENCE_IMAGES
};
const fallbackModels: ModelTier[] = [
  {
    tierKey: 'image_standard',
    tierName: '标准生图',
    description: '适合日常生图和电商素材',
    modelName: '',
    displayName: '',
    apiModelName: '',
    upstreamModelCode: '',
    providerType: '',
    freeImageQuotaModelEligible: false,
    basePointsCost: 2,
    pointsCost: 2,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: false
  },
  {
    tierKey: 'image_pro',
    tierName: '专业生图',
    description: '更高质量的商业图片生成',
    modelName: '',
    displayName: '',
    apiModelName: '',
    upstreamModelCode: '',
    providerType: '',
    freeImageQuotaModelEligible: false,
    basePointsCost: 5,
    pointsCost: 5,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: true
  },
  {
    tierKey: 'image_top',
    tierName: '顶级生图',
    description: '高质量创意与复杂画面生成',
    modelName: '',
    displayName: '',
    apiModelName: '',
    upstreamModelCode: '',
    providerType: '',
    freeImageQuotaModelEligible: false,
    basePointsCost: 10,
    pointsCost: 10,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: false
  }
];
const MODEL_CACHE_TTL_MS = 60_000;
const TEMPLATE_CACHE_TTL_MS = 60_000;
const imageModelCache = new Map<string, { list: Record<string, unknown>[]; loadedAt: number }>();
const imageTemplateCache = new Map<string, { list: CreativeTemplate[]; loadedAt: number }>();
const imageTemplatePromises = new Map<string, Promise<CreativeTemplate[]>>();

const modelOptions = computed<ModelTier[]>(() => {
  const source: ModelTier[] = models.value.map((item) => ({
    tierKey: String(item.tierKey || 'image_standard'),
    tierName: String(item.tierName || '标准生图'),
    description: String(item.description || ''),
    modelName: String(item.modelName || ''),
    displayName: String(item.displayName || ''),
    apiModelName: String(item.apiModelName || item.api_model_name || item.modelCode || item.model_code || ''),
    upstreamModelCode: String(item.upstreamModelCode || item.upstream_model_code || ''),
    providerType: String(item.providerType || item.provider_type || ''),
    freeImageQuotaModelEligible: item.freeImageQuotaModelEligible === true || item.free_image_quota_model_eligible === true,
    basePointsCost: Number(item.basePointsCost || item.pointsCost || 2),
    pointsCost: Number(item.pointsCost || 2),
    memberDiscountPercent: Number(item.memberDiscountPercent || 100),
    memberDiscountApplied: Boolean(item.memberDiscountApplied),
    pricing: normalizeTierPricing(item.pricing),
    capabilities: normalizeCapabilities(item.capabilities),
    isDefault: Boolean(item.isDefault)
  }));
  if (source.length) return source;
  if (isDevFallbackEnabled && modelTiersLoaded.value) return fallbackModels;
  return [];
});
const selectedModel = computed(() => modelOptions.value[selectedModelIndex.value] || modelOptions.value[0]);
const selectedModelName = computed(() => selectedModel.value?.tierName || '标准生图');
const selectedModelDescription = computed(() => selectedModel.value?.description || '');
const selectedModelCost = computed(() => modelTierUnitCost(selectedModel.value));
const selectedCapabilities = computed(() => selectedModel.value?.capabilities || fallbackCapabilities);
const maxImageCount = computed(() => Math.max(1, Math.floor(Number(selectedCapabilities.value.maxImages || 1))));
const maxUploads = computed(() => normalizeMaxReferenceImages(selectedCapabilities.value.maxReferenceImages));
const totalModelCost = computed(() => selectedModelCost.value * selectedImageCount.value);
const selectedModelCostLabel = computed(() => modelTiersLoading.value ? '加载中' : selectedModel.value ? `${selectedModelCost.value} 创作点/张` : '未配置');
const pointsGenerationCostText = computed(() => modelTiersLoading.value
  ? '入口档位加载中'
  : selectedModel.value
    ? `消耗 ${totalModelCost.value} 创作点 · ${selectedImageCount.value}张`
    : '请先配置入口档位');
const freeQuotaGenerationMode = computed(() => {
  if (imageType.value === '图生图') return 'img2img';
  if (imageType.value === '图片编辑') return 'edit';
  return 'text2img';
});
const selectedModelSupportsFreeQuota = computed(() => isGptImage2FreeQuotaModel(selectedModel.value || null));
const generationCostText = computed(() => buildFreeImageQuotaCostText(
  freeQuotaStatus.value,
  selectedImageCount.value,
  pointsGenerationCostText.value,
  selectedModel.value?.tierKey,
  freeQuotaGenerationMode.value,
  selectedModel.value || null,
));
const freeQuotaRemaining = computed(() => getFreeImageQuotaRemainingImages(freeQuotaStatus.value));
const freeQuotaDailyLimit = computed(() => Math.max(0, Math.floor(Number(freeQuotaStatus.value?.dailyLimit) || 0)));
const freeQuotaInfoVisible = computed(() => Boolean(
  authStore.isLoggedIn
  && freeQuotaStatus.value?.enabled
  && freeQuotaStatus.value?.eligible
  && selectedModelSupportsFreeQuota.value
));
const freeQuotaTierAllowed = computed(() => isFreeImageQuotaTierAllowed(freeQuotaStatus.value, selectedModel.value?.tierKey));
const freeQuotaCanCoverSelection = computed(() => canUseFreeImageQuotaForSelection(
  freeQuotaStatus.value,
  selectedImageCount.value,
  selectedModel.value?.tierKey,
  freeQuotaGenerationMode.value,
  selectedModel.value || null,
));
const freeQuotaInfoClass = computed(() => ({
  active: freeQuotaCanCoverSelection.value,
  muted: !freeQuotaCanCoverSelection.value,
}));
const freeQuotaBadgeText = computed(() => `${freeQuotaRemaining.value}/${freeQuotaDailyLimit.value || freeQuotaRemaining.value}`);
const freeQuotaInfoText = computed(() => {
  if (!freeQuotaTierAllowed.value) return '当前入口档位不在免费额度范围内，可切换支持的档位使用。';
  if (freeQuotaRemaining.value <= 0) return freeQuotaStatus.value?.exhaustedMessage || '今日免费生图额度已用完。';
  if (selectedImageCount.value > freeQuotaRemaining.value) return `本次选择 ${selectedImageCount.value} 张，减少到 ${freeQuotaRemaining.value} 张可免费生成。`;
  return `本次可免费生成 ${selectedImageCount.value} 张，提交时优先使用免费额度。`;
});
const imageCountTip = computed(() => maxImageCount.value > 1 ? `当前最多一次生成 ${maxImageCount.value} 张` : '当前一次生成 1 张');
const backendSizeOptions = computed<BackendSizeOption[]>(() => {
  const options = selectedCapabilities.value.sizeOptions?.length
    ? selectedCapabilities.value.sizeOptions
    : fallbackCapabilities.sizeOptions || [];
  return options.filter((item) => item.key && item.ratio && item.resolutionPreset);
});
const selectedSizeOption = computed(() => backendSizeOptions.value.find((item) => item.key === selectedSizeKey.value) || backendSizeOptions.value[0] || null);
const ratioOptions = computed<RatioOption[]>(() => {
  const seen = new Set<string>();
  const options: RatioOption[] = [];
  backendSizeOptions.value.forEach((item) => {
    if (seen.has(item.ratio)) return;
    seen.add(item.ratio);
    options.push({ key: item.ratio, label: ratioLabel(item.ratio) });
  });
  return options;
});
const ratioOptionsCollapsible = computed(() => shouldCollapseRatioOptions(ratioOptions.value));
const visibleRatioOptions = computed(() => getVisibleRatioOptions(
  ratioOptions.value,
  ratioOptionsExpanded.value,
  selectedRatio.value,
));
const resolutionOptions = computed<ResolutionOption[]>(() => {
  const seen = new Set<string>();
  const options: ResolutionOption[] = [];
  backendSizeOptions.value
    .filter((item) => item.ratio === selectedRatio.value)
    .forEach((item) => {
      if (seen.has(item.resolutionPreset)) return;
      seen.add(item.resolutionPreset);
      options.push({
        key: item.resolutionPreset,
        label: resolutionLabel(item.resolutionPreset),
        optionKey: item.key
      });
    });
  return options;
});
const selectedResolution = computed(() => resolutionOptions.value.find((item) => item.key === selectedResolutionPreset.value) || resolutionOptions.value[0] || {
  key: '',
  label: '默认',
  optionKey: ''
});
const activeTemplates = computed(() => {
  const feature = imageFeatureForType();
  const list = backendTemplates.value.filter((item) => templateMatchesImageFeature(item, feature));
  if (list.length) return sortTemplatesForFeature(list, feature);
  if (!isDevFallbackEnabled) return [];
  if (imageType.value === '图生图') return imageToImageTemplates;
  if (imageType.value === '图片编辑') return imageEditTemplates;
  return textImageTemplates;
});
const shouldShowPlatformWatermarkCard = computed(() => !(imageType.value === '图片编辑' && editTool.value === '去水印'));
const effectivePlatformWatermarkEnabled = computed(() => shouldShowPlatformWatermarkCard.value ? platformWatermarkEnabled.value : false);
const platformWatermarkDesc = computed(() => platformWatermarkEnabled.value
  ? '生成图片左下角展示 AI艺术生成工坊'
  : '已关闭平台水印，请遵守用户协议与内容合规要求');

onLoad((query) => {
  restoreDraft();
  if (query?.prompt) prompt.value = decodeURIComponent(String(query.prompt));
  if (query?.scene) form.value.scene = decodeURIComponent(String(query.scene));
});

onShow(async () => {
  enableShareMenu();
  configStore.hydrate();
  configStore.loadPublicConfig().catch(() => undefined);
  await authStore.hydrate();
  if (authStore.isLoggedIn) {
    await userStore.hydrate();
    syncWatermarkPreferenceFromProfile();
    userStore.loadFullProfile().then(syncWatermarkPreferenceFromProfile).catch(() => undefined);
    loadFreeImageQuota().catch(() => undefined);
  } else {
    platformWatermarkEnabled.value = true;
    platformWatermarkOffConfirmed.value = false;
    freeQuotaStatus.value = null;
  }
  loadImageModelsForMode();
  loadImageTemplates();
});

onShareAppMessage(() => createShareMessage({
  title: 'AI 生图，一句话生成创意图片',
  path: withQuery(PAGE_ROUTES.aiImage, { type: imageType.value })
}));

onShareTimeline(() => createShareTimeline({
  title: 'AI 生图，一句话生成创意图片',
  path: withQuery(PAGE_ROUTES.aiImage, { type: imageType.value })
}));

watch(imageType, () => {
  loadImageModelsForMode();
  loadImageTemplates();
  scheduleDraftSave();
});

watch(() => selectedModel.value?.tierKey, () => {
  ratioOptionsExpanded.value = false;
});

watch(() => maxUploads.value, () => {
  trimCurrentAssetsToMaxUploads();
});

watch([
  () => imageType.value,
  () => selectedSizeMode.value,
  () => selectedRatio.value,
  () => selectedResolutionPreset.value,
  () => selectedSizeKey.value,
  () => selectedImageCount.value,
  () => platformWatermarkEnabled.value,
  () => imageStates.文生图.prompt,
  () => imageStates.图生图.prompt,
  () => imageStates.图片编辑.prompt,
  () => imageStates.文生图.form,
  () => imageStates.图生图.form,
  () => imageStates.图片编辑.form,
  () => imageStates.图片编辑.editTool,
], scheduleDraftSave, { deep: true });

function loadImageModelsForMode() {
  const featureKey = imageFeatureKey();
  const configModels = configModelTiers(featureKey);
  if (configModels.length) {
    models.value = configModels;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
    imageModelCache.set(featureKey, { list: configModels, loadedAt: Date.now() });
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
    return;
  }
  const cached = imageModelCache.get(featureKey);
  if (cached && Date.now() - cached.loadedAt < MODEL_CACHE_TTL_MS) {
    models.value = cached.list;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
    return;
  }
  const requestToken = ++imageModelRequestToken;
  models.value = [];
  modelTiersLoading.value = true;
  modelTiersLoaded.value = false;
  selectedModelIndex.value = defaultModelIndex();
  normalizeImageParams();
  getImageModels(featureKey).then((res) => {
    if (requestToken !== imageModelRequestToken || featureKey !== imageFeatureKey()) return;
    const list = Array.isArray(res.list) ? res.list as Record<string, unknown>[] : [];
    if (!list.length && isDevFallbackEnabled) warnDevFallback('image-tiers', `GET /public/model-tiers?feature=${featureKey} returned empty list`);
    imageModelCache.set(featureKey, { list, loadedAt: Date.now() });
    models.value = list;
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
  }).catch(() => {
    if (requestToken !== imageModelRequestToken || featureKey !== imageFeatureKey()) return;
    if (isDevFallbackEnabled) warnDevFallback('image-tiers', `GET /public/model-tiers?feature=${featureKey} failed`);
    models.value = [];
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
  }).finally(() => {
    if (requestToken !== imageModelRequestToken || featureKey !== imageFeatureKey()) return;
    modelTiersLoading.value = false;
    modelTiersLoaded.value = true;
  });
}

async function loadFreeImageQuota() {
  if (!authStore.isLoggedIn) {
    freeQuotaStatus.value = null;
    return;
  }
  freeQuotaStatus.value = await getMyFreeImageQuota();
}

function loadImageTemplates() {
  const feature = imageFeatureForType();
  const cached = imageTemplateCache.get(feature);
  if (cached && Date.now() - cached.loadedAt < TEMPLATE_CACHE_TTL_MS) {
    backendTemplates.value = cached.list;
    return;
  }
  let request = imageTemplatePromises.get(feature);
  if (!request) {
    request = getTemplates<{ list?: Record<string, unknown>[] }>({ templateType: 'image', targetFeature: feature, page: 1, pageSize: 24 })
      .then((res) => {
        const list = (Array.isArray(res.list) ? res.list : [])
          .map(normalizeCreativeTemplate)
          .filter((item): item is CreativeTemplate => Boolean(item));
        imageTemplateCache.set(feature, { list, loadedAt: Date.now() });
        return list;
      });
    imageTemplatePromises.set(feature, request);
    request.finally(() => {
      if (imageTemplatePromises.get(feature) === request) imageTemplatePromises.delete(feature);
    }).catch(() => undefined);
  }
  if (feature === imageFeatureForType()) backendTemplates.value = [];
  request
    .then((list) => {
      if (feature === imageFeatureForType()) backendTemplates.value = list;
    })
    .catch(() => {
      if (feature === imageFeatureForType()) backendTemplates.value = [];
      if (isDevFallbackEnabled) warnDevFallback('image-templates', 'GET /templates?templateType=image&targetFeature=... failed');
    });
}

function selectImageType(value: string) {
  if (!imageTypes.includes(value as ImageMode)) return;
  imageType.value = value as ImageMode;
}

function configModelTiers(featureKey: string) {
  const tiers = configStore.publicConfig?.modelTiers;
  if (!tiers || typeof tiers !== 'object') return [];
  const list = (tiers as Record<string, unknown>)[featureKey];
  return Array.isArray(list) ? list as Record<string, unknown>[] : [];
}

function selectScene(event: { detail: { value: number } }) {
  form.value.scene = sceneOptions[event.detail.value] || '';
}

function selectEditTool(tool: string) {
  editTool.value = tool;
  prompt.value = tool === '换背景' ? '将图片背景替换为高级商业摄影棚，主体保持不变。' : `请对图片进行${tool}处理，保持主体清晰自然。`;
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
  const targetMode: ImageMode = item.mode === 'img2img' ? '图生图' : item.mode === 'edit' ? '图片编辑' : '文生图';
  imageType.value = targetMode;
  const targetState = imageStates[targetMode];
  targetState.prompt = item.prompt;
  targetState.form.scene = item.category || targetState.form.scene;
  applyTemplateRatio(item.ratio);
  previewTemplate.value = null;
  if (item.mode === 'edit' && !targetState.assets.length) {
    uni.showToast({ title: '请先上传需要编辑的图片', icon: 'none' });
  }
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
  return {
    id,
    title: String(raw.title || raw.name || '灵感模板'),
    tags,
    prompt: promptText,
    mediaType: 'image',
    coverUrl: normalizeBackendMediaUrl(raw.coverUrl || raw.cover_url || raw.previewUrl || raw.preview_url),
    mediaUrl: normalizeBackendMediaUrl(raw.previewUrl || raw.preview_url || raw.coverUrl || raw.cover_url),
    mode: imageTemplateMode(targetFeature, usageType),
    category: String(raw.category || raw.scene || raw.style || ''),
    duration: String(raw.duration || params.duration || ''),
    ratio: normalizedTemplateRatio(raw.ratio || raw.aspectRatio || raw.aspect_ratio || params.ratio || params.aspectRatio || params.aspect_ratio),
    targetFeature,
    usageType,
    displayConfig,
    createdAt: String(raw.createdAt || raw.created_at || raw.updatedAt || raw.updated_at || ''),
    canUse: raw.canUse !== false,
    canSave: raw.canSave !== false && raw.canUse !== false,
    lockReason: String(raw.lockReason || '')
  };
}

function normalizedTemplateRatio(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return closestKnownRatio(value);
  }
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const match = text.match(/^(\d{1,4})\s*[:\uFF1A/]\s*(\d{1,4})$/);
  if (!match) return '';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  return ratioFromNumbers(width, height);
}

function closestKnownRatio(aspectRatio: number): string {
  const commonRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5'];
  let closest = '';
  let closestDistance = Number.MAX_VALUE;
  commonRatios.forEach((ratio) => {
    const [width, height] = ratio.split(':').map(Number);
    const distance = Math.abs(width / height - aspectRatio);
    if (distance < closestDistance) {
      closest = ratio;
      closestDistance = distance;
    }
  });
  return closestDistance <= 0.02 ? closest : '';
}

function ratioFromNumbers(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function numericTemplateId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function imageFeatureForType() {
  if (imageType.value === '图生图') return 'image_to_image';
  if (imageType.value === '图片编辑') return 'image_edit';
  return 'text_to_image';
}

function templateMatchesImageFeature(item: CreativeTemplate, feature: string) {
  const config = item.displayConfig;
  if (config && typeof config === 'object' && config[feature]) return true;
  const targetFeature = normalizeTemplateFeature(item.targetFeature || '');
  if (targetFeature === feature) return true;
  if (targetFeature) return false;
  const usageFeature = imageFeatureFromUsage(item.usageType || '');
  if (usageFeature) return usageFeature === feature;
  if (item.mode === 'img2img') return feature === 'image_to_image';
  if (item.mode === 'edit') return feature === 'image_edit';
  if (item.mode === 'text2img') return feature === 'text_to_image';
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

function imageTemplateMode(targetFeature: string, usageType = '') {
  if (/reference/i.test(usageType)) return 'img2img';
  if (/edit/i.test(usageType)) return 'edit';
  if (/image_to_image|img2img/i.test(targetFeature)) return 'img2img';
  if (/edit|paint|watermark|expand/i.test(targetFeature)) return 'edit';
  return 'text2img';
}

function imageFeatureFromUsage(value: string) {
  if (value === 'reference') return 'image_to_image';
  if (value === 'edit') return 'image_edit';
  if (value === 'generate') return 'text_to_image';
  return '';
}

function normalizeTemplateFeature(value: unknown) {
  const text = String(value || '').trim();
  if (text === 'image_create') return 'text_to_image';
  if (text === 'image_editing') return 'image_edit';
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
  if (imageType.value === '图生图' && type === 'reference' && !currentState.value.assets[0]) {
    uni.showToast({ title: '请先上传主图', icon: 'none' });
    return;
  }
  chooseAndSetAsset(type);
}

function replaceAsset(slotIndex: number) {
  const fallbackType = imageType.value === '图生图' && slotIndex === 0 ? 'product' : 'reference';
  chooseAndSetAsset(assets.value[slotIndex]?.type || fallbackType, slotIndex);
}

function pickEditImage() {
  chooseAndSetEditImage();
}

function replaceEditImage() {
  chooseAndSetEditImage(0);
}

function chooseAndSetAsset(type: string, replaceIndex?: number) {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset: LegacyAsset = { path, type, typeLabel: type === 'product' ? '主图' : type === 'edit' ? '编辑图' : '参考图', mediaType: 'image' };
      const state = currentState.value;
      const assetIndex = typeof replaceIndex === 'number' ? replaceIndex : nextAvailableAssetSlot(state, type);
      if (assetIndex < 0) {
        uni.showToast({ title: `最多上传${maxUploads.value}张素材`, icon: 'none' });
        return;
      }
      state.assets[assetIndex] = asset;
      state.uploadKeys[assetIndex] = undefined;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
        const key = uploaded.fileNo || uploaded.fileId || uploaded.url;
        state.uploadKeys[assetIndex] = key;
      } catch {
        uni.showToast({ title: '素材上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function nextAvailableAssetSlot(state: ModeState, type: string) {
  if (imageType.value === '图生图') {
    if (type === 'product') return 0;
    for (let index = 1; index < maxUploads.value; index += 1) {
      if (!state.assets[index]) return index;
    }
    return -1;
  }
  for (let index = 0; index < maxUploads.value; index += 1) {
    if (!state.assets[index]) return index;
  }
  return -1;
}

function chooseAndSetEditImage(replaceIndex?: number) {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'edit', typeLabel: '编辑图', mediaType: 'image' };
      const state = imageStates['图片编辑'];
      const assetIndex = typeof replaceIndex === 'number' ? replaceIndex : nextAvailableAssetSlot(state, 'edit');
      if (assetIndex < 0) {
        uni.showToast({ title: `最多上传${maxUploads.value}张图片`, icon: 'none' });
        return;
      }
      state.assets[assetIndex] = asset;
      state.uploadKeys[assetIndex] = undefined;
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
        state.uploadKeys[assetIndex] = uploaded.fileNo || uploaded.fileId || uploaded.url;
      } catch {
        uni.showToast({ title: '素材上传失败，请重试', icon: 'none' });
      }
    }
  });
}

function removeAsset(slotIndex: number) {
  if (imageType.value === '图生图') {
    currentState.value.assets[slotIndex] = null;
    currentState.value.uploadKeys[slotIndex] = undefined;
    return;
  }
  currentState.value.assets.splice(slotIndex, 1);
  currentState.value.uploadKeys.splice(slotIndex, 1);
}

function removeEditImage() {
  removeAsset(0);
}

function showUploadHint() {
  uni.showToast({ title: '请点击上方上传素材卡片', icon: 'none' });
}

function countFilledAssets(state: ModeState) {
  return state.assets.filter(Boolean).length;
}

function countUploadedKeys(state: ModeState) {
  return state.assets.filter((asset, index) => {
    const key = state.uploadKeys[index];
    return Boolean(asset) && key !== undefined && key !== null && key !== '';
  }).length;
}

function buildUploadKeys(state: ModeState) {
  return state.assets.reduce<unknown[]>((keys, asset, index) => {
    const key = state.uploadKeys[index];
    if (asset && key !== undefined && key !== null && key !== '') keys.push(key);
    return keys;
  }, []);
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
    const result = await optimizeImagePrompt<Record<string, unknown>>({
    featureKey: imageFeatureKey(),
    prompt: prompt.value,
    scene: form.value.scene,
    ratio: selectedRatio.value !== 'auto' ? selectedRatio.value : undefined,
    usage: 'deep_completion',
    context: {
      feature: 'image',
      mode: imageType.value,
      scene: form.value.scene,
      brand: form.value.brand,
      sellingPoint: form.value.sellingPoint,
      sizeMode: selectedSizeMode.value,
      ratio: selectedRatio.value,
      resolutionPreset: selectedResolutionPreset.value,
      imageCount: selectedImageCount.value,
      hasReferenceImage: uploadedAssetCount.value > 0,
      editTool: imageType.value === '图片编辑' ? editTool.value : '',
      tierName: selectedModelName.value,
      tierDescription: selectedModelDescription.value,
    },
  });
    prompt.value = String(result.optimizedPrompt || result.optimized_prompt || prompt.value);
  } finally {
    promptOptimizing.value = false;
  }
}

function confirmRatioConflictBeforeSubmit(finalPrompt: string, selectedRatioValue: string) {
  const conflictRatio = detectPromptRatioConflict(finalPrompt, selectedRatioValue);
  if (!conflictRatio) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '比例冲突提示',
      content: `提示词中包含 ${conflictRatio}，当前选择 ${selectedRatioValue}。继续生成将以页面选择的比例为准。`,
      cancelText: '返回修改',
      confirmText: '继续生成',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    });
  });
}

function detectPromptRatioConflict(text: string, selectedRatioValue: string) {
  const selected = normalizedTemplateRatio(selectedRatioValue);
  if (!selected || selected === 'auto') return '';
  const promptRatio = promptRatioOf(text);
  return promptRatio && promptRatio !== selected ? promptRatio : '';
}

function promptRatioOf(text: string) {
  const raw = text || '';
  const pixelMatch = raw.match(/(\d{2,5})\s*[xX\u00D7*]\s*(\d{2,5})/);
  if (pixelMatch) return ratioFromNumbers(Number(pixelMatch[1]), Number(pixelMatch[2]));

  const ratioMatch = raw.match(/(^|[^\d])(\d{1,4})\s*[:\uFF1A]\s*(\d{1,4})(?!\d)/);
  if (ratioMatch) return normalizedTemplateRatio(`${ratioMatch[2]}:${ratioMatch[3]}`);

  if (/正方形|方图|正方|square/i.test(raw)) return '1:1';
  if (/横版|横图|宽屏|landscape/i.test(raw)) return '16:9';
  if (/竖版|竖图|竖屏|portrait/i.test(raw)) return '9:16';
  return '';
}

async function submit(billingSource: 'auto' | 'points' = 'auto') {
  if (isSubmitting.value) return;
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后提交生图任务',
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
  if (imageType.value === '图生图') {
    if (!state.assets[0]) {
      uni.showToast({ title: '请先上传主图', icon: 'none' });
      return;
    }
    if (!state.uploadKeys[0]) {
      uni.showToast({ title: '主图未上传成功，请重新上传', icon: 'none' });
      return;
    }
  } else if (imageType.value !== '文生图' && !countFilledAssets(state)) {
    uni.showToast({ title: '请先上传素材图片', icon: 'none' });
    return;
  }
  if (countFilledAssets(state) > 0 && countUploadedKeys(state) < countFilledAssets(state)) {
    uni.showToast({ title: '素材未上传成功，请重新上传', icon: 'none' });
    return;
  }
  const subType = imageType.value === '图生图' ? 'img2img' : imageType.value === '图片编辑' ? 'edit' : 'text2img';
  const featureKey = imageFeatureKey();
  const sizeOption = selectedSizeOption.value;
  if (!sizeOption) {
    uni.showToast({ title: '当前档位暂无可用尺寸', icon: 'none' });
    return;
  }
  const finalPrompt = buildFinalPrompt(prompt.value, state.form);
  if (!(await confirmRatioConflictBeforeSubmit(finalPrompt, sizeOption.ratio))) return;
  isSubmitting.value = true;
  try {
  const result = await createImageTask<Record<string, unknown>>({
    featureKey,
    subType,
    prompt: finalPrompt,
    tierKey: String(selectedModel.value.tierKey),
    sizeMode: selectedSizeMode.value,
    ratio: sizeOption.ratio !== 'auto' ? sizeOption.ratio : undefined,
    resolutionPreset: sizeOption.resolutionPreset,
    sizeKey: sizeOption.key,
    scene: state.form.scene,
    formData: { ...state.form },
    params: {
      imageCount: selectedImageCount.value,
      resolutionPreset: sizeOption.resolutionPreset,
      resolutionLabel: resolutionLabel(sizeOption.resolutionPreset),
      sizeKey: sizeOption.key,
      platformWatermarkEnabled: effectivePlatformWatermarkEnabled.value
    },
    platformWatermarkEnabled: effectivePlatformWatermarkEnabled.value,
    uploadKeys: buildUploadKeys(state),
    billingSource: billingSource === 'points' ? 'points' : undefined,
    editTool: imageType.value === '图片编辑' ? state.editTool || 'edit' : undefined
  } as any, { silent: true });
  const id = Number(result.id || result.taskId);
  if (!Number.isInteger(id) || id <= 0) {
    uni.showToast({ title: '任务提交失败，请稍后重试', icon: 'none' });
    return;
  }
  clearDraft();
  uni.redirectTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=image` });
  } catch (error: any) {
    if (error?.code === 4606 && billingSource !== 'points') {
      const data = (error.response?.data || {}) as Record<string, any>;
      const action = await showFreeQuotaInsufficientDialog({ message: error.message, ...data });
      if (action === 'primary' && data.canUsePoints) {
        isSubmitting.value = false;
        await submit('points');
      }
      const shouldReduceImageCount = (action === 'secondary' && data.canUsePoints) || action === 'minor';
      if (shouldReduceImageCount) {
        const reducedCount = resolveFreeQuotaReductionCount({ ...(freeQuotaStatus.value || {}), ...data }, selectedImageCount.value);
        if (reducedCount > 0 && reducedCount < selectedImageCount.value) {
          selectedImageCount.value = reducedCount;
          uni.showToast({ title: `已调整为 ${reducedCount} 张`, icon: 'none' });
        } else {
          uni.showToast({ title: '当前没有可减少的免费张数', icon: 'none' });
        }
      }
      loadFreeImageQuota().catch(() => undefined);
      return;
    }
    uni.showToast({ title: error?.message || '提交失败，请稍后重试', icon: 'none' });
  } finally {
    isSubmitting.value = false;
  }
}

function selectRatioOption(item: RatioOption) {
  selectedRatio.value = item.key;
  const sameResolution = backendSizeOptions.value.find((option) => (
    option.ratio === item.key && option.resolutionPreset === selectedResolutionPreset.value
  ));
  const candidates = backendSizeOptions.value.filter((option) => option.ratio === item.key);
  applySizeOption(sameResolution || chooseClosestSizeOption(candidates, selectedResolutionPreset.value) || null);
}

function selectResolutionOption(item: ResolutionOption) {
  const option = backendSizeOptions.value.find((size) => size.key === item.optionKey)
    || backendSizeOptions.value.find((size) => size.ratio === selectedRatio.value && size.resolutionPreset === item.key)
    || null;
  applySizeOption(option);
}

function toggleRatioOptionsExpanded() {
  ratioOptionsExpanded.value = !ratioOptionsExpanded.value;
}

function selectModel(index: number) {
  selectedModelIndex.value = index;
  normalizeImageParams();
}

function decreaseImageCount() {
  selectedImageCount.value = Math.max(1, selectedImageCount.value - 1);
}

function increaseImageCount() {
  selectedImageCount.value = Math.min(maxImageCount.value, selectedImageCount.value + 1);
}

function syncWatermarkPreferenceFromProfile() {
  const user = userStore.user || {};
  const preferences = user.preferences && typeof user.preferences === 'object' ? user.preferences as Record<string, unknown> : {};
  platformWatermarkEnabled.value = preferences.imagePlatformWatermarkEnabled !== false;
  platformWatermarkOffConfirmed.value = Boolean(preferences.imagePlatformWatermarkOffConfirmed);
}

async function togglePlatformWatermark() {
  if (!authStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后设置水印', icon: 'none' });
    return;
  }
  if (platformWatermarkEnabled.value) {
    if (!platformWatermarkOffConfirmed.value) {
      const confirmed = await confirmPlatformWatermarkOff();
      if (!confirmed) return;
      await confirmCompliance({
        scene: 'platform_watermark_off',
        confirmationText: 'checked'
      });
      platformWatermarkOffConfirmed.value = true;
    }
    platformWatermarkEnabled.value = false;
  } else {
    platformWatermarkEnabled.value = true;
  }
  await saveWatermarkPreference();
}

function confirmPlatformWatermarkOff() {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '关闭平台水印',
      content: '按照监管要求，AI 生成内容应当添加显式标识。您确认关闭平台水印后，即视为您已阅读并同意用户协议，并同意对生成内容的使用、发布和传播承担全部法律责任。请勿生成或传播违反法律法规、公序良俗或侵害他人权益的内容。',
      cancelText: '保持开启',
      confirmText: '确认关闭',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    });
  });
}

async function saveWatermarkPreference() {
  const preferences = {
    imagePlatformWatermarkEnabled: platformWatermarkEnabled.value,
    imagePlatformWatermarkOffConfirmed: platformWatermarkOffConfirmed.value
  };
  const user = userStore.user || {};
  const nextProfile = {
    ...(userStore.profile || {}),
    user: {
      ...user,
      preferences: {
        ...((user.preferences && typeof user.preferences === 'object') ? user.preferences as Record<string, unknown> : {}),
        ...preferences
      }
    }
  };
  userStore.profile = nextProfile;
  uni.setStorageSync(STORAGE_KEYS.profile, nextProfile);
  await updateMe({ preferences }).catch(() => {
    uni.showToast({ title: '水印设置保存失败，请稍后重试', icon: 'none' });
  });
}

function middleModelIndex() {
  return Math.min(1, Math.max(0, modelOptions.value.length - 1));
}

function defaultModelIndex() {
  const index = modelOptions.value.findIndex((item) => item.isDefault);
  return index >= 0 ? index : middleModelIndex();
}

function normalizeImageParams() {
  const caps = selectedCapabilities.value;
  const options = backendSizeOptions.value;
  const current = options.find((item) => item.key === selectedSizeKey.value)
    || options.find((item) => item.ratio === selectedRatio.value && item.resolutionPreset === selectedResolutionPreset.value)
    || options.find((item) => item.key === caps.defaultSizeKey)
    || options[0]
    || null;
  applySizeOption(current);
  selectedImageCount.value = Math.min(maxImageCount.value, Math.max(1, selectedImageCount.value));
  trimCurrentAssetsToMaxUploads();
}

function trimCurrentAssetsToMaxUploads() {
  const state = currentState.value;
  state.assets.splice(maxUploads.value);
  state.uploadKeys.splice(maxUploads.value);
}

function applySizeOption(option: BackendSizeOption | null) {
  if (!option) {
    selectedSizeKey.value = '';
    selectedRatio.value = 'auto';
    selectedResolutionPreset.value = 'auto';
    selectedSizeMode.value = 'auto';
    return;
  }
  selectedSizeKey.value = option.key;
  selectedRatio.value = option.ratio;
  selectedResolutionPreset.value = option.resolutionPreset;
  selectedSizeMode.value = option.ratio === 'auto' ? 'auto' : 'ratio';
}

function applyTemplateRatio(value: unknown) {
  const ratio = normalizedTemplateRatio(value);
  if (!ratio || ratio === selectedRatio.value) return;
  const options = backendSizeOptions.value.filter((item) => item.ratio === ratio);
  const option = options.find((item) => item.resolutionPreset === selectedResolutionPreset.value)
    || chooseClosestSizeOption(options, selectedResolutionPreset.value);
  if (option) applySizeOption(option);
}

function currentPricingParams() {
  return { resolutionPreset: selectedResolutionPreset.value };
}

function modelTierPrice(model?: ModelTier) {
  return resolveTierPriceEstimate(model, currentPricingParams());
}

function modelTierUnitCost(model?: ModelTier) {
  return modelTierPrice(model).pointsCost;
}

function modelTierBaseCost(model?: ModelTier) {
  return modelTierPrice(model).basePointsCost;
}

function modelTierHasDiscount(model?: ModelTier) {
  const price = modelTierPrice(model);
  return Boolean(model?.memberDiscountApplied && price.basePointsCost > price.pointsCost);
}

function chooseClosestSizeOption(options: BackendSizeOption[], currentResolution: string) {
  if (!options.length) return null;
  const resolutionRank: Record<string, number> = { auto: 0, '1K': 1, '2K': 2, '4K': 3 };
  const currentRank = resolutionRank[normalizeResolutionPreset(currentResolution)] ?? 1;
  return [...options].sort((a, b) => {
    const aRank = resolutionRank[a.resolutionPreset] ?? 1;
    const bRank = resolutionRank[b.resolutionPreset] ?? 1;
    const aDistance = Math.abs(aRank - currentRank);
    const bDistance = Math.abs(bRank - currentRank);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return bRank - aRank;
  })[0] || null;
}

function createModeState(): ModeState {
  return {
    prompt: '',
    form: { brand: '', sellingPoint: '', scene: '' },
    assets: [],
    uploadKeys: [],
    editTool: ''
  };
}

function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 500);
}

function saveDraft() {
  const draft = {
    imageType: imageType.value,
    selectedSizeMode: selectedSizeMode.value,
    selectedRatio: selectedRatio.value,
    selectedResolutionPreset: selectedResolutionPreset.value,
    selectedSizeKey: selectedSizeKey.value,
    selectedImageCount: selectedImageCount.value,
    platformWatermarkEnabled: platformWatermarkEnabled.value,
    states: Object.fromEntries(Object.entries(imageStates).map(([key, state]) => [key, {
      prompt: state.prompt,
      form: { ...state.form },
      editTool: state.editTool,
    }])),
  };
  uni.setStorageSync(IMAGE_DRAFT_KEY, draft);
}

function restoreDraft() {
  const draft = uni.getStorageSync(IMAGE_DRAFT_KEY) as any;
  if (!draft || typeof draft !== 'object') return;
  if (imageTypes.includes(draft.imageType)) imageType.value = draft.imageType;
  selectedSizeMode.value = draft.selectedSizeMode || selectedSizeMode.value;
  selectedRatio.value = draft.selectedRatio || selectedRatio.value;
  selectedResolutionPreset.value = draft.selectedResolutionPreset || selectedResolutionPreset.value;
  selectedSizeKey.value = draft.selectedSizeKey || selectedSizeKey.value;
  selectedImageCount.value = Number(draft.selectedImageCount || selectedImageCount.value) || 1;
  platformWatermarkEnabled.value = draft.platformWatermarkEnabled !== false;
  Object.entries(draft.states || {}).forEach(([key, value]) => {
    if (!imageTypes.includes(key as ImageMode)) return;
    const item = value as any;
    imageStates[key as ImageMode].prompt = String(item.prompt || '');
    imageStates[key as ImageMode].form = { ...imageStates[key as ImageMode].form, ...(item.form || {}) };
    imageStates[key as ImageMode].editTool = String(item.editTool || '');
  });
}

function clearDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  uni.removeStorageSync(IMAGE_DRAFT_KEY);
}

function normalizeCapabilities(value: unknown): ModelCapabilities {
  const caps = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const supportedSizeModes = stringArray(caps.supportedSizeModes, fallbackCapabilities.supportedSizeModes);
  const ratios = normalizeRatioOptions(stringArray(caps.ratios, fallbackCapabilities.ratios), supportedSizeModes);
  const resolutionPresets = normalizeResolutionPresetList(
    caps.resolutionPresets,
    stringArray(caps.qualities, fallbackCapabilities.resolutionPresets)
  );
  const sizeOptions = normalizeBackendSizeOptions(caps.sizeOptions, ratios, resolutionPresets);
  return {
    ratios,
    qualities: normalizeResolutionPresetList(caps.qualities, resolutionPresets),
    resolutionPresets,
    sizeOptions,
    defaultSizeKey: chooseDefaultSizeKey(caps.defaultSizeKey, sizeOptions),
    durations: stringArray(caps.durations, []),
    supportedSizeModes,
    nativeSizes: stringArray(caps.nativeSizes, fallbackCapabilities.nativeSizes),
    defaultRatio: String(caps.defaultRatio || fallbackCapabilities.defaultRatio || '1:1'),
    maxImages: Number(caps.maxImages || fallbackCapabilities.maxImages || 1),
    maxReferenceImages: normalizeMaxReferenceImages(caps.maxReferenceImages),
  };
}

function shortTierName(value: unknown) {
  return String(value || '').slice(0, 5);
}

function normalizeMaxReferenceImages(value: unknown) {
  if (value === undefined || value === null || value === '') return DEFAULT_MAX_REFERENCE_IMAGES;
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 0 ? count : DEFAULT_MAX_REFERENCE_IMAGES;
}

function stringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

function uniqueStrings(values: string[]) {
  return values.filter((item, index) => Boolean(item) && values.indexOf(item) === index);
}

function normalizeRatioOptions(values: string[], supportedSizeModes: string[]) {
  const list = values.map((item) => String(item || '').trim()).filter(Boolean);
  if (supportedSizeModes.includes('auto') && !list.includes('auto')) {
    return ['auto', ...list];
  }
  return list.length ? list : ['auto', '1:1'];
}

function normalizeResolutionPresetList(value: unknown, fallback: string[] = []) {
  const raw = Array.isArray(value) ? value : fallback;
  const normalized = raw
    .map(normalizeResolutionPreset)
    .filter((item) => ['auto', '1K', '2K', '4K'].includes(item));
  const unique = normalized.filter((item, index) => normalized.indexOf(item) === index);
  return unique.length ? unique : fallbackCapabilities.resolutionPresets || ['auto', '1K'];
}

function normalizeResolutionPreset(value: unknown) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (!text || lower === 'auto' || lower === 'default') return 'auto';
  if (['standard', 'normal', '1k', '1024'].includes(lower)) return '1K';
  if (['hd', '2k', '2048'].includes(lower)) return '2K';
  if (['4k', '4096'].includes(lower)) return '4K';
  return text.toUpperCase();
}

function normalizeBackendSizeOptions(value: unknown, ratios: string[], resolutions: string[]): BackendSizeOption[] {
  if (Array.isArray(value) && value.length) {
    const explicitOptions = value.map((raw) => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const ratio = String(item.ratio || '').trim();
      const resolutionPreset = normalizeResolutionPreset(item.resolutionPreset || item.resolution || '');
      if (!ratio || !resolutionPreset) return null;
      return {
        key: String(item.key || `${ratio}_${resolutionPreset}`).trim(),
        ratio,
        resolutionPreset,
        label: String(item.label || `${resolutionLabel(resolutionPreset)} ${ratioLabel(ratio)}`),
        upstreamSize: String(item.upstreamSize || ''),
        isAuto: Boolean(item.isAuto)
      } as BackendSizeOption;
    }).filter(Boolean) as BackendSizeOption[];
    return ensureAutoSizeOptions(explicitOptions, ratios, resolutions);
  }
  const safeRatios = ratios.length ? ratios : ['auto', '1:1'];
  const safeResolutions = uniqueStrings([
    ...(safeRatios.includes('auto') ? ['auto'] : []),
    ...(resolutions.length ? resolutions : ['1K'])
  ]);
  const options: BackendSizeOption[] = [];
  safeRatios.forEach((ratio) => {
    safeResolutions.forEach((resolutionPreset) => {
      if (ratio === 'auto' && resolutionPreset !== 'auto') return;
      if (ratio !== 'auto' && resolutionPreset === 'auto') return;
      options.push({
        key: ratio === 'auto' && resolutionPreset === 'auto' ? 'auto' : `${ratio}_${resolutionPreset}`,
        ratio,
        resolutionPreset,
        label: ratio === 'auto' && resolutionPreset === 'auto'
          ? '自动'
          : `${resolutionLabel(resolutionPreset)} ${ratioLabel(ratio)}`,
        isAuto: ratio === 'auto' && resolutionPreset === 'auto'
      });
    });
  });
  return ensureAutoSizeOptions(options, ratios, resolutions);
}

function ensureAutoSizeOptions(options: BackendSizeOption[], ratios: string[], resolutions: string[]) {
  if (!ratios.includes('auto') || options.some((item) => item.ratio === 'auto')) return options;
  const hasAutoResolution = !resolutions.length || resolutions.includes('auto');
  if (!hasAutoResolution) return options;
  const autoOption: BackendSizeOption = {
    key: 'auto',
    ratio: 'auto',
    resolutionPreset: 'auto',
    label: '自动',
    isAuto: true
  };
  return [autoOption, ...options];
}

function chooseDefaultSizeKey(configured: unknown, options: BackendSizeOption[]) {
  const configuredKey = String(configured || '').trim();
  if (configuredKey && options.some((item) => item.key === configuredKey)) return configuredKey;
  return options.find((item) => item.key === 'auto')?.key
    || options.find((item) => item.ratio === 'auto' && item.resolutionPreset === '1K')?.key
    || options.find((item) => item.ratio === 'auto')?.key
    || options[0]?.key
    || String(fallbackCapabilities.defaultSizeKey || 'auto');
}

function resolutionLabel(value: string) {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'auto') return '自动';
  if (/^\d+k$/i.test(text)) return text.toUpperCase();
  return text;
}

function ratioLabel(value: string) {
  const text = String(value || '').trim();
  return text.toLowerCase() === 'auto' || !text ? '自动' : text;
}

function imageFeatureKey() {
  if (imageType.value === '图生图') return FEATURE_KEYS.imageToImage;
  if (imageType.value === '图片编辑') return FEATURE_KEYS.imageEdit;
  return FEATURE_KEYS.image;
}

function buildFinalPrompt(basePrompt: string, data: FormState) {
  const parts = [
    data.brand ? `品牌：${data.brand}` : '',
    data.sellingPoint ? `卖点：${data.sellingPoint}` : '',
    data.scene ? `场景：${data.scene}` : ''
  ].filter(Boolean);
  return [basePrompt.trim(), parts.length ? `创作需求：${parts.join('；')}` : ''].filter(Boolean).join('\n');
}

</script>

<style scoped lang="scss">
.image-create-page {
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

.image-edit-upload-card {
  padding: 24rpx 22rpx 22rpx;
}

.image-edit-upload-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 180rpx;
}

.image-edit-upload-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10rpx;
}

.image-edit-upload-action {
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

.image-edit-upload-action.danger {
  border-color: rgba(255, 122, 139, 0.28);
  background: #fff1f2;
  color: #e11d48;
}

.image-edit-upload-area {
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

.image-edit-upload-area.filled {
  border-style: solid;
  border-color: rgba(122, 92, 255, 0.22);
  background: #111827;
}

.image-edit-upload-preview {
  width: 100%;
  height: 420rpx;
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

.image-edit-empty-title {
  color: #2f3848;
  font-size: 28rpx;
  font-weight: 900;
  text-align: center;
}

.image-edit-empty-desc {
  margin-top: 10rpx;
  padding: 0 18rpx;
  color: #7d8797;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.requirement-card {
  padding: 24rpx 22rpx 20rpx;
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
  font-size: 25rpx;
  font-weight: 900;
  white-space: nowrap;
}

.requirement-icon {
  flex-shrink: 0;
  width: 30rpx;
  height: 30rpx;
}

.requirement-input,
.scene-picker-value {
  width: 100%;
  min-width: 0;
  height: 70rpx;
  padding: 0 12rpx;
  color: #2f3848;
  font-size: 25rpx;
  line-height: 70rpx;
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

.edit-tool-grid,
.ratio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 22rpx;
}

.edit-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 68rpx;
  padding: 0 10rpx;
  border-radius: 12rpx;
  background: #f1f5f9;
  color: #475569;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  white-space: nowrap;
}

.edit-tool.active {
  background: #dbeafe;
  color: #2563eb;
}

.generation-param-card {
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

.ratio-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 58rpx;
  margin-top: 12rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 14rpx;
  background: #ffffff;
  color: #6d4cff;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 58rpx;
}

.ratio-toggle::after {
  border: 0;
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

.quality-option {
  min-height: 72rpx;
}

.quality-option .param-option-title {
  font-size: 23rpx;
}

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

.image-count-card {
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

.image-count-copy {
  min-width: 0;
}

.image-count-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
}

.image-count-desc {
  margin-top: 8rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
}

.free-quota-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 86rpx;
  margin-top: 14rpx;
  padding: 16rpx 18rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
}

.free-quota-card.active {
  border-color: rgba(22, 163, 74, 0.32);
  background: #f0fdf4;
}

.free-quota-card.muted {
  background: #f8fafc;
}

.free-quota-copy {
  min-width: 0;
}

.free-quota-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
}

.free-quota-desc {
  margin-top: 8rpx;
  color: #475569;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
}

.free-quota-card.active .free-quota-title,
.free-quota-card.active .free-quota-badge {
  color: #15803d;
}

.free-quota-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 88rpx;
  height: 46rpx;
  padding: 0 14rpx;
  border-radius: 23rpx;
  background: #ffffff;
  color: #64748b;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 46rpx;
}

.platform-watermark-card {
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

.platform-watermark-card.off {
  border-color: rgba(225, 29, 72, 0.34);
  background: #fff7f8;
  box-shadow: 0 0 0 2rpx rgba(225, 29, 72, 0.08), 0 10rpx 24rpx rgba(225, 29, 72, 0.16);
}

.platform-watermark-copy {
  min-width: 0;
}

.platform-watermark-title {
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
}

.platform-watermark-desc {
  margin-top: 8rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.35;
}

.platform-watermark-card.off .platform-watermark-title {
  color: #be123c;
}

.platform-watermark-card.off .platform-watermark-desc {
  color: #9f1239;
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

.image-count-stepper,
.image-count-fixed {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8rpx;
}

.image-count-fixed {
  justify-content: center;
  min-width: 96rpx;
  height: 56rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 14rpx;
  background: #f8fbff;
}

.count-stepper-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 24rpx;
  background: #ffffff;
  color: #6d4cff;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1;
}

.count-stepper-btn.disabled {
  color: #a8b3c4;
}

.count-stepper-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4rpx;
  min-width: 68rpx;
}

.count-stepper-number {
  color: #172033;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 48rpx;
}

.count-stepper-unit {
  color: #64748b;
  font-size: 20rpx;
  font-weight: 800;
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

.model-picker {
  display: block;
  width: 100%;
}

.model-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 82rpx;
  padding: 0 20rpx;
  border: 2rpx solid #dce8f6;
  border-radius: 16rpx;
  background: #f8fbff;
}

.model-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.model-name {
  overflow: hidden;
  color: #172033;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-desc {
  overflow: hidden;
  margin-top: 8rpx;
  color: #64748b;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-chevron {
  flex-shrink: 0;
  color: #64748b;
  font-size: 30rpx;
  font-weight: 900;
}

.ratio-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.ratio-option {
  padding: 0;
}

.ratio-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 116rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  background: #f8fbff;
}

.ratio-option.active .ratio-preview {
  border-color: #7a5cff;
  background: #f1f0ff;
}

.ratio-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #7a5cff, #35c2ff);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 900;
}

.ratio-square .ratio-frame { width: 58rpx; height: 58rpx; }
.ratio-landscape .ratio-frame { width: 76rpx; height: 44rpx; }
.ratio-story .ratio-frame { width: 42rpx; height: 74rpx; }
.ratio-portrait .ratio-frame { width: 50rpx; height: 70rpx; }
</style>
