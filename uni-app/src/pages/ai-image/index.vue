<template>
  <view class="flow-page create-flow-page image-create-page">
    <view class="content">
      <LegacyTopTabs v-model="imageType" :items="imageTypes" />

      <TemplateStrip
        :templates="activeTemplates"
        @select="openTemplate"
      />

      <block v-if="imageType === '图生图'">
        <LegacyAssetUploadCard
          :types="uploadTypes"
          :uploaded-count="assets.length"
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
      <view v-else-if="imageType === '图片编辑'" class="card image-edit-upload-card">
        <view class="upload-head">
          <view class="section-title">上传待编辑图</view>
          <view class="image-edit-upload-status">
            <view v-if="hasEditImage" class="image-edit-upload-actions">
              <view class="image-edit-upload-action" @tap.stop="replaceEditImage">替换</view>
              <view class="image-edit-upload-action danger" @tap.stop="removeEditImage">删除</view>
            </view>
            <view v-else class="upload-count">已上传 0/1</view>
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
            <view class="image-edit-empty-desc">支持 JPG/PNG/WEBP，上传后可替换或删除</view>
          </block>
        </view>
      </view>

      <LegacyPromptComposer
        v-model="prompt"
        :expanded="promptExpanded"
        :placeholder="imageType === '图片编辑' ? '点击下方一键编辑，或写下你想怎么编辑图片' : '写点什么... 输入完成1秒后自动保存，最多2000字'"
        smart-label="✨ 智能补全"
        @toggle-expanded="promptExpanded = !promptExpanded"
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
            <text class="param-block-title">图片尺寸</text>
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
            <text class="param-block-title">画质选择</text>
            <text class="param-block-tip">{{ selectedQuality.label }}</text>
          </view>
          <view class="param-option-grid quality-grid">
            <button
              v-for="item in qualityOptions"
              :key="item.key"
              class="param-option quality-option"
              :class="{ active: selectedQualityKey === item.key }"
              @tap="selectedQualityKey = item.key"
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
            <view class="image-count-stepper">
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
import { createImageTask, getImageModels, optimizeImagePrompt } from '@/api/ai-image';
import { confirmCompliance } from '@/api/config';
import { updateMe } from '@/api/user';
import { uploadAsset } from '@/api/upload';
import { DEFAULT_RATIOS, FEATURE_KEYS, PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';
import { assertPrompt } from '@/utils/validator';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { discountLabel } from '@/utils/member';
import { useUserStore } from '@/stores/user';
import { useAuthStore } from '@/stores/auth';
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
  assets: LegacyAsset[];
  uploadKeys: unknown[];
  editTool: string;
};
type ModelCapabilities = {
  ratios?: string[];
  qualities?: string[];
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
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};
type SizeOption = {
  key: string;
  label: string;
  desc: string;
  mode: SizeMode;
  ratio?: string;
};
type QualityOption = {
  key: string;
  label: string;
  backendQuality: string;
};

const imageTypes: ImageMode[] = ['文生图', '图生图', '图片编辑'];
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
const editImageState = computed(() => imageStates['图片编辑']);
const editImageAsset = computed(() => editImageState.value.assets[0] || null);
const editImagePreviewPath = computed(() => editImageAsset.value?.path || '');
const hasEditImage = computed(() => Boolean(editImagePreviewPath.value || editImageState.value.uploadKeys[0]));
const editTool = computed({
  get: () => currentState.value.editTool,
  set: (value: string) => { currentState.value.editTool = value; }
});
const promptExpanded = ref(false);
const selectedSizeMode = ref<SizeMode>('auto');
const selectedRatio = ref('1:1');
const selectedImageCount = ref(1);
const editTools = ['换背景', '去水印', '局部重绘', '扩图', '提升清晰度', '改风格'];
const models = ref<Record<string, unknown>[]>([]);
const selectedModelIndex = ref(1);
let imageModelRequestToken = 0;
const DEFAULT_MAX_REFERENCE_IMAGES = 4;
const previewTemplate = ref<CreativeTemplate | null>(null);
const userStore = useUserStore();
const authStore = useAuthStore();
const platformWatermarkEnabled = ref(true);
const platformWatermarkOffConfirmed = ref(false);
const isSubmitting = ref(false);
const fallbackCapabilities: ModelCapabilities = {
  ratios: [...DEFAULT_RATIOS],
  qualities: ['1K', '2K', '4K'],
  supportedSizeModes: ['auto', 'ratio'],
  nativeSizes: ['auto'],
  defaultRatio: '1:1',
  maxImages: 1,
  maxReferenceImages: DEFAULT_MAX_REFERENCE_IMAGES
};
const fallbackModels: ModelTier[] = [
  {
    tierKey: 'image_standard',
    tierName: '标准生图',
    description: '适合日常生图和电商素材',
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
    basePointsCost: 10,
    pointsCost: 10,
    memberDiscountPercent: 100,
    memberDiscountApplied: false,
    capabilities: fallbackCapabilities,
    isDefault: false
  }
];
const selectedQualityKey = ref('2K');

