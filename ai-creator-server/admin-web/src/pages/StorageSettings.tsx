import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, Form, Input, InputNumber, message, Popconfirm, Select, Alert, Space } from 'antd';
import { CloudServerOutlined, CloudUploadOutlined, ApiOutlined } from '@ant-design/icons';
import api from '../services/api';

const PLATFORMS: Record<string, { label: string; provider: string; intro: string; keys: { key: string; label: string; hint: string; secret?: boolean; type?: string; options?: { label: string; value: string }[] }[] }> = {
  '/storage/tencent-cos': {
    label: '腾讯云 COS', provider: 'tencent_cos',
    intro: '腾讯云对象存储。配置前需在腾讯云控制台开通 COS 服务，创建存储桶，并获取 API 密钥。密钥在「访问管理 → API密钥管理」中创建。',
    keys: [
      { key: 'storage.cos.secret_id', label: 'SecretId', hint: '腾讯云 API 密钥 ID，在 https://console.cloud.tencent.com/cam/capi 获取，格式如 AKIDxxxxxxxxxxxxxxxx' },
      { key: 'storage.cos.secret_key', label: 'SecretKey', hint: '腾讯云 API 密钥 Key，与 SecretId 配对使用。注意：SecretKey 仅创建时可见，请妥善保存。', secret: true },
      { key: 'storage.cos.bucket', label: 'Bucket（存储桶）', hint: '存储桶名称，在 COS 控制台创建存储桶时获得。格式如 my-bucket-1234567890，包含 APPID 后缀。' },
      { key: 'storage.cos.region', label: 'Region（地域）', hint: '存储桶所在的地域，创建存储桶时选定，创建后不可更改。', type: 'select', options: [
        { label: '广州 ap-guangzhou', value: 'ap-guangzhou' }, { label: '上海 ap-shanghai', value: 'ap-shanghai' },
        { label: '北京 ap-beijing', value: 'ap-beijing' }, { label: '成都 ap-chengdu', value: 'ap-chengdu' },
        { label: '南京 ap-nanjing', value: 'ap-nanjing' }, { label: '香港 ap-hongkong', value: 'ap-hongkong' },
        { label: '新加坡 ap-singapore', value: 'ap-singapore' },
      ]},
      { key: 'storage.cos.cdn_domain', label: 'CDN 加速域名', hint: '可选。绑定自定义域名以加速文件访问并降低流量成本，需先在 CDN 控制台完成域名配置和 CNAME 解析。如不需要可留空。' },
    ],
  },
  '/storage/aliyun-oss': {
    label: '阿里云 OSS', provider: 'aliyun_oss',
    intro: '阿里云对象存储。配置前需在阿里云控制台开通 OSS 服务，创建 Bucket，并获取 AccessKey。AccessKey 在「RAM 访问控制 → 用户 → 创建用户」时生成，建议使用子账号并仅授予 OSS 权限。',
    keys: [
      { key: 'storage.oss.access_key_id', label: 'AccessKey ID', hint: '阿里云 RAM 用户的 AccessKey ID，在 https://ram.console.aliyun.com/users 创建子用户后获取。' },
      { key: 'storage.oss.access_key_secret', label: 'AccessKey Secret', hint: '与 AccessKey ID 配对的密钥，创建 AccessKey 时仅显示一次，请妥善保存。', secret: true },
      { key: 'storage.oss.bucket', label: 'Bucket（存储桶）', hint: 'OSS Bucket 名称，在 OSS 控制台创建。全局唯一，如 my-ai-creator-bucket。' },
      { key: 'storage.oss.endpoint', label: 'Endpoint（访问端点）', hint: 'OSS 对外服务的访问地址。根据 Bucket 所在地域填写，如 oss-cn-hangzhou.aliyuncs.com。在 Bucket 概览页的「访问域名」处可查看。' },
      { key: 'storage.oss.region', label: 'Region（地域）', hint: 'Bucket 所在地域代码，如 cn-hangzhou、cn-beijing。' },
      { key: 'storage.oss.cdn_domain', label: 'CDN 加速域名', hint: '可选。绑定阿里云 CDN 加速域名，配置后可降低访问延迟和流量费用。需先在 CDN 控制台添加域名并完成 CNAME。' },
    ],
  },
  '/storage/qiniu': {
    label: '七牛云 Kodo', provider: 'qiniu_kodo',
    intro: '七牛云对象存储。配置前需在七牛云控制台创建存储空间，并在「密钥管理」中获取 AccessKey 和 SecretKey。',
    keys: [
      { key: 'storage.qiniu.access_key', label: 'AccessKey', hint: '七牛云 AccessKey，在 https://portal.qiniu.com/user/key 获取。' },
      { key: 'storage.qiniu.secret_key', label: 'SecretKey', hint: '七牛云 SecretKey，与 AccessKey 配对使用。', secret: true },
      { key: 'storage.qiniu.bucket', label: 'Bucket（存储空间）', hint: '在七牛云控制台「对象存储 → 空间管理」中创建的存储空间名称。' },
      { key: 'storage.qiniu.zone', label: 'Zone（存储区域）', hint: '存储空间所在的区域。华东 z0、华北 z1、华南 z2、北美 na0、东南亚 as0。在空间详情页可查看。应和创建空间时的选择一致。' },
      { key: 'storage.qiniu.cdn_domain', label: 'CDN 加速域名', hint: '七牛云为每个空间提供的测试域名（30天有效）或已绑定的自定义 CDN 域名。生产环境务绑定自定义域名。' },
    ],
  },
  '/storage/upyun': {
    label: '又拍云 USS', provider: 'upyun_uss',
    intro: '又拍云对象存储。配置前需在又拍云控制台创建云存储服务，并创建操作员账号及授权。',
    keys: [
      { key: 'storage.upyun.bucket', label: 'Bucket（服务名称）', hint: '又拍云「云存储」中创建的服务名称，如 my-app-images。' },
      { key: 'storage.upyun.operator', label: '操作员', hint: '又拍云「账户管理 → 操作员」中创建的操作员账号。建议创建独立操作员并仅授予其对应服务的读写权限。' },
      { key: 'storage.upyun.password', label: '密码', hint: '操作员的登录密码。', secret: true },
      { key: 'storage.upyun.cdn_domain', label: 'CDN 加速域名', hint: '又拍云默认为每个服务提供测试域名，建议绑定自定义域名以提升访问体验。' },
    ],
  },
  '/storage/eos': {
    label: '移动云 EOS', provider: 'chinamobile_eos',
    intro: '中国移动云对象存储。配置前需在移动云控制台开通 EOS 服务，创建存储桶，并获取 AccessKey。',
    keys: [
      { key: 'storage.eos.access_key', label: 'AccessKey', hint: '移动云 AccessKey，在移动云控制台「访问管理」中创建。' },
      { key: 'storage.eos.secret_key', label: 'SecretKey', hint: '移动云 SecretKey，与 AccessKey 配对使用。', secret: true },
      { key: 'storage.eos.bucket', label: 'Bucket（存储桶）', hint: '在移动云 EOS 控制台创建的存储桶名称。' },
      { key: 'storage.eos.endpoint', label: 'Endpoint（访问端点）', hint: 'EOS 对外服务的访问地址，如 https://eos-wuxi-1.cmecloud.cn。在存储桶详情页可查看。' },
      { key: 'storage.eos.region', label: 'Region（地域）', hint: '存储桶所在地域代码，如 wuxi-1。' },
      { key: 'storage.eos.cdn_domain', label: 'CDN 加速域名', hint: '可选。绑定 CDN 加速域名以提升全国访问速度。' },
    ],
  },
  '/storage/local': {
    label: '本地存储', provider: 'local',
    intro: '将文件直接存储在服务器本地磁盘上。不需要任何第三方账号，开箱即用，适合测试和小规模部署。注意：本地存储的文件无法通过 CDN 加速，多台服务器之间无法共享文件。',
    keys: [
      { key: 'storage.local.upload_dir', label: '上传目录', hint: '文件存储在服务器上的物理路径，需确保 Node.js 进程有读写权限。默认 /www/wwwroot/ai-creator/uploads，如修改请确认目录存在且可写。' },
      { key: 'storage.local.base_url', label: '访问前缀', hint: '前端页面访问上传文件的 URL 前缀。默认为 /static，表示通过 http://你的域名/static/xxx.jpg 访问。如使用 Nginx 反代实际目录则填对应路径。' },
    ],
  },
};

