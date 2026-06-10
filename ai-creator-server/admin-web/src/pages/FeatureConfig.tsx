import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Menu,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownOutlined,
  DownloadOutlined,
  DragOutlined,
  EditOutlined,
  EyeOutlined,
  FileSyncOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SettingOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

const { Text, Title } = Typography;

const FEATURE_LABELS: Record<string, string> = {
  image_create: '文生图',
  image_to_image: '图生图',
  image_edit: '图片编辑',
  video_create: '文生视频',
  image_to_video: '图生视频',
  first_last_frame_video: '首尾帧视频',
  video_edit: '视频编辑',
  prompt_optimize: '提示词优化',
};

const FEATURE_TYPES: Record<string, 'image' | 'video' | 'text'> = {
  image_create: 'image',
  image_to_image: 'image',
  image_edit: 'image',
  video_create: 'video',
  image_to_video: 'video',
  first_last_frame_video: 'video',
  video_edit: 'video',
  prompt_optimize: 'text',
};

const CAPABILITY_ALIASES: Record<string, string> = {
  image_create: 'text_to_image',
  image_generate: 'text_to_image',
  text_to_image: 'text_to_image',
  image_to_image: 'image_to_image',
  img2img: 'image_to_image',
  image_edit: 'image_edit',
  edit: 'image_edit',
  video_create: 'text_to_video',
  text_to_video: 'text_to_video',
  image_to_video: 'image_to_video',
  img2video: 'image_to_video',
  image2video: 'image_to_video',
  first_last_frame: 'first_last_frame_video',
  first_last_frame_video: 'first_last_frame_video',
  video_edit: 'video_edit',
  'prompt-optimize': 'prompt_optimize',
  prompt_optimize: 'prompt_optimize',
  text_generation: 'text_generation',
  text_chat: 'text_chat',
};

const FEATURE_REQUIRED_CAPABILITIES: Record<string, string[]> = {
  image_create: ['text_to_image'],
  image_to_image: ['image_to_image'],
  image_edit: ['image_edit'],
  video_create: ['text_to_video'],
  image_to_video: ['image_to_video'],
  first_last_frame_video: ['first_last_frame_video'],
  video_edit: ['video_edit'],
  prompt_optimize: ['prompt_optimize', 'text_generation', 'text_chat'],
};

const ORDERED_FEATURES = [
  'image_create',
  'image_to_image',
  'image_edit',
  'video_create',
  'image_to_video',
  'first_last_frame_video',
  'video_edit',
  'prompt_optimize',
];

const QUALITY_OPTIONS: Record<string, string[]> = {
  image: ['1K', '2K', '4K'],
  video: ['480p', '720p', '1080p'],
  text: [],
};

const RATIO_OPTIONS: Record<string, string[]> = {
  image: ['自动', '1:1', '16:9', '9:16', '4:5', '2:3', '4:3', '3:4'],
  video: ['自动', '16:9', '9:16', '1:1'],
  text: [],
};

const DEFAULT_TIER_TYPE_LABELS = ['专业', '超清', '艺术', '快速'];
const EDIT_SECTIONS = ['基础设置', '模型绑定', '模型参数', '前台展示', '高级设置'];
const DEFAULT_MAX_REFERENCE_IMAGES = 4;

const VIDEO_UPLOAD_MODE_OPTIONS = [
  { label: '自动推导', value: '' },
  { label: '文生视频，无需素材', value: 'none' },
  { label: '首图视频，单张首图', value: 'first_frame' },
  { label: '图生视频，多参考图', value: 'reference_images' },
  { label: '首尾帧视频，开始帧和结束帧', value: 'first_last' },
  { label: '视频编辑，源视频', value: 'source_video' },
];

const REQUIRED_REFERENCE_OPTIONS = [
  { label: '自动按最少素材数判断', value: 'auto' },
  { label: '需要上传素材', value: 'true' },
  { label: '不强制上传素材', value: 'false' },
];

const TIER_TYPE_OPTIONS = [
  { label: '专业', value: '专业' },
  { label: '超清', value: '超清' },
  { label: '艺术', value: '艺术' },
  { label: '快速', value: '快速' },
  { label: '自定义', value: '自定义' },
];

const PRICING_MODE_OPTIONS = [
  { label: '固定价', value: 'fixed' },
  { label: '参数矩阵', value: 'matrix' },
  { label: '按秒矩阵', value: 'per_second_matrix' },
  { label: 'Token 预扣', value: 'token_preauth' },
];

const TEMPLATE_OPTIONS = [
  {
    label: '标准生图三档',
    value: 'standard-image',
    items: [
      { tierName: '专业生图', tierType: '专业', sortOrder: 10, pointsCost: 10, enabled: true },
      { tierName: '超清生图', tierType: '超清', sortOrder: 20, pointsCost: 20, enabled: true },
      { tierName: '艺术生图', tierType: '艺术', sortOrder: 30, pointsCost: 15, enabled: true },
    ],
  },
  {
    label: '快速生图四档',
    value: 'quick-image',
    items: [
      { tierName: '快速生图', tierType: '快速', sortOrder: 5, pointsCost: 5, enabled: true },
      { tierName: '专业生图', tierType: '专业', sortOrder: 10, pointsCost: 10, enabled: true },
      { tierName: '超清生图', tierType: '超清', sortOrder: 20, pointsCost: 20, enabled: true },
      { tierName: '艺术生图', tierType: '艺术', sortOrder: 30, pointsCost: 15, enabled: true },
    ],
  },
  {
    label: '视频双档',
    value: 'video-basic',
    items: [
      { tierName: '标准视频', tierType: '快速', sortOrder: 10, pointsCost: 20, enabled: true },
      { tierName: '高清视频', tierType: '超清', sortOrder: 20, pointsCost: 40, enabled: true },
    ],
  },
  {
    label: '自定义模板',
    value: 'custom',
    items: [],
  },
];

type RestoreScope = 'current' | 'all';

interface BindingFallbackRow {
  modelId: number;
  fallbackOrder: number;
}

interface ImportPreview {
  count: number;
  missingModels: string[];
  conflicts: string[];
  unsupportedFields: string[];
  blocked: boolean;
}

interface ModelBinding {
  id?: number;
  modelId: number;
  modelName?: string;
  providerName?: string;
  bindingType?: string;
  fallbackOrder?: number;
  failoverOnError?: boolean;
  failoverOnTimeout?: boolean;
  failoverOnRateLimit?: boolean;
  modelStatus?: string;
  providerStatus?: string;
  providerConfigured?: boolean;
  capabilityOk?: boolean;
  canUse?: boolean;
  unusableReason?: string;
}

interface FeatureItem {
  id?: number;
  featureKey: string;
  featureName?: string;
}

interface RealModelItem {
  id: number;
  providerName?: string;
  name?: string;
  apiModelName?: string;
  modelType?: string;
  subType?: string;
  status?: string;
  lastTestStatus?: string;
  capabilities?: string[];
  config?: Record<string, unknown> | string | null;
}

interface TierItem {
  id: number;
  featureId?: number;
  featureKey?: string;
  featureName?: string;
  tierName?: string;
  tierKey?: string;
  description?: string;
  tag?: string;
  iconUrl?: string;
  iconFileId?: number | null;
  pointsCost?: number;
  pricingMode?: string;
  pricingRules?: Record<string, unknown> | null;
  isDefault?: boolean;
  isRecommended?: boolean;
  sortOrder?: number;
  status?: string;
  qualityMultipliers?: Record<string, number>;
  bindings?: ModelBinding[];
  maxEntries?: number;
  capabilities?: {
    maxReferenceImages?: number;
    maxImages?: number;
    maxDurationSeconds?: number;
    inputMode?: string | null;
    minReferenceImages?: number | null;
    referenceUploadMode?: string | null;
    requiredReference?: boolean | null;
  } | null;
}

const normalizeCapabilityKey = (value: unknown) => {
  const key = String(value || '').trim().toLowerCase();
  return CAPABILITY_ALIASES[key] || key;
};

const parseModelConfig = (config: RealModelItem['config']) => {
  if (!config) return {};
  if (typeof config === 'object') return config;
  try {
    return JSON.parse(config) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const formatPricingRulesForForm = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
};

const parsePricingRulesForSubmit = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('定价规则 JSON 必须是对象');
  }
  return parsed;
};

const readPricingRulesObject = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const compactObject = (source: Record<string, unknown>) => Object.fromEntries(
  Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== ''),
);

const pricingRulesToBuilderFields = (value: unknown) => {
  const rules = readPricingRulesObject(value);
  const defaultParams = readPricingRulesObject(rules.defaultParams);
  const rows = Array.isArray(rules.rules)
    ? rules.rules.map((rule: any) => {
        const conditions = readPricingRulesObject(rule?.conditions);
        return {
          duration: conditions.duration,
          quality: conditions.quality || conditions.resolution,
          audioMode: conditions.audioMode,
          pointsCost: rule?.pointsCost,
          unitPoints: rule?.unitPoints,
          preauthPoints: rule?.preauthPoints,
          label: rule?.label,
        };
      })
    : [];
  return {
    pricingDefaultParams: {
      duration: defaultParams.duration,
      quality: defaultParams.quality || defaultParams.resolution,
      audioMode: defaultParams.audioMode,
    },
    pricingPreauthPoints: rules.preauthPoints,
    pricingRuleRows: rows.length ? rows : [{}],
  };
};

const buildPricingRulesFromBuilder = (values: Record<string, any>) => {
  const mode = String(values.pricingMode || 'fixed');
  if (mode === 'fixed') return null;
  if (mode === 'token_preauth') {
    return {
      mode,
      preauthPoints: Number(values.pricingPreauthPoints || values.pointsCost || 0),
      settlement: 'manual_later',
    };
  }
  const defaultParams = compactObject({
    duration: values.pricingDefaultParams?.duration,
    quality: values.pricingDefaultParams?.quality,
    audioMode: values.pricingDefaultParams?.audioMode,
  });
  const rows = Array.isArray(values.pricingRuleRows) ? values.pricingRuleRows : [];
  const rules = rows.map((row: Record<string, any>) => {
    const conditions = compactObject({
      duration: row?.duration,
      quality: row?.quality,
      audioMode: row?.audioMode,
    });
    const priceField = mode === 'per_second_matrix'
      ? { unitPoints: Number(row?.unitPoints || 0) }
      : { pointsCost: Number(row?.pointsCost || 0) };
    return compactObject({
      label: row?.label,
      conditions,
      ...priceField,
    });
  }).filter((row) => Object.keys(row.conditions as Record<string, unknown> || {}).length > 0);
  return compactObject({
    mode,
    defaultParams,
    defaultUnitPoints: mode === 'per_second_matrix' ? Number(values.defaultUnitPoints || 0) || undefined : undefined,
    rules,
  });
};

