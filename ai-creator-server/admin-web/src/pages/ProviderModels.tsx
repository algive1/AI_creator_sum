import {
  ApiOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  EyeInvisibleOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import { MODEL_TYPE_LABELS } from '../utils/adminLabels';
import { EllipsisText, TimeText } from '../utils/tableCells';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface ProviderItem {
  id: number;
  name: string;
  providerKey?: string;
  code?: string;
  providerType?: string;
  protocolType?: string;
  apiKeyConfigured?: boolean;
  apiKeyMasked?: string;
  apiBaseUrl?: string;
  createdAt?: string;
  timeout?: number;
  retry?: number;
  status?: string;
  healthStatus?: string;
  lastHealthCheck?: string;
  remark?: string;
}

interface ModelItem {
  id: number;
  providerId: number;
  providerName?: string;
  providerType?: string;
  displayName?: string;
  name: string;
  modelType: string;
  apiModelName: string;
  modelCode?: string;
  pointsCost?: number;
  apiCostCents?: number;
  status?: string;
  lastTestStatus?: string;
  lastTestAt?: string;
  lastTestMessage?: string;
  timeoutSeconds?: number;
  retryTimes?: number;
  maxConcurrency?: number;
  priority?: number;
  sortOrder?: number;
  remark?: string;
  capabilities?: string[];
  config?: Record<string, unknown> | string | null;
}

interface TierBinding {
  id?: number;
  modelId?: number;
  modelName?: string;
  providerName?: string;
  bindingType?: string;
  fallbackOrder?: number;
  isPrimary?: boolean;
  priority?: number;
  status?: string;
  realModel?: {
    id?: number;
    providerId?: number;
    name?: string;
  };
}

interface TierItem {
  id: number;
  featureKey: string;
  featureName?: string;
  tierName?: string;
  displayName?: string;
  status?: string;
  bindings?: TierBinding[];
}

interface ProviderPreset {
  key: string;
  name: string;
  providerType: string;
  apiBaseUrl: string;
  website?: string;
  remark?: string;
}

interface ModelSyncFieldChange {
  key: string;
  label: string;
  before?: unknown;
  after?: unknown;
}

interface ModelSyncAddition {
  apiModelName: string;
  name: string;
  modelType: string;
  queryTaskUrl?: string;
}

interface ModelSyncUpdate {
  modelId: number;
  apiModelName: string;
  name: string;
  fields: ModelSyncFieldChange[];
}

interface ModelSyncRemoval {
  modelId: number;
  apiModelName: string;
  name: string;
  modelType: string;
  bindingCount?: number;
  fallbackCount?: number;
  affectedTiers?: Array<{
    tierId?: number;
    tierKey?: string;
    tierName?: string;
    featureKey?: string;
    featureName?: string;
  }>;
}

interface ModelSyncPreviewData {
  totalRemote: number;
  additions: ModelSyncAddition[];
  updates: ModelSyncUpdate[];
  removals: ModelSyncRemoval[];
  skipped: Array<{ apiModelName: string; name: string }>;
  failures: Array<{ scope: string; message: string }>;
  message?: string;
}

interface ProviderTestResult {
  responseStatus?: string | number;
  responseTimeMs?: number;
  apiVersion?: string;
  errorMessage?: string;
  checkedAt?: string;
}

interface ModelTestError {
  code?: string;
  message: string;
  durationMs?: number;
}

interface ModelLogItem {
  id: string;
  createdAt?: string;
  feature?: string;
  userOrTaskId?: string;
  status?: string;
  responseTime?: number;
  cost?: string | number;
  errorMessage?: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: 'xiaoma',
    name: '小马AI',
    providerType: 'xiaoma',
    apiBaseUrl: '',
    remark: '小马AI 模型中转站',
  },
  {
    key: 'bagege',
    name: '巴格格AI',
    providerType: 'bagege',
    apiBaseUrl: '',
    remark: '巴格格AI 模型中转站',
  },
  {
    key: 'codesonline',
    name: 'CodesOnline',
    providerType: 'openai_compatible',
    apiBaseUrl: '',
    remark: 'OpenAI 兼容模型中转站',
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    providerType: 'openai_compatible',
    apiBaseUrl: 'https://api.deepseek.com',
    remark: 'DeepSeek OpenAI-compatible text provider, default model deepseek-v4-flash.',
  },
  {
    key: 'custom-relay',
    name: '自定义中转站',
    providerType: 'openai_compatible',
    apiBaseUrl: '',
    remark: '自定义 OpenAI 兼容地址',
  },
];

const PROVIDER_TYPE_OPTIONS = [
  { label: '官方厂商', value: 'openai' },
  { label: '模型中转站', value: 'openai_compatible' },
  { label: '自建代理', value: 'custom' },
];

const REQUEST_FORMAT_OPTIONS = [
  { label: 'OpenAI兼容', value: 'openai_compatible' },
  { label: '自定义', value: 'custom' },
];

const MODEL_TYPE_OPTIONS = [
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '多模态', value: 'multimodal' },
];

const STATUS_FILTER_OPTIONS = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
];

const MODEL_CAPABILITY_OPTIONS = [
  { label: '文生图', value: 'text_to_image' },
  { label: '图生图', value: 'image_to_image' },
  { label: '图片编辑', value: 'image_edit' },
  { label: '文生视频', value: 'text_to_video' },
  { label: '图生视频', value: 'image_to_video' },
  { label: '首尾帧视频', value: 'first_last_frame_video' },
  { label: '视频编辑', value: 'video_edit' },
  { label: '文本对话', value: 'text_chat' },
  { label: '提示词优化', value: 'prompt_optimize' },
  { label: '文本生成', value: 'text_generation' },
];

const FEATURE_LABELS: Record<string, string> = {
  text_to_image: '文生图',
  image_to_image: '图生图',
  image_edit: '图片编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  first_last_frame_video: '首尾帧视频',
  video_edit: '视频编辑',
  text_chat: '文本对话',
  prompt_optimize: '提示词优化',
  text_generation: '文本生成',
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
};

const MODEL_SOURCE_OPTIONS = [
  { label: '官方模型', value: 'official' },
  { label: '中转模型', value: 'relay' },
  { label: '自定义模型', value: 'custom' },
];

const MODEL_TEST_TYPE_OPTIONS = [
  { label: '文本生成', value: 'text_generation' },
  { label: '文生图', value: 'text_to_image' },
  { label: '图生图', value: 'image_to_image' },
  { label: '图片编辑', value: 'image_edit' },
  { label: '文生视频', value: 'text_to_video' },
  { label: '图生视频', value: 'image_to_video' },
  { label: '提示词优化', value: 'prompt_optimize' },
];

const MODEL_TEST_TYPE_LABELS = Object.fromEntries(MODEL_TEST_TYPE_OPTIONS.map((item) => [item.value, item.label]));

const FEATURE_KEYS = Object.keys(FEATURE_LABELS);

const cardStyle = {
  borderRadius: 8,
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
};

const normalizeStatus = (status?: string) => status === 'active' || status === 'enabled';

const providerTypeLabel = (type?: string) => {
  if (type === 'openai') return '官方厂商';
  if (type === 'custom' || type === 'self' || type === 'self_proxy') return '自建代理';
  return '模型中转站';
};

const providerCategoryFromType = (type?: string) => {
  if (type === 'openai') return 'openai';
  if (type === 'custom' || type === 'self' || type === 'self_proxy') return 'custom';
  return 'openai_compatible';
};

const isPresetRelayType = (type?: string) => type === 'xiaoma' || type === 'bagege';

const healthTag = (status?: string) => {
  if (status === 'healthy') return <Tag color="success">正常</Tag>;
  if (status === 'unhealthy') return <Tag color="error">异常</Tag>;
  return <Tag>未测试</Tag>;
};

const formatDate = (value?: string) => {
  if (!value) return '未检测';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const maskApiKey = (value?: string) => (
  <Space size={4}>
    <EyeInvisibleOutlined />
    <Text code>{value || 'sk-****'}</Text>
  </Space>
);

const isMaskedApiKeyValue = (value?: string) => !!value && /\*{3,}/.test(value);

const safeText = (value?: string | number | null, fallback = '-') => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
};

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  return search.toString();
};

const toProviderKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `provider-${Date.now()}`;

const parseConfig = (config: ModelItem['config']) => {
  if (!config) return {};
  if (typeof config === 'object') return config;
  try {
    return JSON.parse(config) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const listToText = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item)).join('\n') : '');

const textToList = (value: unknown) =>
  String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const optionalNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const isHongniaoModel = (model: ModelItem | null | undefined, config: Record<string, unknown>, provider?: ProviderItem | null) => {
  const providerType = String(provider?.providerType || model?.providerType || '').toLowerCase();
  const providerKey = String(provider?.providerKey || provider?.code || '').toLowerCase();
  const syncProviderType = String(config.sync_provider_type || '').toLowerCase();
  const apiFormat = String(config.api_format || '').toLowerCase();
  return providerType === 'hongniao' || providerKey === 'hongniao' || syncProviderType === 'hongniao' || apiFormat.startsWith('hongniao_');
};

const buildHongniaoCommonConfig = (values: Record<string, unknown>, existingConfig: Record<string, unknown>) => {
  const defaultParams = {
    ...((existingConfig.default_params && typeof existingConfig.default_params === 'object') ? existingConfig.default_params as Record<string, unknown> : {}),
  };
  if (hasValue(values.defaultAspectRatio)) defaultParams.aspectRatio = values.defaultAspectRatio;
  if (hasValue(values.defaultResolution)) defaultParams.resolution = values.defaultResolution;
  if (hasValue(values.defaultDurationSeconds)) defaultParams.seconds = values.defaultDurationSeconds;
  return {
    supported_ratios: textToList(values.supportedRatiosText),
    supported_qualities: textToList(values.supportedQualitiesText),
    supported_durations: textToList(values.supportedDurationsText),
    supported_audio_modes: textToList(values.supportedAudioModesText),
    supported_size_modes: textToList(values.supportedSizeModesText),
    input_mode: values.inputMode || undefined,
    reference_upload_mode: values.referenceUploadMode || undefined,
    max_images: optionalNumber(values.maxImages),
    min_reference_images: optionalNumber(values.minReferenceImages),
    max_reference_images: optionalNumber(values.maxReferenceImages),
    max_audio_urls: optionalNumber(values.maxAudioUrls),
    max_video_urls: optionalNumber(values.maxVideoUrls),
    default_size_key: values.defaultSizeKey || undefined,
    default_params: defaultParams,
  };
};

const normalizeCapabilityKey = (value: unknown) => {
  const key = String(value || '').trim().toLowerCase();
  return CAPABILITY_ALIASES[key] || key;
};

const normalizeCapabilities = (value: unknown) => {
  const items = Array.isArray(value) ? value : [];
  return Array.from(new Set(items.map(normalizeCapabilityKey).filter(Boolean)));
};

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';

const formatPriceSet = (points?: number | null) => {
  if (!hasValue(points)) return '-';
  const base = Number(points);
  return `${base} / ${base * 2} / ${base * 4}`;
};

const formatCostSet = (costCents?: number | null) => {
  if (!hasValue(costCents)) return '-';
  const base = Number(costCents) / 100;
  return `${base.toFixed(2)} / ${(base * 2).toFixed(2)} / ${(base * 4).toFixed(2)}`;
};

const formatCostYuan = (costCents?: number | null) => {
  if (!hasValue(costCents)) return '-';
  return `￥${(Number(costCents) / 100).toFixed(2)}`;
};

const modelTypeLabel = (value?: string) =>
  MODEL_TYPE_LABELS[value || ''] || MODEL_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '未分类';

const modelSourceFromProvider = (provider?: ProviderItem | null) => {
  if (!provider) return 'relay';
  if (provider.providerType === 'openai') return 'official';
  if (provider.providerType === 'custom') return 'custom';
  return 'relay';
};

const modelStatusTag = (record: ModelItem) => {
  if (!normalizeStatus(record.status)) return <Tag color="default">停用</Tag>;
  if (record.lastTestStatus === 'failed') return <Tag color="error">异常</Tag>;
  if (!record.lastTestStatus || record.lastTestStatus === 'untested') return <Tag color="warning">未测试</Tag>;
  return <Tag color="success">启用</Tag>;
};

const testStatusTag = (status?: string) => {
  if (status === 'passed' || status === 'success') return <Tag color="success">通过</Tag>;
  if (status === 'failed') return <Tag color="error">失败</Tag>;
  if (status === 'risk' || status === 'warning') return <Tag color="warning">需关注</Tag>;
  return <Tag>未测试</Tag>;
};