const modelOptions = computed<ModelTier[]>(() => {
  const source: ModelTier[] = models.value.map((item) => ({
    tierKey: String(item.tierKey || 'image_standard'),
    tierName: String(item.tierName || '标准生图'),
    description: String(item.description || ''),
    basePointsCost: Number(item.basePointsCost || item.pointsCost || 2),
    pointsCost: Number(item.pointsCost || 2),
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
const selectedModelName = computed(() => selectedModel.value?.tierName || '标准生图');
const selectedModelDescription = computed(() => selectedModel.value?.description || '');
const selectedModelCost = computed(() => Number(selectedModel.value?.pointsCost || 0));
const selectedCapabilities = computed(() => selectedModel.value?.capabilities || fallbackCapabilities);
const maxImageCount = computed(() => Math.max(1, Math.floor(Number(selectedCapabilities.value.maxImages || 1))));
const maxUploads = computed(() => normalizeMaxReferenceImages(selectedCapabilities.value.maxReferenceImages));
const totalModelCost = computed(() => selectedModelCost.value * selectedImageCount.value);
const selectedModelCostLabel = computed(() => modelTiersReady.value ? `${selectedModelCost.value} 创作点/张` : '加载中');
const generationCostText = computed(() => modelTiersReady.value ? `消耗 ${totalModelCost.value} 创作点 · ${selectedImageCount.value}张` : '模型档位加载中');
const imageCountTip = computed(() => maxImageCount.value > 1 ? `当前最多一次生成 ${maxImageCount.value} 张` : '当前一次生成 1 张');
const qualityOptions = computed<QualityOption[]>(() => {
  const values = uniqueStrings([...(selectedCapabilities.value.qualities || []), ...(fallbackCapabilities.qualities || [])]);
  return uniqueStrings(values).map((item) => ({
    key: item,
    label: qualityLabel(item),
    backendQuality: item
  }));
});
const selectedQuality = computed(() => qualityOptions.value.find((item) => item.key === selectedQualityKey.value) || qualityOptions.value[0] || {
  key: '',
  label: '默认画质',
  backendQuality: ''
});
const supportedRatios = computed(() => {
  const values = selectedCapabilities.value.ratios?.length ? selectedCapabilities.value.ratios : fallbackCapabilities.ratios;
  return values || ['1:1'];
});
const supportsAutoSize = computed(() => (selectedCapabilities.value.supportedSizeModes || ['auto', 'ratio']).includes('auto'));
const selectedSizeKey = computed(() => selectedSizeMode.value === 'auto' ? 'auto' : selectedRatio.value);
const sizeOptions = computed<SizeOption[]>(() => {
  const options: SizeOption[] = [];
  if (supportsAutoSize.value) {
    options.push({ key: 'auto', label: '自动', desc: '模型推荐', mode: 'auto' });
  }
  supportedRatios.value.forEach((item) => {
    options.push({ key: item, label: item, desc: '图片比例', mode: 'ratio', ratio: item });
  });
  return options;
});
const activeTemplates = computed(() => {
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
  if (query?.prompt) prompt.value = decodeURIComponent(String(query.prompt));
  if (query?.scene) form.value.scene = decodeURIComponent(String(query.scene));
});

onShow(() => {
  authStore.hydrate();
  if (authStore.isLoggedIn) {
    userStore.hydrate();
    syncWatermarkPreferenceFromProfile();
    userStore.loadFullProfile().then(syncWatermarkPreferenceFromProfile).catch(() => undefined);
  } else {
    platformWatermarkEnabled.value = true;
    platformWatermarkOffConfirmed.value = false;
  }
  loadImageModelsForMode();
});

watch(imageType, () => {
  loadImageModelsForMode();
});

function loadImageModelsForMode() {
  const featureKey = imageFeatureKey();
  const requestToken = ++imageModelRequestToken;
  models.value = [];
  selectedModelIndex.value = defaultModelIndex();
  normalizeImageParams();
  getImageModels(featureKey).then((res) => {
    if (requestToken !== imageModelRequestToken || featureKey !== imageFeatureKey()) return;
    const list = Array.isArray(res.list) ? res.list as Record<string, unknown>[] : [];
    if (!list.length && isDevFallbackEnabled) warnDevFallback('image-tiers', `GET /public/model-tiers?feature=${featureKey} returned empty list`);
    models.value = list;
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
  }).catch(() => {
    if (requestToken !== imageModelRequestToken || featureKey !== imageFeatureKey()) return;
    if (isDevFallbackEnabled) warnDevFallback('image-tiers', `GET /public/model-tiers?feature=${featureKey} failed`);
    models.value = [];
    selectedModelIndex.value = defaultModelIndex();
    normalizeImageParams();
  });
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

function useTemplate(item: CreativeTemplate) {
  const targetMode: ImageMode = item.mode === 'img2img' ? '图生图' : item.mode === 'edit' ? '图片编辑' : '文生图';
  imageType.value = targetMode;
  const targetState = imageStates[targetMode];
  targetState.prompt = item.prompt;
  targetState.form.scene = item.category || targetState.form.scene;
  previewTemplate.value = null;
  if (item.mode === 'edit' && !targetState.assets.length) {
    uni.showToast({ title: '请先上传需要编辑的图片', icon: 'none' });
  }
}

function pickAsset(type: string) {
  chooseAndSetAsset(type);
}

function replaceAsset(slotIndex: number) {
  chooseAndSetAsset(assets.value[slotIndex]?.type || 'reference', slotIndex);
}

function pickEditImage() {
  chooseAndSetEditImage();
}

function replaceEditImage() {
  chooseAndSetEditImage();
}

function chooseAndSetAsset(type: string, replaceIndex?: number) {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset = { path, type, typeLabel: type === 'product' ? '主图' : type === 'edit' ? '编辑图' : '参考图' };
      const state = currentState.value;
      if (typeof replaceIndex === 'number') state.assets.splice(replaceIndex, 1, asset);
      else if (state.assets.length < maxUploads.value) state.assets.push(asset);
      else {
        uni.showToast({ title: `最多上传${maxUploads.value}张素材`, icon: 'none' });
        return;
      }
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image');
        const key = uploaded.fileNo || uploaded.fileId || uploaded.url;
        if (typeof replaceIndex === 'number') state.uploadKeys.splice(replaceIndex, 1, key);
        else state.uploadKeys.push(key);
      } catch {
        // 保留本地预览。
      }
    }
  });
}

function chooseAndSetEditImage() {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : res.tempFilePaths;
      if (!path) return;
      const asset: LegacyAsset = { path, type: 'edit', typeLabel: '编辑图', mediaType: 'image' };
      const state = imageStates['图片编辑'];
      state.assets.splice(0, state.assets.length, asset);
      state.uploadKeys.splice(0, state.uploadKeys.length);
      try {
        const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image');
        state.uploadKeys[0] = uploaded.fileNo || uploaded.fileId || uploaded.url;
      } catch {
        // 上传失败时仍保留本地预览，方便用户替换或删除。
      }
    }
  });
}

