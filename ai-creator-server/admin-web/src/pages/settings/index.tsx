import { useEffect, useState } from 'react';
import { Tabs, Table, Button, Modal, Input, Tag, message, Descriptions, Card, Typography, Space, Form, Switch, Segmented } from 'antd';
import { CopyOutlined, SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { EllipsisText, TimeText } from '../../utils/tableCells';

const { Text, Paragraph } = Typography;

const GROUP_LABELS: Record<string, string> = {
  general: '基础设置',
  wechat: '微信小程序',
  wechat_pay: '微信支付',
  invite: '邀请配置',
  customer_service: '客服入口配置',
  storage: '存储配置',
  model: 'AI 模型',
  ai: 'AI 文本能力',
  security: '安全设置',
  upload: '上传设置',
};

interface ConfigMeta {
  label: string;
  description: string;
  placeholder?: string;
  guide?: string;
}

const CONFIG_META: Record<string, ConfigMeta> = {
  'site.name': {
    label: '站点名称',
    description: '前台和管理后台展示的网站名称。',
    placeholder: 'AI 创作平台',
  },
  'site.timezone': {
    label: '时区',
    description: '系统默认时区，例如 Asia/Shanghai。',
    placeholder: 'Asia/Shanghai',
  },
  'site.lang': {
    label: '语言',
    description: '系统默认语言，例如 zh-CN。',
    placeholder: 'zh-CN',
  },
  'site.debug': {
    label: '调试模式',
    description: '是否开启调试输出。',
  },
  'site.allow_register': {
    label: '允许注册',
    description: '是否允许新用户注册。',
  },
  'site.admin_title': {
    label: '后台标题',
    description: '管理后台页面标题。',
    placeholder: 'AI 创作后台',
  },
  'content.filter_enabled': {
    label: '内容过滤',
    description: '是否启用敏感内容过滤。',
  },
  'membership.template_save_use_member_only': {
    label: '模板保存/使用仅会员可用',
    description: '开启后非会员仍可浏览预览模板，但不能保存模板素材或使用模板生成同款；生成结果保存不受该开关影响。',
  },
  'wechat.app_id': {
    label: '小程序 AppID',
    description: '微信小程序唯一 ID，用于识别你的小程序。',
    placeholder: 'wx1234567890abcdef',
    guide: '获取位置：微信公众平台 → 开发管理 → 开发设置。request 合法域名通常填写后端 API 域名。',
  },
  'wechat.app_secret': {
    label: '小程序 AppSecret',
    description: '小程序接口密钥，用于微信登录换取 OpenID 和 session_key，保存后不明文显示。',
    guide: '获取位置：微信公众平台 → 开发管理 → 开发设置。如需更换请粘贴新密钥，留空保存不会修改原密钥。',
  },
  'wechat.login_enabled': {
    label: '启用微信登录',
    description: '是否启用微信小程序登录。',
  },
  'wechat.login_bypass_dev': {
    label: '开发登录绕过',
    description: '开发环境是否允许使用 dev_ 开头的 code 绕过微信登录。',
  },
  'wechat_pay.enabled': {
    label: '启用支付',
    description: '是否启用微信支付。本阶段检测配置，不会创建真实订单或扣款。',
  },
  'wechat_pay.mchid': {
    label: '商户号 MchID',
    description: '微信支付商户号。',
    placeholder: '1234567890',
    guide: '在微信支付商户平台获取商户号。',
  },
  'wechat_pay.api_v3_key': {
    label: 'API v3 密钥',
    description: '微信支付 API v3 密钥。',
    guide: '在商户平台的 API 安全页面设置 32 位 API v3 密钥。',
  },
  'wechat_pay.merchant_serial_no': {
    label: '证书序列号',
    description: '微信支付 API 证书序列号。',
    guide: '在商户平台 API 安全页面查看 API 证书序列号。',
  },
  'wechat_pay.private_key': {
    label: '商户 API 私钥',
    description: 'PEM 格式的商户 API 私钥。',
    guide: '填写 apiclient_key.pem 内容，包含 -----BEGIN PRIVATE KEY----- 和 -----END PRIVATE KEY-----。',
  },
  'wechat_pay.platform_cert': {
    label: '微信支付平台证书 / 公钥',
    description: '用于微信支付回调验签。开启验签时必须配置完整。',
    guide: '可填写微信支付平台证书或平台公钥，保存后不明文显示。',
  },
  'wechat_pay.notify_url': {
    label: '支付回调地址',
    description: '必须是 https:// 开头的公网地址。',
    placeholder: 'https://your-domain.com/api/v1/payments/wechat/notify',
    guide: '统一填写 https://域名/api/v1/payments/wechat/notify。该路径必须和后端真实路由一致，并且公网可访问。',
  },
  'wechat_pay.timeout_minutes': {
    label: '订单超时分钟数',
    description: '未支付订单自动关闭的时间。',
    placeholder: '30',
  },
  'wechat_pay.verify_signature': {
    label: '验签开关',
    description: '是否校验微信支付回调签名。',
  },
  'invite.enabled': {
    label: '邀请功能开关',
    description: '关闭邀请功能后，小程序不展示邀请入口，也不会发放邀请奖励。',
  },
  'invite.reward_on_use_enabled': {
    label: '好友使用奖励开关',
    description: '好友首次进入并绑定邀请码后，是否给邀请人发放积分。',
  },
  'invite.reward_on_use_points': {
    label: '好友使用奖励积分',
    description: '好友首次进入并绑定邀请码后，给邀请人发放多少积分。',
    placeholder: '20',
  },
  'invite.reward_on_member_enabled': {
    label: '好友开通会员奖励开关',
    description: '好友真实支付开通会员后，是否给邀请人发放积分。',
  },
  'invite.reward_on_member_points': {
    label: '好友开通会员奖励积分',
    description: '好友真实支付开通会员后，给邀请人发放多少积分。',
    placeholder: '100',
  },
  'invite.max_reward_per_day': {
    label: '每日奖励次数',
    description: '限制邀请人每天最多获得几次邀请积分，防止重复刷积分。',
    placeholder: '20',
  },
  'customer_service.enabled': {
    label: '开启客服入口',
    description: '关闭后小程序不显示客服入口。',
  },
  'customer_service.title': {
    label: '入口名称',
    description: '个人中心客服菜单主标题，最多 12 个中文字符或 24 个英文字符。',
    placeholder: '联系客服',
  },
  'customer_service.subtitle': {
    label: '入口描述',
    description: '个人中心客服菜单副标题，最多 40 个中文字符。',
    placeholder: '订单、会员、生成问题都可以咨询',
  },
  'customer_service.icon': {
    label: '图标',
    description: '小程序端图标标识，本阶段不强制上传图标。',
    placeholder: 'customer-service',
  },
  'customer_service.show_in_profile': {
    label: '显示在个人中心',
    description: '关闭后个人中心隐藏客服菜单项。',
  },
  'customer_service.session_from': {
    label: '会话来源 sessionFrom',
    description: '传给微信 button open-type="contact" 的 session-from。',
    placeholder: 'profile',
  },
  'customer_service.show_message_card': {
    label: '发送小程序卡片',
    description: '开启后通过 show-message-card 向客服发送当前小程序卡片。',
  },
  'customer_service.send_message_title': {
    label: '卡片标题',
    description: '发送给客服的小程序卡片标题。',
    placeholder: 'AI创作助手客服咨询',
  },
  'customer_service.send_message_path': {
    label: '卡片路径',
    description: '发送给客服的小程序卡片路径，非空时必须以 / 开头。',
    placeholder: '/pages/user/index',
  },
  'customer_service.send_message_img': {
    label: '卡片图片',
    description: '可选 HTTPS 图片 URL，留空则不传图片。',
    placeholder: 'https://your-domain.com/customer-service-card.png',
  },
  'storage.provider': {
    label: '存储平台',
    description: '当前启用的存储平台。',
    placeholder: 'tencent_cos',
    guide: '第一步选择平台，第二步填写平台参数，第三步测试连接，第四步上传测试文件，最后保存启用。',
  },
  'site.api_domain': {
    label: '后端 API 域名',
    description: '小程序请求后端接口使用的 HTTPS 公网域名。',
    placeholder: 'https://api.example.com',
  },
  'storage.file_domain': {
    label: '文件访问域名',
    description: '小程序访问图片、视频文件使用的域名，通常是对象存储或 CDN。',
    placeholder: 'https://cdn.example.com',
  },
  'storage.local.upload_dir': {
    label: '本地上传目录',
    description: 'local 存储时文件写入的物理目录，目录不存在会在启动或首次上传时创建。',
    placeholder: '/www/wwwroot/ai-creator/uploads',
    guide: '建议使用项目根目录下的 uploads 目录，不要指向源码、node_modules 或 update-packages。',
  },
  'storage.local.base_url': {
    label: '本地静态前缀',
    description: 'local 存储返回给前端的访问前缀，例如 /static。',
    placeholder: '/static',
    guide: '后端会把该前缀映射到 uploads 目录，确保本地上传文件可直接访问。',
  },
  'security.login_lock_count': {
    label: '登录锁定次数',
    description: '连续登录失败达到该次数后锁定。',
    placeholder: '5',
  },
  'security.captcha_enabled': {
    label: '启用验证码',
    description: '是否启用登录或操作验证码。',
  },
  'security.operation_log_enabled': {
    label: '操作日志',
    description: '是否记录后台操作日志。',
  },
  'content.sensitive_words': {
    label: '敏感词',
    description: 'JSON 数组格式，例如 ["词1","词2"]。',
    placeholder: '["敏感词1","敏感词2"]',
    guide: '填写 JSON 数组，留空或 [] 表示不额外配置敏感词。',
  },
  'ai.prompt_optimize.enabled': {
    label: '提示词智能优化开关',
    description: '控制小程序生图/生视频输入框下方的“智能优化”按钮，对应接口 /tasks/optimize-prompt。',
  },
  'ai.prompt_optimize.model_id': {
    label: '智能优化文本模型 ID',
    description: '填写后台“供应商与模型”里已启用的文本模型 ID，用来改写用户输入的提示词。',
    placeholder: '0',
  },
  'ai.prompt_optimize.points_cost': {
    label: '智能优化积分',
    description: '每次智能优化消耗积分。',
    placeholder: '0',
  },
  'ai.script_generate.enabled': {
    label: '剧本/脚本生成开关',
    description: '控制后续小程序剧本生成入口，对应接口 /tasks/script。',
  },
  'ai.script_generate.model_id': {
    label: '剧本/脚本文本模型 ID',
    description: '填写用于把主题生成分镜脚本的文本模型 ID。',
    placeholder: '0',
  },
  'ai.script_generate.points_cost': {
    label: '脚本生成积分',
    description: '每次脚本生成消耗积分。',
    placeholder: '0',
  },
  'ai.prompt_generate.enabled': {
    label: '提示词智能补全/生成开关',
    description: '控制后续小程序提示词输入框的智能补全或多版本提示词生成，对应接口 /tasks/prompt。',
  },
  'ai.prompt_generate.model_id': {
    label: '提示词补全文本模型 ID',
    description: '填写用于根据创意想法生成多条提示词的文本模型 ID。',
    placeholder: '0',
  },
  'ai.prompt_generate.points_cost': {
    label: '提示词生成积分',
    description: '每次提示词生成消耗积分。',
    placeholder: '0',
  },
  'ai.storyboard_generate.enabled': {
    label: 'AI 漫剧分镜生成开关',
    description: '控制后续小程序漫剧分镜生成入口，对应接口 /tasks/storyboard。',
  },
  'ai.storyboard_generate.model_id': {
    label: '漫剧分镜文本模型 ID',
    description: '填写用于把脚本拆成镜头画面、运镜、光影说明的文本模型 ID。',
    placeholder: '0',
  },
  'ai.storyboard_generate.points_cost': {
    label: '分镜生成积分',
    description: '每次分镜生成消耗积分。',
    placeholder: '0',
  },
};

function getMeta(key: string): ConfigMeta {
  return CONFIG_META[key] || { label: key, description: '' };
}

const VISIBLE_SETTING_GROUPS = new Set(['general', 'ai']);
const VISIBLE_CONFIG_KEYS = new Set([
  'site.name',
  'site.api_domain',
  'site.timezone',
  'site.lang',
  'site.allow_register',
  'site.admin_title',
  'content.filter_enabled',
  'content.sensitive_words',
  'membership.enabled',
  'membership.show_entry',
  'membership.template_save_use_member_only',
  'template.user_share_enabled',
  'template.user_public_enabled',
  'template.require_manual_review',
  'template.require_content_check',
  'ai.prompt_optimize.enabled',
  'ai.prompt_optimize.model_id',
  'ai.prompt_optimize.points_cost',
  'ai.script_generate.enabled',
  'ai.script_generate.model_id',
  'ai.script_generate.points_cost',
  'ai.prompt_generate.enabled',
  'ai.prompt_generate.model_id',
  'ai.prompt_generate.points_cost',
  'ai.storyboard_generate.enabled',
  'ai.storyboard_generate.model_id',
  'ai.storyboard_generate.points_cost',
]);

const CUSTOMER_SERVICE_DEFAULTS = {
  enabled: true,
  title: '联系客服',
  subtitle: '订单、会员、生成问题都可以咨询',
  icon: 'customer-service',
  showInProfile: true,
  sessionFrom: 'profile',
  showMessageCard: true,
  sendMessageTitle: 'AI创作助手客服咨询',
  sendMessagePath: '/pages/user/index',
  sendMessageImg: '',
};

function asBool(value: any, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function getConfigValue(configs: any[], key: string, fallback: any): any {
  const item = configs.find((config: any) => config.key === key);
  if (!item || item.value === undefined || item.value === null || item.value === '') return fallback;
  return item.value;
}

export default function Settings() {
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('general');
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editIsSecret, setEditIsSecret] = useState(false);
  const [editType, setEditType] = useState('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logPagination, setLogPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [statusData, setStatusData] = useState<any>({});
  const [customerForm] = Form.useForm();
  const [customerSaving, setCustomerSaving] = useState(false);

  useEffect(() => { fetchGroups(); fetchStatus(); fetchConfigs('general'); }, []);
  useEffect(() => {
    if (activeGroup !== 'customer_service') return;
    customerForm.setFieldsValue({
      enabled: asBool(getConfigValue(configs, 'customer_service.enabled', CUSTOMER_SERVICE_DEFAULTS.enabled), CUSTOMER_SERVICE_DEFAULTS.enabled),
      title: getConfigValue(configs, 'customer_service.title', CUSTOMER_SERVICE_DEFAULTS.title),
      subtitle: getConfigValue(configs, 'customer_service.subtitle', CUSTOMER_SERVICE_DEFAULTS.subtitle),
      icon: getConfigValue(configs, 'customer_service.icon', CUSTOMER_SERVICE_DEFAULTS.icon),
      showInProfile: asBool(getConfigValue(configs, 'customer_service.show_in_profile', CUSTOMER_SERVICE_DEFAULTS.showInProfile), CUSTOMER_SERVICE_DEFAULTS.showInProfile),
      sessionFrom: getConfigValue(configs, 'customer_service.session_from', CUSTOMER_SERVICE_DEFAULTS.sessionFrom),
      showMessageCard: asBool(getConfigValue(configs, 'customer_service.show_message_card', CUSTOMER_SERVICE_DEFAULTS.showMessageCard), CUSTOMER_SERVICE_DEFAULTS.showMessageCard),
      sendMessageTitle: getConfigValue(configs, 'customer_service.send_message_title', CUSTOMER_SERVICE_DEFAULTS.sendMessageTitle),
      sendMessagePath: getConfigValue(configs, 'customer_service.send_message_path', CUSTOMER_SERVICE_DEFAULTS.sendMessagePath),
      sendMessageImg: getConfigValue(configs, 'customer_service.send_message_img', CUSTOMER_SERVICE_DEFAULTS.sendMessageImg),
    });
  }, [activeGroup, configs, customerForm]);

  const fetchGroups = () => {
    api.get('/settings/groups').then((r: any) => setGroups(r.data || []));
  };

  const fetchConfigs = (group: string) => {
    setLoading(true);
    setActiveGroup(group);
    api.get('/settings/' + group).then((r: any) => setConfigs(r.data || [])).finally(() => setLoading(false));
  };

  const fetchStatus = () => {
    api.get('/settings/status').then((r: any) => setStatusData(r.data || {}));
  };

  const fetchLogs = (page = 1) => {
    api.get('/settings/logs', { params: { page, pageSize: 20 } }).then((r: any) => {
      setLogs(r.data?.list || []);
      setLogPagination({ ...logPagination, current: page, total: r.data?.pagination?.total || 0 });
    });
  };

  const openEdit = (item: any) => {
    setEditKey(item.key);
    setEditValue(item.isSecret ? '' : item.value);
    setEditIsSecret(!!item.isSecret);
    setEditType(item.type || '');
    setEditModal(true);
  };

  const saveEdit = async () => {
    const body: any = {};
    body[editKey] = editType === 'boolean' ? String(asBool(editValue, false)) : editValue;
    const url = editIsSecret ? '/settings/' + activeGroup + '/secure' : '/settings/' + activeGroup;
    await api.post(url, body);
    message.success('保存成功');
    setEditModal(false);
    fetchConfigs(activeGroup);
    fetchGroups();
  };

  const saveCustomerService = async () => {
    const values = await customerForm.validateFields();
    setCustomerSaving(true);
    try {
      await api.post('/settings/customer_service', {
        'customer_service.enabled': String(!!values.enabled),
        'customer_service.title': values.title,
        'customer_service.subtitle': values.subtitle,
        'customer_service.icon': values.icon,
        'customer_service.show_in_profile': String(!!values.showInProfile),
        'customer_service.session_from': values.sessionFrom,
        'customer_service.show_message_card': String(!!values.showMessageCard),
        'customer_service.send_message_title': values.sendMessageTitle,
        'customer_service.send_message_path': values.sendMessagePath || '',
        'customer_service.send_message_img': values.sendMessageImg || '',
      });
      message.success('保存成功');
      fetchConfigs('customer_service');
      fetchGroups();
    } catch (err: any) {
      message.error(err.response?.data?.message || '客服入口配置保存失败');
    } finally {
      setCustomerSaving(false);
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    message.success('已复制');
  };

  const openPromptOptimizePrompt = () => {
    window.location.href = '/content?tab=prompt&targetFeature=prompt_optimize';
  };

  const editMeta = getMeta(editKey);

  const columns = [
    {
      title: '配置项', dataIndex: 'key', width: 360,
      render: (key: string) => {
        const m = getMeta(key);
        return (
          <span>
            <span style={{ fontWeight: 500 }}>{m.label}</span>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{m.description || '按实际业务需要填写'}</Text>
            {advancedMode && (
              <>
                <br />
                <EllipsisText value={key} maxWidth={320} code />
              </>
            )}
          </span>
        );
      },
    },
    {
      title: '配置值', dataIndex: 'value', width: 300,
      render: (v: string, r: any) => {
        if (r.isSecret) {
          return <Tag>{r.maskedValue || '****已隐藏****'}</Tag>;
        }
        if (r.type === 'boolean' || (v === 'true' || v === 'false')) {
          return <Tag color={v === 'true' ? 'green' : 'default'}>{v === 'true' ? '开启' : '关闭'}</Tag>;
        }
        if (r.type === 'json') return <EllipsisText value={v} maxWidth={278} code />;
        return <EllipsisText value={v} maxWidth={278} fallback="未设置" />;
      },
    },
    advancedMode ? {
      title: '密钥', dataIndex: 'isSecret', width: 60,
      render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    } : null,
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => <Button size="small" onClick={() => openEdit(r)}>编辑</Button>,
    },
  ].filter(Boolean) as any[];

  const logColumns = [
    { title: '管理员', dataIndex: 'admin_name', width: 100 },
    { title: '分组', dataIndex: 'config_group', width: 80 },
    { title: '配置 Key', dataIndex: 'config_key', width: 220, render: (v: string) => <EllipsisText value={v} maxWidth={198} code /> },
    { title: '操作', dataIndex: 'action', width: 60 },
    { title: '旧值', dataIndex: 'old_value_masked', width: 220, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={198} /> },
    { title: '新值', dataIndex: 'new_value_masked', width: 220, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={198} /> },
    { title: 'IP', dataIndex: 'ip_address', width: 120 },
    { title: '时间', dataIndex: 'created_at', width: 170, render: (v: string) => <TimeText value={v} /> },
  ];

  const renderCustomerServiceSettings = () => (
    <Card title="客服入口配置" loading={loading && activeGroup === 'customer_service'}>
      <Form form={customerForm} layout="vertical">
        <Space align="start" size={32} wrap>
          <Form.Item name="enabled" label="开启客服入口" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="showInProfile" label="显示在个人中心" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="showMessageCard" label="发送小程序卡片" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <Form.Item name="title" label="入口名称" rules={[{ required: true, message: '请输入入口名称' }]}>
          <Input maxLength={24} placeholder="联系客服" />
        </Form.Item>
        <Form.Item name="subtitle" label="入口描述">
          <Input maxLength={80} placeholder="订单、会员、生成问题都可以咨询" />
        </Form.Item>
        <Form.Item name="icon" label="图标" extra="小程序内置图标名称，默认为 customer-service，一般无需修改。">
          <Input maxLength={64} placeholder="customer-service" />
        </Form.Item>
        <Form.Item name="sessionFrom" label="会话来源">
          <Input maxLength={1024} placeholder="profile" />
        </Form.Item>
        <Form.Item name="sendMessageTitle" label="卡片标题">
          <Input maxLength={64} placeholder="AI创作助手客服咨询" />
        </Form.Item>
        <Form.Item name="sendMessagePath" label="卡片路径" rules={[{ pattern: /^$|^\//, message: '卡片路径必须以 / 开头' }]}>
          <Input placeholder="/pages/user/index" />
        </Form.Item>
        <Form.Item name="sendMessageImg" label="卡片图片" rules={[{ pattern: /^$|^https:\/\//i, message: '卡片图片必须是 https:// URL' }]}>
          <Input placeholder="可选填 HTTPS 图片 URL" />
        </Form.Item>
        <Button type="primary" loading={customerSaving} onClick={saveCustomerService}>保存客服入口配置</Button>
      </Form>
    </Card>
  );

  const visibleConfigs = configs.filter((item: any) => VISIBLE_CONFIG_KEYS.has(item.key));
  const settingGroups = groups.filter((g: any) => VISIBLE_SETTING_GROUPS.has(g.group));
  const renderConfigTable = (group: string) => (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={visibleConfigs}
      loading={loading && activeGroup === group}
      size="small"
      pagination={false}
      tableLayout="fixed"
      scroll={{ x: advancedMode ? 820 : 740 }}
    />
  );
  const renderAiTextSettings = (group: string) => (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button size="small" onClick={openPromptOptimizePrompt}>编辑智能补全提示词</Button>
        <Text type="secondary">调整智能补全系统提示词；模型 ID、开关和积分仍在当前表格配置。</Text>
      </Space>
      {renderConfigTable(group)}
    </>
  );
  const tabItems = settingGroups.map((g: any) => ({
    key: g.group, label: GROUP_LABELS[g.group] || g.group,
    children: g.group === 'customer_service'
      ? renderCustomerServiceSettings()
      : g.group === 'ai'
        ? renderAiTextSettings(g.group)
        : renderConfigTable(g.group),
  }));

  tabItems.push({
    key: 'logs', label: '操作日志',
    children: <Table rowKey="id" columns={logColumns} dataSource={logs} pagination={logPagination} size="small" tableLayout="fixed" scroll={{ x: 1260 }} onChange={(p: any) => fetchLogs(p.current)} />,
  });

  return (
    <div>
      <h2><SettingOutlined /> 系统设置</h2>
      <Card style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={5}>
          <Descriptions.Item label="配置总数">{statusData.totalConfigs || 0}</Descriptions.Item>
          <Descriptions.Item label="密钥配置">{statusData.secretConfigs || 0}</Descriptions.Item>
          <Descriptions.Item label="微信配置"><Tag color={statusData.wechatConfigured ? 'green' : 'red'}>{statusData.wechatConfigured ? '已配置' : '未配置'}</Tag></Descriptions.Item>
          <Descriptions.Item label="支付配置"><Tag color={statusData.paymentConfigured ? 'green' : 'red'}>{statusData.paymentConfigured ? '已配置' : '未配置'}</Tag></Descriptions.Item>
          <Descriptions.Item label="存储配置"><Tag color={statusData.storageConfigured ? 'green' : 'red'}>{statusData.storageConfigured ? '已配置' : '未配置'}</Tag></Descriptions.Item>
        </Descriptions>
      </Card>
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={advancedMode ? 'advanced' : 'basic'}
          onChange={(value) => setAdvancedMode(value === 'advanced')}
          options={[{ label: '基础配置', value: 'basic' }, { label: '高级配置', value: 'advanced' }]}
        />
        <Text type="secondary">{advancedMode ? '显示配置 Key 和密钥标识，适合排查问题。' : '默认只显示标题、说明和操作，减少误填。'}</Text>
      </Space>
      <Tabs activeKey={activeGroup} items={tabItems} onChange={(key) => key === 'logs' ? (setActiveGroup('logs'), fetchLogs()) : fetchConfigs(key)} />

      <Modal
        title={editIsSecret ? '编辑密钥配置' : '编辑配置'}
        open={editModal}
        onOk={saveEdit}
        onCancel={() => setEditModal(false)}
        width={560}
      >
        <div style={{ marginBottom: 16 }}>
          <Paragraph strong style={{ fontSize: 16, marginBottom: 4 }}>
            {editMeta.label}
          </Paragraph>
          {advancedMode && <Text type="secondary" style={{ fontSize: 12 }}>配置 Key：{editKey}</Text>}
        </div>

        {editMeta.description && (
          <Paragraph style={{ background: '#f6f8fa', padding: 12, borderRadius: 6, marginBottom: 12 }}>
            <Text>{editMeta.description}</Text>
          </Paragraph>
        )}

        {editMeta.guide && (
          <Paragraph style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <Text strong style={{ color: '#ad6800' }}><QuestionCircleOutlined /> 填写说明</Text>
            <br />
            <Text style={{ color: '#ad6800' }}>{editMeta.guide}</Text>
          </Paragraph>
        )}

        {editKey === 'wechat_pay.notify_url' && (
          <Paragraph style={{ background: '#eef6ff', border: '1px solid #91caff', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <Space>
              <Text code>https://your-domain.com/api/v1/payments/wechat/notify</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copyText('https://your-domain.com/api/v1/payments/wechat/notify')}>复制示例</Button>
            </Space>
          </Paragraph>
        )}

        {activeGroup === 'wechat' && (
          <Paragraph style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            小程序合法域名提示：request 和 uploadFile 通常填写后端 API 域名，downloadFile 通常填写对象存储或 CDN 域名。
          </Paragraph>
        )}

        <div style={{ marginBottom: 8 }}>
          <Text strong>配置值</Text>
        </div>
        {editType === 'boolean' ? (
          <Switch
            checked={asBool(editValue, false)}
            checkedChildren="开启"
            unCheckedChildren="关闭"
            onChange={(checked) => setEditValue(String(checked))}
          />
        ) : editIsSecret ? (
          <Input.Password
            value={editValue}
            placeholder={editMeta.placeholder || '请输入配置值'}
            onChange={(e: any) => setEditValue(e.target.value)}
            autoFocus
          />
        ) : (
          <Input
            value={editValue}
            placeholder={editMeta.placeholder || '请输入配置值'}
            onChange={(e: any) => setEditValue(e.target.value)}
            autoFocus
          />
        )}
        {editIsSecret && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            留空保存不会修改原密钥。如需更换，请输入新密钥。
          </Paragraph>
        )}
      </Modal>
    </div>
  );
}