export default function StorageSettings() {
  const loc = useLocation();
  const cfg = PLATFORMS[loc.pathname];
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [currentProvider, setCurrentProvider] = useState('');

  const isActive = cfg?.provider === currentProvider;

  const loadConfigs = useCallback(async () => {
    if (!cfg) return;
    setLoading(true);
    try {
      const r: any = await api.get('/settings/storage');
      const configs: Record<string, string> = {};
      for (const row of (r.data || [])) {
        if (row.value) configs[row.key] = row.value;
      }
      setCurrentProvider(configs['storage.provider'] || 'local');
      const values: Record<string, any> = {};
      for (const k of cfg.keys) {
        if (k.type === 'number') values[k.key] = Number(configs[k.key] || 0);
        else values[k.key] = configs[k.key] || '';
      }
      form.setFieldsValue(values);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [cfg, form]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        payload[k] = String(v ?? '');
      }
      await api.post('/settings/storage', payload);
      message.success('配置已保存，如需切换平台请点击“启用此平台”');
    } catch (e: any) {
      if (!e?.errorFields) message.error('保存失败');
    } finally { setSaving(false); }
  };

  const activate = async () => {
    if (!cfg) return;
    setActivating(true);
    try {
      await api.post('/settings/storage', { 'storage.provider': cfg.provider });
      setCurrentProvider(cfg.provider);
      message.success(`已切换为 ${cfg.label}`);
    } catch { message.error('切换失败'); }
    finally { setActivating(false); }
  };

  if (!cfg) return <div>未知平台</div>;

  return (
    <div>
      <h2><CloudServerOutlined /> {cfg.label}</h2>

      {isActive ? (
        <Alert type="success" showIcon message={`${cfg.label} 是当前使用的存储平台`} style={{ marginBottom: 12 }} />
      ) : (
        <Alert type="info" showIcon message={`当前使用：${PLATFORMS[Object.keys(PLATFORMS).find(k => PLATFORMS[k].provider === currentProvider) || '']?.label || '本地存储'}。未配置任何第三方存储时，默认使用本地存储。填写下方配置并保存后，点击"启用此平台"即可切换。`} style={{ marginBottom: 12 }} />
      )}

      <Alert type="info" showIcon message={cfg.intro} style={{ marginBottom: 16 }} />

      <Card loading={loading}>
        <Form form={form} layout="vertical">
          {cfg.keys.map(k => (
            <Form.Item key={k.key} name={k.key} label={k.label} extra={<span style={{ color: '#888', fontSize: 12 }}>{k.hint}</span>} style={{ maxWidth: 560 }}>
              {k.secret ? (
                <Input.Password placeholder={k.hint || ''} />
              ) : k.type === 'select' && k.options ? (
                <Select options={k.options} placeholder={k.hint || ''} />
              ) : k.type === 'number' ? (
                <InputNumber style={{ width: '100%' }} />
              ) : (
                <Input placeholder={k.hint || ''} />
              )}
            </Form.Item>
          ))}
        </Form>

        <Space style={{ marginTop: 12 }}>
          <Button type="primary" icon={<CloudUploadOutlined />} loading={saving} onClick={save}>保存配置</Button>
          {!isActive && (
            <Popconfirm title={`确认切换到 ${cfg.label}？`} description="切换后所有文件将使用新的存储平台上传和访问。" onConfirm={activate} okText="确认切换" cancelText="取消"><Button icon={<ApiOutlined />} loading={activating}>启用此平台</Button></Popconfirm>
          )}
        </Space>
      </Card>
    </div>
  );
}