const providerConnectionStatusTag = (status: 'idle' | 'testing' | 'success' | 'failed') => {
  if (status === 'testing') return <Tag color="processing">测试中</Tag>;
  if (status === 'success') return <Tag color="success">成功</Tag>;
  if (status === 'failed') return <Tag color="error">失败</Tag>;
  return <Tag>未开始</Tag>;
};

const requestFormatLabel = (value?: string) =>
  REQUEST_FORMAT_OPTIONS.find((item) => item.value === value)?.label || 'OpenAI兼容';

const providerRequestFormatValue = (provider?: ProviderItem | null) =>
  provider?.protocolType || (provider?.providerType === 'custom' ? 'custom' : 'openai_compatible');

const redactSensitiveText = (value?: string) => {
  if (!value) return '请求失败';
  return value.replace(/(sk-|ak-|key-)[A-Za-z0-9_-]{8,}/gi, '$1****');
};

const sanitizeSensitive = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => sanitizeSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/api.?key|token|authorization|secret|password/i.test(key)) return [key, '****'];
        return [key, sanitizeSensitive(item)];
      }),
    );
  }
  if (typeof value === 'string') return redactSensitiveText(value);
  return value;
};

const collectUrls = (value: unknown): string[] => {
  const urls: string[] = [];
  const walk = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') {
      if (/^https?:\/\//i.test(item)) urls.push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return Array.from(new Set(urls));
};

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);

const getErrorCode = (error: unknown) => {
  const err = error as { code?: string; response?: { status?: number; data?: { code?: string } } };
  return err.response?.data?.code || err.response?.status || err.code || 'REQUEST_ERROR';
};

const logRequestError = (label: string, error: unknown) => {
  const err = error as { message?: string; response?: { status?: number; data?: { message?: string } } };
  console.warn(label, {
    status: err.response?.status,
    message: redactSensitiveText(err.response?.data?.message || err.message),
  });
};

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  const err = error as { message?: string; response?: { data?: { message?: string } } };
  const detail = redactSensitiveText(err.response?.data?.message || err.message);
  return detail ? `${fallback}：${detail}` : fallback;
};