function removeAsset(slotIndex: number) {
  currentState.value.assets.splice(slotIndex, 1);
  currentState.value.uploadKeys.splice(slotIndex, 1);
}

function removeEditImage() {
  const state = imageStates['图片编辑'];
  state.assets.splice(0, state.assets.length);
  state.uploadKeys.splice(0, state.uploadKeys.length);
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
  const result = await optimizeImagePrompt<Record<string, unknown>>({
    featureKey: imageFeatureKey(),
    prompt: prompt.value,
    scene: form.value.scene,
    ratio: selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined
  });
  prompt.value = String(result.optimizedPrompt || result.optimized_prompt || prompt.value);
}

async function submit() {
  if (isSubmitting.value) return;
  if (!authStore.isLoggedIn) {
    uni.navigateTo({ url: `${PAGE_ROUTES.login}?redirect=${encodeURIComponent(PAGE_ROUTES.aiImage)}` });
    return;
  }
  if (!assertPrompt(prompt.value)) return;
  if (!modelTiersReady.value) {
    uni.showToast({ title: '模型档位加载中，请稍后再生成', icon: 'none' });
    loadImageModelsForMode();
    return;
  }
  if (!selectedModel.value) {
    uni.showToast({ title: '请先在后台配置模型档位', icon: 'none' });
    return;
  }
  const state = currentState.value;
  if (imageType.value !== '文生图' && !state.assets.length) {
    uni.showToast({ title: '请先上传素材图片', icon: 'none' });
    return;
  }
  const subType = imageType.value === '图生图' ? 'img2img' : imageType.value === '图片编辑' ? 'edit' : 'text2img';
  const featureKey = imageFeatureKey();
  isSubmitting.value = true;
  try {
  const result = await createImageTask<Record<string, unknown>>({
    featureKey,
    subType,
    prompt: buildFinalPrompt(prompt.value, state.form),
    tierKey: String(selectedModel.value.tierKey),
    sizeMode: selectedSizeMode.value,
    ratio: selectedSizeMode.value === 'ratio' ? selectedRatio.value : undefined,
    quality: selectedQuality.value.backendQuality || undefined,
    scene: state.form.scene,
    formData: { ...state.form },
    params: {
      imageCount: selectedImageCount.value,
      qualityPreset: selectedQuality.value.key,
      qualityLabel: selectedQuality.value.label,
      platformWatermarkEnabled: effectivePlatformWatermarkEnabled.value
    },
    platformWatermarkEnabled: effectivePlatformWatermarkEnabled.value,
    uploadKeys: [...state.uploadKeys],
    editTool: imageType.value === '图片编辑' ? state.editTool || 'edit' : undefined
  } as any);
  const id = Number(result.id || result.taskId);
  if (!Number.isInteger(id) || id <= 0) {
    uni.showToast({ title: 'Task submit failed', icon: 'none' });
    return;
  }
  uni.redirectTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=image` });
  } finally {
    isSubmitting.value = false;
  }
}

function selectSizeOption(item: SizeOption) {
  selectedSizeMode.value = item.mode;
  if (item.ratio) selectedRatio.value = item.ratio;
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
  const modes = caps.supportedSizeModes?.length ? caps.supportedSizeModes : ['auto', 'ratio'];
  if (selectedSizeMode.value === 'auto' && !modes.includes('auto')) {
    selectedSizeMode.value = 'ratio';
  }
  const ratios = caps.ratios?.length ? caps.ratios : fallbackCapabilities.ratios || ['1:1'];
  if (selectedSizeMode.value !== 'auto' && !ratios.includes(selectedRatio.value)) {
    selectedRatio.value = caps.defaultRatio && ratios.includes(caps.defaultRatio) ? caps.defaultRatio : ratios[0];
  }
  if (qualityOptions.value.length && !qualityOptions.value.some((item) => item.key === selectedQualityKey.value)) {
    selectedQualityKey.value = qualityOptions.value[0].key;
  }
  selectedImageCount.value = Math.min(maxImageCount.value, Math.max(1, selectedImageCount.value));
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

function normalizeCapabilities(value: unknown): ModelCapabilities {
  const caps = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ratios: stringArray(caps.ratios, fallbackCapabilities.ratios),
    qualities: stringArray(caps.qualities, fallbackCapabilities.qualities),
    durations: stringArray(caps.durations, []),
    supportedSizeModes: stringArray(caps.supportedSizeModes, fallbackCapabilities.supportedSizeModes),
    nativeSizes: stringArray(caps.nativeSizes, fallbackCapabilities.nativeSizes),
    defaultRatio: String(caps.defaultRatio || fallbackCapabilities.defaultRatio || '1:1'),
    maxImages: Number(caps.maxImages || fallbackCapabilities.maxImages || 1),
    maxReferenceImages: normalizeMaxReferenceImages(caps.maxReferenceImages)
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

function qualityLabel(value: string) {
  const text = String(value || '').trim();
  if (!text) return '默认画质';
  if (/^\d+k$/i.test(text)) return `${text.toUpperCase()}画质`;
  return text;
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

.image-count-stepper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8rpx;
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
