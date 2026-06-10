import { useEffect, useState } from 'react';
import { Alert, Table, Button, Modal, Tabs, Form, Input, InputNumber, Select, Tag, Space, message, Popconfirm, Card, Upload, Avatar } from 'antd';
import { PlusOutlined, EditOutlined, CrownOutlined, UploadOutlined, LinkOutlined, PictureOutlined } from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText, nowrapActionStyle } from '../utils/tableCells';

const DURATION_TYPES = [
  { label: '月卡', value: 'month', days: 30 },
  { label: '季卡', value: 'quarter', days: 90 },
  { label: '年卡', value: 'year', days: 365 },
  { label: '永久会员', value: 'forever', days: 36500 },
];

const RIGHT_CATEGORIES = [
  { label: '图片权益', value: 'image' },
  { label: '视频权益', value: 'video' },
  { label: '导出权益', value: 'export' },
  { label: '模型权益', value: 'model' },
  { label: '积分权益', value: 'points' },
  { label: '商业权益', value: 'business' },
  { label: '队列权益', value: 'queue' },
];

interface Plan {
  id: number;
  versionId: number;
  versionName: string;
  versionKey: string;
  name: string;
  planKey: string;
  durationType: string;
  durationDays: number;
  price: number;
  originalPrice: number;
  tag: string;
  status: string;
  sortOrder: number;
}

interface Version {
  id: number;
  name: string;
  versionKey: string;
  description: string;
  sortOrder: number;
  status: string;
}

interface ModelFeature {
  id: number;
  featureKey: string;
  featureName: string;
}

interface FeatureDiscount {
  featureKey: string;
  featureName?: string;
  discountPercent: number;
}

interface BenefitIcon {
  id: number;
  iconKey: string;
  name: string;
  iconUrl: string;
  iconFileId: number | null;
  source: string;
  sortOrder: number;
}