const SyncPreviewContent = ({ data }: { data: ModelSyncPreviewData }) => {
  const additionColumns: ColumnsType<ModelSyncAddition> = [
    { title: '模型 ID', dataIndex: 'apiModelName', key: 'apiModelName', render: (value) => <Text code>{String(value)}</Text> },
    { title: '名称', dataIndex: 'name', key: 'name', render: (value) => safeText(value) },
    { title: '类型', dataIndex: 'modelType', key: 'modelType', width: 90, render: (value) => <Tag color="blue">{MODEL_TYPE_LABELS[String(value)] || String(value)}</Tag> },
  ];
  const updateColumns: ColumnsType<ModelSyncUpdate> = [
    {
      title: '模型',
      dataIndex: 'name',
      key: 'name',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text>{safeText(row.name)}</Text>
          <Text type="secondary" code>{row.apiModelName}</Text>
        </Space>
      ),
    },
    {
      title: '将覆盖字段',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields: ModelSyncFieldChange[]) => (
        <Space wrap>
          {fields.map((field) => (
            <Tag key={field.key} color={field.key === 'config' ? 'warning' : 'processing'}>
              {field.label || field.key}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];
  const removalColumns: ColumnsType<ModelSyncRemoval> = [
    {
      title: '模型',
      dataIndex: 'name',
      key: 'name',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text>{safeText(row.name)}</Text>
          <Text type="secondary" code>{row.apiModelName}</Text>
        </Space>
      ),
    },
    { title: '绑定', dataIndex: 'bindingCount', key: 'bindingCount', width: 80, render: (value) => Number(value || 0) },
    { title: 'Fallback', dataIndex: 'fallbackCount', key: 'fallbackCount', width: 90, render: (value) => Number(value || 0) },
    {
      title: '受影响功能页',
      dataIndex: 'affectedTiers',
      key: 'affectedTiers',
      render: (tiers: ModelSyncRemoval['affectedTiers']) => (
        <Space wrap>
          {(tiers || []).length ? tiers?.map((tier, index) => (
            <Tag key={`${tier.tierId || index}`} color="warning">
              {tier.featureName || tier.featureKey || '-'} / {tier.tierName || tier.tierKey || '-'}
            </Tag>
          )) : <Text type="secondary">无绑定</Text>}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        showIcon
        type={data.updates.length ? 'warning' : 'info'}
        message="同步预览"
        description="确认后才会写入数据库。已有模型只覆盖模型类型、轮询接口和能力参数；价格、启停状态、档位绑定和显示名不会被覆盖。"
      />
      <Space wrap>
        <Tag>远端 {data.totalRemote}</Tag>
        <Tag color="green">新增 {data.additions.length}</Tag>
        <Tag color={data.updates.length ? 'orange' : 'default'}>待覆盖 {data.updates.length}</Tag>
        <Tag color={data.removals.length ? 'red' : 'default'}>删除待处理 {data.removals.length}</Tag>
        <Tag>跳过 {data.skipped.length}</Tag>
        {data.failures.length ? <Tag color="red">部分失败 {data.failures.length}</Tag> : null}
      </Space>
      {data.failures.length ? (
        <Alert
          showIcon
          type="warning"
          message="部分模型类型拉取失败"
          description={data.failures.map((item) => `${item.scope}: ${item.message}`).join('；')}
        />
      ) : null}
      {data.additions.length ? (
        <div>
          <Text strong>新增模型</Text>
          <Table
            size="small"
            rowKey="apiModelName"
            columns={additionColumns}
            dataSource={data.additions}
            pagination={data.additions.length > 6 ? { pageSize: 6, size: 'small' } : false}
            style={{ marginTop: 8 }}
          />
        </div>
      ) : null}
      {data.updates.length ? (
        <div>
          <Text strong>需要确认覆盖的已有模型</Text>
          <Table
            size="small"
            rowKey="modelId"
            columns={updateColumns}
            dataSource={data.updates}
            pagination={data.updates.length > 6 ? { pageSize: 6, size: 'small' } : false}
            style={{ marginTop: 8 }}
          />
        </div>
      ) : null}
      {data.removals.length ? (
        <div>
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 8 }}
            message="这些模型已不在红鸟远端列表中，确认同步后会软停用并解除套餐绑定和 fallback。历史任务和模型记录会保留。"
          />
          <Table
            size="small"
            rowKey="modelId"
            columns={removalColumns}
            dataSource={data.removals}
            pagination={data.removals.length > 6 ? { pageSize: 6, size: 'small' } : false}
          />
        </div>
      ) : null}
    </Space>
  );
};

const ProviderModels = () => {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelTableRows, setModelTableRows] = useState<ModelItem[]>([]);
  const [tiers, setTiers] = useState<TierItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelTableLoading, setModelTableLoading] = useState(false);
  const [copyingProviderKeyId, setCopyingProviderKeyId] = useState<number | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [providerKeyword, setProviderKeyword] = useState('');
  const [providerTypeFilter, setProviderTypeFilter] = useState<string | undefined>();
  const [providerStatusFilter, setProviderStatusFilter] = useState<string | undefined>();
  const [providerPagination, setProviderPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [modelKeyword, setModelKeyword] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState<string | undefined>();
  const [modelStatusFilter, setModelStatusFilter] = useState<string | undefined>();
  const [modelPagination, setModelPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerApiKeyTouched, setProviderApiKeyTouched] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [testingModelId, setTestingModelId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string>('');
  const [bindingStatusUnknown, setBindingStatusUnknown] = useState(false);
  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false);
  const [detailProvider, setDetailProvider] = useState<ProviderItem | null>(null);
  const [detailModel, setDetailModel] = useState<ModelItem | null>(null);
  const [checkingProviderId, setCheckingProviderId] = useState<number | null>(null);
  const [syncingProviderId, setSyncingProviderId] = useState<number | null>(null);
  const [providerTestOpen, setProviderTestOpen] = useState(false);
  const [testingProvider, setTestingProvider] = useState<ProviderItem | null>(null);
  const [providerTestStatus, setProviderTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [providerTestResult, setProviderTestResult] = useState<ProviderTestResult | null>(null);
  const [deleteProviderOpen, setDeleteProviderOpen] = useState(false);
  const [deleteTargetProvider, setDeleteTargetProvider] = useState<ProviderItem | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [modelTestOpen, setModelTestOpen] = useState(false);
  const [testingModel, setTestingModel] = useState<ModelItem | null>(null);
  const [modelTestResult, setModelTestResult] = useState<Record<string, unknown> | null>(null);
  const [modelTestError, setModelTestError] = useState<ModelTestError | null>(null);
  const [copyModelOpen, setCopyModelOpen] = useState(false);
  const [copySourceModel, setCopySourceModel] = useState<ModelItem | null>(null);
  const [copyingModel, setCopyingModel] = useState(false);
  const [deleteModelOpen, setDeleteModelOpen] = useState(false);
  const [deleteTargetModel, setDeleteTargetModel] = useState<ModelItem | null>(null);
  const [deleteModelConfirmName, setDeleteModelConfirmName] = useState('');
  const [deletingModel, setDeletingModel] = useState(false);
  const [modelLogsOpen, setModelLogsOpen] = useState(false);
  const [logTargetModel, setLogTargetModel] = useState<ModelItem | null>(null);
  const [modelLogs] = useState<ModelLogItem[]>([]);
  const [batchTesting, setBatchTesting] = useState(false);
  const [providerBalance, setProviderBalance] = useState<{ available: boolean; balance?: number; currency?: string; message?: string } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [providerForm] = Form.useForm();
  const [modelForm] = Form.useForm();
  const [modelTestForm] = Form.useForm();
  const [copyModelForm] = Form.useForm();

  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const currentProvider = useMemo(() => {
    if (!selectedProviderId) return null;
    return providers.find((provider) => provider.id === selectedProviderId) || null;
  }, [providers, selectedProviderId]);

  const editingModelConfig = useMemo(
    () => editingModel ? parseConfig(editingModel.config) : {},
    [editingModel],
  );

  const editingIsHongniao = useMemo(
    () => isHongniaoModel(editingModel, editingModelConfig, editingModel ? providerMap.get(editingModel.providerId) : currentProvider),
    [currentProvider, editingModel, editingModelConfig, providerMap],
  );

  const currentModels = useMemo(() => {
    if (!currentProvider) return [];
    return models.filter((model) => model.providerId === currentProvider.id);
  }, [currentProvider, models]);

  const bindingLookup = useMemo(() => {
    const map = new Map<number, TierItem[]>();
    tiers.forEach((tier) => {
      (tier.bindings || []).forEach((binding) => {
        const modelId = binding.modelId || binding.realModel?.id;
        if (!modelId) return;
        const list = map.get(modelId) || [];
        list.push(tier);
        map.set(modelId, list);
      });
    });
    return map;
  }, [tiers]);

  const bindingStats = useMemo(() => {
    const currentModelIds = new Set(currentModels.map((model) => model.id));
    const stats: Record<string, number | null> = {};
    FEATURE_KEYS.forEach((featureKey) => {
      if (bindingStatusUnknown) {
        stats[featureKey] = null;
        return;
      }
      const count = tiers
        .filter((tier) => tier.featureKey === featureKey)
        .flatMap((tier) => tier.bindings || [])
        .filter((binding) => {
          const modelId = binding.modelId || binding.realModel?.id;
          return !!modelId && currentModelIds.has(modelId);
        }).length;
      stats[featureKey] = count;
    });
    return stats;
  }, [bindingStatusUnknown, currentModels, tiers]);

  const providerStats = useMemo(() => {
    const enabled = currentModels.filter((model) => normalizeStatus(model.status)).length;
    const disabled = currentModels.length - enabled;
    const abnormal = currentModels.filter((model) => model.lastTestStatus === 'failed').length;
    return { enabled, disabled, abnormal, total: currentModels.length };
  }, [currentModels]);

  const showProviderDetail = (provider: ProviderItem) => {
    setDetailProvider(provider);
    setProviderDrawerOpen(true);
  };

  const showModelDetail = (model: ModelItem) => {
    setDetailModel(model);
    setModelDrawerOpen(true);
  };

  const fetchProviders = useCallback(async () => {
    try {
      const query = buildQuery({
        paginate: 1,
        page: providerPagination.page,
        pageSize: providerPagination.pageSize,
        keyword: providerKeyword.trim(),
        providerType: providerTypeFilter,
        status: providerStatusFilter,
      });
      const res = await api.get('/models/providers?' + query);
      const payload = res.data || {};
      const list = Array.isArray(payload) ? payload : payload.list || [];
      setProviders(list);
      setProviderPagination((prev) => ({
        ...prev,
        page: payload.pagination?.page || prev.page,
        pageSize: payload.pagination?.pageSize || prev.pageSize,
        total: payload.pagination?.total ?? list.length,
      }));
    } catch (error) {
      logRequestError('获取供应商列表失败', error);
      message.error('获取供应商列表失败');
    }
  }, [providerKeyword, providerPagination.page, providerPagination.pageSize, providerStatusFilter, providerTypeFilter]);

  const fetchModels = useCallback(async () => {
    try {
      const res = await api.get('/real-models');
      setModels(res.data || []);
    } catch (error) {
      logRequestError('获取真实模型列表失败', error);
      message.error('获取真实模型列表失败');
    }
  }, []);

  const fetchModelTable = useCallback(async () => {
    if (!selectedProviderId) {
      setModelTableRows([]);
      setModelPagination((prev) => ({ ...prev, total: 0 }));
      return;
    }
    setModelTableLoading(true);
    try {
      const query = buildQuery({
        paginate: 1,
        page: modelPagination.page,
        pageSize: modelPagination.pageSize,
        providerId: selectedProviderId,
        keyword: modelKeyword.trim(),
        modelType: modelTypeFilter,
        status: modelStatusFilter,
      });
      const res = await api.get('/real-models?' + query);
      const payload = res.data || {};
      const list = Array.isArray(payload) ? payload : payload.list || [];
      setModelTableRows(list);
      setModelPagination((prev) => ({
        ...prev,
        page: payload.pagination?.page || prev.page,
        pageSize: payload.pagination?.pageSize || prev.pageSize,
        total: payload.pagination?.total ?? list.length,
      }));
    } catch (error) {
      logRequestError('获取模型资源列表失败', error);
      message.error('获取模型资源列表失败');
    } finally {
      setModelTableLoading(false);
    }
  }, [modelKeyword, modelPagination.page, modelPagination.pageSize, modelStatusFilter, modelTypeFilter, selectedProviderId]);

  const fetchTiers = useCallback(async () => {
    try {
      const res = await api.get('/model-tiers');
      setTiers(res.data || []);
      setBindingStatusUnknown(false);
    } catch (error) {
      logRequestError('获取功能绑定状态失败', error);
      setTiers([]);
      setBindingStatusUnknown(true);
      message.warning('获取功能绑定状态失败，已使用兼容展示');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([fetchProviders(), fetchModels(), fetchTiers()]);
    setLoading(false);
  }, [fetchModels, fetchProviders, fetchTiers]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const fetchBalance = useCallback(async (providerId: number) => {
    setBalanceLoading(true);
    setProviderBalance(null);
    try {
      const res: any = await api.get(`/models/providers/${providerId}/balance`);
      setProviderBalance(res.data || { available: false, message: '查询失败' });
    } catch {
      setProviderBalance({ available: false, message: '查询失败' });
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentProvider) fetchBalance(currentProvider.id);
    else setProviderBalance(null);
  }, [currentProvider, fetchBalance]);

  useEffect(() => {
    if (!providers.length) {
      setSelectedProviderId(null);
      return;
    }
    if (!selectedProviderId || !providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providers[0].id);
      setModelPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    fetchModelTable();
  }, [fetchModelTable]);

  useEffect(() => {
    if (!detailProvider) return;
    const updatedProvider = providers.find((provider) => provider.id === detailProvider.id);
    if (updatedProvider && updatedProvider !== detailProvider) {
      setDetailProvider(updatedProvider);
    }
  }, [providers, detailProvider]);

  useEffect(() => {
    if (!detailModel) return;
    const updatedModel = models.find((model) => model.id === detailModel.id);
    if (updatedModel && updatedModel !== detailModel) {
      setDetailModel(updatedModel);
    }
  }, [models, detailModel]);

  const openAddProvider = (preset?: ProviderPreset) => {
    setEditingProvider(null);
    setProviderApiKeyTouched(false);
    providerForm.resetFields();
    providerForm.setFieldsValue({
      providerKey: preset?.key || '',
      name: preset?.name || '',
      providerType: providerCategoryFromType(preset?.providerType),
      actualProviderType: preset?.providerType || 'openai_compatible',
      website: preset?.website || '',
      apiBaseUrl: preset?.apiBaseUrl || '',
      apiKey: '',
      requestFormat: preset?.providerType === 'custom' ? 'custom' : 'openai_compatible',
      balanceUrl: '',
      plannedBudget: undefined,
      remark: preset?.remark || '',
      status: true,
      timeout: 120,
      retry: 3,
    });
    setProviderModalOpen(true);
  };

  const openEditProvider = (provider: ProviderItem) => {
    setEditingProvider(provider);
    setProviderApiKeyTouched(false);
    setProviderDrawerOpen(false);
    providerForm.resetFields();
    providerForm.setFieldsValue({
      providerKey: provider.providerKey || provider.code || '',
      name: provider.name,
      providerType: providerCategoryFromType(provider.providerType),
      actualProviderType: provider.providerType || 'openai_compatible',
      website: '',
      apiBaseUrl: provider.apiBaseUrl,
      apiKey: provider.apiKeyMasked || (provider.apiKeyConfigured ? 'sk-****' : ''),
      requestFormat: providerRequestFormatValue(provider),
      balanceUrl: '',
      plannedBudget: undefined,
      remark: provider.remark,
      status: normalizeStatus(provider.status),
      timeout: provider.timeout,
      retry: provider.retry,
    });
    setProviderModalOpen(true);
  };

  const saveProvider = async () => {
    if (savingProvider) return;
    try {
      const values = await providerForm.validateFields();
      setSavingProvider(true);
      const finalProviderType = isPresetRelayType(values.actualProviderType) && values.providerType === 'openai_compatible'
        ? values.actualProviderType
        : values.providerType;
      const baseBody: Record<string, unknown> = {
        name: values.name,
        providerType: finalProviderType,
        apiBaseUrl: values.apiBaseUrl,
        timeout: values.timeout,
        retry: values.retry,
        remark: values.remark,
      };
      const nextApiKey = typeof values.apiKey === 'string' ? values.apiKey.trim() : values.apiKey;
      if (editingProvider) {
        if (providerApiKeyTouched && nextApiKey && !isMaskedApiKeyValue(nextApiKey)) baseBody.apiKey = nextApiKey;
      } else if (nextApiKey) {
        baseBody.apiKey = nextApiKey;
      }
      if (editingProvider) {
        baseBody.status = values.status ? 'active' : 'inactive';
        await api.put(`/models/providers/${editingProvider.id}`, baseBody);
        message.success('供应商已保存');
      } else {
        const created: any = await api.post('/models/providers', {
          ...baseBody,
          providerKey: values.providerKey || toProviderKey(values.name),
          code: values.providerKey || toProviderKey(values.name),
          apiKey: nextApiKey,
        });
        const createdId = created?.data?.id;
        if (createdId && !values.status) {
          await api.put(`/models/providers/${createdId}`, { status: 'inactive' });
        }
        if (createdId) setSelectedProviderId(createdId);
        message.success('供应商已添加');
      }
      setProviderModalOpen(false);
      void refreshAll();
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      logRequestError('保存供应商失败', error);
      message.error('保存供应商失败，请检查必填项和接口返回');
    } finally {
      setSavingProvider(false);
    }
  };

  const toggleProvider = async (provider: ProviderItem) => {
    try {
      await api.put(`/models/providers/${provider.id}`, {
        status: normalizeStatus(provider.status) ? 'inactive' : 'active',
      });
      message.success('供应商状态已更新');
      void refreshAll();
    } catch (error) {
      logRequestError('更新供应商状态失败', error);
      message.error('更新供应商状态失败');
    }
  };

  const deleteProvider = async (provider: ProviderItem) => {
    if (deletingProvider) return;
    const currentIndex = providers.findIndex((item) => item.id === provider.id);
    const remainingProviders = providers.filter((item) => item.id !== provider.id);
    const nextProvider = remainingProviders[currentIndex] || remainingProviders[currentIndex - 1] || remainingProviders[0] || null;
    setDeletingProvider(true);
    try {
      await api.delete(`/models/providers/${provider.id}`);
      message.success('供应商已删除');
      setProviderDrawerOpen(false);
      setDetailProvider(null);
      setDeleteProviderOpen(false);
      setDeleteTargetProvider(null);
      setDeleteConfirmName('');
      setSelectedProviderId(nextProvider?.id || null);
      void refreshAll();
    } catch (error) {
      logRequestError('删除供应商失败', error);
      message.error(getRequestErrorMessage(error, '删除供应商失败，请确认是否仍有关联模型'));
    } finally {
      setDeletingProvider(false);
    }
  };

  const openProviderConnectionTest = (provider: ProviderItem) => {
    setTestingProvider(provider);
    setProviderTestStatus('idle');
    setProviderTestResult(null);
    setProviderTestOpen(true);
  };

  const runProviderConnectionTest = async (provider: ProviderItem | null = testingProvider) => {
    if (!provider || checkingProviderId === provider.id) return;
    const startedAt = Date.now();
    if (checkingProviderId === provider.id) return;
    setCheckingProviderId(provider.id);
    setProviderTestStatus('testing');
    setProviderTestResult(null);
    try {
      const res: any = await api.post(`/models/providers/${provider.id}/health-check`);
      const data = res?.data || res || {};
      const healthy = data.healthy !== false && data.status !== 'unhealthy' && data.status !== 'failed';
      setProviderTestStatus(healthy ? 'success' : 'failed');
      setProviderTestResult({
        responseStatus: data.status || (healthy ? 'healthy' : 'unhealthy'),
        responseTimeMs: Date.now() - startedAt,
        apiVersion: data.apiVersion || data.version || data.modelVersion || '-',
        errorMessage: healthy ? undefined : data.message || '供应商健康检查未通过',
        checkedAt: data.checkedAt,
      });
      if (healthy) {
        message.success('连接测试完成');
      } else {
        message.error(data.message || '连接测试失败，请检查 Base URL 和 API Key');
      }
      void fetchProviders();
    } catch (error) {
      logRequestError('测试连接失败', error);
      setProviderTestStatus('failed');
      setProviderTestResult({
        responseStatus: (error as { response?: { status?: number } }).response?.status || '请求失败',
        responseTimeMs: Date.now() - startedAt,
        apiVersion: '-',
        errorMessage: getRequestErrorMessage(error, '测试连接失败，请检查 Base URL 和 API Key'),
      });
      message.error('测试连接失败，请检查 Base URL 和 API Key');
    } finally {
      setCheckingProviderId(null);
    }
  };

  const openProviderModelSync = async (provider: ProviderItem) => {
    if (syncingProviderId === provider.id) return;
    setSyncingProviderId(provider.id);
    try {
      const res: any = await api.post(`/models/providers/${provider.id}/sync`, { mode: 'preview' });
      const payload = res?.data || {};
      const preview: ModelSyncPreviewData = {
        totalRemote: Number(payload.totalRemote || 0),
        additions: Array.isArray(payload.additions) ? payload.additions : [],
        updates: Array.isArray(payload.updates) ? payload.updates : [],
        removals: Array.isArray(payload.removals) ? payload.removals : [],
        skipped: Array.isArray(payload.skipped) ? payload.skipped : [],
        failures: Array.isArray(payload.failures) ? payload.failures : [],
        message: payload.message,
      };
      if (!preview.additions.length && !preview.updates.length && !preview.removals.length) {
        message.info(preview.message || '同步预览完成，没有需要写入的变动');
        return;
      }
      Modal.confirm({
        title: `同步模型：${provider.name}`,
        width: 920,
        icon: <SyncOutlined />,
        content: <SyncPreviewContent data={preview} />,
        okText: preview.removals.length ? '确认同步并软停用' : preview.updates.length ? '确认覆盖并同步' : '确认同步新增模型',
        cancelText: '取消',
        onOk: async () => {
          setSyncingProviderId(provider.id);
          try {
            const applyRes: any = await api.post(`/models/providers/${provider.id}/sync`, { mode: 'apply' });
            message.success(applyRes?.data?.message || '同步已完成');
            await Promise.allSettled([refreshAll(), fetchModelTable()]);
          } catch (error) {
            logRequestError('同步模型失败', error);
            message.error(getRequestErrorMessage(error, '同步模型失败'));
            throw error;
          } finally {
            setSyncingProviderId(null);
          }
        },
      });
    } catch (error) {
      logRequestError('获取模型同步预览失败', error);
      message.error(getRequestErrorMessage(error, '获取模型同步预览失败'));
    } finally {
      setSyncingProviderId(null);
    }
  };

  const openAddModel = () => {
    if (!currentProvider) {
      message.warning('请先选择或添加供应商');
      return;
    }
    setEditingModel(null);
    modelForm.resetFields();
    modelForm.setFieldsValue({
      providerId: currentProvider.id,
      providerName: currentProvider.name,
      name: '',
      apiModelName: '',
      modelType: 'image',
      modelSource: modelSourceFromProvider(currentProvider),
      description: '',
      capabilities: [],
      price1k: 10,
      price2k: 20,
      price4k: 40,
      cost1k: 0,
      cost2k: 0,
      cost4k: 0,
      isPrimary: false,
      fallbackPriority: undefined,
      timeoutSeconds: 120,
      retryTimes: 3,
      maxConcurrency: 5,
      maxPollingMinutes: undefined,
      supportedRatiosText: '',
      supportedQualitiesText: '',
      supportedDurationsText: '',
      supportedAudioModesText: '',
      supportedSizeModesText: '',
      inputMode: '',
      referenceUploadMode: '',
      maxImages: undefined,
      minReferenceImages: undefined,
      maxReferenceImages: undefined,
      maxAudioUrls: undefined,
      maxVideoUrls: undefined,
      defaultAspectRatio: '',
      defaultResolution: '',
      defaultDurationSeconds: '',
      defaultSizeKey: '',
      status: true,
      remark: '',
    });
    setModelModalOpen(true);
  };

  const openEditModel = (model: ModelItem) => {
    const config = parseConfig(model.config);
    const cost = Number(model.apiCostCents || 0) / 100;
    const price = Number(model.pointsCost || 0);
    setEditingModel(model);
    setModelDrawerOpen(false);
    modelForm.resetFields();
    modelForm.setFieldsValue({
      providerId: model.providerId,
      providerName: providerMap.get(model.providerId)?.name || model.providerName || '',
      name: model.name,
      apiModelName: model.apiModelName,
      modelType: model.modelType,
      modelSource: model.providerType === 'openai' ? 'official' : model.providerType === 'custom' ? 'custom' : 'relay',
      description: model.displayName && model.displayName !== model.name ? model.displayName : '',
      capabilities: normalizeCapabilities((config.capabilities as string[]) || model.capabilities || []),
      price1k: price,
      price2k: price * 2,
      price4k: price * 4,
      cost1k: cost,
      cost2k: cost * 2,
      cost4k: cost * 4,
      isPrimary: !!config.is_primary,
      fallbackPriority: config.fallback_priority,
      timeoutSeconds: model.timeoutSeconds,
      retryTimes: model.retryTimes,
      maxConcurrency: model.maxConcurrency,
      maxPollingMinutes: config.max_polling_minutes,
      supportedRatiosText: listToText(config.supported_ratios),
      supportedQualitiesText: listToText(config.supported_qualities),
      supportedDurationsText: listToText(config.supported_durations),
      supportedAudioModesText: listToText(config.supported_audio_modes),
      supportedSizeModesText: listToText(config.supported_size_modes),
      inputMode: config.input_mode,
      referenceUploadMode: config.reference_upload_mode,
      maxImages: config.max_images,
      minReferenceImages: config.min_reference_images,
      maxReferenceImages: config.max_reference_images,
      maxAudioUrls: config.max_audio_urls,
      maxVideoUrls: config.max_video_urls,
      defaultAspectRatio: (config.default_params as Record<string, unknown> | undefined)?.aspectRatio,
      defaultResolution: (config.default_params as Record<string, unknown> | undefined)?.resolution,
      defaultDurationSeconds: (config.default_params as Record<string, unknown> | undefined)?.seconds,
      defaultSizeKey: config.default_size_key,
      status: normalizeStatus(model.status),
      remark: model.remark,
    });
    setModelModalOpen(true);
  };

  const saveModel = async () => {
    if (savingModel) return;
    try {
      const values = await modelForm.validateFields();
      setSavingModel(true);
      const body = {
        providerId: values.providerId,
        name: values.name,
        apiModelName: values.apiModelName,
        modelType: values.modelType,
        pointsCost: values.price1k,
        apiCostCents: Math.round(Number(values.cost1k || 0) * 100),
        status: values.status ? 'active' : 'inactive',
        timeoutSeconds: values.timeoutSeconds,
        retryTimes: values.retryTimes,
        maxConcurrency: values.maxConcurrency,
        remark: values.remark,
      };
      const existingConfig = editingModel ? parseConfig(editingModel.config) : {};
      const configBody: Record<string, unknown> = {
        capabilities: normalizeCapabilities(values.capabilities || []),
        model_source: values.modelSource,
        description: values.description,
        is_primary: !!values.isPrimary,
        fallback_priority: values.fallbackPriority,
        max_polling_minutes: values.maxPollingMinutes,
      };
      if (editingIsHongniao) {
        Object.assign(configBody, buildHongniaoCommonConfig(values, existingConfig));
      }
      if (editingModel) {
        await api.put(`/real-models/${editingModel.id}`, { ...body, config: configBody });
        message.success('模型已保存');
      } else {
        const created: any = await api.post('/real-models', body);
        const createdId = created?.data?.id;
        if (createdId) {
          await api.put(`/real-models/${createdId}`, { config: configBody });
        }
        if ((values.isPrimary || values.fallbackPriority !== undefined) && createdId) {
          message.info('模型已保存；功能页绑定请到“功能页配置”中完成。');
        }
        message.success('模型已添加');
      }
      setModelModalOpen(false);
      void Promise.allSettled([fetchModels(), fetchModelTable(), fetchTiers()]);
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      logRequestError('保存模型失败', error);
      message.error(getRequestErrorMessage(error, '保存模型失败，请检查必填项和接口返回'));
    } finally {
      setSavingModel(false);
    }
  };

  const toggleModel = async (model: ModelItem) => {
    try {
      await api.put(`/real-models/${model.id}`, {
        status: normalizeStatus(model.status) ? 'inactive' : 'active',
      });
      message.success('模型状态已更新');
      void Promise.allSettled([fetchModels(), fetchModelTable()]);
    } catch (error) {
      logRequestError('更新模型状态失败', error);
      message.error(getRequestErrorMessage(error, '更新模型状态失败'));
    }
  };

  const deleteModel = async (model: ModelItem) => {
    if (deletingModel) return;
    setDeletingModel(true);
    try {
      await api.delete(`/real-models/${model.id}`);
      message.success('模型已删除');
      setModelDrawerOpen(false);
      setDetailModel(null);
      setDeleteModelOpen(false);
      setDeleteTargetModel(null);
      setDeleteModelConfirmName('');
      void Promise.allSettled([fetchModels(), fetchModelTable(), fetchTiers()]);
    } catch (error) {
      logRequestError('删除模型失败', error);
      message.error(getRequestErrorMessage(error, '删除模型失败'));
    } finally {
      setDeletingModel(false);
    }
  };

  const buildModelTestPayload = (values: Record<string, unknown>) => {
    const testType = String(values.testType || '').trim();
    const images = [
      values.referenceImageUrl,
      values.firstFrameUrl,
    ].map((item) => String(item || '').trim()).filter(Boolean);
    const payload: Record<string, unknown> = {
      prompt: String(values.prompt || '').trim(),
      taskType: testType,
    };
    if (testType === 'image_to_image' || testType === 'image_edit') {
      if (images.length) payload.images = images.slice(0, 1);
      payload.nativeSize = values.resolution || '1024x1024';
      payload.quality = values.quality || 'standard';
    } else if (testType === 'image_to_video') {
      if (images.length) payload.images = images.slice(0, 1);
      payload.ratio = values.resolution || '16:9';
      payload.duration = '5s';
      payload.quality = values.quality || 'standard';
    } else if (testType === 'text_to_video') {
      payload.ratio = values.resolution || '16:9';
      payload.duration = '5s';
      payload.quality = values.quality || 'standard';
    } else {
      payload.nativeSize = values.resolution || '1024x1024';
      payload.quality = values.quality || 'standard';
    }
    return payload;
  };

  const runModelTest = async (model: ModelItem, values?: Record<string, unknown>) => {
    setTestingModelId(model.id);
    setModelTestResult(null);
    setModelTestError(null);
    const startedAt = Date.now();
    try {
      const payload = values ? buildModelTestPayload(values) : {};
      const res = await api.post(`/real-models/${model.id}/test`, { ...payload, confirmRealCost: true });
      const data = res.data || res || {};
      setModelTestResult({
        ...data,
        durationMs: (data as Record<string, unknown>).durationMs || Date.now() - startedAt,
      });
      setTestResult(JSON.stringify(sanitizeSensitive(data), null, 2));
      message.success('模型测试完成');
      void Promise.allSettled([fetchModels(), fetchModelTable()]);
    } catch (error: any) {
      logRequestError('模型测试失败', error);
      setModelTestError({
        code: String(getErrorCode(error)),
        message: getRequestErrorMessage(error, '模型测试失败'),
        durationMs: Date.now() - startedAt,
      });
      setTestResult(getRequestErrorMessage(error, '模型测试失败'));
      message.error('模型测试失败，请查看返回信息');
    } finally {
      setTestingModelId(null);
    }
  };

  const confirmModelTest = (model: ModelItem) => {
    setTestingModel(model);
    setModelTestResult(null);
    setModelTestError(null);
    modelTestForm.resetFields();
    modelTestForm.setFieldsValue({
      testType: model.modelType === 'video' ? 'text_to_video' : model.modelType === 'text' ? 'text_generation' : 'text_to_image',
      resolution: model.modelType === 'video' ? '16:9' : '1024x1024',
      quality: '1K',
      prompt: '',
      negativePrompt: '',
      referenceImageUrl: '',
      maskImageUrl: '',
      firstFrameUrl: '',
    });
    setModelTestOpen(true);
  };

  const confirmProviderHealthCheck = (provider: ProviderItem) => {
    openProviderConnectionTest(provider);
  };

  const confirmToggleProvider = (provider: ProviderItem) => {
    const enabled = normalizeStatus(provider.status);
    Modal.confirm({
      title: enabled ? '确认停用供应商？' : '确认启用供应商？',
      content: enabled
        ? '停用后，该供应商下的模型将不可用于新任务，请确认是否继续。'
        : '启用后，该供应商下已启用的模型可继续参与调用。',
      okText: enabled ? '确认停用' : '确认启用',
      okButtonProps: enabled ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: () => toggleProvider(provider),
    });
  };

  const confirmDeleteProvider = (provider: ProviderItem) => {
    setDeleteTargetProvider(provider);
    setDeleteConfirmName('');
    setDeleteProviderOpen(true);
  };

  const confirmToggleModel = (model: ModelItem) => {
    const enabled = normalizeStatus(model.status);
    const boundTiers = bindingLookup.get(model.id) || [];
    Modal.confirm({
      title: enabled ? '确认停用模型？' : '确认启用模型？',
      width: 560,
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>
            {enabled
              ? '停用后该模型不会参与新任务调用，已绑定功能页可能出现不可用风险。'
              : '启用后该模型可重新参与调用。'}
          </Text>
          {enabled && boundTiers.length ? (
            <Alert
              type="warning"
              showIcon
              message="该模型仍被功能页绑定"
              description={boundTiers.map((tier) => tier.displayName || tier.tierName || tier.featureName || tier.featureKey).join(' / ')}
            />
          ) : null}
        </Space>
      ),
      okText: enabled ? '确认停用' : '确认启用',
      okButtonProps: enabled ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: () => toggleModel(model),
    });
  };

  const confirmDeleteModel = (model: ModelItem) => {
    setDeleteTargetModel(model);
    setDeleteModelConfirmName('');
    setDeleteModelOpen(true);
  };

  const openCopyModel = (model: ModelItem) => {
    setCopySourceModel(model);
    copyModelForm.resetFields();
    copyModelForm.setFieldsValue({
      name: `${model.name} - 副本`,
      apiModelName: '',
      copyCapabilities: true,
      copyPricing: true,
      copyAdvanced: true,
      status: false,
    });
    setCopyModelOpen(true);
  };

  const saveCopyModel = async () => {
    if (!copySourceModel || copyingModel) return;
    try {
      const values = await copyModelForm.validateFields();
      if (values.apiModelName === copySourceModel.apiModelName) {
        message.error('新模型标识不能与原模型相同');
        return;
      }
      setCopyingModel(true);
      const config = parseConfig(copySourceModel.config);
      const body: Record<string, unknown> = {
        providerId: copySourceModel.providerId,
        name: values.name,
        apiModelName: values.apiModelName,
        modelType: copySourceModel.modelType,
        status: values.status ? 'active' : 'inactive',
        remark: copySourceModel.remark,
      };
      let configBody: Record<string, unknown> = {};
      if (values.copyPricing) {
        body.pointsCost = copySourceModel.pointsCost;
        body.apiCostCents = copySourceModel.apiCostCents;
      }
      if (values.copyAdvanced) {
        body.timeoutSeconds = copySourceModel.timeoutSeconds;
        body.retryTimes = copySourceModel.retryTimes;
        body.maxConcurrency = copySourceModel.maxConcurrency;
        configBody = {
          ...configBody,
          max_polling_minutes: config.max_polling_minutes,
          is_primary: config.is_primary,
          fallback_priority: config.fallback_priority,
        };
      }
      if (values.copyCapabilities) {
        configBody = {
          ...configBody,
          capabilities: normalizeCapabilities(config.capabilities || copySourceModel.capabilities || []),
          model_source: config.model_source,
          description: config.description,
        };
      }
      const created: any = await api.post('/real-models', body);
      const createdId = created?.data?.id;
      if (createdId && Object.keys(configBody).length) {
        await api.put(`/real-models/${createdId}`, { config: configBody });
      }
      message.success('模型已复制');
      setCopyModelOpen(false);
      setCopySourceModel(null);
      void Promise.allSettled([fetchModels(), fetchModelTable(), fetchTiers()]);
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      logRequestError('复制模型失败', error);
      message.error(getRequestErrorMessage(error, '复制模型失败'));
    } finally {
      setCopyingModel(false);
    }
  };

  const openModelLogs = (model: ModelItem) => {
    setLogTargetModel(model);
    setModelLogsOpen(true);
  };

  const runBatchTest = async () => {
    if (batchTesting) return;
    const enabledModels = currentModels.filter((model) => normalizeStatus(model.status));
    if (!enabledModels.length) {
      message.warning('当前供应商下没有启用中的模型');
      return;
    }
    setBatchTesting(true);
    setTestResult('');
    const results: string[] = [];
    try {
      for (const model of enabledModels) {
        setTestingModelId(model.id);
        try {
          const res: any = await api.post(`/real-models/${model.id}/test`);
          const data = res.data || res || {};
          results.push(`【${model.name}】测试完成：${data.message || data.status || '已返回'}`);
        } catch (error: any) {
          const errMessage = error?.response?.data?.message || error?.message || '模型测试失败';
          results.push(`【${model.name}】测试失败：${errMessage}`);
        }
      }
      setTestResult(results.join('\n'));
      message.success('批量测试已完成');
      void Promise.allSettled([fetchModels(), fetchModelTable()]);
    } finally {
      setTestingModelId(null);
      setBatchTesting(false);
    }
  };

  const confirmBatchTest = () => {
    const enabledModels = currentModels.filter((model) => normalizeStatus(model.status));
    Modal.confirm({
      title: '确认批量测试模型？',
      icon: <ExperimentOutlined style={{ color: '#1677ff' }} />,
      width: 560,
      content: (
        <Space direction="vertical" size={12}>
          <Alert type="warning" showIcon message="将逐个调用当前供应商下启用中的真实模型，可能产生额度消耗。" />
          <Text>供应商：{safeText(currentProvider?.name)}</Text>
          <Text>启用中模型：{enabledModels.length} 个</Text>
        </Space>
      ),
      okText: '开始批量测试',
      cancelText: '取消',
      onOk: runBatchTest,
    });
  };

  const copyProviderApiKey = async (provider: ProviderItem) => {
    if (copyingProviderKeyId) return;
    setCopyingProviderKeyId(provider.id);
    try {
      const res: any = await api.post(`/models/providers/${provider.id}/api-key/copy`);
      const value = String(res.data?.value || '');
      if (!value) {
        message.warning('当前供应商未配置 API Key');
        return;
      }
      await copyTextToClipboard(value);
      message.success('API Key 已复制');
    } catch (error) {
      message.error(getRequestErrorMessage(error, '复制 API Key 失败'));
    } finally {
      setCopyingProviderKeyId(null);
    }
  };

  const copyModelId = async (model: ModelItem) => {
    try {
      await copyTextToClipboard(model.apiModelName || '');
      message.success('模型标识已复制');
    } catch {
      message.info('当前浏览器不支持自动复制');
    }
  };

  const startModelTestFromDialog = async () => {
    if (!testingModel || testingModelId === testingModel.id) return;
    try {
      const values = await modelTestForm.validateFields();
      await runModelTest(testingModel, values);
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
    }
  };

  const clearModelTestDialog = () => {
    modelTestForm.resetFields();
    modelTestForm.setFieldsValue({
      testType: testingModel?.modelType === 'video' ? 'text_to_video' : testingModel?.modelType === 'text' ? 'text_generation' : 'text_to_image',
      resolution: testingModel?.modelType === 'video' ? '16:9' : '1024x1024',
      quality: '1K',
      prompt: '',
      negativePrompt: '',
      referenceImageUrl: '',
      maskImageUrl: '',
      firstFrameUrl: '',
    });
    setModelTestResult(null);
    setModelTestError(null);
  };

  const modelColumns: ColumnsType<ModelItem> = [
    {
      title: '模型资源',
      key: 'provider',
      width: 150,
      render: (_, record) => safeText(providerMap.get(record.providerId)?.name || record.providerName),
    },
    {
      title: '模型名称',
      dataIndex: 'name',
      width: 180,
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={safeText(value)}>
          <Text strong>{safeText(value)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '类型',
      dataIndex: 'modelType',
      width: 90,
      render: (value: string) => <Tag color="blue">{modelTypeLabel(value)}</Tag>,
    },
    {
      title: '模型标识',
      dataIndex: 'apiModelName',
      width: 190,
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={safeText(value)}>
          <Text code>{safeText(value)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '售价',
      dataIndex: 'pointsCost',
      width: 130,
      render: (value: number) => (
        <Space direction="vertical" size={0}>
          <Text>{formatPriceSet(value)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1K/2K/4K 积分
          </Text>
        </Space>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'apiCostCents',
      width: 150,
      render: (value: number) => (
        <Space direction="vertical" size={0}>
          <Text>{formatCostSet(value)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1K/2K/4K 成本
          </Text>
        </Space>
      ),
    },
    {
      title: '绑定功能',
      key: 'feature',
      width: 160,
      render: (_, record) => {
        const boundTiers = bindingLookup.get(record.id) || [];
        const labels = Array.from(new Set(boundTiers.map((tier) => FEATURE_LABELS[tier.featureKey] || tier.featureKey)));
        if (!labels.length) return <Text type="secondary">待绑定</Text>;
        return labels.slice(0, 2).map((label) => <Tag key={label}>{label}</Tag>);
      },
    },
    {
      title: '绑定档位',
      key: 'tier',
      width: 130,
      render: (_, record) => {
        const boundTiers = bindingLookup.get(record.id) || [];
        const labels = boundTiers.map((tier) => tier.displayName || tier.tierName).filter(Boolean);
        if (!labels.length) return <Text type="secondary">待绑定</Text>;
        return labels.slice(0, 2).map((label) => <Tag key={label}>{label}</Tag>);
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => modelStatusTag(record),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 160,
      render: (_, record) => (
        <Space size={8}>
          <Button size="small" type="link" onClick={() => openEditModel(record)}>
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            loading={testingModelId === record.id}
            onClick={() => confirmModelTest(record)}
          >
            测试
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'copyId', label: '复制模型标识', icon: <CopyOutlined /> },
                { key: 'copy', label: '复制模型', icon: <CopyOutlined /> },
                {
                  key: 'toggle',
                  label: normalizeStatus(record.status) ? '停用' : '启用',
                  icon: <SyncOutlined />,
                },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
                { key: 'logs', label: '查看日志（未接入）', icon: <ApiOutlined />, disabled: true },
                { key: 'detail', label: '查看详情', icon: <MoreOutlined /> },
              ],
              onClick: ({ key }) => {
                if (key === 'copyId') copyModelId(record);
                if (key === 'copy') openCopyModel(record);
                if (key === 'toggle') {
                  confirmToggleModel(record);
                }
                  if (key === 'detail') showModelDetail(record);
                if (key === 'delete') {
                  confirmDeleteModel(record);
                }
              },
            }}
          >
            <Button size="small" icon={<MoreOutlined />}>更多</Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="provider-models-page">
      <style>{`
        .provider-models-page {
          background: #f5f7fb;
          margin: -24px;
          padding: 24px;
          min-height: calc(100vh - 64px);
        }
        .provider-models-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }
        .provider-models-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 16px;
          align-items: start;
        }
        .provider-pill-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .provider-models-page .ant-btn-primary {
          background: #1677ff;
          border-color: #1677ff;
          box-shadow: 0 4px 12px rgba(22, 119, 255, 0.22);
        }
        .provider-models-page .ant-btn-primary:not(:disabled):hover {
          background: #4096ff;
          border-color: #4096ff;
        }
        .provider-models-page .ant-switch.ant-switch-checked {
          background: #1677ff;
        }
        .provider-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }
        .right-stack {
          position: sticky;
          top: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .provider-stat-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .provider-stat-tile {
          min-height: 72px;
          padding: 12px;
          border: 1px solid #eef1f6;
          border-radius: 8px;
          background: #f8fafc;
        }
        .model-test-result-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .model-test-video-grid {
          display: grid;
          gap: 12px;
        }
        .danger-confirm-name {
          color: #cf1322;
          font-weight: 600;
        }
        @media (max-width: 1180px) {
          .provider-models-shell {
            grid-template-columns: 1fr;
          }
          .right-stack {
            position: static;
          }
        }
      `}</style>

      <div className="provider-models-header">
        <Space direction="vertical" size={4}>
          <Text type="secondary">AI模型管理 / 供应商与模型</Text>
          <Title level={3} style={{ margin: 0 }}>
            供应商与模型
          </Title>
          <Text type="secondary">管理接入的供应商和真实模型资源</Text>
        </Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={async () => {
            await refreshAll();
            await fetchModelTable();
          }}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      <div className="provider-models-shell">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            title="已有供应商"
            style={cardStyle}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddProvider()}>
                添加供应商
              </Button>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Input.Search
                allowClear
                placeholder="搜索名称、标识、Base URL"
                value={providerKeyword}
                onChange={(event) => {
                  setProviderKeyword(event.target.value);
                  setProviderPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 260 }}
              />
              <Select
                allowClear
                placeholder="供应商类型"
                value={providerTypeFilter}
                options={PROVIDER_TYPE_OPTIONS}
                onChange={(value) => {
                  setProviderTypeFilter(value);
                  setProviderPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 150 }}
              />
              <Select
                allowClear
                placeholder="状态"
                value={providerStatusFilter}
                options={STATUS_FILTER_OPTIONS}
                onChange={(value) => {
                  setProviderStatusFilter(value);
                  setProviderPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 120 }}
              />
            </Space>
            {providers.length ? (
              <div className="provider-pill-list">
                {providers.map((provider) => (
                  <Button
                    key={provider.id}
                    type={provider.id === selectedProviderId ? 'primary' : 'default'}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setModelPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    {provider.name}
                  </Button>
                ))}
              </div>
            ) : (
              <Empty description="暂无供应商">
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddProvider()}>
                  添加供应商
                </Button>
              </Empty>
            )}
            <Pagination
              size="small"
              current={providerPagination.page}
              pageSize={providerPagination.pageSize}
              total={providerPagination.total}
              showSizeChanger
              showTotal={(total) => `共 ${total} 个供应商`}
              onChange={(page, pageSize) => setProviderPagination((prev) => ({ ...prev, page, pageSize }))}
              style={{ marginTop: 12, textAlign: 'right' }}
            />
          </Card>

          <Card
            title="供应商详情"
            style={cardStyle}
            extra={
              currentProvider ? (
                <div className="provider-detail-actions">
                  <Button icon={<EditOutlined />} onClick={() => openEditProvider(currentProvider)}>
                    编辑供应商
                  </Button>
                  <Button
                    icon={<ExperimentOutlined />}
                    loading={checkingProviderId === currentProvider.id}
                    onClick={() => confirmProviderHealthCheck(currentProvider)}
                  >
                    测试连接
                  </Button>
                  <Button
                    icon={<SyncOutlined />}
                    loading={!!currentProvider && syncingProviderId === currentProvider.id}
                    onClick={() => currentProvider && openProviderModelSync(currentProvider)}
                  >
                    同步模型
                  </Button>
                  <Button
                    danger={normalizeStatus(currentProvider.status)}
                    onClick={() => confirmToggleProvider(currentProvider)}
                  >
                    {normalizeStatus(currentProvider.status) ? '停用供应商' : '启用供应商'}
                  </Button>
                  <Button icon={<MoreOutlined />} onClick={() => showProviderDetail(currentProvider)}>
                    更多
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmDeleteProvider(currentProvider)}
                  >
                    删除供应商
                  </Button>
                </div>
              ) : null
            }
          >
            {currentProvider ? (
              <Descriptions column={{ xs: 1, sm: 2, xl: 3 }} bordered size="small">
                <Descriptions.Item label="供应商名称">{safeText(currentProvider.name)}</Descriptions.Item>
                <Descriptions.Item label="供应商类型">
                  <Tag color="blue">{providerTypeLabel(currentProvider.providerType)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="官网地址">
                  <Text type="secondary">未配置</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Base URL">
                  <Tooltip title={safeText(currentProvider.apiBaseUrl)}>
                    <Text code ellipsis style={{ maxWidth: 260 }}>
                      {safeText(currentProvider.apiBaseUrl)}
                    </Text>
                  </Tooltip>
                </Descriptions.Item>
                <Descriptions.Item label="API Key">
                  <Space wrap>
                    {maskApiKey(currentProvider.apiKeyMasked || (currentProvider.apiKeyConfigured ? undefined : '未配置'))}
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      disabled={!currentProvider.apiKeyConfigured}
                      loading={copyingProviderKeyId === currentProvider.id}
                      onClick={() => copyProviderApiKey(currentProvider)}
                    >
                      复制
                    </Button>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
	                  <Switch
	                    checked={normalizeStatus(currentProvider.status)}
	                    checkedChildren="启用"
	                    unCheckedChildren="停用"
	                    onChange={() => confirmToggleProvider(currentProvider)}
	                  />
                </Descriptions.Item>
                <Descriptions.Item label="健康状态">{healthTag(currentProvider.healthStatus)}</Descriptions.Item>
                <Descriptions.Item label="累计消费">
                  <Text type="secondary">暂无数据</Text>
                </Descriptions.Item>
                <Descriptions.Item label="计划预算">
                  <Text type="secondary">未设置</Text>
                </Descriptions.Item>
                <Descriptions.Item label="余额">
                  {balanceLoading ? <Spin size="small" /> :
                   providerBalance?.available ? <Text strong style={{ color: providerBalance.balance! > 0 ? '#16a34a' : '#ef4444' }}>{providerBalance.currency} {providerBalance.balance?.toFixed(4)}</Text> :
                   <Text type="secondary">{providerBalance?.message || '不支持'}</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="最后检测时间">
                  {formatDate(currentProvider.lastHealthCheck)}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Empty description="请选择或添加供应商" />
            )}
          </Card>

          <Card
            title={`模型资源列表${currentProvider ? `（${currentProvider.name}）` : ''}`}
            style={cardStyle}
            extra={
              <Space wrap>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddModel}>
                  添加模型
                </Button>
                <Button
                  icon={<ExperimentOutlined />}
                  loading={batchTesting}
                  disabled={!currentModels.some((model) => normalizeStatus(model.status))}
                  onClick={confirmBatchTest}
                >
                  批量测试
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={async () => {
                    await fetchModels();
                    await fetchModelTable();
                  }}
                >
                  刷新
                </Button>
              </Space>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Input.Search
                allowClear
                placeholder="搜索模型名称或标识"
                value={modelKeyword}
                onChange={(event) => {
                  setModelKeyword(event.target.value);
                  setModelPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 260 }}
              />
              <Select
                allowClear
                placeholder="模型类型"
                value={modelTypeFilter}
                options={MODEL_TYPE_OPTIONS}
                onChange={(value) => {
                  setModelTypeFilter(value);
                  setModelPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 130 }}
              />
              <Select
                allowClear
                placeholder="状态"
                value={modelStatusFilter}
                options={STATUS_FILTER_OPTIONS}
                onChange={(value) => {
                  setModelStatusFilter(value);
                  setModelPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{ width: 120 }}
              />
            </Space>
            <Table
              rowKey="id"
              loading={loading || modelTableLoading}
              columns={modelColumns}
              dataSource={modelTableRows}
              scroll={{ x: 1360 }}
              pagination={{
                current: modelPagination.page,
                pageSize: modelPagination.pageSize,
                total: modelPagination.total,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) => setModelPagination((prev) => ({ ...prev, page, pageSize })),
              }}
              locale={{ emptyText: <Empty description="当前供应商下暂无模型" /> }}
            />
            {testResult ? (
              <Alert
                style={{ marginTop: 16 }}
                type="info"
                showIcon
                message="最近一次模型测试返回"
                description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{testResult}</pre>}
              />
            ) : null}
          </Card>
        </Space>

        <aside className="right-stack">
          <Card title="快捷操作" style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {PROVIDER_PRESETS.map((preset) => (
                <Button key={preset.key} block icon={<PlusOutlined />} onClick={() => openAddProvider(preset)}>
                  {preset.name}
                </Button>
              ))}
            </Space>
          </Card>

          <Card title="快捷绑定状态" style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {FEATURE_KEYS.map((featureKey) => {
                const count = bindingStats[featureKey];
                return (
                  <div
                    key={featureKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/ai-models/features?feature=${encodeURIComponent(featureKey)}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        navigate(`/ai-models/features?feature=${encodeURIComponent(featureKey)}`);
                      }
                    }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <Text>{FEATURE_LABELS[featureKey]}</Text>
                    {count === null ? <Tag>待检查</Tag> : <Tag color={count > 0 ? 'success' : 'default'}>已绑定 {count} 个模型</Tag>}
                  </div>
                );
              })}
            </Space>
          </Card>

          <Card title="检测入口" style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                block
                type="primary"
                icon={<ExperimentOutlined />}
                disabled={!currentProvider}
                onClick={() => currentProvider && confirmProviderHealthCheck(currentProvider)}
                loading={!!currentProvider && checkingProviderId === currentProvider.id}
              >
                检测当前供应商
              </Button>
              <Button block loading={batchTesting} disabled={!currentModels.some((model) => normalizeStatus(model.status))} onClick={confirmBatchTest}>
                检测全部启用模型
              </Button>
              <Button block onClick={() => currentProvider && showProviderDetail(currentProvider)} disabled={!currentProvider}>
                查看检测记录
              </Button>
            </Space>
          </Card>

          <Card title="当前供应商概览" style={cardStyle}>
            <div className="provider-stat-grid">
              <div className="provider-stat-tile">
                <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
                  {providerStats.total}
                </Title>
                <Text type="secondary">模型总数</Text>
              </div>
              <div className="provider-stat-tile">
                <Title level={4} style={{ margin: 0, color: '#16a34a' }}>
                  {providerStats.enabled}
                </Title>
                <Text type="secondary">启用中</Text>
              </div>
              <div className="provider-stat-tile">
                <Title level={4} style={{ margin: 0 }}>
                  {providerStats.disabled}
                </Title>
                <Text type="secondary">已停用</Text>
              </div>
              <div className="provider-stat-tile">
                <Title level={4} style={{ margin: 0, color: '#ef4444' }}>
                  {providerStats.abnormal}
                </Title>
                <Text type="secondary">异常</Text>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        title={editingProvider ? '编辑供应商' : '添加供应商'}
        open={providerModalOpen}
        width={720}
        onCancel={() => setProviderModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Button
              icon={<ExperimentOutlined />}
              loading={!!editingProvider && checkingProviderId === editingProvider.id}
              onClick={() => {
                if (!editingProvider) {
                  message.warning('请先保存供应商后再测试连接');
                  return;
                }
                confirmProviderHealthCheck(editingProvider);
              }}
            >
              测试连接
            </Button>
            <Space>
              <Button onClick={() => setProviderModalOpen(false)} disabled={savingProvider}>
                取消
              </Button>
              <Button type="primary" onClick={saveProvider} loading={savingProvider}>
                保存
              </Button>
            </Space>
          </div>
        }
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item name="providerKey" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="actualProviderType" hidden>
            <Input />
          </Form.Item>
          <Divider orientation="left" plain>
            基础信息
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
                <Input placeholder="例如：巴格格AI" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="providerType" label="供应商类型" rules={[{ required: true, message: '请选择供应商类型' }]}>
                <Select options={PROVIDER_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label="官网地址">
                <Input placeholder="https://example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="remark" label="备注">
                <Input placeholder="请输入备注" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>
            接口配置
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="requestFormat" label="请求格式">
                <Select options={REQUEST_FORMAT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="apiBaseUrl" label="Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
                <Input placeholder="https://api.example.com/v1" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="apiKey"
                label="API Key"
                rules={editingProvider ? [] : [{ required: true, message: '请输入 API Key' }]}
                extra={
                  editingProvider ? (
                    <Space wrap>
                      <Text type="secondary">当前 API Key：</Text>
                      {maskApiKey(editingProvider.apiKeyMasked)}
                      <Text type="secondary">留空则不修改已保存密钥。</Text>
                    </Space>
                  ) : (
                    '保存后默认脱敏展示'
                  )
                }
              >
                <Input.Password
                  placeholder={editingProvider ? '重新输入后更新 API Key' : '请输入 API Key'}
                  onFocus={() => {
                    if (editingProvider && !providerApiKeyTouched && isMaskedApiKeyValue(providerForm.getFieldValue('apiKey'))) {
                      providerForm.setFieldValue('apiKey', '');
                    }
                    if (editingProvider) setProviderApiKeyTouched(true);
                  }}
                  onChange={() => {
                    if (editingProvider) setProviderApiKeyTouched(true);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="balanceUrl" label="余额查询地址">
                <Input placeholder="当前版本仅兼容展示" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>
            财务配置
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="plannedBudget" label="计划预算">
                <InputNumber min={0} addonAfter="元" style={{ width: '100%' }} placeholder="当前后端未保存该字段" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="余额">
                <InputNumber disabled style={{ width: '100%' }} placeholder="当前后端未提供余额字段" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="累计消费">
                <InputNumber disabled style={{ width: '100%' }} placeholder="当前后端未提供累计消费字段" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>
            状态设置
          </Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="timeout" label="超时时间（秒）">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="retry" label="最大重试次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="是否启用" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="测试连接"
        open={providerTestOpen}
        width={640}
        onCancel={() => setProviderTestOpen(false)}
        footer={[
          <Button key="close" onClick={() => setProviderTestOpen(false)}>
            关闭
          </Button>,
          <Button
            key="start"
            type="primary"
            icon={<ExperimentOutlined />}
            loading={providerTestStatus === 'testing'}
            disabled={!testingProvider}
            onClick={() => runProviderConnectionTest()}
          >
            开始测试
          </Button>,
        ]}
      >
        {testingProvider ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="info" showIcon message="将使用已保存的供应商配置调用现有健康检查接口。" />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="供应商名称">{safeText(testingProvider.name)}</Descriptions.Item>
              <Descriptions.Item label="Base URL">
                <Text code>{safeText(testingProvider.apiBaseUrl)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="API Key">{maskApiKey(testingProvider.apiKeyMasked || (testingProvider.apiKeyConfigured ? undefined : '未配置'))}</Descriptions.Item>
              <Descriptions.Item label="请求格式">{requestFormatLabel(providerRequestFormatValue(testingProvider))}</Descriptions.Item>
              <Descriptions.Item label="测试状态">{providerConnectionStatusTag(providerTestStatus)}</Descriptions.Item>
              <Descriptions.Item label="响应状态">{safeText(providerTestResult?.responseStatus, '未开始')}</Descriptions.Item>
              <Descriptions.Item label="响应时间">
                {providerTestResult?.responseTimeMs !== undefined ? `${providerTestResult.responseTimeMs} ms` : '未开始'}
              </Descriptions.Item>
              <Descriptions.Item label="接口版本">{safeText(providerTestResult?.apiVersion, '-')}</Descriptions.Item>
              <Descriptions.Item label="错误信息">{safeText(providerTestResult?.errorMessage, '-')}</Descriptions.Item>
            </Descriptions>
            {providerTestStatus === 'success' ? (
              <Alert type="success" showIcon message="供应商连接测试成功" />
            ) : null}
            {providerTestStatus === 'failed' ? (
              <Alert
                type="error"
                showIcon
                message="供应商连接测试失败"
                description="请检查 Base URL 是否可访问、API Key 是否有效、供应商账号额度是否充足，以及服务器网络是否能访问该地址。"
              />
            ) : null}
          </Space>
        ) : (
          <Empty description="暂无供应商信息" />
        )}
      </Modal>

      <Modal
        title="删除供应商"
        open={deleteProviderOpen}
        width={560}
        onCancel={() => {
          if (deletingProvider) return;
          setDeleteProviderOpen(false);
          setDeleteTargetProvider(null);
          setDeleteConfirmName('');
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDeleteProviderOpen(false);
              setDeleteTargetProvider(null);
              setDeleteConfirmName('');
            }}
            disabled={deletingProvider}
          >
            取消
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deletingProvider}
            disabled={!deleteTargetProvider || deleteConfirmName !== deleteTargetProvider.name}
            onClick={() => deleteTargetProvider && deleteProvider(deleteTargetProvider)}
          >
            删除
          </Button>,
        ]}
      >
        {deleteTargetProvider ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message="删除供应商会同时软删除其下所有真实模型，并清除这些模型的功能页绑定和兜底规则。"
              description="删除后小程序不会再展示绑定到这些模型的档位；如某个功能页只绑定了该供应商模型，用户将无法通过该档位提交任务。"
            />
            {models.filter((model) => model.providerId === deleteTargetProvider.id).length ? (
              <Alert
                type="warning"
                showIcon
                message="当前供应商下仍有关联模型。"
                description={`将同步软删除 ${models.filter((model) => model.providerId === deleteTargetProvider.id).length} 个模型，并解绑对应功能页档位。`}
              />
            ) : null}
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="供应商名称">{deleteTargetProvider.name}</Descriptions.Item>
              <Descriptions.Item label="Base URL">{safeText(deleteTargetProvider.apiBaseUrl)}</Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label={`请输入供应商名称“${deleteTargetProvider.name}”确认删除`}>
                <Input
                  value={deleteConfirmName}
                  onChange={(event) => setDeleteConfirmName(event.target.value)}
                  placeholder="输入完整供应商名称"
                />
              </Form.Item>
            </Form>
          </Space>
        ) : (
          <Empty description="暂无供应商信息" />
        )}
      </Modal>

      <Drawer
        title={editingModel ? '编辑模型' : '添加模型'}
        open={modelModalOpen}
        width={860}
        onClose={() => setModelModalOpen(false)}
        extra={
          <Space>
            <Button
              icon={<ExperimentOutlined />}
              loading={!!editingModel && testingModelId === editingModel.id}
              onClick={() => {
                if (!editingModel) {
                  message.warning('请先保存模型后再测试');
                  return;
                }
                confirmModelTest(editingModel);
              }}
            >
              测试模型
            </Button>
            <Button onClick={() => setModelModalOpen(false)} disabled={savingModel}>
              取消
            </Button>
            <Button type="primary" onClick={saveModel} loading={savingModel}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={modelForm} layout="vertical">
          <Form.Item name="providerName" hidden>
            <Input />
          </Form.Item>
          <Divider orientation="left" plain>
            基础信息
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="providerId" label="当前供应商" rules={[{ required: true, message: '请选择供应商' }]}>
                <Select disabled options={providers.map((provider) => ({ label: provider.name, value: provider.id }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="modelType" label="模型类型" rules={[{ required: true, message: '请选择模型类型' }]}>
                <Select options={MODEL_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
                <Input placeholder="例如：Nano Banana" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="apiModelName"
                label="模型标识 model id"
                rules={[{ required: true, message: '请输入模型标识' }]}
                extra={editingModel ? '修改模型标识可能影响真实调用。' : undefined}
              >
                <Input placeholder="真实传给接口的 model id" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="modelSource" label="模型来源">
                <Select options={MODEL_SOURCE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="模型描述">
                <TextArea rows={2} placeholder="当前字段保存到兼容配置，不影响后端调用" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>
            能力与定价
          </Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="capabilities" label="模型能力">
                <Select mode="multiple" options={MODEL_CAPABILITY_OPTIONS} placeholder="不强制绑定前台档位" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="price1k" label="1K 售价积分">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="price2k" label="2K 售价积分">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="price4k" label="4K 售价积分">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost1k" label="1K 成本价">
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost2k" label="2K 成本价">
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost4k" label="4K 成本价">
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="当前后端仅保存 1K 售价和 1K 成本价；2K/4K 字段仅用于前端配置参考，不会提交。"
          />

          {editingIsHongniao ? (
            <>
              <Divider orientation="left" plain>
                红鸟能力
              </Divider>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="这里只编辑常用能力字段，完整上游参数保留在模型详情中只读查看。"
              />
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="supportedRatiosText" label="支持比例">
                    <TextArea rows={3} placeholder={'16:9\n9:16\n1:1'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="supportedQualitiesText" label="支持清晰度">
                    <TextArea rows={3} placeholder={'720p\n1K\n2K'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="supportedDurationsText" label="支持时长">
                    <TextArea rows={3} placeholder={'5s\n10s\n15s'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="supportedAudioModesText" label="音频模式">
                    <TextArea rows={3} placeholder={'silent\naudio'} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="supportedSizeModesText" label="尺寸模式">
                    <Input placeholder="ratio, auto" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="inputMode" label="输入模式">
                    <Input placeholder="text / first_frame / reference_images / source_video" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="referenceUploadMode" label="参考上传模式">
                    <Input placeholder="none / first_frame / reference_images / source_video" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="defaultSizeKey" label="默认尺寸 key">
                    <Input placeholder="auto 或 size option key" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="maxImages" label="最大图片数">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="minReferenceImages" label="最少参考图">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="maxReferenceImages" label="最多参考图">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="maxAudioUrls" label="最大音频数">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="maxVideoUrls" label="最大视频数">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="defaultDurationSeconds" label="默认时长">
                    <Input placeholder="10" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="defaultAspectRatio" label="默认比例">
                    <Input placeholder="16:9" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="defaultResolution" label="默认清晰度">
                    <Input placeholder="720p / 1K / 2K" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          ) : null}

          <Divider orientation="left" plain>
            高级配置
          </Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="isPrimary" label="是否主模型" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fallbackPriority" label="备用优先级">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="是否启用" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="timeoutSeconds" label="超时时间">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="retryTimes" label="最大重试次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maxConcurrency" label="并发限制">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maxPollingMinutes" label="最长轮询时间（分钟）">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Modal
        title={`测试模型${testingModel ? ` - ${testingModel.name}` : ''}`}
        open={modelTestOpen}
        width={900}
        onCancel={() => setModelTestOpen(false)}
        footer={[
          <Button key="clear" onClick={clearModelTestDialog}>
            清空
          </Button>,
          <Button key="cancel" onClick={() => setModelTestOpen(false)}>
            取消
          </Button>,
          <Button
            key="start"
            type="primary"
            icon={<ExperimentOutlined />}
            loading={!!testingModel && testingModelId === testingModel.id}
            disabled={!testingModel}
            onClick={startModelTestFromDialog}
          >
            开始测试
          </Button>,
        ]}
      >
        {testingModel ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="本操作会调用真实供应商接口，可能产生额度消耗。" />
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="当前供应商">{safeText(providerMap.get(testingModel.providerId)?.name || testingModel.providerName)}</Descriptions.Item>
              <Descriptions.Item label="当前模型">{safeText(testingModel.name)}</Descriptions.Item>
              <Descriptions.Item label="模型标识">
                <Text code>{safeText(testingModel.apiModelName)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="模型类型">{modelTypeLabel(testingModel.modelType)}</Descriptions.Item>
            </Descriptions>
            <Form form={modelTestForm} layout="vertical">
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="testType" label="测试类型">
                    <Select options={MODEL_TEST_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="resolution" label="分辨率 / 比例">
                    <Select options={['1024x1024', '1024x1536', '1536x1024', '1:1', '16:9', '9:16'].map((value) => ({ label: value, value }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="quality" label="质量">
                    <Select options={['1K', '2K', '4K'].map((value) => ({ label: value, value }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
                <TextArea rows={4} showCount maxLength={1000} />
              </Form.Item>
              <Form.Item name="negativePrompt" label="负面提示词">
                <TextArea rows={2} showCount maxLength={500} placeholder="可选，当前后端测试接口暂不提交该字段" />
              </Form.Item>
              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const type = getFieldValue('testType');
                  return (
                    <>
                      {(type === 'image_to_image' || type === 'image_edit') ? (
                        <Row gutter={16}>
                          <Col xs={24} md={12}>
                            <Form.Item name="referenceImageUrl" label="参考图 URL" rules={[{ required: true, message: '请输入参考图 URL' }]}>
                              <Input placeholder="https://example.com/reference.png" />
                            </Form.Item>
                            <Upload beforeUpload={() => false} maxCount={1}>
                              <Button>参考图上传</Button>
                            </Upload>
                          </Col>
                          {type === 'image_edit' ? (
                            <Col xs={24} md={12}>
                              <Form.Item name="maskImageUrl" label="mask URL">
                                <Input placeholder="当前测试接口暂不区分 mask 字段" />
                              </Form.Item>
                              <Upload beforeUpload={() => false} maxCount={1}>
                                <Button>mask 上传</Button>
                              </Upload>
                            </Col>
                          ) : null}
                        </Row>
                      ) : null}
                      {type === 'image_to_video' ? (
                        <Row gutter={16}>
                          <Col xs={24} md={12}>
                            <Form.Item name="firstFrameUrl" label="首帧图 URL" rules={[{ required: true, message: '请输入首帧图 URL' }]}>
                              <Input placeholder="https://example.com/first-frame.png" />
                            </Form.Item>
                            <Upload beforeUpload={() => false} maxCount={1}>
                              <Button>首帧图上传</Button>
                            </Upload>
                          </Col>
                        </Row>
                      ) : null}
                    </>
                  );
                }}
              </Form.Item>
              <Collapse
                ghost
                items={[{
                  key: 'advanced',
                  label: '高级参数',
                  children: (
                    <Row gutter={16}>
                      <Col xs={24} md={8}><Form.Item name="seed" label="随机种子"><Input placeholder="留空随机" /></Form.Item></Col>
                      <Col xs={24} md={8}><Form.Item name="steps" label="采样步数"><InputNumber min={1} max={100} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col xs={24} md={8}><Form.Item name="cfgScale" label="CFG Scale"><InputNumber min={1} max={30} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                  ),
                }]}
              />
            </Form>
            {testingModelId === testingModel.id ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Spin />
                <div style={{ marginTop: 12, color: '#64748b' }}>模型测试中，请稍候。</div>
              </div>
            ) : null}
            {modelTestError ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert type="error" showIcon message="模型测试失败" description={modelTestError.message} />
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="错误码">{safeText(modelTestError.code)}</Descriptions.Item>
                  <Descriptions.Item label="错误信息">{modelTestError.message}</Descriptions.Item>
                  <Descriptions.Item label="响应时间">{modelTestError.durationMs ? `${modelTestError.durationMs} ms` : '-'}</Descriptions.Item>
                </Descriptions>
                <Alert
                  type="warning"
                  showIcon
                  message="排查建议"
                  description="请检查供应商 Base URL、API Key、模型标识、余额、模型能力是否支持当前测试类型，以及服务器网络和超时时间。"
                />
              </Space>
            ) : null}
            {modelTestResult ? (() => {
              const urls = collectUrls(modelTestResult.urls || modelTestResult.result || modelTestResult);
              const imageUrls = urls.filter((url) => !isVideoUrl(url));
              const videoUrls = urls.filter(isVideoUrl);
              return (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="状态">
                      <Tag color={modelTestResult.status === 'passed' || modelTestResult.mappedStatus === 'completed' ? 'success' : 'warning'}>
                        {safeText(modelTestResult.status as string || modelTestResult.mappedStatus as string)}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="响应时间">{modelTestResult.durationMs ? `${modelTestResult.durationMs} ms` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="task_id">{safeText(modelTestResult.providerTaskId as string || modelTestResult.task_id as string)}</Descriptions.Item>
                    <Descriptions.Item label="request_id">{safeText(modelTestResult.requestId as string || modelTestResult.request_id as string)}</Descriptions.Item>
                    <Descriptions.Item label="成本">{safeText(modelTestResult.cost as string | number, formatCostYuan(testingModel.apiCostCents))}</Descriptions.Item>
                    <Descriptions.Item label="测试类型">{MODEL_TEST_TYPE_LABELS[String(modelTestResult.taskType || '')] || safeText(modelTestResult.taskType as string)}</Descriptions.Item>
                  </Descriptions>
                  {imageUrls.length ? (
                    <div className="model-test-result-grid">
                      {imageUrls.map((url) => (
                        <Card key={url} size="small" styles={{ body: { padding: 8 } }}>
                          <Image src={url} alt="测试结果" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6 }} />
                        </Card>
                      ))}
                    </div>
                  ) : null}
                  {videoUrls.length ? (
                    <div className="model-test-video-grid">
                      {videoUrls.map((url) => (
                        <Card key={url} size="small" styles={{ body: { padding: 8 } }}>
                          <video src={url} controls style={{ width: '100%', maxHeight: 360, borderRadius: 6, background: '#000' }} />
                        </Card>
                      ))}
                    </div>
                  ) : null}
                  {!urls.length ? (
                    <Card size="small" style={{ background: '#f8fafc' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {safeText(modelTestResult.message as string || JSON.stringify(sanitizeSensitive(modelTestResult), null, 2))}
                      </pre>
                    </Card>
                  ) : null}
                  <Collapse
                    items={[{
                      key: 'raw',
                      label: '原始响应',
                      children: (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                          {JSON.stringify(sanitizeSensitive(modelTestResult), null, 2)}
                        </pre>
                      ),
                    }]}
                  />
                </Space>
              );
            })() : null}
          </Space>
        ) : (
          <Empty description="暂无模型信息" />
        )}
      </Modal>

      <Modal
        title="复制模型"
        open={copyModelOpen}
        width={560}
        onCancel={() => setCopyModelOpen(false)}
        onOk={saveCopyModel}
        confirmLoading={copyingModel}
        okText="保存"
        cancelText="取消"
      >
        {copySourceModel ? (
          <Form form={copyModelForm} layout="vertical">
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`复制来源：${copySourceModel.name}`} />
            <Form.Item name="name" label="新模型名称" rules={[{ required: true, message: '请输入新模型名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="apiModelName"
              label="新模型标识"
              rules={[
                { required: true, message: '请输入新模型标识' },
                {
                  validator: (_, value) => {
                    if (value && value === copySourceModel.apiModelName) return Promise.reject(new Error('新模型标识不能与原模型相同'));
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <Input placeholder="必须填写新的 model id" />
            </Form.Item>
            <Form.Item name="copyCapabilities" valuePropName="checked">
              <Checkbox>复制能力配置</Checkbox>
            </Form.Item>
            <Form.Item name="copyPricing" valuePropName="checked">
              <Checkbox>复制价格配置</Checkbox>
            </Form.Item>
            <Form.Item name="copyAdvanced" valuePropName="checked">
              <Checkbox>复制高级配置</Checkbox>
            </Form.Item>
            <Form.Item name="status" label="是否立即启用" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Form>
        ) : (
          <Empty description="暂无模型信息" />
        )}
      </Modal>

      <Modal
        title="删除模型"
        open={deleteModelOpen}
        width={560}
        onCancel={() => {
          if (deletingModel) return;
          setDeleteModelOpen(false);
          setDeleteTargetModel(null);
          setDeleteModelConfirmName('');
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDeleteModelOpen(false);
              setDeleteTargetModel(null);
              setDeleteModelConfirmName('');
            }}
            disabled={deletingModel}
          >
            取消
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deletingModel}
            disabled={!deleteTargetModel || deleteModelConfirmName !== deleteTargetModel.name}
            onClick={() => deleteTargetModel && deleteModel(deleteTargetModel)}
          >
            删除
          </Button>,
        ]}
      >
        {deleteTargetModel ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message="删除模型会软删除该真实模型，并清除它的功能页绑定和兜底规则。"
              description="如果功能页档位没有其他可用模型，小程序对应档位会不可用或无法提交任务。"
            />
            {(bindingLookup.get(deleteTargetModel.id) || []).length ? (
              <Alert
                type="warning"
                showIcon
                message="该模型已被功能页绑定，请先解除绑定或确认风险。"
                description={(bindingLookup.get(deleteTargetModel.id) || []).map((tier) => tier.displayName || tier.tierName || tier.featureKey).join(' / ')}
              />
            ) : null}
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="模型名称">{deleteTargetModel.name}</Descriptions.Item>
              <Descriptions.Item label="模型标识">
                <Text code>{safeText(deleteTargetModel.apiModelName)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="供应商">{safeText(providerMap.get(deleteTargetModel.providerId)?.name || deleteTargetModel.providerName)}</Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label={<>请输入模型名称 <span className="danger-confirm-name">{deleteTargetModel.name}</span> 确认删除</>}>
                <Input
                  value={deleteModelConfirmName}
                  onChange={(event) => setDeleteModelConfirmName(event.target.value)}
                  placeholder="输入完整模型名称"
                />
              </Form.Item>
            </Form>
          </Space>
        ) : (
          <Empty description="暂无模型信息" />
        )}
      </Modal>

      <Drawer
        title={`模型调用日志${logTargetModel ? ` - ${logTargetModel.name}` : ''}`}
        open={modelLogsOpen}
        onClose={() => setModelLogsOpen(false)}
        width={860}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="当前版本暂未接入模型调用日志接口。"
          description="后端存在调用日志数据表，但当前后台前端没有可复用的模型日志查询接口，因此这里不新增接口、不伪造数据。"
        />
        <Table<ModelLogItem>
          rowKey="id"
          dataSource={modelLogs}
          locale={{ emptyText: <Empty description="当前版本暂未接入模型调用日志接口" /> }}
          columns={[
            { title: '时间', dataIndex: 'createdAt', width: 170, render: (value) => <TimeText value={value} /> },
            { title: '调用功能', dataIndex: 'feature', width: 130, render: (value) => <EllipsisText value={value} maxWidth={108} /> },
            { title: '用户或任务 ID', dataIndex: 'userOrTaskId', width: 140, render: (value) => <EllipsisText value={value} maxWidth={118} /> },
            { title: '请求状态', dataIndex: 'status', width: 100, render: (value) => <Tag>{safeText(value)}</Tag> },
            { title: '响应时间', dataIndex: 'responseTime', width: 110, render: (value) => (value ? `${value} ms` : '-') },
            { title: '成本', dataIndex: 'cost', width: 100, render: (value) => safeText(value) },
            { title: '错误信息', dataIndex: 'errorMessage', width: 260, render: (value) => <EllipsisText value={value} maxWidth={238} /> },
            { title: '查看详情', key: 'detail', render: () => <Button size="small" disabled>查看详情</Button> },
          ]}
          tableLayout="fixed"
          scroll={{ x: 1180 }}
        />
      </Drawer>

      <Drawer
        title="供应商更多信息"
        open={providerDrawerOpen}
        onClose={() => setProviderDrawerOpen(false)}
        width={520}
        extra={detailProvider ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => openEditProvider(detailProvider)}>编辑</Button>
            <Button
              icon={<ExperimentOutlined />}
              loading={checkingProviderId === detailProvider.id}
              onClick={() => confirmProviderHealthCheck(detailProvider)}
            >
              测试连接
            </Button>
          </Space>
        ) : null}
      >
        {detailProvider ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="API Key 默认脱敏展示"
              description="如需更新 API Key，请在编辑供应商弹窗中重新填写；留空不会覆盖已保存密钥。"
            />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="供应商名称">{safeText(detailProvider.name)}</Descriptions.Item>
              <Descriptions.Item label="供应商标识">{safeText(detailProvider.providerKey || detailProvider.code)}</Descriptions.Item>
              <Descriptions.Item label="供应商类型">
                <Tag color="blue">{providerTypeLabel(detailProvider.providerType)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Base URL">
                <Text code copyable>{safeText(detailProvider.apiBaseUrl)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="API Key">
                <Space wrap>
                  {maskApiKey(detailProvider.apiKeyMasked || (detailProvider.apiKeyConfigured ? undefined : '未配置'))}
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    disabled={!detailProvider.apiKeyConfigured}
                    loading={copyingProviderKeyId === detailProvider.id}
                    onClick={() => copyProviderApiKey(detailProvider)}
                  >
                    复制
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={normalizeStatus(detailProvider.status) ? 'success' : 'default'}>
                  {normalizeStatus(detailProvider.status) ? '启用' : '停用'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="健康状态">{healthTag(detailProvider.healthStatus)}</Descriptions.Item>
              <Descriptions.Item label="最后检测时间">{formatDate(detailProvider.lastHealthCheck)}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{safeText(detailProvider.timeout)} 秒</Descriptions.Item>
              <Descriptions.Item label="重试次数">{safeText(detailProvider.retry)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(detailProvider.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="备注">{safeText(detailProvider.remark)}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block danger={normalizeStatus(detailProvider.status)} onClick={() => confirmToggleProvider(detailProvider)}>
                {normalizeStatus(detailProvider.status) ? '停用供应商' : '启用供应商'}
              </Button>
              <Button block danger icon={<DeleteOutlined />} onClick={() => confirmDeleteProvider(detailProvider)}>
                删除供应商
              </Button>
            </Space>
          </Space>
        ) : (
          <Empty description="暂无供应商信息" />
        )}
      </Drawer>

      <Drawer
        title="模型更多信息"
        open={modelDrawerOpen}
        onClose={() => setModelDrawerOpen(false)}
        width={560}
        extra={detailModel ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => openEditModel(detailModel)}>编辑</Button>
            <Button
              icon={<ExperimentOutlined />}
              loading={testingModelId === detailModel.id}
              onClick={() => confirmModelTest(detailModel)}
            >
              测试
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'copy', label: '复制模型', icon: <CopyOutlined /> },
                  { key: 'logs', label: '查看日志（未接入）', icon: <ApiOutlined />, disabled: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'copy') openCopyModel(detailModel);
                },
              }}
            >
              <Button icon={<MoreOutlined />}>更多</Button>
            </Dropdown>
          </Space>
        ) : null}
      >
        {detailModel ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="所属供应商">{safeText(providerMap.get(detailModel.providerId)?.name || detailModel.providerName)}</Descriptions.Item>
              <Descriptions.Item label="模型名称">{safeText(detailModel.name)}</Descriptions.Item>
              <Descriptions.Item label="模型标识">
                <Text code copyable>{safeText(detailModel.apiModelName)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="模型类型">
                <Tag color="blue">{modelTypeLabel(detailModel.modelType)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{modelStatusTag(detailModel)}</Descriptions.Item>
              <Descriptions.Item label="最近测试状态">{testStatusTag(detailModel.lastTestStatus)}</Descriptions.Item>
              <Descriptions.Item label="测试信息">{safeText(detailModel.lastTestMessage)}</Descriptions.Item>
              <Descriptions.Item label="售价积分">{formatPriceSet(detailModel.pointsCost)}</Descriptions.Item>
              <Descriptions.Item label="成本价">{formatCostSet(detailModel.apiCostCents)}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{safeText(detailModel.timeoutSeconds)} 秒</Descriptions.Item>
              <Descriptions.Item label="重试次数">{safeText(detailModel.retryTimes)}</Descriptions.Item>
              <Descriptions.Item label="并发限制">{safeText(detailModel.maxConcurrency)}</Descriptions.Item>
              <Descriptions.Item label="备注">{safeText(detailModel.remark)}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="功能页绑定" style={{ borderRadius: 8 }}>
              {(bindingLookup.get(detailModel.id) || []).length ? (
                <Space wrap>
                  {(bindingLookup.get(detailModel.id) || []).map((tier) => (
                    <Tag key={tier.id} color="blue">
                      {FEATURE_LABELS[tier.featureKey] || tier.featureName || tier.featureKey} / {tier.displayName || tier.tierName || `入口#${tier.id}`}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">暂未绑定功能页入口</Text>
              )}
            </Card>
            {(() => {
              const config = parseConfig(detailModel.config);
              const remoteParameters = config.remote_parameters;
              const shouldShow = isHongniaoModel(detailModel, config, providerMap.get(detailModel.providerId))
                || (Array.isArray(remoteParameters) && remoteParameters.length > 0);
              if (!shouldShow) return null;
              return (
                <Card size="small" title="红鸟原始参数" style={{ borderRadius: 8 }}>
                  <Descriptions bordered size="small" column={1} style={{ marginBottom: 12 }}>
                    <Descriptions.Item label="计费方式">{JSON.stringify(config.billing || {})}</Descriptions.Item>
                    <Descriptions.Item label="远端状态">{safeText(config.remote_status as string)}</Descriptions.Item>
                    <Descriptions.Item label="远端删除标记">{safeText(config.upstream_removed_at as string)}</Descriptions.Item>
                  </Descriptions>
                  <Collapse
                    items={[{
                      key: 'remote_parameters',
                      label: '查看原始参数',
                      children: (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                          {JSON.stringify(sanitizeSensitive(remoteParameters || []), null, 2)}
                        </pre>
                      ),
                    }]}
                  />
                </Card>
              );
            })()}
            <Divider />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block danger={normalizeStatus(detailModel.status)} onClick={() => confirmToggleModel(detailModel)}>
                {normalizeStatus(detailModel.status) ? '停用模型' : '启用模型'}
              </Button>
              <Button block icon={<ApiOutlined />} disabled title="当前版本暂未接入模型调用日志查询接口">
                查看日志（未接入）
              </Button>
              <Button block icon={<CopyOutlined />} onClick={() => openCopyModel(detailModel)}>
                复制模型
              </Button>
              <Button block danger icon={<DeleteOutlined />} onClick={() => confirmDeleteModel(detailModel)}>
                删除模型
              </Button>
            </Space>
          </Space>
        ) : (
          <Empty description="暂无模型信息" />
        )}
      </Drawer>
    </div>
  );
};

export default ProviderModels;