const normalizeCapabilityList = (value: unknown) => {
  const items = Array.isArray(value) ? value : [];
  return Array.from(new Set(items.map(normalizeCapabilityKey).filter(Boolean)));
};

const getModelCapabilities = (model: RealModelItem) => {
  const explicit = normalizeCapabilityList(model.capabilities);
  if (explicit.length) return { capabilities: explicit, explicit: true };
  const config = parseModelConfig(model.config);
  const configured = normalizeCapabilityList(config.capabilities);
  if (configured.length) return { capabilities: configured, explicit: true };

  const type = String(model.modelType || '').toLowerCase();
  const subType = String(model.subType || '').toLowerCase();
  if (type === 'image' || type === 'multimodal') {
    if (subType.includes('image_to_image') || subType.includes('img2img')) return { capabilities: ['image_to_image'], explicit: false };
    if (subType.includes('edit')) return { capabilities: ['image_edit'], explicit: false };
    return { capabilities: ['text_to_image'], explicit: false };
  }
  if (type === 'video') {
    if (subType.includes('first_last_frame')) return { capabilities: ['first_last_frame_video'], explicit: false };
    if (subType.includes('image_to_video') || subType.includes('img2video') || subType.includes('image2video')) return { capabilities: ['image_to_video'], explicit: false };
    if (subType.includes('edit')) return { capabilities: ['video_edit'], explicit: false };
    return { capabilities: ['text_to_video'], explicit: false };
  }
  if (type === 'text') return { capabilities: ['text_generation', 'text_chat', 'prompt_optimize'], explicit: false };
  return { capabilities: [], explicit: false };
};

const modelSupportsFeature = (model: RealModelItem, featureKey: string) => {
  const required = FEATURE_REQUIRED_CAPABILITIES[featureKey] || [];
  const expectedType = FEATURE_TYPES[featureKey];
  const modelType = String(model.modelType || '');
  if (expectedType === 'image' && !['image', 'multimodal'].includes(modelType)) return false;
  if (expectedType === 'video' && !['video', 'multimodal'].includes(modelType)) return false;
  if (expectedType === 'text' && !['text', 'multimodal'].includes(modelType)) return false;
  if (!required.length) return true;
  const caps = getModelCapabilities(model).capabilities;
  return required.some((item) => caps.includes(normalizeCapabilityKey(item)));
};

const isVideoFeatureKey = (featureKey?: string) => FEATURE_TYPES[featureKey || ''] === 'video';

const isReferenceTier = (tier?: Pick<TierItem, 'tierKey' | 'tierName'> | null) => {
  const text = `${tier?.tierKey || ''} ${tier?.tierName || ''}`.toLowerCase();
  return text.includes('reference') || text.includes('cankao') || text.includes('参考');
};

const defaultUploadModeForFeature = (featureKey: string, tier?: Pick<TierItem, 'tierKey' | 'tierName'> | null) => {
  if (featureKey === 'video_create') return 'none';
  if (featureKey === 'image_to_video') return isReferenceTier(tier) ? 'reference_images' : 'first_frame';
  if (featureKey === 'first_last_frame_video') return 'first_last';
  if (featureKey === 'video_edit') return 'source_video';
  return '';
};

const inputModeForUploadMode = (uploadMode?: string | null) => {
  if (uploadMode === 'none') return 'text';
  if (uploadMode === 'first_frame') return 'first_frame';
  if (uploadMode === 'reference_images') return 'reference_images';
  if (uploadMode === 'first_last') return 'first_last';
  if (uploadMode === 'source_video') return 'source_video';
  return null;
};

const minReferenceImagesForUploadMode = (uploadMode?: string | null) => {
  if (uploadMode === 'first_last') return 2;
  if (uploadMode === 'first_frame' || uploadMode === 'reference_images' || uploadMode === 'source_video') return 1;
  return 0;
};

const uploadModeLabel = (uploadMode?: string | null) => {
  const option = VIDEO_UPLOAD_MODE_OPTIONS.find((item) => item.value === (uploadMode || ''));
  return option?.label || uploadMode || '自动推导';
};

const uploadModeTagColor = (uploadMode?: string | null) => {
  if (uploadMode === 'first_frame') return 'cyan';
  if (uploadMode === 'reference_images') return 'purple';
  if (uploadMode === 'first_last') return 'geekblue';
  if (uploadMode === 'source_video') return 'orange';
  if (uploadMode === 'none') return 'default';
  return 'blue';
};

const requiredReferenceFormValue = (value: boolean | null | undefined) => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'auto';
};

const requiredReferenceSubmitValue = (value: string | undefined) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

