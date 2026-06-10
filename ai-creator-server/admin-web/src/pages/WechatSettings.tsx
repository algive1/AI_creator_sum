import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Form, Image, Input, Modal, Select, Space, Switch, Typography, Upload, message } from 'antd';
import { CopyOutlined, CustomerServiceOutlined, MinusCircleOutlined, PayCircleOutlined, PictureOutlined, PlusOutlined, QuestionCircleOutlined, UploadOutlined, WechatOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { sanitizeHelpHtml } from '../utils/htmlSanitizer';

const { Text } = Typography;

const VISUAL_ASSET_FIELDS = [
  {
    name: 'homeBannerUrl',
    key: 'miniapp_visual_assets.home_banner_url',
    label: '首页顶部 Banner',
    hint: '首页首屏大图。为空时小程序使用本地 JPG 和 CSS 绘制兜底。',
  },
  {
    name: 'homeMemberUpsellUrl',
    key: 'miniapp_visual_assets.home_member_upsell_url',
    label: '首页会员悬浮引导',
    hint: '未开通会员时首页底部悬浮引导图。为空时使用小程序 CSS 兜底。',
  },
  {
    name: 'inspirationBannerUrl',
    key: 'miniapp_visual_assets.inspiration_banner_url',
    label: '灵感页顶部 Banner',
    hint: '发现灵感页顶部运营图。为空时使用页面原 CSS 灯泡 Banner。',
  },
  {
    name: 'comicBannerUrl',
    key: 'miniapp_visual_assets.comic_banner_url',
    label: 'AI漫剧页顶部 Banner',
    hint: 'AI漫剧页顶部运营图。为空时使用页面原 CSS 猫咪 Banner。',
  },
  {
    name: 'profileMemberOfferBannerUrl',
    key: 'miniapp_visual_assets.profile_member_offer_banner_url',
    label: '我的页会员套餐入口 Banner',
    hint: '我的页用户卡片下方会员套餐入口图。为空时使用当前 CSS 会员入口卡片。',
  },
] as const;

type ConfigRow = {
  key: string;
  value: string;
  isSecret?: boolean;
  maskedValue?: string;
};

function asBool(value: any, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function findValue(rows: ConfigRow[], key: string, fallback = '') {
  const row = rows.find(item => item.key === key);
  return row?.value || fallback;
}

function secretText(rows: ConfigRow[], key: string) {
  const row = rows.find(item => item.key === key);
  return row?.maskedValue || '未配置';
}

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

export default function WechatSettings() {
  const location = useLocation();
  const page = useMemo(() => {
    if (location.pathname.includes('/wechat/pay')) return 'pay';
    if (location.pathname.includes('/wechat/customer-service')) return 'customer';
    if (location.pathname.includes('/wechat/help')) return 'help';
    if (location.pathname.includes('/wechat/tabbar')) return 'tabbar';
    if (location.pathname.includes('/wechat/visual-assets')) return 'visualAssets';
    return 'miniapp';
  }, [location.pathname]);
  const [form] = Form.useForm();
  const [configs, setConfigs] = useState<Record<string, ConfigRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingAppSecret, setCopyingAppSecret] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<Record<string, boolean>>({});

  // tabBar
  const [tabItems, setTabItems] = useState<any[]>([]);
  const [tabModal, setTabModal] = useState(false);
  const [editingTab, setEditingTab] = useState<any>(null);
  const [tabForm] = Form.useForm();

  const PAGE_OPTIONS = [
    { label: '首页', value: '/pages/home/index' },
    { label: '灵感', value: '/pages/inspiration/index' },
    { label: '漫剧', value: '/pages/comic/index' },
    { label: '记录', value: '/pages/history/index' },
    { label: '我的', value: '/pages/profile/index' },
  ];

  const fetchTabBar = useCallback(async () => {
    try {
      const res: any = await api.get('/settings/general');
      const row = (res.data || []).find((r: any) => r.key === 'miniapp.tab_bar');
      if (row?.value) {
        try { setTabItems(JSON.parse(row.value)); } catch { setTabItems([]); }
      } else {
        setTabItems([
          { text: '首页', pagePath: '/pages/home/index', iconPath: '', selectedIconPath: '' },
          { text: '灵感', pagePath: '/pages/inspiration/index', iconPath: '', selectedIconPath: '' },
          { text: '我的', pagePath: '/pages/profile/index', iconPath: '', selectedIconPath: '' },
        ]);
      }
    } catch { setTabItems([]); }
  }, []);

  const openTabEdit = (item?: any) => {
    setEditingTab(item || null);
    tabForm.setFieldsValue(item || { text: '', pagePath: '/pages/home/index', iconPath: '', selectedIconPath: '' });
    setTabModal(true);
  };

  const saveTab = async () => {
    const values = await tabForm.validateFields();
    const newItems = editingTab
      ? tabItems.map((t, i) => i === tabItems.indexOf(editingTab) ? values : t)
      : [...tabItems, values];
    if (newItems.length < 2) { message.warning('至少需要 2 个导航项'); return; }
    if (newItems.length > 5) { message.warning('最多 5 个导航项'); return; }
    setTabItems(newItems);
    setTabModal(false);
  };

  const deleteTab = (idx: number) => {
    if (tabItems.length <= 2) { message.warning('至少保留 2 个导航项'); return; }
    setTabItems(tabItems.filter((_, i) => i !== idx));
  };

  const saveTabBar = async () => {
    setSaving(true);
    try {
      await api.post('/settings/general', { 'miniapp.tab_bar': JSON.stringify(tabItems) });
      message.success('导航栏配置已保存');
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (page === 'tabbar') fetchTabBar(); }, [fetchTabBar, page]);

  const fetchGroup = useCallback(async (group: string) => {
    const res: any = await api.get('/settings/' + group);
    return res.data || [];
  }, []);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const groups = ['wechat', 'wechat_pay', 'customer_service', 'miniapp_help', 'miniapp_visual_assets', 'general', 'storage'];
      const result: Record<string, ConfigRow[]> = {};
      await Promise.all(groups.map(async group => { result[group] = await fetchGroup(group); }));
      setConfigs(result);
      form.setFieldsValue({
        loginEnabled: asBool(findValue(result.wechat || [], 'wechat.login_enabled', 'true'), true),
        appId: findValue(result.wechat || [], 'wechat.app_id'),
        appSecret: '',
        apiDomain: findValue(result.general || [], 'site.api_domain'),
        fileDomain: findValue(result.storage || [], 'storage.file_domain'),

        payEnabled: asBool(findValue(result.wechat_pay || [], 'wechat_pay.enabled', 'false'), false),
        payAppId: findValue(result.wechat_pay || [], 'wechat_pay.appid'),
        mchId: findValue(result.wechat_pay || [], 'wechat_pay.mchid'),
        apiV3Key: '',
        merchantSerialNo: findValue(result.wechat_pay || [], 'wechat_pay.merchant_serial_no'),
        privateKey: '',
        notifyUrl: findValue(result.wechat_pay || [], 'wechat_pay.notify_url', '/api/v1/payments/wechat/notify'),

        customerEnabled: asBool(findValue(result.customer_service || [], 'customer_service.enabled', 'true'), true),
        showInProfile: asBool(findValue(result.customer_service || [], 'customer_service.show_in_profile', 'true'), true),
        customerTitle: findValue(result.customer_service || [], 'customer_service.title', '联系客服'),
        customerSubtitle: findValue(result.customer_service || [], 'customer_service.subtitle', '订单、会员、生成问题都可以咨询'),
        customerIcon: findValue(result.customer_service || [], 'customer_service.icon', 'customer-service'),
        sessionFrom: findValue(result.customer_service || [], 'customer_service.session_from', 'profile'),
        showMessageCard: asBool(findValue(result.customer_service || [], 'customer_service.show_message_card', 'true'), true),
        sendMessageTitle: findValue(result.customer_service || [], 'customer_service.send_message_title', 'AI创作助手客服咨询'),
        sendMessagePath: findValue(result.customer_service || [], 'customer_service.send_message_path', '/pages/user/index'),
        sendMessageImg: findValue(result.customer_service || [], 'customer_service.send_message_img'),

        helpEnabled: asBool(findValue(result.miniapp_help || [], 'miniapp_help.enabled', 'true'), true),
        helpTitle: findValue(result.miniapp_help || [], 'miniapp_help.title', '使用帮助'),
        helpContentHtml: findValue(result.miniapp_help || [], 'miniapp_help.content_html'),

        homeBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.home_banner_url'),
        homeMemberUpsellUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.home_member_upsell_url'),
        inspirationBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.inspiration_banner_url'),
        comicBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.comic_banner_url'),
        profileMemberOfferBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.profile_member_offer_banner_url'),
      });
    } finally {
      setLoading(false);
    }
  }, [fetchGroup, form]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs, page]);

  const postNormal = (group: string, body: Record<string, string>) => api.post('/settings/' + group, body);
  const postSecret = (group: string, body: Record<string, string>) => {
    const filtered = Object.fromEntries(Object.entries(body).filter(([, value]) => String(value || '').trim()));
    if (Object.keys(filtered).length === 0) return Promise.resolve();
    return api.post('/settings/' + group + '/secure', filtered);
  };

  const copyWechatAppSecret = async () => {
    if (copyingAppSecret) return;
    setCopyingAppSecret(true);
    try {
      const res: any = await api.post('/settings/secrets/copy', { key: 'wechat.app_secret' });
      const value = String(res.data?.value || '');
      if (!value) {
        message.warning('AppSecret 未配置');
        return;
      }
      await copyTextToClipboard(value);
      message.success('AppSecret 已复制');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '复制 AppSecret 失败');
    } finally {
      setCopyingAppSecret(false);
    }
  };

  const saveMiniapp = async () => {
    const values = await form.validateFields(['loginEnabled', 'appId', 'appSecret', 'apiDomain', 'fileDomain']);
    setSaving(true);
    try {
      await Promise.all([
        postNormal('wechat', {
          'wechat.login_enabled': String(!!values.loginEnabled),
          'wechat.app_id': values.appId || '',
        }),
        postSecret('wechat', { 'wechat.app_secret': values.appSecret || '' }),
        postNormal('general', { 'site.api_domain': values.apiDomain || '' }),
        postNormal('storage', { 'storage.file_domain': values.fileDomain || '' }),
      ]);
      message.success('微信小程序配置已保存');
      void fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const savePay = async () => {
    const values = await form.validateFields(['payEnabled', 'payAppId', 'mchId', 'apiV3Key', 'merchantSerialNo', 'privateKey', 'notifyUrl']);
    if (values.payEnabled && (!values.payAppId || !values.mchId || !values.merchantSerialNo || !values.notifyUrl)) {
      message.error('启用微信支付前，请先填写 AppID、商户号、证书序列号和回调地址');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        postNormal('wechat_pay', {
          'wechat_pay.enabled': String(!!values.payEnabled),
          'wechat_pay.appid': values.payAppId || '',
          'wechat_pay.mchid': values.mchId || '',
          'wechat_pay.merchant_serial_no': values.merchantSerialNo || '',
          'wechat_pay.notify_url': values.notifyUrl || '',
        }),
        postSecret('wechat_pay', {
          'wechat_pay.api_v3_key': values.apiV3Key || '',
          'wechat_pay.private_key': values.privateKey || '',
        }),
      ]);
      message.success('微信支付配置已保存');
      void fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveCustomer = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await postNormal('customer_service', {
        'customer_service.enabled': String(!!values.customerEnabled),
        'customer_service.show_in_profile': String(!!values.showInProfile),
        'customer_service.title': values.customerTitle || '联系客服',
        'customer_service.subtitle': values.customerSubtitle || '',
        'customer_service.icon': values.customerIcon || 'customer-service',
        'customer_service.session_from': values.sessionFrom || 'profile',
        'customer_service.show_message_card': String(!!values.showMessageCard),
        'customer_service.send_message_title': values.sendMessageTitle || '',
        'customer_service.send_message_path': values.sendMessagePath || '',
        'customer_service.send_message_img': values.sendMessageImg || '',
      });
      message.success('微信客服配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveHelp = async () => {
    const values = await form.validateFields(['helpEnabled', 'helpTitle', 'helpContentHtml']);
    setSaving(true);
    try {
      await postNormal('miniapp_help', {
        'miniapp_help.enabled': String(!!values.helpEnabled),
        'miniapp_help.title': values.helpTitle || '使用帮助',
        'miniapp_help.content_html': values.helpContentHtml || '',
      });
      message.success('使用帮助配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveVisualAssets = async () => {
    const fieldNames = VISUAL_ASSET_FIELDS.map(item => item.name);
    const values = await form.validateFields(fieldNames);
    setSaving(true);
    try {
      await postNormal('miniapp_visual_assets', Object.fromEntries(
        VISUAL_ASSET_FIELDS.map(item => [item.key, values[item.name] || '']),
      ));
      message.success('小程序素材配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const uploadVisualAsset = (fieldName: string) => async (options: any) => {
    const file = options.file as File;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'general');
    formData.append('refType', 'miniapp_visual_asset');
    try {
      setUploadingAsset(prev => ({ ...prev, [fieldName]: true }));
      const result: any = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const fileInfo = result?.data || result;
      const url = fileInfo?.url || fileInfo?.cdnUrl;
      if (!url) throw new Error('上传成功但未返回文件地址');
      form.setFieldsValue({ [fieldName]: url });
      message.success('素材上传成功，请确认 URL 为 HTTPS 后保存');
      options.onSuccess?.(fileInfo, file);
    } catch (e: any) {
      message.error(e?.message || '素材上传失败');
      options.onError?.(e);
    } finally {
      setUploadingAsset(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const renderHint = (title: string, content: string) => (
    <div style={{ marginBottom: 8 }}>
      <Text strong>{title}</Text>
      <div><Text type="secondary">{content}</Text></div>
    </div>
  );

  const miniapp = (
    <Card loading={loading} title={<Space><WechatOutlined />微信小程序</Space>}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="只填写小程序运行必须的信息。合法域名需要到微信公众平台单独配置。" />
      <Form form={form} layout="vertical">
        <Form.Item name="loginEnabled" label="启用微信登录" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item name="appId" label="AppID" extra="微信公众平台 -> 开发管理 -> 开发设置中获取。" rules={[{ required: true, message: '请输入小程序 AppID' }]}>
          <Input placeholder="wx..." />
        </Form.Item>
        <Form.Item
          name="appSecret"
          label="AppSecret"
          extra={
            <Space wrap>
              <Text type="secondary">当前状态：{secretText(configs.wechat || [], 'wechat.app_secret')}。留空不会修改原密钥。</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={copyingAppSecret}
                disabled={secretText(configs.wechat || [], 'wechat.app_secret') === '未配置'}
                onClick={copyWechatAppSecret}
              >
                复制
              </Button>
            </Space>
          }
        >
          <Input.Password placeholder="需要更换时再填写" />
        </Form.Item>
        <Form.Item name="apiDomain" label="后端 API 域名" extra="用于微信 request / uploadFile 合法域名，建议填写 https:// 开头的公网域名。">
          <Input placeholder="https://api.example.com" />
        </Form.Item>
        <Form.Item name="fileDomain" label="文件访问域名" extra="用于 downloadFile 合法域名，通常是对象存储或 CDN 域名。">
          <Input placeholder="https://cdn.example.com" />
        </Form.Item>
        <Button type="primary" loading={saving} onClick={saveMiniapp}>保存微信小程序配置</Button>
      </Form>
    </Card>
  );

  const pay = (
    <Card loading={loading} title={<Space><PayCircleOutlined />微信支付</Space>}>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="线上收款前请确认小程序已绑定商户号。密钥保存后不会明文显示。" />
      <Form form={form} layout="vertical">
        <Form.Item name="payEnabled" label="启用微信支付" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item name="payAppId" label="小程序 AppID">
          <Input placeholder="wx..." />
        </Form.Item>
        <Form.Item name="mchId" label="商户号">
          <Input placeholder="例如 1900000001" />
        </Form.Item>
        <Form.Item name="apiV3Key" label="API v3 Key" extra={`当前状态：${secretText(configs.wechat_pay || [], 'wechat_pay.api_v3_key')}。留空不会修改原密钥。`}>
          <Input.Password placeholder="32 位 API v3 Key" />
        </Form.Item>
        <Form.Item name="merchantSerialNo" label="商户证书序列号">
          <Input />
        </Form.Item>
        <Form.Item name="privateKey" label="商户私钥" extra={`当前状态：${secretText(configs.wechat_pay || [], 'wechat_pay.private_key')}。留空不会修改原密钥。`}>
          <Input.TextArea rows={5} placeholder="-----BEGIN PRIVATE KEY-----" />
        </Form.Item>
        <Form.Item name="notifyUrl" label="支付回调地址" extra="推荐填写完整 HTTPS 地址；如填相对路径，需要先配置后端 API 域名。">
          <Input placeholder="https://your-domain.com/api/v1/payments/wechat/notify" />
        </Form.Item>
        <Button type="primary" loading={saving} onClick={savePay}>保存微信支付配置</Button>
      </Form>
    </Card>
  );

  const customer = (
    <Card loading={loading} title={<Space><CustomerServiceOutlined />微信客服</Space>}>
      <Form form={form} layout="vertical">
        <Space size={32} wrap>
          <Form.Item name="customerEnabled" label="开启客服入口" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="showInProfile" label="显示在个人中心" valuePropName="checked">
            <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
          </Form.Item>
        </Space>
        <Form.Item name="customerTitle" label="入口名称" rules={[{ required: true, message: '请输入入口名称' }]}>
          <Input maxLength={24} placeholder="联系客服" />
        </Form.Item>
        <Form.Item name="customerSubtitle" label="入口描述">
          <Input maxLength={80} placeholder="订单、会员、生成问题都可以咨询" />
        </Form.Item>
        <Collapse ghost items={[{
          key: 'advanced',
          label: '高级配置',
          children: (
            <>
              {renderHint('这些配置通常不用改', '只有当小程序客服卡片或埋点来源有特殊要求时再调整。')}
              <Form.Item name="customerIcon" label="图标标识">
                <Input placeholder="customer-service" />
              </Form.Item>
              <Form.Item name="sessionFrom" label="sessionFrom">
                <Input placeholder="profile" />
              </Form.Item>
              <Form.Item name="showMessageCard" label="发送小程序卡片" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sendMessageTitle" label="卡片标题">
                <Input placeholder="AI创作助手客服咨询" />
              </Form.Item>
              <Form.Item name="sendMessagePath" label="卡片路径" rules={[{ pattern: /^$|^\//, message: '卡片路径必须以 / 开头' }]}>
                <Input placeholder="/pages/user/index" />
              </Form.Item>
              <Form.Item name="sendMessageImg" label="卡片图片" rules={[{ pattern: /^$|^https:\/\//i, message: '卡片图片必须是 https:// URL' }]}>
                <Input placeholder="可选填 HTTPS 图片 URL" />
              </Form.Item>
            </>
          ),
        }]} />
        <Button type="primary" loading={saving} onClick={saveCustomer}>保存微信客服配置</Button>
      </Form>
    </Card>
  );

  const helpContent = Form.useWatch('helpContentHtml', form) || '';
  const sanitizedHelpContent = useMemo(() => sanitizeHelpHtml(String(helpContent)), [helpContent]);
  const help = (
    <Card loading={loading} title={<Space><QuestionCircleOutlined />使用帮助</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里保存小程序使用帮助内容。当前小程序入口先提示暂未开发，内容会通过 /public/app 下发，后续帮助页可直接复用。"
      />
      <Form form={form} layout="vertical">
        <Form.Item name="helpEnabled" label="启用使用帮助内容" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item name="helpTitle" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input maxLength={40} placeholder="使用帮助" />
        </Form.Item>
        <Form.Item
          name="helpContentHtml"
          label="富文本 HTML 内容"
          extra="支持常见 HTML 标签，例如 h3、p、ul、li、strong、a。请不要粘贴 script 或 javascript: 链接。"
        >
          <Input.TextArea rows={12} placeholder="<h3>如何开始创作？</h3><p>选择功能，输入提示词后提交生成。</p>" />
        </Form.Item>
        <Card size="small" title="预览" style={{ marginBottom: 16 }}>
          {helpContent
            ? <div style={{ color: '#1f2937', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: sanitizedHelpContent }} />
            : <Text type="secondary">暂无内容</Text>}
        </Card>
        <Button type="primary" loading={saving} onClick={saveHelp}>保存使用帮助配置</Button>
      </Form>
    </Card>
  );

  const visualAssets = (
    <Card loading={loading} title={<Space><PictureOutlined />小程序素材配置</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这些图片通过 /public/app 下发给小程序。为空时小程序使用本地 JPG 或 CSS 绘制兜底，首屏不会空白。"
        description="生产环境请使用 HTTPS 公网图片，并把图片域名配置到微信公众平台 downloadFile 合法域名。后台上传复用当前对象存储配置；如果返回本地 /static 地址，请先配置公网文件域名或对象存储后再用于真机。"
      />
      <Form form={form} layout="vertical">
        {VISUAL_ASSET_FIELDS.map(item => (
          <Card key={item.key} size="small" style={{ marginBottom: 14 }} title={item.label}>
            <Form.Item
              name={item.name}
              label="图片 URL"
              extra={item.hint}
              rules={[{ pattern: /^$|^https:\/\//i, message: '请填写 https:// 开头的图片 URL，或留空使用小程序兜底' }]}
            >
              <Input placeholder="https://cdn.example.com/miniapp/banner.jpg" />
            </Form.Item>
            <Space align="start" size={16} wrap>
              <Upload accept="image/jpeg,image/png" showUploadList={false} customRequest={uploadVisualAsset(item.name)} maxCount={1}>
                <Button icon={<UploadOutlined />} loading={!!uploadingAsset[item.name]}>上传 JPG/PNG</Button>
              </Upload>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) => {
                  const url = String(getFieldValue(item.name) || '').trim();
                  return url
                    ? <Image src={url} width={220} height={82} style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(99,102,241,0.12)' }} />
                    : <div style={{ width: 220, height: 82, borderRadius: 10, background: 'linear-gradient(135deg, #f7f4ff, #fff)', border: '1px dashed rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8fa3' }}>使用小程序兜底</div>;
                }}
              </Form.Item>
            </Space>
          </Card>
        ))}
        <Button type="primary" loading={saving} onClick={saveVisualAssets}>保存素材配置</Button>
      </Form>
    </Card>
  );

  const tabbar = (
    <div>
      <h2>底部导航栏配置</h2>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="配置小程序底部导航栏的图标和页面。最少 2 个，最多 5 个。图标支持粘贴图片 URL 或上传 SVG/PNG 文件。尺寸建议 81×81 像素。小程序仅支持 HTTPS 域名的图标。" />

      <Card size="small" style={{ marginBottom: 16 }}>
        {tabItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6', minWidth: 32 }}>{idx + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.text || '未命名'}</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                页面：{PAGE_OPTIONS.find(p => p.value === item.pagePath)?.label || item.pagePath}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>默认</div>
                  {item.iconPath ? <Image src={item.iconPath} width={32} height={32} preview={false} style={{ borderRadius: 4 }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>无</div>}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>选中</div>
                  {item.selectedIconPath ? <Image src={item.selectedIconPath} width={32} height={32} preview={false} style={{ borderRadius: 4 }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>无</div>}
                </div>
              </div>
            </div>
            <Space>
              <Button size="small" onClick={() => openTabEdit(item)}>编辑</Button>
              <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => deleteTab(idx)} disabled={tabItems.length <= 2}>删除</Button>
            </Space>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => openTabEdit()} disabled={tabItems.length >= 5}>添加导航项</Button>
        </div>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" loading={saving} onClick={saveTabBar}>保存配置</Button>
        </div>
      </Card>

      <Modal title={editingTab ? '编辑导航项' : '添加导航项'} open={tabModal} onCancel={() => setTabModal(false)} onOk={saveTab} destroyOnClose>
        <Form form={tabForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="text" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="首页" />
          </Form.Item>
          <Form.Item name="pagePath" label="页面路径" rules={[{ required: true }]}>
            <Select options={PAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="iconPath" label="未选中图标 URL" extra="粘贴 HTTPS 图片链接，或通过文件管理上传后复制链接。支持 SVG/PNG。">
            <Input placeholder="https://cdn.example.com/icons/home.svg" />
          </Form.Item>
          <Form.Item name="selectedIconPath" label="选中图标 URL" extra="导航项被选中时显示的图标，颜色/样式通常与未选中不同。">
            <Input placeholder="https://cdn.example.com/icons/home-active.svg" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  return page === 'pay' ? pay : page === 'customer' ? customer : page === 'help' ? help : page === 'visualAssets' ? visualAssets : page === 'tabbar' ? tabbar : miniapp;
}
