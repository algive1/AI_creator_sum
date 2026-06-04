import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Progress,
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
  ApiOutlined,
  AppstoreOutlined,
  AudioOutlined,
  BugOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

type ModelCategory = 'text' | 'image' | 'video' | 'audio' | 'multimodal';
type HealthLevel = 'normal' | 'warning' | 'abnormal' | 'untested';

interface RealModel {
  id: number;
  name?: string;
  displayName?: string;
  providerId?: number;
  providerName?: string;
  modelType?: string;
  subType?: string;
  apiModelName?: string;
  modelCode?: string;
  status?: string;
  priority?: number;
  sortOrder?: number;
  createdAt?: string;
  timeoutSeconds?: number;
  retryTimes?: number;
  maxConcurrency?: number;
  pointsCost?: number;
  apiCostCents?: number;
  lastTestStatus?: string;
  lastTestAt?: string | null;
  lastTestMessage?: string;
  capabilities?: string[];
  [key: string]: unknown;
}

interface TestRecord {
  id: string;
  modelId: number;
  modelName: string;
  providerName: string;
  modelCode: string;
  modelType?: string;
  testType: string;
  testTypeKey: string;
  summary: string;
  status: 'success' | 'failed' | 'warning';
  responseTime: number;
  createdAt: string;
  params?: Record<string, unknown>;
  cost?: string;
  taskId?: string;
  requestId?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
}

interface TestRunRow {
  modelId: number;
  modelName: string;
  providerName: string;
  modelType: ModelCategory;
  status: 'pending' | 'running' | 'success' | 'warning' | 'failed' | 'stopped';
  responseTime?: number;
  cost?: string;
  record?: TestRecord;
  error?: string;
}

const cardStyle = {
  borderRadius: 8,
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
};

const primaryButtonStyle = {
  background: '#1677ff',
  borderColor: '#1677ff',
};

const MODEL_TABS: { key: ModelCategory; label: string }[] = [
  { key: 'text', label: '文本模型' },
  { key: 'image', label: '图片模型' },
  { key: 'video', label: '视频模型' },
  { key: 'audio', label: '音频模型' },
  { key: 'multimodal', label: '多模态模型' },
];

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: '文本模型',
  image: '图片模型',
  video: '视频模型',
  audio: '音频模型',
  multimodal: '多模态模型',
};

const HEALTH_META: Record<HealthLevel, { color: string; text: string }> = {
  normal: { color: 'success', text: '正常' },
  warning: { color: 'warning', text: '警告' },
  abnormal: { color: 'error', text: '异常' },
  untested: { color: 'default', text: '未测试' },
};

const TEST_TYPE_LABELS: Record<string, string> = {
  prompt_optimize: '提示词优化',
  text_generation: '文本生成',
  script_generation: '脚本生成',
  text_to_image: '文生图',
  image_to_image: '图生图',
  image_edit: '图片编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  first_last_frame_video: '首尾帧视频',
  audio_generation: '音频生成',
  multimodal_test: '多模态测试',
};

const CAPABILITY_LABELS: Record<string, string> = {
  prompt_optimize: '提示词优化',
  text_generation: '文本生成',
  script_generation: '脚本生成',
  text_to_image: '文生图',
  image_to_image: '图生图',
  image_edit: '图片编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  first_last_frame_video: '首尾帧',
  audio_generation: '音频生成',
  multimodal_test: '多模态',
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: 'all' },
  { label: '正常', value: 'normal' },
  { label: '警告', value: 'warning' },
  { label: '异常', value: 'abnormal' },
  { label: '未测试', value: 'untested' },
];

const TYPE_OPTIONS = [
  { label: '全部类型', value: 'all' },
  ...MODEL_TABS.map((item) => ({ label: item.label, value: item.key })),
];

const CAPABILITY_OPTIONS = [
  { label: '全部能力', value: 'all' },
  { label: '文本生成', value: 'text_generation' },
  { label: '提示词优化', value: 'prompt_optimize' },
  { label: '文生图', value: 'text_to_image' },
  { label: '图生图', value: 'image_to_image' },
  { label: '图片编辑', value: 'image_edit' },
  { label: '文生视频', value: 'text_to_video' },
  { label: '图生视频', value: 'image_to_video' },
  { label: '首尾帧视频', value: 'first_last_frame_video' },
  { label: '视频编辑', value: 'video_edit' },
];

const TEST_FLOW_OPTIONS = [
  { label: '文本生成', value: 'text_generation' },
  { label: '提示词优化', value: 'prompt_optimize' },
  { label: '文生图', value: 'text_to_image' },
  { label: '图生图', value: 'image_to_image' },
  { label: '图片编辑', value: 'image_edit' },
  { label: '文生视频', value: 'text_to_video' },
  { label: '图生视频', value: 'image_to_video' },
  { label: '首尾帧视频', value: 'first_last_frame_video' },
];

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
};

const BACKEND_SUPPORTED_TEST_TYPES = new Set([
  'text_generation',
  'prompt_optimize',
  'script_generation',
  'text_to_image',
  'image_to_image',
  'image_edit',
  'text_to_video',
  'image_to_video',
  'first_last_frame_video',
]);

const COMMON_RESOLUTION_OPTIONS = ['1024x1024', '1024x1536', '1536x1024', '1:1', '16:9', '9:16'];
const COMMON_QUALITY_OPTIONS = ['1K', '2K', '4K'];

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
};

const safeText = (value: unknown, fallback = '-') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const normalizeModelType = (value?: string): ModelCategory => {
  const raw = String(value || '').trim().toLowerCase();
  if (['image', 'picture', 'img', '图片', '图像', '图片模型'].includes(raw)) return 'image';
  if (['video', 'movie', '视频', '视频模型'].includes(raw)) return 'video';
  if (['audio', 'sound', 'voice', '音频', '音频模型'].includes(raw)) return 'audio';
  if (['multimodal', 'multi_modal', 'multi-modal', '多模态', '多模态模型'].includes(raw)) return 'multimodal';
  return 'text';
};

const getHealthLevel = (model?: RealModel | null): HealthLevel => {
  const status = String(model?.lastTestStatus || '').toLowerCase();
  if (['passed', 'success', 'completed', 'healthy', 'ok'].includes(status)) return 'normal';
  if (['risk', 'warning', 'pending', 'processing'].includes(status)) return 'warning';
  if (['failed', 'error', 'unhealthy', 'timeout'].includes(status)) return 'abnormal';
  return 'untested';
};

const healthTag = (level: HealthLevel) => {
  const meta = HEALTH_META[level];
  return <Tag color={meta.color}>{meta.text}</Tag>;
};

const modelIcon = (category: ModelCategory) => {
  const iconMap: Record<ModelCategory, ReactNode> = {
    text: <FileTextOutlined />,
    image: <PictureOutlined />,
    video: <VideoCameraOutlined />,
    audio: <AudioOutlined />,
    multimodal: <AppstoreOutlined />,
  };
  return iconMap[category];
};

const getModelName = (model?: RealModel | null) => safeText(model?.displayName || model?.name, '未命名模型');
const getModelCode = (model?: RealModel | null) => safeText(model?.apiModelName || model?.modelCode);
const normalizeCapabilityKey = (value: unknown) => {
  const key = String(value || '').trim().toLowerCase();
  return CAPABILITY_ALIASES[key] || key;
};

const inferCapabilities = (model: RealModel): string[] => {
  if (Array.isArray(model.capabilities) && model.capabilities.length > 0) {
    return Array.from(new Set(model.capabilities.map(normalizeCapabilityKey).filter(Boolean)));
  }
  const category = normalizeModelType(model.modelType);
  const subType = String(model.subType || '').toLowerCase();
  if (category === 'image') {
    if (['image_to_image', 'img2img'].includes(subType)) return ['image_to_image'];
    if (['image_edit', 'edit'].includes(subType)) return ['image_edit'];
    return ['text_to_image'];
  }
  if (category === 'video') {
    if (['image_to_video', 'img2video', 'image2video'].includes(subType)) return ['image_to_video'];
    if (['first_last_frame', 'first_last_frame_video'].includes(subType)) return ['first_last_frame_video'];
    return ['text_to_video'];
  }
  if (category === 'audio') return ['audio_generation'];
  if (category === 'multimodal') return ['multimodal_test'];
  return ['prompt_optimize', 'text_generation'];
};

const isSupportedTestType = (value?: string) => BACKEND_SUPPORTED_TEST_TYPES.has(String(value || ''));
const isSupportedModelCategory = (category: ModelCategory): boolean => category === 'text' || category === 'image' || category === 'video';