export default function FeatureConfig() {
  const location = useLocation();
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [tiers, setTiers] = useState<TierItem[]>([]);
  const [models, setModels] = useState<RealModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(ORDERED_FEATURES[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TierItem | null>(null);
  const [form] = Form.useForm();
  const [priceModal, setPriceModal] = useState(false);
  const [priceTier, setPriceTier] = useState<TierItem | null>(null);
  const [priceForm] = Form.useForm();
  const [bindModal, setBindModal] = useState(false);
  const [bindTier, setBindTier] = useState<TierItem | null>(null);
  const [bindForm] = Form.useForm();
  const [bindingFallbackRows, setBindingFallbackRows] = useState<BindingFallbackRow[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [activeEditSection, setActiveEditSection] = useState(EDIT_SECTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [priceSaving, setPriceSaving] = useState(false);
  const [bindSaving, setBindSaving] = useState(false);
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<number[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [copySourceTier, setCopySourceTier] = useState<TierItem | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyForm] = Form.useForm();
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [sortRows, setSortRows] = useState<{ id: number; tierName: string; currentSort: number; newSort: number }[]>([]);
  const [sortSaving, setSortSaving] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateForm] = Form.useForm();
  const [templateSaving, setTemplateSaving] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportForm] = Form.useForm();
  const [importForm] = Form.useForm();
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreScope, setRestoreScope] = useState<RestoreScope>('current');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const tierRequestSeq = useRef(0);

  const fetchFeatures = useCallback(() => api.get('/model-features').then((r: any) => {
    const list = r.data || [];
    setFeatures(list);
    setActiveFeature((current) => (
      list.some((item: FeatureItem) => item.featureKey === current)
        ? current
        : list[0]?.featureKey || ORDERED_FEATURES[0]
    ));
  }).catch((e: any) => {
    setFeatures([]);
    if (!e?.response?.data?.message) message.error('获取功能页列表失败');
  }), []);
  const fetchModels = useCallback(() => api.get('/real-models').then((r: any) => setModels(r.data || [])).catch((e: any) => {
    setModels([]);
    if (!e?.response?.data?.message) message.error('获取真实模型列表失败');
  }), []);
  const fetchTiers = useCallback(() => {
    if (!activeFeature) return;
    if (features.length && !features.some((item) => item.featureKey === activeFeature)) {
      setTiers([]);
      setSelectedTierId(null);
      return;
    }
    const requestSeq = tierRequestSeq.current + 1;
    tierRequestSeq.current = requestSeq;
    setLoading(true);
    api.get('/model-tiers?feature=' + encodeURIComponent(activeFeature))
      .then((r: any) => {
        if (requestSeq !== tierRequestSeq.current) return;
        const list = r.data || [];
        setTiers(list);
        setSelectedTierId((prev) => {
          if (prev && list.some((item: TierItem) => item.id === prev)) return prev;
          return list[0]?.id || null;
        });
      })
      .catch((e: any) => {
        if (requestSeq !== tierRequestSeq.current) return;
        setTiers([]);
        setSelectedTierId(null);
        if (!e?.response?.data?.message) message.error('获取入口配置失败');
      })
      .finally(() => {
        if (requestSeq === tierRequestSeq.current) setLoading(false);
      });
  }, [activeFeature, features]);

  useEffect(() => { fetchFeatures(); fetchModels(); }, [fetchFeatures, fetchModels]);
  useEffect(() => {
    const feature = new URLSearchParams(location.search).get('feature');
    if (feature && ORDERED_FEATURES.includes(feature)) setActiveFeature(feature);
  }, [location.search]);
  useEffect(() => { fetchTiers(); }, [fetchTiers]);

  const featureTabs = useMemo(() => {
    const map = new Map(features.map((item) => [item.featureKey, item]));
    return ORDERED_FEATURES.map((key) => {
      const existing = map.get(key);
      return {
        key,
        label: existing ? FEATURE_LABELS[key] || existing.featureName || key : `${FEATURE_LABELS[key] || key}（未初始化）`,
        disabled: !existing,
      };
    });
  }, [features]);

  const selectedTier = tiers.find((item) => item.id === selectedTierId) || null;
  const activeFeatureItem = features.find((item) => item.featureKey === activeFeature);
  const ft = FEATURE_TYPES[activeFeature] || 'image';
  const qualities = QUALITY_OPTIONS[ft] || [];
  const ratios = RATIO_OPTIONS[ft] || [];
  const enabledCount = tiers.filter((item) => item.status === 'active').length;
  const disabledCount = tiers.filter((item) => item.status !== 'active').length;
  const unboundCount = tiers.filter((item) => !item.bindings || item.bindings.length === 0).length;

  const openCreate = () => {
    if (!activeFeatureItem) {
      message.warning('当前功能暂未初始化，无法新增入口');
      return;
    }
    const uploadMode = defaultUploadModeForFeature(activeFeature);
    const minReferenceImages = minReferenceImagesForUploadMode(uploadMode);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      pointsCost: 1,
      pricingMode: 'fixed',
      pricingRules: '',
      pricingDefaultParams: {},
      pricingPreauthPoints: undefined,
      pricingRuleRows: [{}],
      sortOrder: 0,
      qualityMultipliers: { '1K': 1.0, '2K': 2.0, '4K': 4.0 },
      isDefault: false,
      isRecommended: false,
      status: 'active',
      failoverOnError: true,
      primaryModelId: undefined,
      fallbackModelIds: [],
      fallbackPriority: 1,
      maxEntries: 1,
      maxReferenceImages: DEFAULT_MAX_REFERENCE_IMAGES,
      referenceUploadMode: uploadMode,
      minReferenceImages,
      requiredReference: requiredReferenceFormValue(minReferenceImages > 0),
      timeoutSeconds: 120,
      concurrencyLimit: 5,
    });
    setModalOpen(true);
  };

  const openEdit = (tier: TierItem) => {
    setEditing(tier);
    setSelectedTierId(tier.id);
    const bindings = tier.bindings || [];
    const primary = bindings.find((binding) => binding.bindingType === 'primary') || bindings[0] || null;
    const fallbacks = bindings.filter((binding) => binding.modelId !== primary?.modelId);
    const pricingBuilderFields = pricingRulesToBuilderFields(tier.pricingRules);
    const uploadMode = tier.capabilities?.referenceUploadMode || defaultUploadModeForFeature(tier.featureKey || activeFeature, tier);
    form.setFieldsValue({
      tierName: tier.tierName,
      tierKey: tier.tierKey,
      description: tier.description,
      tag: tier.tag,
      pointsCost: tier.pointsCost,
      pricingMode: tier.pricingMode || 'fixed',
      pricingRules: formatPricingRulesForForm(tier.pricingRules),
      ...pricingBuilderFields,
      isDefault: tier.isDefault,
      isRecommended: tier.isRecommended,
      sortOrder: tier.sortOrder,
      status: tier.status,
      maxEntries: tier.maxEntries || 3,
      maxReferenceImages: tier.capabilities?.maxReferenceImages || DEFAULT_MAX_REFERENCE_IMAGES,
      referenceUploadMode: uploadMode,
      minReferenceImages: tier.capabilities?.minReferenceImages ?? minReferenceImagesForUploadMode(uploadMode),
      requiredReference: requiredReferenceFormValue(tier.capabilities?.requiredReference),
      tierType: tier.tag || '自定义',
      badge: tier.tag,
      displayColor: '#1677ff',
      failoverOnError: true,
      primaryModelId: primary?.modelId,
      fallbackModelIds: fallbacks.map((binding) => binding.modelId),
      fallbackPriority: fallbacks[0]?.fallbackOrder ?? 1,
      timeoutSeconds: 120,
      concurrencyLimit: 5,
      qualityMultipliers: tier.qualityMultipliers || {},
    });
    setModalOpen(true);
  };

  const buildBindingPayload = (
    primaryModelId: number | undefined,
    fallbackModelIds: number[] = [],
    failoverOnError = true,
    fallbackPriority = 1,
  ) => {
    if (!primaryModelId) return [];
    return [
      {
        modelId: Number(primaryModelId),
        bindingType: 'primary',
        fallbackOrder: 0,
        failoverOnError: failoverOnError !== false,
        failoverOnTimeout: failoverOnError !== false,
        failoverOnRateLimit: failoverOnError !== false,
      },
      ...fallbackModelIds.map((modelId: number, index: number) => ({
        modelId: Number(modelId),
        bindingType: 'fallback',
        fallbackOrder: Number(fallbackPriority || 1) + index,
        failoverOnError: failoverOnError !== false,
        failoverOnTimeout: failoverOnError !== false,
        failoverOnRateLimit: failoverOnError !== false,
      })),
    ];
  };

  const validateBindingPayload = (bindings: Array<{ modelId: number }>) => {
    const seen = new Set<number>();
    for (const binding of bindings) {
      if (seen.has(binding.modelId)) return '同一个模型不能重复绑定';
      seen.add(binding.modelId);
      const model = models.find((item) => item.id === binding.modelId);
      if (!model) return `模型#${binding.modelId} 未同步，请刷新模型列表`;
      if (model.status !== 'active') return `模型 ${model.name || binding.modelId} 未启用`;
      if (!modelSupportsFeature(model, activeFeature)) return `模型 ${model.name || binding.modelId} 不支持${FEATURE_LABELS[activeFeature] || activeFeature}`;
    }
    return '';
  };

  const applyTierBindings = (tierId: number, bindings: ModelBinding[]) => {
    setTiers((items) => items.map((item) => item.id === tierId ? { ...item, bindings } : item));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      const featureId = features.find((item) => item.featureKey === activeFeature)?.id;
      if (!editing && !featureId) {
        message.error('当前功能暂未启用，无法新增入口');
        return;
      }
      const qualityMultipliers = qualities.length
        ? Object.fromEntries(qualities.map((quality, index) => [quality, Number(values.qualityMultipliers?.[quality] || index + 1)]))
        : values.qualityMultipliers || {};
      let pricingRules: Record<string, unknown> | null = null;
      try {
        pricingRules = parsePricingRulesForSubmit(values.pricingRules);
      } catch (err: any) {
        message.error(err?.message || '定价规则 JSON 格式错误');
        return;
      }
      const body = {
        featureId,
        tierName: values.tierName,
        tierKey: values.tierKey,
        description: values.description,
        tag: values.tierType === '自定义' ? values.badge || values.tag || '自定义' : values.tierType || values.tag,
        pointsCost: values.pointsCost,
        pricingMode: values.pricingMode || 'fixed',
        pricingRules,
        isDefault: !!values.isDefault,
        isRecommended: !!values.isRecommended,
        sortOrder: values.sortOrder,
        status: values.status,
        iconFileId: values.iconFileId,
        qualityMultipliers,
      };
      const fallbackModelIds = (values.fallbackModelIds || []).filter(Boolean);
      if (values.primaryModelId && fallbackModelIds.includes(values.primaryModelId)) {
        message.error('备用模型不能和主模型重复');
        return;
      }
      const bindingPayload = buildBindingPayload(values.primaryModelId, fallbackModelIds, values.failoverOnError, values.fallbackPriority);
      const bindingError = validateBindingPayload(bindingPayload);
      if (bindingError) {
        message.error(bindingError);
        return;
      }
      let savedTierId = editing?.id;
      if (editing) await api.put('/model-tiers/' + editing.id, body);
      else {
        const created: any = await api.post('/model-tiers', body);
        savedTierId = created?.data?.id;
      }
      if (savedTierId) {
        try {
          const uploadMode = values.referenceUploadMode || null;
          await api.put('/model-tiers/' + savedTierId + '/capabilities', {
            maxReferenceImages: Number(values.maxReferenceImages || DEFAULT_MAX_REFERENCE_IMAGES),
            inputMode: inputModeForUploadMode(uploadMode),
            referenceUploadMode: uploadMode,
            minReferenceImages: values.minReferenceImages === undefined || values.minReferenceImages === null ? null : Number(values.minReferenceImages),
            requiredReference: requiredReferenceSubmitValue(values.requiredReference),
          });
        } catch (e: any) {
          message.warning(e?.response?.data?.message || '入口已保存，但视频上传能力保存失败');
        }
      }
      if (savedTierId) {
        const bindingResult: any = await api.put('/model-tiers/' + savedTierId + '/bindings', { bindings: bindingPayload });
        const nextBindings = Array.isArray(bindingResult?.data?.bindings) ? bindingResult.data.bindings as ModelBinding[] : null;
        if (nextBindings) applyTierBindings(savedTierId, nextBindings);
      }
      message.success(editing ? '已保存' : '已创建');
      setModalOpen(false);
      fetchTiers();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '保存入口失败');
    } finally {
      setSaving(false);
    }
  };

  const applyPricingBuilder = () => {
    const values = form.getFieldsValue(true);
    const rules = buildPricingRulesFromBuilder(values);
    form.setFieldsValue({
      pricingRules: rules ? JSON.stringify(rules, null, 2) : '',
    });
    message.success('已生成动态定价 JSON，请保存入口配置后生效');
  };

  const openCopyTier = (tier?: TierItem | null) => {
    const source = tier || selectedTier;
    if (!source) {
      message.warning('请先选择一个入口');
      return;
    }
    setCopySourceTier(source);
    copyForm.resetFields();
    copyForm.setFieldsValue({
      tierName: `${source.tierName || '新入口'} 副本`,
      tierKey: `${source.tierKey || 'tier'}_copy_${Date.now().toString().slice(-4)}`,
      sortOrder: Number(source.sortOrder || 0) + 1,
      copyBindings: true,
      copyPricing: true,
      status: false,
    });
    setCopyModalOpen(true);
  };

  const copyTier = async () => {
    if (saving || !copySourceTier) return;
    setSaving(true);
    try {
      const values = await copyForm.validateFields();
      const featureId = features.find((item) => item.featureKey === activeFeature)?.id || copySourceTier.featureId;
      if (!featureId) {
        message.error('当前功能暂未启用，无法复制入口');
        return;
      }
      const created: any = await api.post('/model-tiers', {
        featureId,
        tierName: values.tierName,
        tierKey: values.tierKey,
        description: copySourceTier.description || '',
        tag: copySourceTier.tag || '',
        pointsCost: values.copyPricing ? copySourceTier.pointsCost ?? 1 : 1,
        pricingMode: values.copyPricing ? copySourceTier.pricingMode || 'fixed' : 'fixed',
        pricingRules: values.copyPricing ? copySourceTier.pricingRules || null : null,
        isDefault: false,
        isRecommended: false,
        sortOrder: values.sortOrder || 0,
        iconFileId: copySourceTier.iconFileId || null,
        qualityMultipliers: values.copyPricing ? copySourceTier.qualityMultipliers || {} : {},
      });
      const newTierId = created?.data?.id;
      if (newTierId && !values.status) {
        await api.put('/model-tiers/' + newTierId, { status: 'inactive' });
      }
      if (newTierId && values.copyBindings && copySourceTier.bindings?.length) {
        const bindings = copySourceTier.bindings.map((binding, index) => ({
          modelId: binding.modelId,
          bindingType: binding.bindingType || (index === 0 ? 'primary' : 'fallback'),
          fallbackOrder: binding.fallbackOrder ?? index,
          failoverOnError: binding.failoverOnError !== false,
          failoverOnTimeout: binding.failoverOnTimeout !== false,
          failoverOnRateLimit: binding.failoverOnRateLimit !== false,
        }));
        await api.put('/model-tiers/' + newTierId + '/bindings', { bindings });
      }
      message.success('入口已复制');
      setCopyModalOpen(false);
      fetchTiers();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '复制入口失败');
    } finally {
      setSaving(false);
    }
  };

  const openPrice = (tier: TierItem) => {
    setPriceTier(tier);
    setSelectedTierId(tier.id);
    priceForm.setFieldsValue(tier.qualityMultipliers || {});
    setPriceModal(true);
  };

  const savePrice = async () => {
    if (priceSaving) return;
    setPriceSaving(true);
    try {
      const values = await priceForm.validateFields();
      if (!priceTier) return;
      await api.put('/model-tiers/' + priceTier.id, { qualityMultipliers: values });
      message.success('定价已保存');
      setPriceModal(false);
      fetchTiers();
    } catch (e: any) {
      if (e?.errorFields) return;
      if (!e?.response?.data?.message) message.error('保存画质倍率失败');
    } finally {
      setPriceSaving(false);
    }
  };

  const compatibleModels = useMemo(() => {
    return models.filter((model) => modelSupportsFeature(model, activeFeature));
  }, [activeFeature, models]);

  const modelOptionLabel = (model: RealModelItem) => (
    <Space size={6} wrap>
      <Text>{model.providerName || '未知供应商'} / {model.name || `模型#${model.id}`}</Text>
      <Tag color={model.modelType === 'video' ? 'purple' : model.modelType === 'text' ? 'cyan' : 'blue'}>
        {({ image: '图片', video: '视频', text: '文本', multimodal: '多模态' } as Record<string, string>)[model.modelType || ''] || model.modelType || '未知'}
      </Tag>
      <Tag color={model.status === 'active' ? 'success' : 'default'}>{model.status === 'active' ? '启用' : '已停用'}</Tag>
    </Space>
  );

  const modelSelectOptions = compatibleModels.map((model) => ({
    label: modelOptionLabel(model),
    value: model.id,
    disabled: model.status !== 'active',
    labelText: `${model.providerName || ''} ${model.name || ''} ${model.apiModelName || ''}`,
  }));

  const setTierStatus = async (tier: TierItem, status: 'active' | 'inactive') => {
    if (statusUpdatingIds.includes(tier.id)) return;
    setStatusUpdatingIds((ids) => [...ids, tier.id]);
    try {
      await api.put('/model-tiers/' + tier.id, { status });
      message.success(status === 'active' ? '已启用' : '已停用');
      fetchTiers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败');
    } finally {
      setStatusUpdatingIds((ids) => ids.filter((id) => id !== tier.id));
    }
  };

  const deleteTier = async (id: number) => {
    if (statusUpdatingIds.includes(id)) return;
    setStatusUpdatingIds((ids) => [...ids, id]);
    try {
      await api.delete('/model-tiers/' + id);
      message.success('入口已删除');
      fetchTiers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '删除入口失败');
    } finally {
      setStatusUpdatingIds((ids) => ids.filter((item) => item !== id));
    }
  };

  const confirmTierStatus = (tier: TierItem, status: 'active' | 'inactive') => {
    const hasBinding = !!tier.bindings?.length;
    Modal.confirm({
      title: status === 'active' ? '确认启用入口？' : '确认停用入口？',
      width: 560,
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>
            {status === 'active'
              ? '启用后，如果已绑定可用模型，将在前台对应功能页展示。'
              : '停用后，该入口将不会在前台对应功能页展示。'}
          </Text>
          {status === 'active' && !hasBinding ? (
            <Alert type="warning" showIcon message="当前入口尚未绑定真实模型，启用后仍可能无法在前台正常展示。" />
          ) : null}
        </Space>
      ),
      okText: status === 'active' ? '确认启用' : '确认停用',
      okButtonProps: status === 'inactive' ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: () => setTierStatus(tier, status),
    });
  };

  const confirmDeleteTier = (tier: TierItem) => {
    Modal.confirm({
      title: '删除功能入口',
      width: 520,
      content: (
        <Space direction="vertical" size={10}>
          <Alert type="error" showIcon message="删除后前台将不再显示该入口。" />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="入口名称">{tier.tierName || `入口#${tier.id}`}</Descriptions.Item>
            <Descriptions.Item label="所属功能">{FEATURE_LABELS[tier.featureKey || activeFeature] || tier.featureName || activeFeature}</Descriptions.Item>
          </Descriptions>
          <Text type="secondary">删除会同时移除该入口的能力配置和模型绑定关系，操作后不可恢复。</Text>
        </Space>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteTier(tier.id),
    });
  };

  const openBind = (tier: TierItem) => {
    setBindTier(tier);
    setSelectedTierId(tier.id);
    const bindings = tier.bindings || [];
    const primary = bindings.find((binding) => binding.bindingType === 'primary') || bindings[0] || null;
    const fallbacks = bindings
      .filter((binding) => binding.modelId !== primary?.modelId)
      .map((binding, index) => ({
        modelId: binding.modelId,
        fallbackOrder: binding.fallbackOrder ?? index + 1,
      }));
    bindForm.resetFields();
    bindForm.setFieldsValue({
      primaryModelId: primary?.modelId,
      failoverOnError: primary?.failoverOnError !== false,
      fallbackModelIds: fallbacks.map((item) => item.modelId),
    });
    setBindingFallbackRows(fallbacks);
    setBindModal(true);
  };

  const saveBind = async () => {
    if (bindSaving) return;
    setBindSaving(true);
    try {
      if (!bindTier) return;
      const values = await bindForm.validateFields();
      const primaryModelId = values.primaryModelId;
      if (!primaryModelId) {
        message.error('请选择主模型');
        return;
      }
      const selectedModelIds = [primaryModelId, ...(values.fallbackModelIds || [])].map(Number).filter(Boolean);
      const invalidModelId = selectedModelIds.find((id) => {
        const model = models.find((item) => item.id === id);
        return !model || model.status !== 'active' || !modelSupportsFeature(model, activeFeature);
      });
      if (invalidModelId) {
        const invalidModel = models.find((item) => item.id === invalidModelId);
        message.error(`模型 ${invalidModel?.name || invalidModelId} 未启用或不支持${FEATURE_LABELS[activeFeature] || activeFeature}`);
        return;
      }
      const fallbackRows = bindingFallbackRows
        .filter((row) => row.modelId && row.modelId !== primaryModelId)
        .sort((a, b) => Number(a.fallbackOrder || 0) - Number(b.fallbackOrder || 0));
      if (fallbackRows.length !== bindingFallbackRows.filter((row) => row.modelId).length) {
        message.error('备用模型不能和主模型重复');
        return;
      }
      const duplicateFallbacks = new Set(fallbackRows.map((row) => row.modelId));
      if (duplicateFallbacks.size !== fallbackRows.length) {
        message.error('备用模型不能重复');
        return;
      }
      const bindings = [
        {
          modelId: primaryModelId,
          bindingType: 'primary',
          fallbackOrder: 0,
          failoverOnError: values.failoverOnError !== false,
          failoverOnTimeout: values.failoverOnError !== false,
          failoverOnRateLimit: values.failoverOnError !== false,
        },
        ...fallbackRows.map((row, index) => ({
          modelId: row.modelId,
          bindingType: 'fallback',
          fallbackOrder: row.fallbackOrder ?? index + 1,
          failoverOnError: values.failoverOnError !== false,
          failoverOnTimeout: values.failoverOnError !== false,
          failoverOnRateLimit: values.failoverOnError !== false,
        })),
      ];
      const bindingResult: any = await api.put('/model-tiers/' + bindTier.id + '/bindings', { bindings });
      const nextBindings = Array.isArray(bindingResult?.data?.bindings) ? bindingResult.data.bindings as ModelBinding[] : null;
      if (nextBindings) applyTierBindings(bindTier.id, nextBindings);
      message.success('绑定已保存');
      setBindModal(false);
      fetchTiers();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '保存模型绑定失败');
    } finally {
      setBindSaving(false);
    }
  };

  const openSortModal = () => {
    setSortRows(tiers.map((tier) => ({
      id: tier.id,
      tierName: tier.tierName || `入口#${tier.id}`,
      currentSort: Number(tier.sortOrder || 0),
      newSort: Number(tier.sortOrder || 0),
    })));
    setSortModalOpen(true);
  };

  const saveSort = async () => {
    if (sortSaving) return;
    const sorts = sortRows.map((row) => Number(row.newSort));
    if (sorts.some((item) => !Number.isFinite(item))) {
      message.error('新排序必须是数字');
      return;
    }
    if (new Set(sorts).size !== sorts.length) {
      message.error('新排序不允许重复');
      return;
    }
    setSortSaving(true);
    try {
      await Promise.all(sortRows
        .filter((row) => row.newSort !== row.currentSort)
        .map((row) => api.put('/model-tiers/' + row.id, { sortOrder: row.newSort })));
      message.success('排序已保存');
      setSortModalOpen(false);
      fetchTiers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存排序失败');
    } finally {
      setSortSaving(false);
    }
  };

  const openTemplateModal = () => {
    templateForm.resetFields();
    templateForm.setFieldsValue({ templateKey: FEATURE_TYPES[activeFeature] === 'video' ? 'video-basic' : 'standard-image' });
    setTemplateModalOpen(true);
  };

  const createFromTemplate = async () => {
    if (templateSaving) return;
    const values = await templateForm.validateFields();
    const template = TEMPLATE_OPTIONS.find((item) => item.value === values.templateKey);
    if (!template || template.value === 'custom' || template.items.length === 0) {
      message.warning('自定义模板暂未接入，请先选择预设模板');
      return;
    }
    const featureId = features.find((item) => item.featureKey === activeFeature)?.id;
    if (!featureId) {
      message.error('当前功能暂未启用，无法创建模板配置');
      return;
    }
    setTemplateSaving(true);
    try {
      for (const item of template.items) {
        const created: any = await api.post('/model-tiers', {
          featureId,
          tierName: item.tierName,
          tierKey: `${activeFeature}_${item.tierType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          description: `${item.tierName}入口`,
          tag: item.tierType,
          pointsCost: item.pointsCost,
          isDefault: item.tierType === '快速',
          isRecommended: item.tierType === '专业',
          sortOrder: item.sortOrder,
          qualityMultipliers: { '1K': 1, '2K': 2, '4K': 4 },
        });
        const createdId = created?.data?.id;
        if (createdId && !item.enabled) await api.put('/model-tiers/' + createdId, { status: 'inactive' });
      }
      message.success('模板配置已创建');
      setTemplateModalOpen(false);
      fetchTiers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '从模板创建配置失败');
    } finally {
      setTemplateSaving(false);
    }
  };

  const openExportModal = () => {
    exportForm.resetFields();
    exportForm.setFieldsValue({ scope: 'current', format: 'json', includeBindings: true });
    setExportModalOpen(true);
  };

  const exportCurrentConfig = async () => {
    const values = await exportForm.validateFields();
    const exportTiers = values.scope === 'current' ? tiers : tiers;
    const payload = {
      exportedAt: new Date().toISOString(),
      scope: values.scope,
      feature: values.scope === 'current' ? activeFeature : 'all',
      featureName: values.scope === 'current' ? FEATURE_LABELS[activeFeature] || activeFeature : '全部功能',
      tiers: exportTiers.map((tier) => ({
        id: tier.id,
        featureKey: tier.featureKey,
        featureName: tier.featureName,
        tierName: tier.tierName,
        tierKey: tier.tierKey,
        description: tier.description,
        tag: tier.tag,
        pointsCost: tier.pointsCost,
        pricingMode: tier.pricingMode || 'fixed',
        pricingRules: tier.pricingRules || null,
        sortOrder: tier.sortOrder,
        status: tier.status,
        qualityMultipliers: tier.qualityMultipliers || {},
        bindings: values.includeBindings ? (tier.bindings || []).map((binding) => ({
          modelId: binding.modelId,
          modelName: binding.modelName,
          providerName: binding.providerName,
          bindingType: binding.bindingType,
          fallbackOrder: binding.fallbackOrder,
        })) : undefined,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.download = `feature-config-${payload.featureName}-${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
    message.success('配置已导出');
  };

  const analyzeImportConfig = (text: string) => {
    if (/api[_-]?key|authorization|secret|password/i.test(text)) {
      setImportPreview({ count: 0, missingModels: [], conflicts: [], unsupportedFields: ['检测到敏感字段，禁止导入'], blocked: true });
      return;
    }
    const parsed = JSON.parse(text);
    const incomingTiers = Array.isArray(parsed?.tiers) ? parsed.tiers : Array.isArray(parsed) ? parsed : [];
    const allowedKeys = new Set(['tierName', 'tierKey', 'description', 'tag', 'pointsCost', 'pricingMode', 'pricingRules', 'sortOrder', 'status', 'qualityMultipliers', 'bindings']);
    const unsupportedFields = Array.from(new Set<string>(incomingTiers.flatMap((tier: Record<string, unknown>) => Object.keys(tier).filter((key) => !allowedKeys.has(key) && key !== 'id' && key !== 'featureKey' && key !== 'featureName'))));
    const conflicts = incomingTiers
      .map((tier: TierItem) => tier.tierName)
      .filter((name: string) => name && tiers.some((item) => item.tierName === name));
    const modelIds = new Set(models.map((model) => model.id));
    const missingModels = incomingTiers
      .flatMap((tier: TierItem) => tier.bindings || [])
      .filter((binding: ModelBinding) => binding.modelId && !modelIds.has(binding.modelId))
      .map((binding: ModelBinding) => binding.modelName || `模型#${binding.modelId}`);
    setImportPreview({
      count: incomingTiers.length,
      missingModels: Array.from(new Set(missingModels)),
      conflicts: Array.from(new Set(conflicts)),
      unsupportedFields,
      blocked: true,
    });
  };

  const showImportDialog = () => {
    importForm.resetFields();
    importForm.setFieldsValue({ mode: 'createOnly' });
    setImportPreview(null);
    setImportModalOpen(true);
  };

  const openRestoreDefaults = () => {
    setRestoreScope('current');
    setRestoreConfirmText('');
    setRestoreModalOpen(true);
  };

  const tierTypeLabel = (tier: TierItem, index: number) => {
    if (tier.tag) return tier.tag;
    if (tier.isRecommended) return '专业';
    if (tier.isDefault) return '快速';
    return DEFAULT_TIER_TYPE_LABELS[index % DEFAULT_TIER_TYPE_LABELS.length];
  };

  const primaryBinding = (tier: TierItem) => {
    const bindings = tier.bindings || [];
    return bindings.find((item) => item.bindingType === 'primary') || bindings[0] || null;
  };

  const fallbackCount = (tier: TierItem) => {
    const bindings = tier.bindings || [];
    if (!bindings.length) return 0;
    const explicitFallbackCount = bindings.filter((item) => item.bindingType === 'fallback').length;
    return explicitFallbackCount || Math.max(bindings.length - 1, 0);
  };

  const modelNames = (tier: TierItem) => {
    const bindings = tier.bindings || [];
    return bindings.map((item) => item.modelName || `模型#${item.modelId}`).filter(Boolean).join(' / ');
  };

  const modelStatusMeta = (modelId: number) => {
    const model = models.find((item) => item.id === modelId);
    if (!model) return { color: 'default', text: '未同步' };
    if (model.status !== 'active') return { color: 'default', text: '已停用' };
    if (model.lastTestStatus === 'failed') return { color: 'error', text: '异常' };
    if (!model.lastTestStatus || model.lastTestStatus === 'untested') return { color: 'warning', text: '未测试' };
    return { color: 'success', text: '可用' };
  };

  const bindingStatusMeta = (binding?: ModelBinding | null) => {
    if (!binding) return { color: 'default', text: '未绑定' };
    if (binding.canUse === true) return { color: 'success', text: '可展示' };
    if (binding.canUse === false) return { color: 'warning', text: binding.unusableReason || '需检查' };
    return modelStatusMeta(binding.modelId);
  };

  const hasUsableBinding = (tier: TierItem) => (tier.bindings || []).some((binding) => bindingStatusMeta(binding).text === '可展示' || bindingStatusMeta(binding).text === '可用');

  const restorePreviewTemplate = TEMPLATE_OPTIONS.find((item) => item.value === (FEATURE_TYPES[activeFeature] === 'video' ? 'video-basic' : 'standard-image')) || TEMPLATE_OPTIONS[0];

  const columns: ColumnsType<TierItem> = [
    {
      title: '',
      key: 'drag',
      width: 42,
      align: 'center',
      render: () => <DragOutlined style={{ color: '#94a3b8', cursor: 'grab' }} />,
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 86,
      render: (value: number) => (
        <InputNumber min={0} value={value || 0} size="small" style={{ width: 58 }} readOnly />
      ),
    },
    {
      title: '前台显示名称',
      dataIndex: 'tierName',
      width: 180,
      ellipsis: true,
      render: (value: string, record, index) => (
        <Space size={10}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            background: ['#6366f1', '#f59e0b', '#14b8a6', '#64748b'][index % 4],
          }}>
            {tierTypeLabel(record, index).slice(0, 1)}
          </div>
          <div style={{ minWidth: 0 }}>
            <Tooltip title={value || '-'}>
              <Text strong style={{ display: 'block', maxWidth: 118 }} ellipsis>{value || '-'}</Text>
            </Tooltip>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.tierKey || '-'}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '入口说明',
      dataIndex: 'description',
      width: 210,
      ellipsis: true,
      render: (value: string) => <Text type="secondary">{value || '暂无说明'}</Text>,
    },
    {
      title: '档位类型',
      key: 'tierType',
      width: 96,
      render: (_value, record, index) => <Tag color="blue">{tierTypeLabel(record, index)}</Tag>,
    },
    {
      title: '素材方式',
      key: 'uploadMode',
      width: 150,
      render: (_value, record) => {
        const featureKey = record.featureKey || activeFeature;
        if (!isVideoFeatureKey(featureKey)) return <Text type="secondary">不涉及</Text>;
        const uploadMode = record.capabilities?.referenceUploadMode || defaultUploadModeForFeature(featureKey, record);
        const minReference = record.capabilities?.minReferenceImages ?? minReferenceImagesForUploadMode(uploadMode);
        const maxReference = record.capabilities?.maxReferenceImages || DEFAULT_MAX_REFERENCE_IMAGES;
        return (
          <Space direction="vertical" size={2}>
            <Tag color={uploadModeTagColor(uploadMode)}>{uploadModeLabel(uploadMode)}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>最少 {minReference}，最多 {maxReference}</Text>
          </Space>
        );
      },
    },
    {
      title: '绑定真实模型',
      key: 'models',
      width: 180,
      ellipsis: true,
      render: (_value, record) => {
        const names = modelNames(record);
        if (!names) return <Tag color="red">未绑定</Tag>;
        const unavailable = !hasUsableBinding(record);
        return (
          <Space size={4}>
            <Tooltip title={names}><Text ellipsis style={{ maxWidth: 120 }}>{names}</Text></Tooltip>
            {unavailable ? <Tag color="warning">需检查</Tag> : <Tag color="success">可展示</Tag>}
          </Space>
        );
      },
    },
    {
      title: '供应商',
      key: 'provider',
      width: 130,
      ellipsis: true,
      render: (_value, record) => {
        const primary = primaryBinding(record);
        const providerName = primary?.providerName || '-';
        return <Tooltip title={providerName}><Text ellipsis style={{ maxWidth: 105 }}>{providerName}</Text></Tooltip>;
      },
    },
    {
      title: '主模型',
      key: 'primary',
      width: 110,
      render: (_value, record) => {
        const primary = primaryBinding(record);
        if (!primary) return <Text type="secondary">-</Text>;
        return <Tag color="success" icon={<CheckCircleOutlined />}>主模型</Tag>;
      },
    },
    {
      title: '备用模型数量',
      key: 'fallbackCount',
      width: 120,
      render: (_value, record) => `${fallbackCount(record)}个`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string, record) => (
        <Switch
          checked={value === 'active'}
          checkedChildren="开"
          unCheckedChildren="关"
          loading={statusUpdatingIds.includes(record.id)}
	          onChange={(checked) => {
	            confirmTierStatus(record, checked ? 'active' : 'inactive');
	          }}
	        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_value, record) => {
        const menuItems = [
          { key: 'copy', icon: <CopyOutlined />, label: '复制' },
          { key: 'bind', icon: <LinkOutlined />, label: '配置绑定' },
          { key: 'price', icon: <DollarOutlined />, label: '画质倍率' },
          {
            key: 'toggle',
            icon: <StopOutlined />,
            label: record.status === 'active' ? '停用' : '启用',
          },
        ];
        return (
          <Space size={6}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
            <Dropdown
              trigger={['click']}
	              menu={{
	                items: menuItems,
	                onClick: ({ key }) => {
	                  if (key === 'copy') openCopyTier(record);
	                  if (key === 'bind') openBind(record);
	                  if (key === 'price') openPrice(record);
	                  if (key === 'toggle') {
	                    confirmTierStatus(record, record.status === 'active' ? 'inactive' : 'active');
	                  }
	                },
	              }}
	              dropdownRender={(menu) => (
	                <div>
	                  {menu}
	                  <div style={{ padding: 4 }}>
	                    <Button block danger type="text" icon={<DeleteOutlined />} loading={statusUpdatingIds.includes(record.id)} onClick={() => confirmDeleteTier(record)}>删除</Button>
	                  </div>
	                </div>
	              )}
            >
              <Button size="small">更多 <DownOutlined /></Button>
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const renderEditContent = () => {
    if (!selectedTier) {
      return (
        <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="请选择一个入口进行编辑" />
        </div>
      );
    }

    if (activeEditSection !== '基础设置') {
      return (
        <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description={`${activeEditSection} 暂保留原弹窗配置，本阶段不改保存逻辑`} />
        </div>
      );
    }

    return (
      <Form layout="vertical" style={{ width: '100%' }}>
        <Row gutter={18}>
          <Col xs={24} md={10}>
            <Form.Item label="前台显示名称" required>
              <Input value={selectedTier.tierName} readOnly suffix={<Text type="secondary">{String(selectedTier.tierName || '').length}/20</Text>} />
            </Form.Item>
          </Col>
          <Col xs={24} md={7}>
            <Form.Item label="档位类型" required>
              <Select value={tierTypeLabel(selectedTier, tiers.indexOf(selectedTier))} options={DEFAULT_TIER_TYPE_LABELS.map((label) => ({ label, value: label }))} disabled />
            </Form.Item>
          </Col>
          <Col xs={24} md={7}>
            <Form.Item label="排序" required>
              <InputNumber value={selectedTier.sortOrder || 0} min={0} style={{ width: '100%' }} readOnly />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={18}>
          <Col xs={24} md={8}>
            <Form.Item label="是否启用">
              <Switch checked={selectedTier.status === 'active'} disabled />
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>关闭后，入口不会在前台显示</div>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="是否会员专享">
              <Switch checked={false} disabled />
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>后端暂未提供字段，本阶段仅展示</div>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="入口描述">
          <Input.TextArea value={selectedTier.description || ''} rows={4} readOnly />
        </Form.Item>
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => openEdit(selectedTier)}>编辑基础设置</Button>
          <Button icon={<LinkOutlined />} onClick={() => openBind(selectedTier)}>配置模型绑定</Button>
          <Button icon={<DollarOutlined />} onClick={() => openPrice(selectedTier)}>画质倍率定价</Button>
        </Space>
      </Form>
    );
  };

  return (
    <div style={{ background: '#f5f7fb', margin: -24, padding: 24, minHeight: 'calc(100vh - 112px)' }}>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">AI模型管理 / </Text>
        <Text strong>功能页配置</Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>功能页配置</Title>
          <Text type="secondary">配置前台功能页可用的模型入口、展示名称、排序和可见状态</Text>
        </div>
        <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>功能预览</Button>
      </div>

      <div className="feature-config-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <Card style={{ borderRadius: 8, marginBottom: 16 }} bodyStyle={{ padding: 18 }}>
            <Tabs
              activeKey={activeFeature}
              onChange={setActiveFeature}
              items={featureTabs}
              tabBarStyle={{ marginBottom: 16 }}
            />

            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="配置说明"
              description="前台按照排序从小到大展示模型入口；只有启用、已绑定可用模型、供应商 Base URL/API Key 已配置且能力匹配的入口才会在小程序显示。"
              style={{ marginBottom: 16, borderRadius: 8 }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <Space wrap>
                <Button type="primary" icon={<PlusOutlined />} disabled={!activeFeatureItem} onClick={openCreate}>新增入口</Button>
                <Button icon={<RetweetOutlined />} onClick={openSortModal}>批量排序</Button>
                <Button icon={<FileSyncOutlined />} onClick={openTemplateModal}>从模板创建配置</Button>
                <Button icon={<ReloadOutlined />} onClick={fetchTiers}>刷新</Button>
                <Button icon={<FileSyncOutlined />} onClick={() => setStatusDrawerOpen(true)}>检查绑定状态</Button>
              </Space>
              <Text type="secondary" style={{ lineHeight: '32px' }}>
                {qualities.length > 0 ? `画质档位：${qualities.join(' / ')}，比例：${ratios.join(' / ')}` : '当前功能无画质和比例维度'}
              </Text>
            </div>

            <Table
              rowKey="id"
              columns={columns}
              dataSource={tiers}
              loading={loading}
              size="middle"
              pagination={false}
              scroll={{ x: 1320 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedTierId ? [selectedTierId] : [],
                onChange: (keys) => setSelectedTierId(Number(keys[0])),
              }}
              onRow={(record) => ({
                onClick: () => setSelectedTierId(record.id),
              })}
              locale={{ emptyText: <Empty description="当前功能暂无入口配置" /> }}
            />
          </Card>

          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #eef2f7' }}>
              <Text strong>入口配置</Text>
              {selectedTier && <Text type="secondary">（编辑中：{selectedTier.tierName || '-'}）</Text>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', minHeight: 320 }}>
              <div style={{ borderRight: '1px solid #eef2f7', padding: 12 }}>
                <Menu
                  mode="inline"
                  selectedKeys={[activeEditSection]}
                  onClick={({ key }) => setActiveEditSection(String(key))}
                  items={EDIT_SECTIONS.map((label) => ({ key: label, label, icon: label === '基础设置' ? <SettingOutlined /> : <MoreOutlined /> }))}
                  style={{ borderInlineEnd: 0 }}
                />
              </div>
              <div style={{ padding: 18, minWidth: 0 }}>
                {renderEditContent()}
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <Card title={`${FEATURE_LABELS[activeFeature] || activeFeature}概览`} style={{ borderRadius: 8 }}>
            <Row gutter={[10, 10]}>
              <Col span={12}><StatBlock value={tiers.length} label="已配置入口" color="#2563eb" /></Col>
              <Col span={12}><StatBlock value={enabledCount} label="启用中" color="#16a34a" /></Col>
              <Col span={12}><StatBlock value={disabledCount} label="已停用" color="#ef4444" /></Col>
              <Col span={12}><StatBlock value={unboundCount} label="未绑定模型" color="#334155" /></Col>
            </Row>
          </Card>

          <Card title="绑定状态检查" style={{ borderRadius: 8 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              {tiers.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无入口" />}
              {tiers.slice(0, 6).map((tier, index) => {
                const bound = !!tier.bindings?.length;
                const disabled = tier.status !== 'active';
                const usable = hasUsableBinding(tier);
                return (
                  <div key={tier.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Text ellipsis style={{ maxWidth: 150 }}>{tier.tierName || `${DEFAULT_TIER_TYPE_LABELS[index % 4]}入口`}</Text>
                    <Tag color={disabled ? 'default' : usable ? 'success' : bound ? 'warning' : 'error'}>
                      {disabled ? '未启用' : usable ? '可展示' : bound ? '需检查' : '未绑定'}
                    </Tag>
                  </div>
                );
              })}
              <Button block type="primary" icon={<ReloadOutlined />} onClick={() => setStatusDrawerOpen(true)}>检测绑定状态</Button>
            </Space>
          </Card>

          <Card title="快捷操作" style={{ borderRadius: 8 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block icon={<CopyOutlined />} onClick={() => openCopyTier(selectedTier)}>从当前入口复制</Button>
              <Button block icon={<DownloadOutlined />} onClick={openExportModal}>导出当前配置</Button>
              <Tooltip title="当前后端未提供导入执行接口，仅保留预检代码，入口暂不开放">
                <span>
                  <Button block icon={<ImportOutlined />} disabled>导入配置</Button>
                </span>
              </Tooltip>
              <Tooltip title="当前后端未提供恢复默认接口，为避免覆盖现有入口，入口暂不开放">
                <span>
                  <Button block danger icon={<UploadOutlined />} disabled>恢复默认配置</Button>
                </span>
              </Tooltip>
            </Space>
          </Card>
        </div>
      </div>

      <Drawer
        title={editing ? '编辑功能入口' : '新增功能入口'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        width={820}
        extra={
          <Space>
            <Button onClick={() => setModalOpen(false)} disabled={saving}>取消</Button>
            <Button type="primary" onClick={save} loading={saving}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Alert
            type="info"
            showIcon
            message="只保存后端已支持的入口字段"
            description="颜色、会员专享、超时和并发等后端暂未提供入口字段，页面只展示不提交。"
            style={{ marginBottom: 16 }}
          />
          <Divider orientation="left" plain>基础设置</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="所属功能">
                <Input value={FEATURE_LABELS[activeFeature] || activeFeature} readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="tierName" label="前台显示名称" rules={[{ required: true, message: '请输入前台显示名称' }]} extra="小程序中展示给用户的名称。"><Input showCount maxLength={20} /></Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="tierKey" label="入口标识" rules={[{ required: true, message: '请输入入口标识' }]} extra="唯一英文标识，创建后不可修改。"><Input disabled={!!editing} /></Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="tierType" label="档位类型" rules={[{ required: true, message: '请选择档位类型' }]}>
                <Select options={TIER_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="sortOrder" label="排序" rules={[{ required: true, message: '请输入排序' }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="入口说明" extra="小程序展示的说明文字。"><Input.TextArea rows={3} showCount maxLength={120} /></Form.Item>
          <Space style={{ display: 'flex' }} size="large" wrap>
            <Form.Item name="status" label="是否启用">
              <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 130 }} />
            </Form.Item>
            <Form.Item label="是否会员专享">
              <Switch disabled />
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>后端暂未提供字段</div>
            </Form.Item>
          </Space>

          <Divider orientation="left" plain>模型绑定</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="primaryModelId" label="主模型">
                <Select allowClear showSearch optionFilterProp="labelText" options={modelSelectOptions} placeholder="保存入口时可选绑定" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="fallbackModelIds" label="备用模型">
                <Select mode="multiple" allowClear showSearch optionFilterProp="labelText" options={modelSelectOptions} placeholder="可选择多个备用模型" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="fallbackPriority" label="备用模型优先级">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="failoverOnError" label="失败自动切换" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>价格与展示</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="pointsCost" label="默认/兜底消耗积分" rules={[{ required: true, message: '请输入消耗积分' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="pricingMode" label="定价模式" initialValue="fixed">
                <Select options={PRICING_MODE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={['qualityMultipliers', '2K']} label="2K 倍率"><InputNumber min={0.1} step={0.1} style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={['qualityMultipliers', '4K']} label="4K 倍率"><InputNumber min={0.1} step={0.1} style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="badge" label="前台角标"><Input placeholder="例如 热门 / 推荐" /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="iconFileId" label="前台图标 File ID"><InputNumber min={1} style={{ width: '100%' }} placeholder="可选" /></Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="displayColor" label="展示颜色">
                <Input type="color" disabled />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item shouldUpdate={(prev, cur) => prev.pricingMode !== cur.pricingMode}>
            {({ getFieldValue }) => {
              const mode = getFieldValue('pricingMode') || 'fixed';
              if (mode === 'fixed') {
                return <Alert type="info" showIcon style={{ marginBottom: 16 }} message="固定价入口只使用默认/兜底消耗积分，不需要动态规则。" />;
              }
              return (
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Text strong>定价规则辅助编辑</Text>
                    {mode === 'token_preauth' ? (
                      <>
                        <Row gutter={12}>
                          <Col xs={24} md={8}>
                            <Form.Item name="pricingPreauthPoints" label="预扣创作点" extra="任务完成后不按 token 自动补扣或退款。">
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Alert type="warning" showIcon message="Token 数量和最终成本以小马侧为准，本系统只做预扣和成本快照留存。" />
                      </>
                    ) : (
                      <>
                        <Row gutter={12}>
                          <Col xs={24} md={8}>
                            <Form.Item name={['pricingDefaultParams', 'duration']} label="默认时长"><Input placeholder="例如 8s" /></Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item name={['pricingDefaultParams', 'quality']} label="默认清晰度"><Input placeholder="例如 720p" /></Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item name={['pricingDefaultParams', 'audioMode']} label="默认声音"><Select allowClear options={[{ label: '有声', value: 'audio' }, { label: '无声', value: 'silent' }]} /></Form.Item>
                          </Col>
                        </Row>
                        <Form.List name="pricingRuleRows">
                          {(fields, { add, remove }) => (
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              {fields.map((field) => (
                                <Row key={field.key} gutter={8} align="top">
                                  <Col xs={12} md={4}>
                                    <Form.Item name={[field.name, 'duration']} label="时长"><Input placeholder="8s" /></Form.Item>
                                  </Col>
                                  <Col xs={12} md={4}>
                                    <Form.Item name={[field.name, 'quality']} label="清晰度"><Input placeholder="720p" /></Form.Item>
                                  </Col>
                                  <Col xs={12} md={4}>
                                    <Form.Item name={[field.name, 'audioMode']} label="声音"><Select allowClear options={[{ label: '有声', value: 'audio' }, { label: '无声', value: 'silent' }]} /></Form.Item>
                                  </Col>
                                  <Col xs={12} md={4}>
                                    <Form.Item name={[field.name, mode === 'per_second_matrix' ? 'unitPoints' : 'pointsCost']} label={mode === 'per_second_matrix' ? '每秒点数' : '本规则点数'}>
                                      <InputNumber min={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={18} md={6}>
                                    <Form.Item name={[field.name, 'label']} label="备注"><Input placeholder="可选" /></Form.Item>
                                  </Col>
                                  <Col xs={6} md={2}>
                                    <Form.Item label=" ">
                                      <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} disabled={fields.length <= 1} />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              ))}
                              <Space>
                                <Button icon={<PlusOutlined />} onClick={() => add({})}>添加规则</Button>
                                <Button type="primary" onClick={applyPricingBuilder}>生成 JSON</Button>
                              </Space>
                            </Space>
                          )}
                        </Form.List>
                      </>
                    )}
                    {mode === 'token_preauth' && <Button type="primary" onClick={applyPricingBuilder}>生成 JSON</Button>}
                  </Space>
                </div>
              );
            }}
          </Form.Item>
          <Form.Item
            name="pricingRules"
            label="动态定价规则 JSON（最终保存值）"
            extra="辅助编辑会覆盖这里；需要复杂条件时可直接编辑 JSON。视频真实扣费以后端重算为准。"
          >
            <Input.TextArea rows={8} placeholder={'{\n  "mode": "matrix",\n  "defaultParams": { "duration": "5s", "quality": "720P" },\n  "rules": [\n    { "conditions": { "duration": "10s", "quality": "1080P" }, "pointsCost": 60 }\n  ]\n}'} />
          </Form.Item>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="2K/4K 字段仍保存到旧的 qualityMultipliers，展示颜色字段后端暂未支持。" />

          <Divider orientation="left" plain>高级设置</Divider>
          {isVideoFeatureKey(activeFeature) ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="视频上传能力会直接影响小程序选项卡和上传卡片。保存后，公开档位接口会下发这些能力。"
              />
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="referenceUploadMode"
                    label="上传入口类型"
                    extra="首图视频进入小程序“首图视频”；多参考图进入小程序“图生视频”。"
                  >
                    <Select
                      options={VIDEO_UPLOAD_MODE_OPTIONS}
                      onChange={(value) => {
                        const minReferenceImages = minReferenceImagesForUploadMode(value);
                        form.setFieldsValue({
                          minReferenceImages,
                          requiredReference: requiredReferenceFormValue(minReferenceImages > 0),
                        });
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="minReferenceImages"
                    label="最少素材数"
                    extra="用于小程序提交前校验，0 表示该入口不要求上传素材。"
                  >
                    <InputNumber min={0} max={12} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="requiredReference"
                    label="素材是否必填"
                    extra="自动时按最少素材数判断；也可以手动覆盖。"
                  >
                    <Select options={REQUIRED_REFERENCE_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          ) : null}
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="maxEntries" label="最大生成数量">
                <InputNumber min={1} style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="maxReferenceImages"
                label="参考图上限"
                extra="多参考图视频会按该值限制上传数量；首图视频固定 1 张，首尾帧固定 2 张。"
              >
                <InputNumber min={1} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="timeoutSeconds" label="超时时间">
                <InputNumber min={1} addonAfter="秒" style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="concurrencyLimit" label="并发限制">
                <InputNumber min={1} style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="备注">
            <Input.TextArea rows={2} disabled placeholder="后端暂未提供独立备注字段" />
          </Form.Item>
          <Space style={{ display: 'flex' }} size="large" wrap>
            <Form.Item name="isRecommended" label="推荐" valuePropName="checked"><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item>
            <Form.Item name="isDefault" label="默认" valuePropName="checked"><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item>
          </Space>
        </Form>
      </Drawer>

      <Modal title="绑定真实模型" open={bindModal} onCancel={() => setBindModal(false)} onOk={saveBind} confirmLoading={bindSaving} width={820} okText="保存绑定" cancelText="取消" destroyOnClose>
        <div style={{ marginTop: 12 }}>
          <Alert
            type="info"
            showIcon
            message="仅显示与当前功能能力匹配的真实模型"
            description="已停用模型会展示为“已停用”且默认不可选；保存时只提交 modelId、bindingType、fallbackOrder 和故障切换字段。"
            style={{ marginBottom: 12 }}
          />
          <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="所属功能">{FEATURE_LABELS[bindTier?.featureKey || activeFeature] || bindTier?.featureName || activeFeature}</Descriptions.Item>
            <Descriptions.Item label="前台显示名称">{bindTier?.tierName || '-'}</Descriptions.Item>
            <Descriptions.Item label="档位类型">{bindTier ? tierTypeLabel(bindTier, tiers.indexOf(bindTier)) : '-'}</Descriptions.Item>
          </Descriptions>
          <Form form={bindForm} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={16}>
                <Form.Item name="primaryModelId" label="主模型" rules={[{ required: true, message: '请选择主模型' }]}>
                  <Select allowClear options={modelSelectOptions} placeholder="请选择主模型" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="failoverOnError" label="失败自动切换" valuePropName="checked">
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="fallbackModelIds" label="添加备用模型">
              <Select
                mode="multiple"
                allowClear
                options={modelSelectOptions}
                placeholder="选择备用模型"
                onChange={(values) => {
                  setBindingFallbackRows((values as number[]).map((modelId, index) => {
                    const existing = bindingFallbackRows.find((row) => row.modelId === modelId);
                    return existing || { modelId, fallbackOrder: index + 1 };
                  }));
                }}
              />
            </Form.Item>
          </Form>
          <Table<BindingFallbackRow>
            size="small"
            rowKey="modelId"
            pagination={false}
            dataSource={bindingFallbackRows}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无备用模型" /> }}
            columns={[
              {
                title: '备用模型',
                dataIndex: 'modelId',
                render: (modelId) => {
                  const model = models.find((item) => item.id === modelId);
                  return model ? modelOptionLabel(model) : `模型#${modelId}`;
                },
              },
              {
                title: '优先级',
                dataIndex: 'fallbackOrder',
                width: 120,
                render: (value, record) => (
                  <InputNumber
                    min={1}
                    value={value}
                    style={{ width: 90 }}
                    onChange={(next) => setBindingFallbackRows((rows) => rows.map((row) => row.modelId === record.modelId ? { ...row, fallbackOrder: Number(next || 1) } : row))}
                  />
                ),
              },
              {
                title: '操作',
                width: 90,
                render: (_, record) => (
                  <Button
                    size="small"
                    danger
                    type="link"
                    onClick={() => {
                      const nextRows = bindingFallbackRows.filter((row) => row.modelId !== record.modelId);
                      setBindingFallbackRows(nextRows);
                      bindForm.setFieldsValue({ fallbackModelIds: nextRows.map((row) => row.modelId) });
                    }}
                  >
                    删除
                  </Button>
                ),
              },
            ]}
          />
          {!compatibleModels.length ? <Empty description="当前功能暂无能力匹配模型" /> : null}
        </div>
      </Modal>

      <Modal title="画质倍率定价" open={priceModal} onCancel={() => setPriceModal(false)} onOk={savePrice} confirmLoading={priceSaving} width={460} okText="保存倍率" cancelText="取消">
        <Form form={priceForm} layout="vertical" style={{ marginTop: 12 }}>
          <Alert
            type="info"
            showIcon
            message="倍率会直接影响前台消耗积分"
            description={`当前入口基础积分：${priceTier?.pointsCost ?? '-'}。实际消耗按基础积分乘以倍率计算。`}
            style={{ marginBottom: 16 }}
          />
          {qualities.map((quality) => (
            <Form.Item key={quality} name={quality} label={`${quality} 倍率`} extra={`${quality} 实际消耗 = 基础积分 × 倍率，向上取整。`}>
              <InputNumber min={0.1} step={0.1} style={{ width: 140 }} />
            </Form.Item>
          ))}
          {qualities.length === 0 && <p style={{ color: '#999' }}>此功能页无画质维度，不需要配置倍率。</p>}
        </Form>
      </Modal>

      <Modal
        title="复制入口"
        open={copyModalOpen}
        onCancel={() => setCopyModalOpen(false)}
        onOk={copyTier}
        confirmLoading={saving}
        okText="复制"
        cancelText="取消"
        width={520}
      >
        <Form form={copyForm} layout="vertical" style={{ marginTop: 12 }}>
          <Alert
            type="info"
            showIcon
            message={`来源入口：${copySourceTier?.tierName || '-'}`}
            description="复制会调用新增入口接口；模型绑定、价格配置按下方选项决定。"
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="tierName" label="新入口名称" rules={[{ required: true, message: '请输入新入口名称' }]}>
            <Input showCount maxLength={20} />
          </Form.Item>
          <Form.Item name="tierKey" label="新入口标识" hidden rules={[{ required: true, message: '请输入新入口标识' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sortOrder" label="新排序" rules={[{ required: true, message: '请输入新排序' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="copyBindings" valuePropName="checked">
            <Checkbox>是否复制模型绑定</Checkbox>
          </Form.Item>
          <Form.Item name="copyPricing" valuePropName="checked">
            <Checkbox>是否复制价格配置</Checkbox>
          </Form.Item>
          <Form.Item name="status" label="是否立即启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          </Form>
        </Modal>

      <Modal
        title="批量排序"
        open={sortModalOpen}
        onCancel={() => setSortModalOpen(false)}
        onOk={saveSort}
        confirmLoading={sortSaving}
        okText="保存排序"
        cancelText="取消"
        width={680}
      >
        <Table
          rowKey="id"
          pagination={false}
          dataSource={sortRows}
          columns={[
            { title: '当前排序', dataIndex: 'currentSort', width: 110 },
            { title: '入口名称', dataIndex: 'tierName' },
            {
              title: '新排序',
              dataIndex: 'newSort',
              width: 150,
              render: (value, record) => (
                <InputNumber
                  min={0}
                  value={value}
                  style={{ width: '100%' }}
                  onChange={(next) => setSortRows((rows) => rows.map((row) => row.id === record.id ? { ...row, newSort: Number(next || 0) } : row))}
                />
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="从模板创建配置"
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        onOk={createFromTemplate}
        confirmLoading={templateSaving}
        okText="创建配置"
        cancelText="取消"
        width={720}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="创建前请确认"
          description="模板创建会新增配置，不会删除旧配置，也不会覆盖现有入口。"
        />
        <Form form={templateForm} layout="vertical">
          <Form.Item name="templateKey" label="模板选择" rules={[{ required: true, message: '请选择模板' }]}>
            <Select options={TEMPLATE_OPTIONS.map((item) => ({ label: item.label, value: item.value }))} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const template = TEMPLATE_OPTIONS.find((item) => item.value === getFieldValue('templateKey')) || TEMPLATE_OPTIONS[0];
              return (
                <Table
                  rowKey={(record) => `${record.tierName}-${record.sortOrder}`}
                  size="small"
                  pagination={false}
                  dataSource={template.items}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="自定义模板暂未接入" /> }}
                  columns={[
                    { title: '入口名称', dataIndex: 'tierName' },
                    { title: '档位类型', dataIndex: 'tierType' },
                    { title: '默认排序', dataIndex: 'sortOrder' },
                    { title: '是否启用', dataIndex: 'enabled', render: (value) => <Tag color={value ? 'success' : 'default'}>{value ? '启用' : '停用'}</Tag> },
                  ]}
                />
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导出当前配置"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={exportCurrentConfig}
        okText="导出"
        cancelText="取消"
        width={520}
      >
        <Form form={exportForm} layout="vertical">
          <Form.Item name="scope" label="导出范围">
            <Select options={[{ label: '当前功能', value: 'current' }, { label: '全部功能（当前版本仅导出已加载数据）', value: 'all' }]} />
          </Form.Item>
          <Form.Item name="format" label="导出格式">
            <Select disabled options={[{ label: 'JSON', value: 'json' }]} />
          </Form.Item>
          <Form.Item name="includeBindings" label="包含模型绑定" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="功能预览"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>}
        width={720}
      >
        <Alert
          type="info"
          showIcon
          message="预览使用当前接口返回数据"
          description="这里只做后台兼容预览，不额外写死小程序假数据。"
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {tiers.length === 0 && <Empty description="当前功能暂无入口" />}
          {tiers.map((tier, index) => {
            const bound = !!tier.bindings?.length;
            const usable = hasUsableBinding(tier);
            return (
              <Card key={tier.id} size="small" style={{ borderRadius: 8 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color="blue">{tierTypeLabel(tier, index)}</Tag>
                    <Text strong>{tier.tierName || '-'}</Text>
                    <Tag color={tier.status === 'active' ? 'success' : 'default'}>{tier.status === 'active' ? '启用' : '停用'}</Tag>
                    <Tag color={usable ? 'success' : bound ? 'warning' : 'error'}>{usable ? '小程序可展示' : bound ? '绑定需检查' : '未绑定模型'}</Tag>
                  </Space>
                  <Text type="secondary">{tier.description || '暂无说明'}</Text>
                  <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                    <Descriptions.Item label="基础积分">{tier.pointsCost ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="排序">{tier.sortOrder ?? 0}</Descriptions.Item>
                    <Descriptions.Item label="绑定模型">{modelNames(tier) || '-'}</Descriptions.Item>
                  </Descriptions>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Modal>

      <Drawer
        title="绑定状态检查"
        open={statusDrawerOpen}
        onClose={() => setStatusDrawerOpen(false)}
        width={560}
        extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={fetchTiers}>刷新</Button>}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="基于当前真实接口数据检查"
            description="检查项包括入口启用状态、是否绑定模型、模型/供应商状态、供应商 Base URL/API Key 以及能力是否匹配。"
          />
          {tiers.length === 0 && <Empty description="当前功能暂无入口" />}
          {tiers.map((tier) => {
            const bindings = tier.bindings || [];
            const issues = [
              tier.status !== 'active' ? '入口未启用' : '',
              bindings.length === 0 ? '未绑定真实模型' : '',
              ...bindings.map((binding) => {
                const meta = bindingStatusMeta(binding);
                return meta.text === '可用' || meta.text === '可展示' ? '' : `${binding.modelName || `模型#${binding.modelId}`}：${meta.text}`;
              }),
            ].filter(Boolean);
            return (
              <Card key={tier.id} size="small" style={{ borderRadius: 8 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space wrap>
                    <Text strong>{tier.tierName || `入口#${tier.id}`}</Text>
                    <Tag color={issues.length ? 'warning' : 'success'}>{issues.length ? '需检查' : '可用'}</Tag>
                  </Space>
                  {issues.length ? (
                    <Space wrap>{issues.map((issue) => <Tag key={issue} color="warning">{issue}</Tag>)}</Space>
                  ) : (
                    <Text type="secondary">入口已启用，且绑定模型可在小程序展示。</Text>
                  )}
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(tier)}>编辑</Button>
                    <Button size="small" icon={<LinkOutlined />} onClick={() => openBind(tier)}>配置绑定</Button>
                  </Space>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Drawer>

      <Modal
        title="导入配置"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalOpen(false)}>取消</Button>,
          <Tooltip key="import" title="当前版本暂未接入安全导入执行接口，已限制为预检查">
            <Button type="primary" disabled>导入配置</Button>
          </Tooltip>,
        ]}
        width={720}
      >
        <Form form={importForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="上传 JSON 文件" required>
            <Upload
              accept=".json,application/json"
              maxCount={1}
              beforeUpload={(file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    analyzeImportConfig(String(reader.result || ''));
                    message.success('导入文件预检查完成');
                  } catch {
                    setImportPreview({
                      count: 0,
                      missingModels: [],
                      conflicts: [],
                      unsupportedFields: ['JSON 格式错误'],
                      blocked: true,
                    });
                    message.error('JSON 解析失败，请检查文件格式');
                  }
                };
                reader.readAsText(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>选择 JSON 文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="mode" label="导入模式">
            <Radio.Group
              optionType="button"
              options={[
                { label: '仅新增', value: 'createOnly' },
                { label: '覆盖同名入口', value: 'overwrite' },
              ]}
            />
          </Form.Item>
        </Form>
        {importPreview ? (
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="入口数量">{importPreview.count}</Descriptions.Item>
            <Descriptions.Item label="缺失模型">{importPreview.missingModels.length ? importPreview.missingModels.join('、') : '无'}</Descriptions.Item>
            <Descriptions.Item label="冲突入口">{importPreview.conflicts.length ? importPreview.conflicts.join('、') : '无'}</Descriptions.Item>
            <Descriptions.Item label="不支持字段">{importPreview.unsupportedFields.length ? importPreview.unsupportedFields.join('、') : '无'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先上传 JSON 文件进行预检查" style={{ margin: '18px 0' }} />
        )}
        <Alert
          type="warning"
          showIcon
          message="当前版本仅支持预检查"
          description="后端暂未提供导入接口。为避免覆盖真实配置，本页不会执行前端假导入；文件中如包含 API Key、secret、password 等敏感字段会被拦截。"
        />
      </Modal>

      <Modal
        title="恢复默认配置"
        open={restoreModalOpen}
        onCancel={() => setRestoreModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setRestoreModalOpen(false)}>取消</Button>,
          <Button
            key="restore"
            danger
            type="primary"
            disabled={restoreConfirmText !== '恢复默认'}
            onClick={() => {
              message.warning('当前版本暂未接入恢复默认配置接口，未执行任何变更');
              setRestoreModalOpen(false);
            }}
          >
            恢复默认
          </Button>,
        ]}
        width={720}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="error"
            showIcon
            message="恢复默认配置可能覆盖当前功能页入口，请谨慎操作。"
            description="当前后端未提供恢复默认接口，本弹窗只做强确认和变更预览，不会执行恢复。"
          />
          <div>
            <Text strong>恢复范围</Text>
            <Radio.Group
              value={restoreScope}
              onChange={(event) => setRestoreScope(event.target.value)}
              style={{ display: 'block', marginTop: 10 }}
              options={[
                { label: '只恢复当前功能', value: 'current' },
                { label: '恢复全部功能', value: 'all' },
              ]}
            />
          </div>
          <div>
            <Text strong>默认配置预览</Text>
            <Table
              size="small"
              rowKey={(record) => `${record.tierName}-${record.sortOrder}`}
              pagination={false}
              style={{ marginTop: 10 }}
              dataSource={restorePreviewTemplate.items}
              columns={[
                { title: '入口名称', dataIndex: 'tierName' },
                { title: '档位类型', dataIndex: 'tierType' },
                { title: '默认排序', dataIndex: 'sortOrder' },
                { title: '是否启用', dataIndex: 'enabled', render: (value) => <Tag color={value ? 'success' : 'default'}>{value ? '启用' : '停用'}</Tag> },
              ]}
            />
            {restoreScope === 'all' ? <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>全部功能恢复需要后端提供批量恢复接口，当前版本不会执行。</Text> : null}
          </div>
          <div>
            <Text strong>强确认</Text>
            <Input
              value={restoreConfirmText}
              onChange={(event) => setRestoreConfirmText(event.target.value)}
              placeholder="请输入“恢复默认”后按钮可点击"
              style={{ marginTop: 10 }}
            />
          </div>
        </Space>
      </Modal>

      <style>{`
        @media (max-width: 1180px) {
          .feature-config-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 760px) {
          .feature-config-grid .ant-card-body > div[style*="grid-template-columns: 150px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function StatBlock({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      border: '1px solid #eef2f7',
      background: '#fafcff',
      borderRadius: 8,
      padding: '14px 10px',
      textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>{label}</div>
    </div>
  );
}