export default function Membership() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [features, setFeatures] = useState<ModelFeature[]>([]);
  const [benefitIcons, setBenefitIcons] = useState<BenefitIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [iconLinkModalOpen, setIconLinkModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editingVersion, setEditingVersion] = useState<Version | null>(null);
  const [form] = Form.useForm();
  const [versionForm] = Form.useForm();
  const [iconLinkForm] = Form.useForm();
  const [planSaving, setPlanSaving] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);

  const fetchBenefitIcons = async () => {
    const iconRes: any = await api.get('/membership/benefit-icons');
    setBenefitIcons(iconRes.data?.list || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [planRes, versionRes, featureRes, iconRes]: any[] = await Promise.all([
        api.get('/membership/plans'),
        api.get('/membership/versions'),
        api.get('/model-features'),
        api.get('/membership/benefit-icons'),
      ]);
      setPlans(planRes.data || []);
      setVersions(versionRes.data || []);
      setFeatures(featureRes.data || []);
      setBenefitIcons(iconRes.data?.list || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const featureDiscountDefaults = (discounts: FeatureDiscount[] = []) => {
    const byKey = new Map(discounts.map(item => [item.featureKey, Number(item.discountPercent || 100)]));
    return Object.fromEntries(features.map(item => [item.featureKey, byKey.get(item.featureKey) || 100]));
  };

  const buildFeatureDiscounts = (values: Record<string, number> = {}) => features.map(item => ({
    featureKey: item.featureKey,
    discountPercent: Number(values[item.featureKey] || 100),
  }));

  const openCreate = () => {
    setEditingPlan(null);
    form.resetFields();
    form.setFieldsValue({
      versionId: versions.find(v => v.status === 'active')?.id || versions[0]?.id,
      durationType: 'month',
      durationDays: 30,
      price: 0,
      originalPrice: 0,
      sortOrder: 0,
      status: 'active',
      rights: [],
      immediatePoints: 0,
      featureDiscounts: featureDiscountDefaults(),
    });
    setModalOpen(true);
  };

  const openEdit = async (plan: Plan) => {
    setEditingPlan(plan);
    try {
      const r: any = await api.get('/membership/plans/' + plan.id);
      const detail = r.data;
      form.setFieldsValue({
        versionId: detail.versionId,
        name: detail.name,
        planKey: detail.planKey,
        durationType: detail.durationType,
        durationDays: detail.durationDays,
        price: detail.price / 100,
        originalPrice: detail.originalPrice / 100,
        tag: detail.tag,
        sortOrder: detail.sortOrder,
        status: detail.status,
        rights: detail.rights || [],
        immediatePoints: Number(detail.pointRule?.immediatePoints || 0) + Number(detail.pointRule?.giftPoints || 0),
        featureDiscounts: featureDiscountDefaults(detail.featureDiscounts || []),
      });
      setModalOpen(true);
    } catch {
      message.error('获取套餐详情失败');
    }
  };

  const handleSave = async () => {
    if (planSaving) return;
    setPlanSaving(true);
    try {
      const values = await form.validateFields();
      const version = versions.find(v => v.id === values.versionId);
      const body: any = {
        versionId: values.versionId,
        name: values.name,
        planKey: values.planKey || `${version?.versionKey || 'plan'}_${values.durationType}`,
        durationType: values.durationType,
        durationDays: values.durationDays,
        price: Math.round(values.price * 100),
        originalPrice: Math.round((values.originalPrice || values.price) * 100),
        tag: values.tag || '',
        sortOrder: values.sortOrder || 0,
        status: values.status || 'active',
      };

      const rights = (values.rights || []).map((r: any) => ({
        rightKey: r.rightKey,
        rightName: r.rightName,
        rightValue: r.rightValue,
        rightCategory: r.rightCategory,
        iconUrl: r.iconUrl || '',
        iconFileId: r.iconFileId || null,
        sortOrder: r.sortOrder || 0,
      }));
      const pointRule = {
        totalPoints: values.immediatePoints || 0,
        immediatePoints: values.immediatePoints || 0,
        monthlyPoints: 0,
        giftPoints: 0,
        grantMode: 'immediate',
        pointsExpireType: 'none',
      };
      const featureDiscounts = buildFeatureDiscounts(values.featureDiscounts || {});

      if (editingPlan) {
        await api.put('/membership/plans/' + editingPlan.id, body);
        await Promise.all([
          api.put('/membership/plans/' + editingPlan.id + '/rights', { rights }),
          api.put('/membership/plans/' + editingPlan.id + '/points', pointRule),
          api.put('/membership/plans/' + editingPlan.id + '/feature-discounts', { featureDiscounts }),
        ]);
      } else {
        await api.post('/membership/plans', { ...body, rights, pointRule, featureDiscounts });
      }

      message.success(editingPlan ? '已保存' : '已创建');
      setModalOpen(false);
      void fetchAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败: ' + (e?.response?.data?.message || e?.message || ''));
    } finally {
      setPlanSaving(false);
    }
  };

  const toggleStatus = async (plan: Plan) => {
    try {
      await api.put('/membership/plans/' + plan.id, { status: plan.status === 'active' ? 'inactive' : 'active' });
      message.success('状态已更新');
      void fetchAll();
    } catch {
      message.error('状态更新失败');
    }
  };

  const openCreateVersion = () => {
    setEditingVersion(null);
    versionForm.resetFields();
    versionForm.setFieldsValue({ sortOrder: versions.length + 1, status: 'active' });
    setVersionModalOpen(true);
  };

  const openEditVersion = (version: Version) => {
    setEditingVersion(version);
    versionForm.setFieldsValue(version);
    setVersionModalOpen(true);
  };

  const handleVersionSave = async () => {
    if (versionSaving) return;
    setVersionSaving(true);
    try {
      const values = await versionForm.validateFields();
      const body = {
        name: values.name,
        versionKey: values.versionKey,
        description: values.description || '',
        sortOrder: values.sortOrder || 0,
        status: values.status || 'active',
      };
      if (editingVersion) await api.put('/membership/versions/' + editingVersion.id, body);
      else await api.post('/membership/versions', body);
      message.success('版本已保存');
      setVersionModalOpen(false);
      void fetchAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存版本失败: ' + (e?.response?.data?.message || e?.message || ''));
    } finally {
      setVersionSaving(false);
    }
  };

  const setRightIcon = (fieldName: number, iconUrl: string, iconFileId?: number | null) => {
    const rights = [...(form.getFieldValue('rights') || [])];
    rights[fieldName] = {
      ...(rights[fieldName] || {}),
      iconUrl,
      iconFileId: iconFileId || null,
    };
    form.setFieldValue('rights', rights);
  };

  const rightNameAt = (fieldName?: number) => {
    if (fieldName === undefined) return '';
    const rights = form.getFieldValue('rights') || [];
    return String(rights[fieldName]?.rightName || '').trim();
  };

  const uploadIcon = async (options: any, fieldName?: number) => {
    const { file, onSuccess, onError } = options;
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      uploadForm.append('category', 'general');
      uploadForm.append('refType', 'member_benefit_icon');
      const uploaded: any = await api.post('/files/upload', uploadForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = uploaded.data?.url || uploaded.url || '';
      const fileId = Number(uploaded.data?.fileId || uploaded.fileId || 0) || null;
      if (!url) throw new Error('上传接口未返回图标 URL');
      const rawName = String(file?.name || '权益图标').replace(/\.[^.]+$/, '');
      await api.post('/membership/benefit-icons', {
        name: rightNameAt(fieldName) || rawName || '权益图标',
        iconUrl: url,
        iconFileId: fileId,
        source: 'upload',
      });
      if (fieldName !== undefined) setRightIcon(fieldName, url, fileId);
      void fetchBenefitIcons();
      onSuccess?.(uploaded);
      message.success('图标已上传并保存到图标库');
    } catch (e: any) {
      onError?.(e);
      message.error('上传图标失败: ' + (e?.response?.data?.message || e?.message || ''));
    }
  };

  const openIconLink = () => {
    iconLinkForm.resetFields();
    setIconLinkModalOpen(true);
  };

  const handleIconLinkSave = async () => {
    try {
      const values = await iconLinkForm.validateFields();
      await api.post('/membership/benefit-icons', {
        name: values.name,
        iconUrl: values.iconUrl,
        source: 'link',
      });
      message.success('图标链接已加入图标库');
      setIconLinkModalOpen(false);
      void fetchBenefitIcons();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存图标链接失败: ' + (e?.response?.data?.message || e?.message || ''));
    }
  };

  const renderRightIconControls = (fieldName: number) => (
    <Space align="center" wrap>
      <Form.Item noStyle shouldUpdate>
        {() => {
          const iconUrl = form.getFieldValue(['rights', fieldName, 'iconUrl']);
          return <Avatar shape="square" size={34} src={iconUrl} icon={<PictureOutlined />} />;
        }}
      </Form.Item>
      <Form.Item name={[fieldName, 'iconFileId']} hidden>
        <Input />
      </Form.Item>
      <Select
        allowClear
        showSearch
        placeholder="选择图标库"
        style={{ width: 170 }}
        optionFilterProp="label"
        options={benefitIcons.map(icon => ({
          label: icon.name,
          value: icon.iconUrl,
          iconFileId: icon.iconFileId,
        }))}
        onChange={(value, option: any) => {
          const selected = Array.isArray(option) ? option[0] : option;
          setRightIcon(fieldName, value || '', selected?.iconFileId || null);
        }}
      />
      <Form.Item name={[fieldName, 'iconUrl']} style={{ marginBottom: 0 }}>
        <Input
          placeholder="图标链接"
          style={{ width: 220 }}
          onChange={(event) => setRightIcon(fieldName, event.target.value, null)}
        />
      </Form.Item>
      <Upload
        accept="image/png,image/jpeg,image/webp"
        showUploadList={false}
        customRequest={(options) => uploadIcon(options, fieldName)}
      >
        <Button icon={<UploadOutlined />}>上传</Button>
      </Upload>
    </Space>
  );

  const durationLabel = (type: string, days: number) => {
    if (type === 'forever' || days >= 36500) return '永久会员';
    if (type === 'month') return days > 30 ? `${days}天` : '月卡';
    if (type === 'quarter') return '季卡';
    if (type === 'year') return days > 365 ? `${days}天` : '年卡';
    return type;
  };

  const handleDurationChange = (value: string) => {
    const option = DURATION_TYPES.find(item => item.value === value);
    if (option) form.setFieldValue('durationDays', option.days);
  };

  const versionColumns = [
    { title: '版本名称', dataIndex: 'name', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} strong /> },
    { title: '版本 Key', dataIndex: 'versionKey', width: 120 },
    { title: '描述', dataIndex: 'description', width: 260, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => v === 'active' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '操作', width: 90, render: (_: any, r: Version) => <Button size="small" icon={<EditOutlined />} onClick={() => openEditVersion(r)}>编辑</Button> },
  ];

  const iconColumns = [
    {
      title: '图标',
      dataIndex: 'iconUrl',
      width: 72,
      render: (url: string) => <Avatar shape="square" size={36} src={url} icon={<PictureOutlined />} />,
    },
    { title: '名称', dataIndex: 'name', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '来源', dataIndex: 'source', width: 90, render: (v: string) => <Tag>{v === 'seed' ? '种子' : v === 'upload' ? '上传' : '链接'}</Tag> },
    { title: '链接', dataIndex: 'iconUrl', width: 360, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={338} code /> },
  ];

  const columns = [
    { title: '套餐名称', dataIndex: 'name', width: 180, render: (v: string) => <EllipsisText value={v} maxWidth={158} strong /> },
    { title: '版本', dataIndex: 'versionName', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: '周期', width: 90, render: (_: any, r: Plan) => durationLabel(r.durationType, r.durationDays) },
    { title: '价格', dataIndex: 'price', width: 120, render: (v: number, r: Plan) => (
      <span>
        <span style={{ fontWeight: 600, color: '#f5222d' }}>¥{(v / 100).toFixed(2)}</span>
        {r.originalPrice > v && <span style={{ textDecoration: 'line-through', color: '#999', marginLeft: 8 }}>¥{(r.originalPrice / 100).toFixed(2)}</span>}
      </span>
    )},
    { title: '标签', dataIndex: 'tag', width: 90, render: (v: string) => v ? <Tag color="orange">{v}</Tag> : '-' },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => v === 'active' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    {
      title: '操作', width: 180,
      render: (_: any, r: Plan) => (
        <Space style={nowrapActionStyle}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title={r.status === 'active' ? '确认停用该套餐？' : '确认启用该套餐？'} onConfirm={() => toggleStatus(r)}>
            <Button size="small" danger={r.status === 'active'}>{r.status === 'active' ? '停用' : '启用'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2><CrownOutlined /> 会员套餐</h2>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增套餐</Button>
          <Button icon={<PlusOutlined />} onClick={openCreateVersion}>新增版本</Button>
        </Space>
      </Card>

      <Card title="会员版本" style={{ marginBottom: 16 }}>
        <Table rowKey="id" columns={versionColumns} dataSource={versions} loading={loading} pagination={false} size="small" tableLayout="fixed" scroll={{ x: 880 }} />
      </Card>

      <Card
        title="权益图标库"
        extra={
          <Space>
            <Upload
              accept="image/png,image/jpeg,image/webp"
              showUploadList={false}
              customRequest={(options) => uploadIcon(options)}
            >
              <Button icon={<UploadOutlined />}>上传图标</Button>
            </Upload>
            <Button icon={<LinkOutlined />} onClick={openIconLink}>添加图标链接</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="权益图标库用于会员权益配置。小程序优先展示后台返回图标，图片加载失败时自动使用本地默认图标。"
        />
        <Table rowKey="id" columns={iconColumns} dataSource={benefitIcons} loading={loading} pagination={{ pageSize: 8 }} size="small" tableLayout="fixed" scroll={{ x: 720 }} />
      </Card>

      <Table rowKey="id" columns={columns} dataSource={plans} loading={loading} pagination={false} tableLayout="fixed" scroll={{ x: 920 }} />

      <Modal title={editingVersion ? '编辑会员版本' : '新增会员版本'} open={versionModalOpen} onCancel={() => setVersionModalOpen(false)} onOk={handleVersionSave} confirmLoading={versionSaving} destroyOnClose>
        <Form form={versionForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="版本名称" rules={[{ required: true, message: '请输入版本名称' }]}>
            <Input placeholder="例如：标准版 / 专业版" />
          </Form.Item>
          <Form.Item name="versionKey" label="版本 Key" rules={[{ required: true, message: '请输入版本 Key' }]}>
            <Input placeholder="standard / pro" disabled={!!editingVersion} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="前台可展示的版本说明" />
          </Form.Item>
          <Space size="middle" wrap>
            <Form.Item name="sortOrder" label="排序"><InputNumber min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal title={editingPlan ? '编辑套餐 - ' + editingPlan.name : '新增套餐'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave} confirmLoading={planSaving} width={820} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Tabs items={[
            {
              key: 'basic',
              label: '基础信息',
              children: (
                <>
                  <Form.Item name="versionId" label="会员版本" rules={[{ required: true, message: '请选择会员版本' }]}>
                    <Select options={versions.map(v => ({ label: `${v.name}${v.status !== 'active' ? '（停用）' : ''}`, value: v.id }))} placeholder="请选择会员版本" />
                  </Form.Item>
                  <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请输入套餐名称' }]}>
                    <Input placeholder="例如：专业版月卡" />
                  </Form.Item>
                  {!editingPlan && (
                    <Form.Item name="planKey" label="套餐 Key" tooltip="唯一标识，例如 pro_month">
                      <Input placeholder="pro_month" />
                    </Form.Item>
                  )}
                  <Space size="middle" wrap>
                    <Form.Item name="durationType" label="周期类型" rules={[{ required: true }]}>
                      <Select options={DURATION_TYPES.map(({ label, value }) => ({ label, value }))} style={{ width: 130 }} onChange={handleDurationChange} />
                    </Form.Item>
                    <Form.Item name="durationDays" label="周期天数" rules={[{ required: true }]}>
                      <InputNumber min={1} max={36500} style={{ width: 130 }} />
                    </Form.Item>
                    <Form.Item name="price" label="售价（元）" rules={[{ required: true }]}>
                      <InputNumber min={0} precision={2} style={{ width: 140 }} prefix="¥" />
                    </Form.Item>
                    <Form.Item name="originalPrice" label="原价（元）">
                      <InputNumber min={0} precision={2} style={{ width: 140 }} prefix="¥" />
                    </Form.Item>
                  </Space>
                  <Space size="middle" wrap>
                    <Form.Item name="tag" label="标签"><Input placeholder="推荐/热卖" style={{ width: 120 }} /></Form.Item>
                    <Form.Item name="sortOrder" label="排序"><InputNumber min={0} style={{ width: 100 }} /></Form.Item>
                    <Form.Item name="status" label="状态">
                      <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 100 }} />
                    </Form.Item>
                  </Space>
                </>
              ),
            },
            {
              key: 'rights',
              label: '权益配置',
              children: (
                <Form.List name="rights">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...rest }) => (
                        <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
                          <Form.Item {...rest} name={[name, 'rightCategory']} rules={[{ required: true }]}>
                            <Select options={RIGHT_CATEGORIES} placeholder="权益分类" style={{ width: 120 }} />
                          </Form.Item>
                          <Form.Item {...rest} name={[name, 'rightKey']} rules={[{ required: true }]}>
                            <Input placeholder="权益 Key" style={{ width: 120 }} />
                          </Form.Item>
                          <Form.Item {...rest} name={[name, 'rightName']} rules={[{ required: true }]}>
                            <Input placeholder="权益名称" style={{ width: 140 }} />
                          </Form.Item>
                          <Form.Item {...rest} name={[name, 'rightValue']} rules={[{ required: true }]}>
                            <Input placeholder="权益值" style={{ width: 120 }} />
                          </Form.Item>
                          <Form.Item {...rest} name={[name, 'sortOrder']}>
                            <InputNumber placeholder="排序" min={0} style={{ width: 80 }} />
                          </Form.Item>
                          {renderRightIconControls(name)}
                          <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add({ rightCategory: 'image', rightKey: '', rightName: '', rightValue: '', sortOrder: 0 })} block>
                        添加权益
                      </Button>
                    </>
                  )}
                </Form.List>
              ),
            },
            {
              key: 'points',
              label: '积分规则',
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="当前购买链路只支持会员积分一次性发放；积分过期策略尚未上线，不会随会员到期自动扣回。"
                  />
                  <Form.Item
                    name="immediatePoints"
                    label="购买后立即发放积分"
                    extra="用户购买或重新发放会员权益时一次性到账。"
                  >
                    <InputNumber min={0} precision={0} style={{ width: 180 }} />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'discounts',
              label: '功能折扣',
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="100% 表示无折扣；95% 表示按原积分 95% 扣费；60% 表示 6 折。"
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
                    {features.map(feature => (
                      <Form.Item
                        key={feature.featureKey}
                        name={['featureDiscounts', feature.featureKey]}
                        label={feature.featureName}
                        rules={[{ required: true, message: '请输入折扣百分比' }]}
                      >
                        <InputNumber min={1} max={100} precision={2} style={{ width: '100%' }} addonAfter="%" />
                      </Form.Item>
                    ))}
                  </div>
                  {!features.length && <Alert type="warning" showIcon message="请先在 AI 模型管理中启用功能页配置。" />}
                </>
              ),
            },
          ]} />
        </Form>
      </Modal>

      <Modal title="添加图标链接" open={iconLinkModalOpen} onCancel={() => setIconLinkModalOpen(false)} onOk={handleIconLinkSave} destroyOnClose>
        <Form form={iconLinkForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="图标名称" rules={[{ required: true, message: '请输入图标名称' }]}>
            <Input placeholder="例如：专属顾问" />
          </Form.Item>
          <Form.Item
            name="iconUrl"
            label="图标链接"
            rules={[{ required: true, message: '请输入图标链接' }]}
            extra="建议使用 HTTPS 图片地址，并确认域名已加入小程序 downloadFile 合法域名。"
          >
            <Input placeholder="https://cdn.example.com/icons/support.png" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