const defaultFormValues = (category: ModelCategory) => {
  if (category === 'image') {
    return {
      testType: 'text_to_image',
      resolution: '1024x1024',
      quality: 'standard',
      imageCount: 1,
      prompt: '一只穿着宇航服的猫，站在月球表面，背景是地球，科幻风格，高清细节',
      negativePrompt: '',
      cfgScale: 7,
      steps: 30,
      sampler: 'DPM-Solver++',
      seed: '',
      timeoutSeconds: 120,
      referenceImageUrl: '',
      maskImageUrl: '',
      backgroundImageUrl: '',
    };
  }
  if (category === 'video') {
    return {
      testType: 'text_to_video',
      ratio: '16:9',
      duration: '5s',
      customDuration: undefined,
      videoQuality: '720p',
      prompt: '一个简洁的产品展示视频，镜头缓慢推进，光线自然，画面稳定',
      seed: '',
      motionStrength: 5,
      cameraControl: 'slow_push',
      timeoutSeconds: 180,
      firstFrameUrl: '',
      lastFrameUrl: '',
    };
  }
  if (category === 'audio') {
    return {
      testType: 'audio_generation',
      prompt: '生成一段轻快、清晰、适合产品展示的背景音乐',
      timeoutSeconds: 120,
    };
  }
  if (category === 'multimodal') {
    return {
      testType: 'multimodal_test',
      prompt: '请分析这张图片的主体、风格和适合的生成提示词',
      timeoutSeconds: 120,
    };
  }
  return {
    testType: 'text_generation',
    prompt: '你好',
    systemPrompt: '',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1024,
  };
};

const categoryForTestType = (value?: string): ModelCategory => {
  if (['text_to_image', 'image_to_image', 'image_edit'].includes(String(value))) return 'image';
  if (['text_to_video', 'image_to_video', 'first_last_frame_video'].includes(String(value))) return 'video';
  if (String(value) === 'audio_generation') return 'audio';
  if (String(value) === 'multimodal_test') return 'multimodal';
  return 'text';
};

const statusTag = (status: TestRecord['status'] | TestRunRow['status']) => {
  const meta: Record<string, { color: string; text: string }> = {
    pending: { color: 'default', text: '待测试' },
    running: { color: 'processing', text: '测试中' },
    success: { color: 'success', text: '成功' },
    warning: { color: 'warning', text: '警告' },
    failed: { color: 'error', text: '失败' },
    stopped: { color: 'default', text: '已中止' },
  };
  const item = meta[status] || meta.pending;
  return <Tag color={item.color}>{item.text}</Tag>;
};

const collectUrls = (value: unknown): string[] => {
  const urls: string[] = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (/^(https?:\/\/|data:image\/|data:video\/)/i.test(node)) urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return Array.from(new Set(urls));
};

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) || /^data:video\//i.test(url);

const maskSensitiveText = (text: string) =>
  text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,"'}]+/gi, '$1****')
    .replace(/((api[_-]?key|token|secret|password)\s*[:=]\s*)["']?[^"',\s}]+/gi, '$1****')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-****');

const sanitizeSensitive = (value: unknown): unknown => {
  if (typeof value === 'string') return maskSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitizeSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/(api[_-]?key|token|secret|password|authorization)/i.test(key)) return [key, '****'];
      return [key, sanitizeSensitive(item)];
    }));
  }
  return value;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const getErrorMessage = (error: unknown) => {
  const err = error as { response?: { data?: { message?: string; code?: string } }; message?: string; code?: string };
  if (err.code === 'ECONNABORTED') return '请求超时，请检查网络连接或模型超时时间';
  if (!err.response && /network error/i.test(err.message || '')) return '网络连接失败，请检查服务器是否正常运行';
  return err.response?.data?.message || err.message || '模型测试失败';
};

const getErrorCode = (error: unknown) => {
  const err = error as { response?: { data?: { code?: string | number } }; code?: string };
  return safeText(err.response?.data?.code || err.code, '-');
};

export default function ModelTest() {
  const [form] = Form.useForm();
  const [models, setModels] = useState<RealModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [activeType, setActiveType] = useState<ModelCategory>('image');
  const activeTypeRef = useRef<ModelCategory>(activeType);
  activeTypeRef.current = activeType;
  const [providerFilter, setProviderFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [modelLoading, setModelLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [testError, setTestError] = useState<{ code?: string; message: string; durationMs?: number } | null>(null);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [recordDetail, setRecordDetail] = useState<TestRecord | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchForm] = Form.useForm();
  const [batchRows, setBatchRows] = useState<TestRunRow[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareForm] = Form.useForm();
  const [compareRows, setCompareRows] = useState<TestRunRow[]>([]);
  const [compareRunning, setCompareRunning] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm] = Form.useForm();
  const batchStopRef = useRef(false);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) || null,
    [models, selectedModelId],
  );
  const selectedCategory = normalizeModelType(selectedModel?.modelType || activeType);
  const testType = Form.useWatch('testType', form);
  const durationValue = Form.useWatch('duration', form);
  const resolutionValue = Form.useWatch('resolution', form);
  const selectedModelTestSupported = selectedModel ? isSupportedModelCategory(selectedCategory) : false;
  const activeTypeTestSupported = isSupportedModelCategory(activeType);

  const providerOptions = useMemo(() => {
    const names = Array.from(new Set(models.map((model) => model.providerName).filter(Boolean).map(String)));
    return [{ label: '全部供应商', value: 'all' }, ...names.map((name) => ({ label: name, value: name }))];
  }, [models]);

  const modelSelectOptions = useMemo(() => models.map((model) => {
    const category = normalizeModelType(model.modelType);
    return {
      value: model.id,
      disabled: model.status !== 'active',
      label: (
        <Space size={6} wrap>
          <Text>{safeText(model.providerName)} / {getModelName(model)}</Text>
          <Tag color={category === 'video' ? 'purple' : category === 'image' ? 'blue' : 'cyan'}>{CATEGORY_LABELS[category]}</Tag>
          <Tag color={model.status === 'active' ? 'success' : 'default'}>{model.status === 'active' ? '启用' : '已停用'}</Tag>
        </Space>
      ),
    };
  }), [models]);

  const filteredModels = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return models.filter((model) => {
      const category = normalizeModelType(model.modelType);
      const caps = inferCapabilities(model);
      const haystack = [
        model.name,
        model.displayName,
        model.apiModelName,
        model.modelCode,
        model.providerName,
      ].map((item) => String(item || '').toLowerCase()).join(' ');
      if (category !== activeType) return false;
      if (providerFilter !== 'all' && model.providerName !== providerFilter) return false;
      if (typeFilter !== 'all' && category !== typeFilter) return false;
      if (capabilityFilter !== 'all' && !caps.includes(capabilityFilter)) return false;
      if (statusFilter !== 'all' && getHealthLevel(model) !== statusFilter) return false;
      if (kw && !haystack.includes(kw)) return false;
      return true;
    });
  }, [activeType, capabilityFilter, keyword, models, providerFilter, statusFilter, typeFilter]);

  const selectedRecords = useMemo(
    () => records.filter((item) => item.modelId === selectedModelId),
    [records, selectedModelId],
  );

  const healthStats = useMemo(() => {
    if (!selectedRecords.length) {
      return {
        successRate: '暂无数据',
        avg: '暂无数据',
        min: '暂无数据',
        max: '暂无数据',
        total: '暂无数据',
        failed: '暂无数据',
      };
    }
    const success = selectedRecords.filter((item) => item.status === 'success').length;
    const failed = selectedRecords.filter((item) => item.status === 'failed').length;
    const times = selectedRecords.map((item) => item.responseTime).filter((item) => Number.isFinite(item));
    const avg = times.length ? Math.round(times.reduce((sum, item) => sum + item, 0) / times.length) : 0;
    return {
      successRate: `${Math.round((success / selectedRecords.length) * 100)}%`,
      avg: times.length ? `${avg}ms` : '-',
      min: times.length ? `${Math.min(...times)}ms` : '-',
      max: times.length ? `${Math.max(...times)}ms` : '-',
      total: `${selectedRecords.length} 次`,
      failed: `${failed} 次`,
    };
  }, [selectedRecords]);

  const loadModels = useCallback(async () => {
    setModelLoading(true);
    try {
      const response: any = await api.get('/real-models');
      const list: RealModel[] = Array.isArray(response.data) ? response.data : [];
      setModels(list);
      setSelectedModelId((current) => {
        if (current && list.some((model) => model.id === current)) return current;
        return list.find((model) => normalizeModelType(model.modelType) === activeTypeRef.current)?.id || list[0]?.id || null;
      });
    } catch {
      setModels([]);
      message.error('获取真实模型列表失败');
    } finally {
      setModelLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!filteredModels.length) {
      setSelectedModelId(null);
      return;
    }
    if (!selectedModelId || !filteredModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(filteredModels[0].id);
    }
  }, [filteredModels, selectedModelId]);

  useEffect(() => {
    form.setFieldsValue(defaultFormValues(selectedCategory));
    setResult(null);
    setTestError(null);
  }, [form, selectedCategory, selectedModelId]);

  const clearParams = () => {
    form.resetFields();
    form.setFieldsValue({ testType: defaultFormValues(selectedCategory).testType });
    setResult(null);
    setTestError(null);
  };

  const buildPayloadForCategory = (values: Record<string, any>, category: ModelCategory) => {
    // 后端测试接口当前只识别 prompt/taskType/images/nativeSize/quality/duration/ratio；
    // 其它高级参数保留为前端兼容展示，提交前过滤，避免未知字段影响接口。
    const payload: Record<string, unknown> = {
      prompt: String(values.prompt || '').trim(),
      taskType: values.testType,
    };
    const images = [
      values.referenceImageUrl,
      values.firstFrameUrl,
      values.lastFrameUrl,
    ].map((item) => String(item || '').trim()).filter(Boolean);

    if (category === 'image') {
      payload.nativeSize = values.resolution === 'custom' ? values.customResolution || '1024x1024' : values.resolution;
      payload.quality = values.quality;
      if (images.length) payload.images = images;
    }
    if (category === 'video') {
      payload.ratio = values.ratio;
      payload.duration = values.duration === 'custom' ? `${values.customDuration || 5}s` : values.duration;
      payload.quality = values.videoQuality || values.quality;
      if (images.length) payload.images = images;
    }
    if (category === 'text') {
      payload.systemPrompt = String(values.systemPrompt || '').trim();
      payload.temperature = values.temperature;
      payload.topP = values.topP;
      payload.maxTokens = values.maxTokens;
    }
    return payload;
  };

  const summarizeTestParams = (values: Record<string, any>, category: ModelCategory) => {
    if (category === 'image') {
      return `${safeText(values.resolution || values.ratio)} / ${safeText(values.quality)} / ${safeText(values.imageCount || 1)}张`;
    }
    if (category === 'video') {
      return `${safeText(values.ratio)} / ${safeText(values.duration)} / ${safeText(values.videoQuality || values.quality)}`;
    }
    return `${safeText(TEST_TYPE_LABELS[String(values.testType)] || values.testType)} / 超时 ${safeText(values.timeoutSeconds || 120)}秒`;
  };

  const extractRecordCost = (data: Record<string, any>, model: RealModel) => safeText(
    data.cost ?? data.costCents ?? data.pointsCost ?? data.actualCost ?? model.apiCostCents ?? model.pointsCost,
  );

  const executeSingleModelTest = async (model: RealModel, values: Record<string, any>) => {
    const category = categoryForTestType(values.testType) || normalizeModelType(model.modelType);
    const started = Date.now();
    const payload = buildPayloadForCategory(values, category);
    const testTypeLabel = TEST_TYPE_LABELS[String(values.testType)] || safeText(values.testType);
    const recordBase = {
      id: `${Date.now()}-${model.id}-${Math.random().toString(36).slice(2, 7)}`,
      modelId: model.id,
      modelName: getModelName(model),
      providerName: safeText(model.providerName),
      modelCode: getModelCode(model),
      modelType: CATEGORY_LABELS[normalizeModelType(model.modelType)],
      testType: testTypeLabel,
      testTypeKey: String(values.testType || ''),
      summary: summarizeTestParams(values, category),
      createdAt: new Date().toISOString(),
      params: sanitizeSensitive({
        ...payload,
        imageCount: values.imageCount,
        timeoutSeconds: values.timeoutSeconds,
        negativePrompt: values.negativePrompt,
      }) as Record<string, unknown>,
    };

    try {
      const response: any = await api.post(`/real-models/${model.id}/test`, payload);
      const data = response.data || response || {};
      const durationMs = Number((data as any).durationMs || Date.now() - started);
      const nextRecord: TestRecord = {
        ...recordBase,
        status: (data as any).status === 'passed' || (data as any).mappedStatus === 'completed' ? 'success' : 'warning',
        responseTime: durationMs,
        cost: extractRecordCost(data as Record<string, any>, model),
        taskId: safeText((data as any).providerTaskId || (data as any).task_id, ''),
        requestId: safeText((data as any).requestId || (data as any).request_id, ''),
        result: data,
      };
      return nextRecord;
    } catch (error) {
      const durationMs = Date.now() - started;
      const failedRecord: TestRecord = {
        ...recordBase,
        status: 'failed',
        responseTime: durationMs,
        error: {
          code: getErrorCode(error),
          message: getErrorMessage(error),
        },
      };
      return failedRecord;
    }
  };

  const runTest = async () => {
    if (testing) return;
    if (!selectedModel) {
      message.warning('请选择模型');
      return;
    }
    if (!isSupportedModelCategory(selectedCategory)) {
      message.warning('当前后端真实模型测试接口仅支持图片和视频模型');
      return;
    }
    let values: Record<string, any>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!isSupportedTestType(values.testType)) {
      message.warning('当前版本暂未接入该测试类型的真实测试接口');
      return;
    }
    setTesting(true);
    setResult(null);
    setTestError(null);
    try {
      const nextRecord = await executeSingleModelTest(selectedModel, values);
      if (nextRecord.result) setResult(nextRecord.result);
      setRecords((items) => [nextRecord, ...items].slice(0, 20));
      if (nextRecord.status === 'failed') {
        setTestError({
          code: nextRecord.error?.code,
          message: nextRecord.error?.message || '模型测试失败，请检查模型配置',
          durationMs: nextRecord.responseTime,
        });
        message.error(nextRecord.error?.message || '模型测试失败，请检查模型配置');
      } else {
        message.success('模型测试完成');
      }
      await loadModels();
    } finally {
      setTesting(false);
    }
  };

  const confirmRunTest = () => {
    if (!selectedModel) {
      message.warning('请选择模型');
      return;
    }
    Modal.confirm({
      title: '确认开始模型测试？',
      icon: <ThunderboltOutlined style={{ color: '#1677ff' }} />,
      width: 560,
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="warning" showIcon message="本操作会调用真实供应商接口，可能产生额度消耗。" />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="供应商">{safeText(selectedModel.providerName)}</Descriptions.Item>
            <Descriptions.Item label="模型名称">{getModelName(selectedModel)}</Descriptions.Item>
            <Descriptions.Item label="模型标识">
              <Text code>{getModelCode(selectedModel)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="测试类型">{TEST_TYPE_LABELS[String(testType)] || safeText(testType)}</Descriptions.Item>
            <Descriptions.Item label="提交字段">prompt / taskType / images / nativeSize / quality / duration / ratio</Descriptions.Item>
          </Descriptions>
        </Space>
      ),
      okText: '开始测试',
      cancelText: '取消',
      onOk: runTest,
    });
  };

  const confirmRetest = () => {
    if (!selectedModel) {
      message.warning('请选择模型');
      return;
    }
    Modal.confirm({
      title: '重新检测模型？',
      icon: <ReloadOutlined style={{ color: '#1677ff' }} />,
      width: 520,
      content: '将使用当前测试参数重新检测该模型，可能产生费用。',
      okText: '确认检测',
      cancelText: '取消',
      onOk: runTest,
    });
  };

  const openBatchModal = () => {
    const currentValues = form.getFieldsValue();
    batchForm.resetFields();
    batchForm.setFieldsValue({
      scope: 'filtered',
      testType: currentValues.testType || defaultFormValues(activeType).testType,
      prompt: currentValues.prompt || defaultFormValues(activeType).prompt,
      resolution: currentValues.resolution || '1024x1024',
      ratio: currentValues.ratio || '16:9',
      quality: currentValues.quality || '1K',
      videoQuality: currentValues.videoQuality || '720p',
      imageCount: currentValues.imageCount || 1,
      timeoutSeconds: currentValues.timeoutSeconds || 120,
      modelIds: selectedModelId ? [selectedModelId] : [],
    });
    setBatchRows([]);
    setBatchOpen(true);
  };

  const resolveBatchModels = (values: Record<string, any>) => {
    const testCategory = categoryForTestType(values.testType);
    const matchesTestCategory = (model: RealModel) => normalizeModelType(model.modelType) === testCategory;
    if (values.scope === 'allEnabled') return models.filter((model) => model.status === 'active' && matchesTestCategory(model));
    if (values.scope === 'manual') {
      const ids = new Set((values.modelIds || []).map(Number));
      return models.filter((model) => ids.has(model.id) && matchesTestCategory(model));
    }
    return filteredModels.filter((model) => model.status === 'active' && matchesTestCategory(model));
  };

  const updateRunRow = (modelId: number, patch: Partial<TestRunRow>) => {
    setBatchRows((rows) => rows.map((row) => row.modelId === modelId ? { ...row, ...patch } : row));
    setCompareRows((rows) => rows.map((row) => row.modelId === modelId ? { ...row, ...patch } : row));
  };

  const startBatchTest = async () => {
    if (batchRunning) return;
    let values: Record<string, any>;
    try {
      values = await batchForm.validateFields();
    } catch {
      return;
    }
    if (!isSupportedTestType(values.testType)) {
      message.warning('当前版本暂未接入该测试类型的真实测试接口');
      return;
    }
    const targetModels = resolveBatchModels(values);
    if (!targetModels.length) {
      message.warning('请选择需要测试的模型');
      return;
    }
    batchStopRef.current = false;
    const initialRows: TestRunRow[] = targetModels.map((model) => ({
      modelId: model.id,
      modelName: getModelName(model),
      providerName: safeText(model.providerName),
      modelType: normalizeModelType(model.modelType),
      status: 'pending',
    }));
    setBatchRows(initialRows);
    setBatchRunning(true);
    try {
      for (const model of targetModels) {
        if (batchStopRef.current) {
          setBatchRows((rows) => rows.map((row) => row.status === 'pending' ? { ...row, status: 'stopped' } : row));
          break;
        }
        updateRunRow(model.id, { status: 'running' });
        const record = await executeSingleModelTest(model, values);
        updateRunRow(model.id, {
          status: record.status,
          responseTime: record.responseTime,
          cost: record.cost,
          record,
          error: record.error?.message,
        });
        setRecords((items) => [record, ...items].slice(0, 100));
      }
      if (batchStopRef.current) message.info('已中止后续测试，已发出的请求已正常完成');
      else message.success('批量测试完成');
      await loadModels();
    } finally {
      setBatchRunning(false);
    }
  };

  const openCompareModal = () => {
    const currentValues = form.getFieldsValue();
    compareForm.resetFields();
    compareForm.setFieldsValue({
      modelIds: selectedModelId ? [selectedModelId] : [],
      testType: currentValues.testType || defaultFormValues(activeType).testType,
      prompt: currentValues.prompt || defaultFormValues(activeType).prompt,
      resolution: currentValues.resolution || '1024x1024',
      ratio: currentValues.ratio || '16:9',
      quality: currentValues.quality || '1K',
      videoQuality: currentValues.videoQuality || '720p',
      imageCount: currentValues.imageCount || 1,
      timeoutSeconds: currentValues.timeoutSeconds || 120,
    });
    setCompareRows([]);
    setCompareOpen(true);
  };

  const startCompareTest = async () => {
    if (compareRunning) return;
    let values: Record<string, any>;
    try {
      values = await compareForm.validateFields();
    } catch {
      return;
    }
    if (!isSupportedTestType(values.testType)) {
      message.warning('当前版本暂未接入该测试类型的真实测试接口');
      return;
    }
    const ids = (values.modelIds || []).map(Number);
    const targetModels = models.filter((model) => ids.includes(model.id));
    if (targetModels.length < 2 || targetModels.length > 4) {
      message.error('请选择 2-4 个模型进行对比');
      return;
    }
    const typeSet = new Set(targetModels.map((model) => normalizeModelType(model.modelType)));
    if (typeSet.size !== 1) {
      message.error('模型类型必须一致，不允许图片模型和视频模型混测');
      return;
    }
    const targetType = Array.from(typeSet)[0];
    const testCategory = categoryForTestType(values.testType);
    if (targetType !== 'multimodal' && testCategory !== targetType) {
      message.error('测试类型必须与所选模型类型一致');
      return;
    }
    setCompareRows(targetModels.map((model) => ({
      modelId: model.id,
      modelName: getModelName(model),
      providerName: safeText(model.providerName),
      modelType: normalizeModelType(model.modelType),
      status: 'running',
    })));
    setCompareRunning(true);
    try {
      await Promise.all(targetModels.map(async (model) => {
        const record = await executeSingleModelTest(model, values);
        updateRunRow(model.id, {
          status: record.status,
          responseTime: record.responseTime,
          cost: record.cost,
          record,
          error: record.error?.message,
        });
        setRecords((items) => [record, ...items].slice(0, 100));
      }));
      message.success('测试对比完成');
      await loadModels();
    } finally {
      setCompareRunning(false);
    }
  };

  const confirmClearRecords = () => {
    Modal.confirm({
      title: '清空当前页面测试结果？',
      width: 520,
      content: '只清空当前页面本地展示结果，不影响后台真实记录。',
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setRecords([]);
        setResult(null);
        setTestError(null);
        setRecordDetail(null);
        message.success('本地测试结果已清空');
      },
    });
  };

  const openExportModal = () => {
    exportForm.resetFields();
    exportForm.setFieldsValue({ format: 'json', modelIds: [], statuses: [] });
    setExportOpen(true);
  };

  const exportRecords = async () => {
    const values = await exportForm.validateFields();
    const range = values.range || [];
    const modelIds = new Set((values.modelIds || []).map(Number));
    const statuses = new Set(values.statuses || []);
    const filtered = records.filter((record) => {
      const time = new Date(record.createdAt).getTime();
      if (range.length === 2) {
        const start = range[0]?.startOf?.('day')?.valueOf?.() ?? range[0]?.valueOf?.();
        const end = range[1]?.endOf?.('day')?.valueOf?.() ?? range[1]?.valueOf?.();
        if (time < start || time > end) return false;
      }
      if (modelIds.size && !modelIds.has(record.modelId)) return false;
      if (statuses.size && !statuses.has(record.status)) return false;
      return true;
    });
    if (!filtered.length) {
      message.warning('当前筛选条件下没有可导出的测试记录');
      return;
    }
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (values.format === 'csv') {
      const headers = ['测试时间', '模型名称', '供应商', '测试类型', '参数摘要', '状态', '响应时间', '成本', '错误信息'];
      const rows = filtered.map((record) => [
        formatDate(record.createdAt),
        record.modelName,
        record.providerName,
        record.testType,
        record.summary,
        record.status,
        `${record.responseTime}ms`,
        record.cost || '',
        record.error?.message || '',
      ]);
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      downloadTextFile(`model-test-records-${date}.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    } else {
      const payload = filtered.map((record) => ({
        ...record,
        params: sanitizeSensitive(record.params),
        result: sanitizeSensitive(record.result),
      }));
      downloadTextFile(`model-test-records-${date}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    }
    setExportOpen(false);
    message.success('测试记录已导出');
  };

  const copyText = async (value: string, label = '内容') => {
    try {
      await navigator.clipboard?.writeText(value);
      message.success(`${label}已复制`);
    } catch {
      message.info('当前浏览器不支持自动复制');
    }
  };

  const resetFilters = () => {
    setProviderFilter('all');
    setTypeFilter('all');
    setCapabilityFilter('all');
    setStatusFilter('all');
    setKeyword('');
  };

  const renderRecordOutput = (record?: TestRecord | null, compact = false) => {
    if (!record?.result && !record?.error) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无输出结果" />;
    }
    if (record.error) {
      return (
        <Alert
          type="error"
          showIcon
          message={record.error.code ? `错误码：${record.error.code}` : '测试失败'}
          description={record.error.message}
        />
      );
    }
    const data = record.result as Record<string, any>;
    const urls = collectUrls(data?.urls || data?.result || data);
    const videoUrls = urls.filter(isVideoUrl);
    const imageUrls = urls.filter((url) => !isVideoUrl(url));
    if (imageUrls.length) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(96px, 1fr))' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {imageUrls.map((url) => (
            <Image key={url} src={url} alt="测试结果" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6 }} />
          ))}
        </div>
      );
    }
    if (videoUrls.length) {
      return (
        <Space direction="vertical" style={{ width: '100%' }}>
          {videoUrls.map((url) => (
            <video key={url} src={url} controls style={{ width: '100%', maxHeight: compact ? 180 : 360, borderRadius: 6, background: '#000' }} />
          ))}
        </Space>
      );
    }
    return (
      <Card size="small" style={{ background: '#f8fafc' }}>
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {safeText(data?.message || data?.text || data?.content || JSON.stringify(sanitizeSensitive(data), null, compact ? 0 : 2))}
        </Paragraph>
      </Card>
    );
  };

  const renderTestParameterFields = (formNamePrefix = '') => (
    <>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="testType" label="测试类型" rules={[{ required: true, message: '请选择测试类型' }]}>
            <Select options={TEST_FLOW_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="resolution" label="分辨率/比例">
            <Select options={COMMON_RESOLUTION_OPTIONS.map((value) => ({ label: value, value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="quality" label="质量">
            <Select options={COMMON_QUALITY_OPTIONS.map((value) => ({ label: value, value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="ratio" label="视频比例">
            <Select options={['16:9', '9:16', '1:1'].map((value) => ({ label: value, value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="imageCount" label="生成数量">
            <InputNumber min={1} max={4} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="timeoutSeconds" label="超时时间">
            <InputNumber min={5} max={600} addonAfter="秒" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
        <TextArea rows={formNamePrefix === 'compare' ? 3 : 4} showCount maxLength={1000} />
      </Form.Item>
    </>
  );

  const renderTestForm = () => {
    if (!selectedModel) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择一个模型" />;
    }

    if (!isSupportedModelCategory(selectedCategory)) {
      return (
        <Alert
          showIcon
          type="warning"
          message="当前版本暂未接入该类型模型的真实测试接口"
          description="后端 /real-models/:id/test 当前仅支持文本、图片和视频真实模型测试；音频、多模态需要独立测试参数接入后再开放。"
        />
      );
    }

    if (selectedCategory === 'text') {
      return (
        <>
          <Alert
            showIcon
            type="info"
            message="文本模型将复用真实模型测试接口，按供应商配置的聊天协议提交。"
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="testType" label="测试类型">
                <Select options={[
                  { label: '提示词优化', value: 'prompt_optimize' },
                  { label: '文本生成', value: 'text_generation' },
                  { label: '脚本生成', value: 'script_generation' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="temperature" label="temperature">
                <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="topP" label="top_p">
                <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
            <TextArea rows={4} showCount maxLength={1000} />
          </Form.Item>
          <Form.Item name="systemPrompt" label="系统提示词（可选）">
            <TextArea rows={3} placeholder="用于约束模型角色、风格或输出格式" />
          </Form.Item>
          <Form.Item name="maxTokens" label="max_tokens">
            <InputNumber min={1} max={8000} style={{ width: 220 }} />
          </Form.Item>
        </>
      );
    }

    if (selectedCategory === 'video') {
      return (
        <>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="testType" label="测试类型">
                <Select options={[
                  { label: '文生视频', value: 'text_to_video' },
                  { label: '图生视频', value: 'image_to_video' },
                  { label: '首尾帧视频', value: 'first_last_frame_video' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="ratio" label="比例">
                <Select options={['16:9', '9:16', '1:1'].map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="duration" label="时长">
                <Select options={[
                  { label: '5秒', value: '5s' },
                  { label: '10秒', value: '10s' },
                  { label: '自定义', value: 'custom' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          {durationValue === 'custom' && (
            <Form.Item name="customDuration" label="自定义时长（秒）">
              <InputNumber min={1} max={60} style={{ width: 220 }} />
            </Form.Item>
          )}
          <Form.Item name="videoQuality" label="清晰度">
            <Segmented disabled options={['720p', '1080p', '2K', '4K']} />
          </Form.Item>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
            <TextArea rows={4} showCount maxLength={1000} />
          </Form.Item>
          {(testType === 'image_to_video' || testType === 'first_last_frame_video') && (
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="firstFrameUrl"
                  label="首帧图 URL"
                  rules={[{ required: true, message: '请输入首帧图 URL' }]}
                  extra="后端测试接口接收图片 URL；上传控件仅用于本地选择提示，不会自动上传。"
                >
                  <Input placeholder="https://example.com/image.png" />
                </Form.Item>
                <Upload beforeUpload={() => false} maxCount={1}>
                  <Button>选择首帧图</Button>
                </Upload>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="lastFrameUrl"
                  label={testType === 'first_last_frame_video' ? '尾帧图 URL' : '尾帧图 URL（可选）'}
                  rules={testType === 'first_last_frame_video' ? [{ required: true, message: '请输入尾帧图 URL' }] : []}
                >
                  <Input placeholder="https://example.com/end.png" />
                </Form.Item>
                <Upload beforeUpload={() => false} maxCount={1}>
                  <Button>选择尾帧图</Button>
                </Upload>
              </Col>
            </Row>
          )}
          <Collapse
            ghost
            items={[{
              key: 'advanced',
              label: '高级参数（可选）',
              children: (
                <Row gutter={16}>
                  <Col xs={24} md={6}><Form.Item name="seed" label="随机种子"><Input placeholder="留空随机" /></Form.Item></Col>
                  <Col xs={24} md={6}><Form.Item name="motionStrength" label="运动强度"><InputNumber min={1} max={10} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={6}><Form.Item name="cameraControl" label="镜头控制"><Select options={[
                    { label: '缓慢推进', value: 'slow_push' },
                    { label: '固定镜头', value: 'static' },
                    { label: '轻微平移', value: 'pan' },
                  ]} /></Form.Item></Col>
                  <Col xs={24} md={6}><Form.Item name="timeoutSeconds" label="超时时间"><InputNumber min={5} max={600} addonAfter="秒" style={{ width: '100%' }} /></Form.Item></Col>
                </Row>
              ),
            }]}
          />
        </>
      );
    }

    if (selectedCategory === 'audio' || selectedCategory === 'multimodal') {
      return (
        <>
          <Alert
            showIcon
            type="warning"
            message="当前后端真实模型测试接口暂未支持该类型模型，提交后可能返回不支持提示。"
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="testType" label="测试类型">
            <Select options={[
              { label: selectedCategory === 'audio' ? '音频生成' : '多模态测试', value: selectedCategory === 'audio' ? 'audio_generation' : 'multimodal_test' },
            ]} />
          </Form.Item>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
            <TextArea rows={5} showCount maxLength={1000} />
          </Form.Item>
        </>
      );
    }

    return (
      <>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="testType" label="测试类型">
              <Select options={[
                { label: '文生图', value: 'text_to_image' },
                { label: '图生图', value: 'image_to_image' },
                { label: '图片编辑', value: 'image_edit' },
              ]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="resolution" label="分辨率/比例">
              <Select options={['1024x1024', '1024x1536', '1536x1024', '1:1', '16:9', '9:16', 'custom'].map((value) => ({
                label: value === 'custom' ? '自定义' : value,
                value,
              }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="quality" label="质量">
              <Select options={[
                { label: '标准', value: 'standard' },
                { label: '1K', value: '1K' },
                { label: '2K', value: '2K' },
                { label: '4K', value: '4K' },
              ]} />
            </Form.Item>
          </Col>
        </Row>
        {resolutionValue === 'custom' && (
          <Form.Item name="customResolution" label="自定义分辨率">
            <Input placeholder="例如 1280x720" style={{ maxWidth: 260 }} />
          </Form.Item>
        )}
        <Form.Item name="imageCount" label="生成数量">
          <Radio.Group optionType="button" buttonStyle="solid" options={[
            { label: '1张', value: 1 },
            { label: '2张', value: 2 },
            { label: '4张', value: 4 },
          ]} />
        </Form.Item>
        <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
          <TextArea rows={4} showCount maxLength={1000} />
        </Form.Item>
        <Form.Item name="negativePrompt" label="负面提示词（可选）">
          <TextArea rows={3} showCount maxLength={500} placeholder="不希望出现的内容，例如：模糊、低质量、文字、水印等" />
        </Form.Item>
        {(testType === 'image_to_image' || testType === 'image_edit') && (
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="referenceImageUrl"
                label="参考图 URL"
                rules={[{ required: true, message: '请输入参考图 URL' }]}
                extra="后端测试接口接收图片 URL；上传控件仅用于本地选择提示，不会自动上传。"
              >
                <Input placeholder="https://example.com/reference.png" />
              </Form.Item>
              <Upload beforeUpload={() => false} maxCount={1}>
                <Button>选择参考图</Button>
              </Upload>
            </Col>
            {testType === 'image_edit' && (
              <>
                <Col xs={24} md={8}>
                  <Form.Item name="maskImageUrl" label="mask URL（前端展示）">
                    <Input placeholder="当前测试接口暂不区分 mask 字段" />
                  </Form.Item>
                  <Upload beforeUpload={() => false} maxCount={1}>
                    <Button>选择 mask</Button>
                  </Upload>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="backgroundImageUrl" label="background URL（前端展示）">
                    <Input placeholder="当前测试接口暂不区分 background 字段" />
                  </Form.Item>
                  <Upload beforeUpload={() => false} maxCount={1}>
                    <Button>选择背景图</Button>
                  </Upload>
                </Col>
              </>
            )}
          </Row>
        )}
        <Collapse
          ghost
          items={[{
            key: 'advanced',
            label: '高级参数（可选）',
            children: (
              <Row gutter={16}>
                <Col xs={24} md={6}><Form.Item name="cfgScale" label="CFG Scale"><InputNumber min={1} max={30} style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} md={6}><Form.Item name="steps" label="采样步数"><InputNumber min={1} max={100} style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} md={6}><Form.Item name="sampler" label="采样器"><Select options={[
                  { label: 'DPM-Solver++', value: 'DPM-Solver++' },
                  { label: 'Euler', value: 'Euler' },
                  { label: 'DDIM', value: 'DDIM' },
                ]} /></Form.Item></Col>
                <Col xs={24} md={6}><Form.Item name="seed" label="随机种子"><Input placeholder="留空随机" /></Form.Item></Col>
                <Col xs={24} md={6}><Form.Item name="timeoutSeconds" label="超时时间"><InputNumber min={5} max={600} addonAfter="秒" style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
            ),
          }]}
        />
      </>
    );
  };

  const renderResult = () => {
    if (testing) {
      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12, color: '#64748b' }}>模型测试中，请稍候。</div>
        </div>
      );
    }
    if (testError) {
      return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="error"
            message="模型测试失败"
            description={testError.message}
          />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="错误码">{testError.code || '-'}</Descriptions.Item>
            <Descriptions.Item label="错误信息">{testError.message}</Descriptions.Item>
            <Descriptions.Item label="响应时间">{testError.durationMs ? `${testError.durationMs}ms` : '-'}</Descriptions.Item>
          </Descriptions>
          <Card size="small" title="建议排查" style={{ background: '#fff7f7' }}>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.8 }}>
              <li>检查 API Key 是否正确。</li>
              <li>检查 Base URL 是否正确。</li>
              <li>检查模型标识是否正确。</li>
              <li>检查供应商余额是否充足。</li>
              <li>检查该模型是否支持当前测试能力。</li>
              <li>检查网络和超时时间。</li>
            </ul>
          </Card>
        </Space>
      );
    }
    if (!result) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="点击“开始测试”生成结果。测试结果将展示在这里，包括输出内容、响应时间、成本和错误信息。"
        />
      );
    }

    const resultData = result as Record<string, any>;
    const urls = collectUrls(resultData.urls || resultData.result || resultData);
    const videoUrls = urls.filter(isVideoUrl);
    const imageUrls = urls.filter((url) => !isVideoUrl(url));
    const createdAt = new Date().toISOString();

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions size="small" bordered column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="状态">
            <Tag color={resultData.status === 'passed' || resultData.mappedStatus === 'completed' ? 'success' : 'warning'}>
              {safeText(resultData.status || resultData.mappedStatus)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="响应时间">{resultData.durationMs ? `${resultData.durationMs}ms` : '-'}</Descriptions.Item>
          <Descriptions.Item label="供应商">{safeText(selectedModel?.providerName)}</Descriptions.Item>
          <Descriptions.Item label="模型名称">{getModelName(selectedModel)}</Descriptions.Item>
          <Descriptions.Item label="模型标识">{getModelCode(selectedModel)}</Descriptions.Item>
          <Descriptions.Item label="测试类型">{TEST_TYPE_LABELS[resultData.taskType] || safeText(resultData.taskType)}</Descriptions.Item>
          <Descriptions.Item label="消耗积分">{safeText(resultData.pointsCost || selectedModel?.pointsCost)}</Descriptions.Item>
          <Descriptions.Item label="成本">{safeText(resultData.cost || selectedModel?.apiCostCents)}</Descriptions.Item>
          <Descriptions.Item label="task_id">{safeText(resultData.providerTaskId || resultData.task_id)}</Descriptions.Item>
          <Descriptions.Item label="request_id">{safeText(resultData.requestId || resultData.request_id)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(createdAt)}</Descriptions.Item>
        </Descriptions>

        {imageUrls.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {imageUrls.map((url) => (
              <Card key={url} size="small" styles={{ body: { padding: 8 } }}>
                <Image src={url} alt="测试结果" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6 }} />
                <Space style={{ marginTop: 8 }}>
                  <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(url, 'URL')}>复制 URL</Button>
                  <Button size="small" icon={<DownloadOutlined />} href={url} target="_blank">下载</Button>
                </Space>
              </Card>
            ))}
          </div>
        )}

        {videoUrls.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {videoUrls.map((url) => (
              <Card key={url} size="small" styles={{ body: { padding: 8 } }}>
                <video src={url} controls style={{ width: '100%', maxHeight: 360, borderRadius: 6, background: '#000' }} />
                <Space style={{ marginTop: 8 }}>
                  <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(url, 'URL')}>复制 URL</Button>
                  <Button size="small" icon={<DownloadOutlined />} href={url} target="_blank">下载</Button>
                </Space>
              </Card>
            ))}
          </div>
        )}

        {urls.length === 0 && (
          <Card size="small" style={{ background: '#f8fafc' }}>
            <Paragraph copyable style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {safeText(resultData.message || resultData.text || resultData.content || JSON.stringify(sanitizeSensitive(resultData), null, 2))}
            </Paragraph>
          </Card>
        )}

        <Collapse
          items={[{
            key: 'raw',
            label: '原始响应',
            children: (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                {JSON.stringify(sanitizeSensitive(resultData), null, 2)}
              </pre>
            ),
          }]}
        />
      </Space>
    );
  };

  const runRowColumns: ColumnsType<TestRunRow> = [
    { title: '模型名称', dataIndex: 'modelName', ellipsis: true },
    { title: '供应商', dataIndex: 'providerName', width: 130, ellipsis: true },
    { title: '模型类型', dataIndex: 'modelType', width: 110, render: (value) => CATEGORY_LABELS[value as ModelCategory] || safeText(value) },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => statusTag(value) },
    { title: '响应时间', dataIndex: 'responseTime', width: 110, render: (value) => value ? `${value}ms` : '-' },
    { title: '成本', dataIndex: 'cost', width: 90, render: (value) => safeText(value) },
    { title: '错误信息', dataIndex: 'error', ellipsis: true, render: (value) => value ? <Text type="danger">{value}</Text> : '-' },
  ];

  const modelStatus = selectedModel?.status === 'active' ? '启用' : selectedModel?.status === 'inactive' ? '停用' : safeText(selectedModel?.status);
  const batchFinishedCount = batchRows.filter((row) => !['pending', 'running'].includes(row.status)).length;
  const batchProgressPercent = batchRows.length ? Math.round((batchFinishedCount / batchRows.length) * 100) : 0;

  return (
    <div style={{ margin: -24, padding: 24, minHeight: 'calc(100vh - 112px)', background: '#f5f7fb' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Space direction="vertical" size={4}>
          <Breadcrumb items={[{ title: 'AI模型管理' }, { title: '模型测试' }]} />
          <Space align="center">
            <BugOutlined style={{ color: '#1677ff', fontSize: 22 }} />
            <Title level={3} style={{ margin: 0 }}>模型测试</Title>
          </Space>
          <Text type="secondary">测试真实模型的可用性、响应速度、输出结果和错误信息，帮助快速排查模型接入问题。</Text>
        </Space>
        <Space wrap>
          <Button
            icon={<ThunderboltOutlined />}
            disabled={!activeTypeTestSupported}
            title={!activeTypeTestSupported ? '当前版本暂未接入该类型模型的批量测试接口' : undefined}
            onClick={openBatchModal}
          >
            批量测试
          </Button>
          <Button
            icon={<ApiOutlined />}
            disabled={!activeTypeTestSupported}
            title={!activeTypeTestSupported ? '当前版本暂未接入该类型模型的测试对比接口' : undefined}
            onClick={openCompareModal}
          >
            测试对比
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setRecordsOpen(true)}>测试记录</Button>
          <Button disabled={!records.length} icon={<DownloadOutlined />} onClick={openExportModal}>导出测试记录</Button>
          <Button danger disabled={!records.length} icon={<DeleteOutlined />} onClick={confirmClearRecords}>清空历史测试结果</Button>
          <Button type="primary" icon={<ReloadOutlined />} loading={modelLoading} onClick={loadModels} style={primaryButtonStyle}>刷新</Button>
        </Space>
      </div>

      <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
        <Tabs
          activeKey={activeType}
          onChange={(key) => {
            setActiveType(key as ModelCategory);
            setTypeFilter('all');
            setResult(null);
            setTestError(null);
          }}
          items={MODEL_TABS.map((item) => ({ key: item.key, label: item.label }))}
        />
        <Row gutter={[16, 12]} style={{ padding: '4px 0 16px' }}>
          <Col xs={24} md={8} xl={5}>
            <Text type="secondary">供应商</Text>
            <Select value={providerFilter} onChange={setProviderFilter} options={providerOptions} style={{ width: '100%', marginTop: 6 }} />
          </Col>
          <Col xs={24} md={8} xl={5}>
            <Text type="secondary">模型类型</Text>
            <Select
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                if (value !== 'all') setActiveType(value as ModelCategory);
              }}
              options={TYPE_OPTIONS}
              style={{ width: '100%', marginTop: 6 }}
            />
          </Col>
          <Col xs={24} md={8} xl={5}>
            <Text type="secondary">模型能力</Text>
            <Select value={capabilityFilter} onChange={setCapabilityFilter} options={CAPABILITY_OPTIONS} style={{ width: '100%', marginTop: 6 }} />
          </Col>
          <Col xs={24} md={8} xl={4}>
            <Text type="secondary">状态</Text>
            <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} style={{ width: '100%', marginTop: 6 }} />
          </Col>
          <Col xs={24} md={12} xl={4}>
            <Text type="secondary">搜索</Text>
            <Input.Search
              allowClear
              placeholder="搜索模型名称或 ID"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ marginTop: 6 }}
            />
          </Col>
          <Col xs={24} md={4} xl={1} style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
            <Button icon={<ReloadOutlined />} loading={modelLoading} onClick={loadModels} />
          </Col>
          {(providerFilter !== 'all' || typeFilter !== 'all' || capabilityFilter !== 'all' || statusFilter !== 'all' || keyword) && (
            <Col span={24}>
              <Button size="small" onClick={resetFilters}>清空筛选</Button>
            </Col>
          )}
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={7} xxl={6}>
          <Card title={`模型列表（${filteredModels.length}）`} style={cardStyle} extra={<InfoCircleOutlined style={{ color: '#94a3b8' }} />}>
            {modelLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
            ) : filteredModels.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无可测试模型，请先在“供应商与模型”中添加真实模型。"
              />
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%', maxHeight: 680, overflow: 'auto', paddingRight: 4 }}>
                {filteredModels.map((model) => {
                  const category = normalizeModelType(model.modelType);
                  const active = model.id === selectedModelId;
                  const caps = inferCapabilities(model);
                  return (
                    <div
                      key={model.id}
                      onClick={() => setSelectedModelId(model.id)}
                      style={{
                        border: `1px solid ${active ? '#1677ff' : '#e2e8f0'}`,
                        background: active ? '#eff6ff' : '#fff',
                        borderRadius: 8,
                        padding: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <Space align="start" style={{ width: '100%' }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1677ff',
                          background: '#eaf2ff',
                          fontSize: 20,
                          flexShrink: 0,
                        }}>
                          {modelIcon(category)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Space size={6} wrap>
                            <Text strong ellipsis style={{ maxWidth: 180 }}>{getModelName(model)}</Text>
                            {caps.slice(0, 2).map((cap) => <Tag key={cap} color="blue">{CAPABILITY_LABELS[cap] || cap}</Tag>)}
                          </Space>
                          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                            {safeText(model.providerName)}
                            <span style={{ margin: '0 6px' }}>|</span>
                            <Tooltip title={getModelCode(model)}>
                              <span style={{ display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                                {getModelCode(model)}
                              </span>
                            </Tooltip>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                            {healthTag(getHealthLevel(model))}
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              平均响应 {selectedRecords.length && model.id === selectedModelId ? healthStats.avg : '-'}
                            </Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            最近测试：{formatDate(model.lastTestAt)}
                          </Text>
                        </div>
                      </Space>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={11} xxl={12}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title="测试配置"
              style={cardStyle}
              extra={selectedModel ? <Tag color="blue">{CATEGORY_LABELS[selectedCategory]}</Tag> : null}
            >
              <Form form={form} layout="vertical" requiredMark="optional">
                {renderTestForm()}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                  <Button onClick={clearParams}>清空参数</Button>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
	                    loading={testing}
	                    disabled={!selectedModel || !selectedModelTestSupported}
	                    onClick={confirmRunTest}
	                    style={primaryButtonStyle}
	                  >
                    开始测试
                  </Button>
                </div>
              </Form>
            </Card>

            <Card title="测试结果" style={cardStyle}>
              {renderResult()}
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={6}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="模型基本信息" style={cardStyle}>
              {selectedModel ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="模型名称">{getModelName(selectedModel)}</Descriptions.Item>
                    <Descriptions.Item label="模型标识">
                      <Tooltip title={getModelCode(selectedModel)}>
                        <Text ellipsis style={{ maxWidth: 180 }}>{getModelCode(selectedModel)}</Text>
                      </Tooltip>
                    </Descriptions.Item>
                    <Descriptions.Item label="供应商">{safeText(selectedModel.providerName)}</Descriptions.Item>
                    <Descriptions.Item label="模型类型">{CATEGORY_LABELS[selectedCategory]}</Descriptions.Item>
                    <Descriptions.Item label="模型能力">
                      <Space wrap size={[0, 4]}>
                        {inferCapabilities(selectedModel).map((cap) => <Tag key={cap}>{CAPABILITY_LABELS[cap] || cap}</Tag>)}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态"><Tag color={selectedModel.status === 'active' ? 'success' : 'default'}>{modelStatus}</Tag></Descriptions.Item>
                    <Descriptions.Item label="优先级">{safeText(selectedModel.priority ?? selectedModel.sortOrder)}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{formatDate(selectedModel.createdAt)}</Descriptions.Item>
                  </Descriptions>
                  <Button block onClick={() => setDetailOpen(true)}>查看模型详情</Button>
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未选择模型" />
              )}
            </Card>

            <Card
              title="健康状态"
              style={cardStyle}
              extra={selectedModel ? healthTag(getHealthLevel(selectedModel)) : null}
            >
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="当前健康状态">{selectedModel ? healthTag(getHealthLevel(selectedModel)) : '-'}</Descriptions.Item>
                <Descriptions.Item label="24小时成功率">{healthStats.successRate}</Descriptions.Item>
                <Descriptions.Item label="平均响应时间">{healthStats.avg}</Descriptions.Item>
                <Descriptions.Item label="最快响应时间">{healthStats.min}</Descriptions.Item>
                <Descriptions.Item label="最慢响应时间">{healthStats.max}</Descriptions.Item>
                <Descriptions.Item label="24小时请求数">{healthStats.total}</Descriptions.Item>
                <Descriptions.Item label="24小时失败数">{healthStats.failed}</Descriptions.Item>
              </Descriptions>
              <Button block icon={<ReloadOutlined />} loading={testing} disabled={!selectedModel || !selectedModelTestSupported} onClick={confirmRetest}>重新检测</Button>
            </Card>

            <Card title="最近测试记录" style={cardStyle} extra={<Button type="link" size="small" disabled={!records.length} onClick={() => setRecordsOpen(true)}>查看更多</Button>}>
              {selectedRecords.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本地测试记录" />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {selectedRecords.slice(0, 5).map((record) => (
                    <div key={record.id} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <Text strong>{record.testType}</Text>
                        <Tag color={record.status === 'success' ? 'success' : record.status === 'warning' ? 'warning' : 'error'}>
                          {record.status === 'success' ? '成功' : record.status === 'warning' ? '警告' : '失败'}
                        </Tag>
                      </div>
	                      <Text type="secondary" style={{ fontSize: 12 }}>{record.summary}</Text>
	                      <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
	                        <ClockCircleOutlined /> {formatDate(record.createdAt)} · {record.responseTime}ms
	                      </div>
	                      <Button
	                        type="link"
	                        size="small"
	                        icon={<EyeOutlined />}
	                        style={{ padding: 0, marginTop: 4 }}
	                        onClick={() => setRecordDetail(record)}
	                      >
	                        查看详情
	                      </Button>
	                    </div>
	                  ))}
                </Space>
              )}
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal
        title="模型详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        width={720}
      >
        {selectedModel && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="模型名称">{getModelName(selectedModel)}</Descriptions.Item>
            <Descriptions.Item label="模型标识">{getModelCode(selectedModel)}</Descriptions.Item>
            <Descriptions.Item label="供应商">{safeText(selectedModel.providerName)}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{CATEGORY_LABELS[selectedCategory]}</Descriptions.Item>
            <Descriptions.Item label="模型能力">
              <Space wrap>{inferCapabilities(selectedModel).map((cap) => <Tag key={cap}>{CAPABILITY_LABELS[cap] || cap}</Tag>)}</Space>
            </Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={selectedModel.status === 'active' ? 'success' : 'default'}>{modelStatus}</Tag></Descriptions.Item>
            <Descriptions.Item label="绑定功能">
              {(() => {
                const value = selectedModel.boundFeatures || selectedModel.featureBindings || selectedModel.tiers || selectedModel.features;
                if (Array.isArray(value) && value.length) {
                  return value.map((item: any) => item.featureName || item.tierName || item.name || item.featureKey || item).join('、');
                }
                return safeText(value);
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="价格配置">售价积分：{safeText(selectedModel.pointsCost)}</Descriptions.Item>
            <Descriptions.Item label="成本配置">成本价：{safeText(selectedModel.apiCostCents)}</Descriptions.Item>
            <Descriptions.Item label="最近健康状态">{healthTag(getHealthLevel(selectedModel))}</Descriptions.Item>
            <Descriptions.Item label="最近测试">{formatDate(selectedModel.lastTestAt)}</Descriptions.Item>
            <Descriptions.Item label="测试信息">{safeText(selectedModel.lastTestMessage)}</Descriptions.Item>
            <Descriptions.Item label="超时时间">{safeText(selectedModel.timeoutSeconds)}</Descriptions.Item>
            <Descriptions.Item label="最大并发">{safeText(selectedModel.maxConcurrency)}</Descriptions.Item>
            <Descriptions.Item label="重试次数">{safeText(selectedModel.retryTimes)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="批量测试"
        open={batchOpen}
        onCancel={() => {
          if (batchRunning) {
            message.warning('批量测试执行中，可先中止后续测试');
            return;
          }
          setBatchOpen(false);
        }}
        width={920}
        footer={[
          <Button key="cancel" disabled={batchRunning} onClick={() => setBatchOpen(false)}>取消</Button>,
          batchRunning ? (
            <Button key="stop" danger onClick={() => { batchStopRef.current = true; }}>中止后续测试</Button>
          ) : null,
          <Button key="start" type="primary" icon={<ThunderboltOutlined />} loading={batchRunning} onClick={startBatchTest}>
            开始批量测试
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          message="批量测试会逐个调用真实模型测试接口，可能产生真实费用。"
          description="当前后端没有批量测试接口，本页面复用单模型测试接口顺序执行；中止只会停止后续模型，不会强行取消已经发出的请求。"
          style={{ marginBottom: 16 }}
        />
        <Form form={batchForm} layout="vertical">
          <Form.Item name="scope" label="选择模型" rules={[{ required: true, message: '请选择模型范围' }]}>
            <Radio.Group
              optionType="button"
              options={[
                { label: `当前筛选结果（${filteredModels.filter((model) => model.status === 'active').length}）`, value: 'filtered' },
                { label: '手动选择模型', value: 'manual' },
                { label: `全部启用模型（${models.filter((model) => model.status === 'active').length}）`, value: 'allEnabled' },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => getFieldValue('scope') === 'manual' ? (
              <Form.Item name="modelIds" label="手动选择模型" rules={[{ required: true, message: '请选择至少一个模型' }]}>
                <Select mode="multiple" options={modelSelectOptions} placeholder="请选择需要测试的模型" />
              </Form.Item>
            ) : null}
          </Form.Item>
          {renderTestParameterFields('batch')}
        </Form>
        {batchRows.length ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Progress percent={batchProgressPercent} status={batchRunning ? 'active' : batchProgressPercent === 100 ? 'success' : 'normal'} />
            <Table<TestRunRow>
              rowKey="modelId"
              size="small"
              pagination={false}
              dataSource={batchRows}
              columns={runRowColumns}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="测试对比"
        open={compareOpen}
        onCancel={() => {
          if (compareRunning) {
            message.warning('测试对比执行中，请等待当前请求完成');
            return;
          }
          setCompareOpen(false);
        }}
        width={1080}
        footer={[
          <Button key="cancel" disabled={compareRunning} onClick={() => setCompareOpen(false)}>取消</Button>,
          <Button key="start" type="primary" icon={<ApiOutlined />} loading={compareRunning} onClick={startCompareTest}>开始对比</Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          message="测试对比会对 2-4 个模型使用相同参数发起真实测试，可能产生真实费用。"
          description="当前后端没有独立对比接口，本页面复用单模型测试接口；模型类型必须一致。"
          style={{ marginBottom: 16 }}
        />
        <Form form={compareForm} layout="vertical">
          <Form.Item
            name="modelIds"
            label="选择模型"
            rules={[
              { required: true, message: '请选择模型' },
              {
                validator: (_, value) => {
                  const count = Array.isArray(value) ? value.length : 0;
                  if (count >= 2 && count <= 4) return Promise.resolve();
                  return Promise.reject(new Error('请选择 2-4 个模型'));
                },
              },
            ]}
          >
            <Select mode="multiple" options={modelSelectOptions} placeholder="请选择 2-4 个同类型模型" />
          </Form.Item>
          {renderTestParameterFields('compare')}
        </Form>
        {compareRows.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            {compareRows.map((row) => (
              <Card key={row.modelId} size="small" title={<Text ellipsis>{row.modelName}</Text>} extra={statusTag(row.status)} style={{ borderRadius: 8 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text type="secondary">{row.providerName}</Text>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="响应时间">{row.responseTime ? `${row.responseTime}ms` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="成本">{safeText(row.cost)}</Descriptions.Item>
                  </Descriptions>
                  {row.status === 'running' ? (
                    <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
                  ) : (
                    renderRecordOutput(row.record, true)
                  )}
                </Space>
              </Card>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal
        title="测试记录详情"
        open={!!recordDetail}
        onCancel={() => setRecordDetail(null)}
        footer={<Button onClick={() => setRecordDetail(null)}>关闭</Button>}
        width={900}
      >
        {recordDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="模型名称">{recordDetail.modelName}</Descriptions.Item>
              <Descriptions.Item label="供应商">{recordDetail.providerName}</Descriptions.Item>
              <Descriptions.Item label="测试类型">{recordDetail.testType}</Descriptions.Item>
              <Descriptions.Item label="测试时间">{formatDate(recordDetail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(recordDetail.status)}</Descriptions.Item>
              <Descriptions.Item label="响应时间">{recordDetail.responseTime}ms</Descriptions.Item>
              <Descriptions.Item label="成本">{safeText(recordDetail.cost)}</Descriptions.Item>
              <Descriptions.Item label="模型标识">{recordDetail.modelCode}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="输入参数">
              <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                <Descriptions.Item label="提示词">{safeText(recordDetail.params?.prompt)}</Descriptions.Item>
                <Descriptions.Item label="分辨率">{safeText(recordDetail.params?.nativeSize || recordDetail.params?.ratio)}</Descriptions.Item>
                <Descriptions.Item label="质量">{safeText(recordDetail.params?.quality)}</Descriptions.Item>
                <Descriptions.Item label="生成数量">{safeText((recordDetail.params as any)?.imageCount || 1)}</Descriptions.Item>
              </Descriptions>
            </Card>
            <Card size="small" title="输出结果">
              {renderRecordOutput(recordDetail)}
            </Card>
            {recordDetail.error ? (
              <Card size="small" title="错误信息" style={{ background: '#fff7f7' }}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="错误码">{safeText(recordDetail.error.code)}</Descriptions.Item>
                  <Descriptions.Item label="错误内容">{recordDetail.error.message}</Descriptions.Item>
                  <Descriptions.Item label="排查建议">检查 API Key、Base URL、模型标识、供应商余额、模型能力和网络超时时间。</Descriptions.Item>
                </Descriptions>
              </Card>
            ) : null}
            <Collapse
              items={[{
                key: 'raw',
                label: '原始响应',
                children: (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                    {JSON.stringify(sanitizeSensitive(recordDetail.result || recordDetail.error || {}), null, 2)}
                  </pre>
                ),
              }]}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="导出测试记录"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        onOk={exportRecords}
        okText="导出"
        cancelText="取消"
        width={620}
      >
        <Alert
          type="info"
          showIcon
          message="基于当前页面本地记录导出"
          description="后端暂未提供测试记录导出接口；导出前会对原始响应中的 API Key、Token、Secret 等敏感字段脱敏。"
          style={{ marginBottom: 16 }}
        />
        <Form form={exportForm} layout="vertical">
          <Form.Item name="range" label="时间范围">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="modelIds" label="模型范围">
            <Select mode="multiple" allowClear options={modelSelectOptions} placeholder="不选则导出全部模型" />
          </Form.Item>
          <Form.Item name="statuses" label="状态范围">
            <Select
              mode="multiple"
              allowClear
              options={[
                { label: '成功', value: 'success' },
                { label: '警告', value: 'warning' },
                { label: '失败', value: 'failed' },
              ]}
              placeholder="不选则导出全部状态"
            />
          </Form.Item>
          <Form.Item name="format" label="导出格式" rules={[{ required: true, message: '请选择导出格式' }]}>
            <Radio.Group optionType="button" options={[{ label: 'JSON', value: 'json' }, { label: 'CSV', value: 'csv' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="测试记录"
        open={recordsOpen}
        onClose={() => setRecordsOpen(false)}
        width={1040}
        extra={
          <Space>
            <Button disabled={!records.length} icon={<DownloadOutlined />} onClick={openExportModal}>导出</Button>
            <Button danger disabled={!records.length} icon={<DeleteOutlined />} onClick={confirmClearRecords}>清空</Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="当前版本展示本页面本地测试记录"
          description="后端暂未提供测试记录查询接口，页面刷新后本地记录会清空，不会伪造历史数据。"
          style={{ marginBottom: 16 }}
        />
        <Table<TestRecord>
          rowKey="id"
          size="middle"
          dataSource={records}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无测试记录" /> }}
          columns={[
            { title: '测试时间', dataIndex: 'createdAt', width: 170, render: (value) => formatDate(value) },
            { title: '模型名称', dataIndex: 'modelName', width: 160, ellipsis: true },
            { title: '供应商', dataIndex: 'providerName', width: 130, ellipsis: true },
            { title: '测试类型', dataIndex: 'testType', width: 120 },
            { title: '参数摘要', dataIndex: 'summary', ellipsis: true },
            { title: '状态', dataIndex: 'status', width: 90, render: (value) => statusTag(value) },
            { title: '响应时间', dataIndex: 'responseTime', width: 110, render: (value) => `${value}ms` },
            { title: '成本', dataIndex: 'cost', width: 90, render: (value) => safeText(value) },
            {
              title: '操作',
              key: 'action',
              width: 110,
              render: (_value, record) => (
                <Button size="small" icon={<EyeOutlined />} onClick={() => setRecordDetail(record)}>查看详情</Button>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}
