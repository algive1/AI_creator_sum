import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { EditOutlined, GiftOutlined, ShoppingOutlined } from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText, nowrapActionStyle } from '../utils/tableCells';

interface PointPackage {
  id: number;
  name: string;
  points: number;
  priceYuan: number;
  priceCents: number;
  description: string;
  firstPurchaseBonusType: 'none' | 'double' | 'fixed';
  firstPurchaseBonusPoints: number;
  enabled: boolean;
  sortOrder: number;
}

interface PointTask {
  id: number;
  taskKey: string;
  title: string;
  group: 'daily' | 'growth';
  rewardPoints: number;
  icon: string;
  actionText: string;
  resetCycle: 'daily' | 'once';
  status: 'active' | 'disabled';
  sortOrder: number;
}

interface ConfigItem {
  key: string;
  value: string;
  type: string;
}

const DEFAULT_NORMAL_REWARDS = [10, 15, 20, 25, 30, 50, 80];
const DEFAULT_SUPER_REWARDS = [20, 30, 40, 50, 60, 80, 100];
const TASK_GROUP_OPTIONS = [
  { label: '每日任务', value: 'daily' },
  { label: '成长任务', value: 'growth' },
];
const TASK_ICON_OPTIONS = ['video', 'calendar', 'share', 'invite', 'pro', 'camera'].map(value => ({ label: value, value }));
const TASK_RESET_OPTIONS = [
  { label: '每日重置', value: 'daily' },
  { label: '仅领取一次', value: 'once' },
];
const TASK_KEY_OPTIONS = [
  { label: '观看广告', value: 'watch_ad' },
  { label: '每日签到', value: 'daily_checkin' },
  { label: '分享作品', value: 'share_work' },
  { label: '邀请好友', value: 'invite_friend' },
  { label: '开通会员', value: 'open_pro' },
  { label: '连续签到 7 天', value: 'checkin_7' },
];

const parseBoolConfig = (value: unknown) => value === true || value === 'true' || value === '1';
const parseNumberConfig = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseRewardPoints = (value: unknown, fallback: number[]) => {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const text = String(value || '').trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
  } catch {
    // 兼容旧页面保存过的英文逗号字符串，重新保存后会变成 JSON 数组。
  }
  const csv = text.split(',').map(item => Number(item.trim())).filter(Number.isFinite);
  return csv.length ? csv : fallback;
};

const rewardRowsFromValue = (value: unknown, fallback: number[]) => (
  parseRewardPoints(value, fallback).map((points) => ({ points: Math.max(0, points) }))
);

const rewardRowsToPoints = (rows: any[]) => (
  (rows || []).map(row => Math.max(0, Number(row?.points || 0))).filter(Number.isFinite)
);

const bonusTypeLabel = (type?: string, points?: number) => {
  if (type === 'double') return '首充双倍';
  if (type === 'fixed') return `首充送${Number(points || 0)}积分`;
  return '无活动';
};

const configsToMap = (configs: ConfigItem[]) => (
  configs.reduce<Record<string, ConfigItem>>((map, item) => {
    map[item.key] = item;
    return map;
  }, {})
);

export default function PointTasks() {
  const [packages, setPackages] = useState<PointPackage[]>([]);
  const [tasks, setTasks] = useState<PointTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PointPackage | null>(null);
  const [editingTask, setEditingTask] = useState<PointTask | null>(null);
  const [packageForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  // 三个配置表单
  const [checkinForm] = Form.useForm();
  const [adsForm] = Form.useForm();
  const [bonusForm] = Form.useForm();
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [adsSaving, setAdsSaving] = useState(false);
  const [bonusSaving, setBonusSaving] = useState(false);

  // ===== 积分套餐 =====
  const fetchPackages = async () => {
    setLoading(true);
    try { const r: any = await api.get('/point-packages'); setPackages(r.data || []); }
    finally { setLoading(false); }
  };

  const fetchTasks = async () => {
    setTaskLoading(true);
    try { const r: any = await api.get('/point-tasks'); setTasks(r.data || []); }
    finally { setTaskLoading(false); }
  };

  useEffect(() => { fetchPackages(); fetchTasks(); }, []);

  const openTaskCreate = () => {
    setEditingTask(null);
    taskForm.resetFields();
    taskForm.setFieldsValue({
      group: 'daily',
      rewardPoints: 10,
      icon: 'calendar',
      actionText: '去完成',
      resetCycle: 'daily',
      status: 'active',
      sortOrder: 0,
    });
    setTaskModalOpen(true);
  };

  const openTaskEdit = (item: PointTask) => {
    setEditingTask(item);
    taskForm.setFieldsValue(item);
    setTaskModalOpen(true);
  };

  const saveTask = async () => {
    try {
      const values = await taskForm.validateFields();
      const body = {
        ...values,
        rewardPoints: Number(values.rewardPoints || 0),
        sortOrder: Number(values.sortOrder || 0),
      };
      if (editingTask) await api.put('/point-tasks/' + editingTask.id, body);
      else await api.post('/point-tasks', body);
      message.success(editingTask ? '任务已保存' : '任务已创建');
      setTaskModalOpen(false);
      fetchTasks();
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.response?.data?.message || '保存失败');
    }
  };

  const toggleTaskStatus = async (item: PointTask) => {
    try {
      const status = item.status === 'active' ? 'disabled' : 'active';
      await api.put('/point-tasks/' + item.id + '/status', { status });
      message.success(status === 'active' ? '已启用' : '已停用');
      fetchTasks();
    } catch { message.error('操作失败'); }
  };

  const deleteTask = async (item: PointTask) => {
    await api.delete('/point-tasks/' + item.id);
    message.success('任务已删除');
    fetchTasks();
  };

  const openPackageCreate = () => {
    setEditingPackage(null);
    packageForm.resetFields();
    packageForm.setFieldsValue({
      points: 100,
      priceYuan: 9.9,
      description: '',
      firstPurchaseBonusType: 'none',
      firstPurchaseBonusPoints: 0,
      enabled: true,
      sortOrder: 0,
    });
    setPackageModalOpen(true);
  };

  const openPackageEdit = (item: PointPackage) => {
    setEditingPackage(item);
    packageForm.setFieldsValue({
      ...item,
      firstPurchaseBonusType: item.firstPurchaseBonusType || 'none',
      firstPurchaseBonusPoints: Number(item.firstPurchaseBonusPoints || 0),
      priceYuan: item.priceYuan ?? Number(item.priceCents || 0) / 100,
    });
    setPackageModalOpen(true);
  };

  const savePackage = async () => {
    try {
      const values = await packageForm.validateFields();
      const body = {
        ...values,
        priceYuan: Number(values.priceYuan || 0),
        firstPurchaseBonusType: values.firstPurchaseBonusType || 'none',
        firstPurchaseBonusPoints: values.firstPurchaseBonusType === 'fixed' ? Number(values.firstPurchaseBonusPoints || 0) : 0,
        enabled: values.enabled !== false,
      };
      if (editingPackage) await api.put('/point-packages/' + editingPackage.id, body);
      else await api.post('/point-packages', body);
      message.success(editingPackage ? '套餐已保存' : '套餐已创建');
      setPackageModalOpen(false);
      fetchPackages();
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.response?.data?.message || '保存失败');
    }
  };

  const togglePackageStatus = async (item: PointPackage) => {
    try {
      await api.put('/point-packages/' + item.id + '/status', { enabled: !item.enabled });
      message.success(item.enabled ? '已停用' : '已启用');
      fetchPackages();
    } catch { message.error('操作失败'); }
  };

  const deletePackage = async (item: PointPackage) => {
    await api.delete('/point-packages/' + item.id);
    message.success('套餐已删除');
    fetchPackages();
  };

  const packageColumns = [
    { title: '套餐名称', dataIndex: 'name', width: 170, render: (v: string) => <EllipsisText value={v} maxWidth={148} strong /> },
    { title: '积分数量', dataIndex: 'points', width: 100 },
    { title: '售价', dataIndex: 'priceCents', width: 90, render: (v: number) => `¥${(Number(v || 0) / 100).toFixed(2)}` },
    { title: '描述', dataIndex: 'description', width: 220, render: (v: string) => <EllipsisText value={v} maxWidth={198} /> },
    {
      title: '营销活动',
      dataIndex: 'firstPurchaseBonusType',
      width: 140,
      render: (v: string, r: PointPackage) => v && v !== 'none'
        ? <Tag color="magenta">{bonusTypeLabel(v, r.firstPurchaseBonusPoints)}</Tag>
        : <Tag>无活动</Tag>,
    },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '状态', dataIndex: 'enabled', width: 70, render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    {
      title: '操作', width: 210,
      render: (_: any, r: PointPackage) => (
        <Space style={nowrapActionStyle}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openPackageEdit(r)}>编辑</Button>
          <Switch checked={r.enabled} onChange={() => togglePackageStatus(r)} checkedChildren="开" unCheckedChildren="关" />
          <Popconfirm title="确认删除此套餐？" onConfirm={() => deletePackage(r)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const taskColumns = [
    { title: '任务标识', dataIndex: 'taskKey', width: 150 },
    { title: '任务名称', dataIndex: 'title', width: 220, render: (v: string) => <EllipsisText value={v} maxWidth={198} strong /> },
    { title: '分组', dataIndex: 'group', width: 90, render: (v: string) => v === 'daily' ? <Tag color="blue">每日</Tag> : <Tag color="purple">成长</Tag> },
    { title: '展示积分', dataIndex: 'rewardPoints', width: 90 },
    { title: '图标', dataIndex: 'icon', width: 90 },
    { title: '按钮文案', dataIndex: 'actionText', width: 130, render: (v: string) => <EllipsisText value={v} maxWidth={108} /> },
    { title: '周期', dataIndex: 'resetCycle', width: 100, render: (v: string) => v === 'once' ? '仅一次' : '每日' },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => v === 'active' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    {
      title: '操作',
      width: 210,
      render: (_: any, r: PointTask) => (
        <Space style={nowrapActionStyle}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openTaskEdit(r)}>编辑</Button>
          <Switch checked={r.status === 'active'} onChange={() => toggleTaskStatus(r)} checkedChildren="开" unCheckedChildren="关" />
          <Popconfirm title="确认删除此任务？已有记录的任务只能停用。" onConfirm={() => deleteTask(r)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ===== 签到和广告配置 =====
  const loadCheckinConfig = async () => {
    try {
      const r: any = await api.get('/settings/signin');
      const configs: ConfigItem[] = r.data || [];
      const map = configsToMap(configs);
      checkinForm.setFieldsValue({
        'signin.enabled': parseBoolConfig(map['signin.enabled']?.value),
        'signin.normal_enabled': parseBoolConfig(map['signin.normal_enabled']?.value ?? true),
        'signin.super_enabled': parseBoolConfig(map['signin.super_enabled']?.value),
        'signin.super_requires_ad': parseBoolConfig(map['signin.super_requires_ad']?.value ?? true),
        normalRewards: rewardRowsFromValue(map['signin.rewards_json']?.value, DEFAULT_NORMAL_REWARDS),
        superRewards: rewardRowsFromValue(map['signin.super_rewards_json']?.value, DEFAULT_SUPER_REWARDS),
        'signin.allow_makeup': parseBoolConfig(map['signin.allow_makeup']?.value),
        'signin.makeup_cost_points': parseNumberConfig(map['signin.makeup_cost_points']?.value, 0),
      });
    } catch {
      // 分组可能为空，正常
    }
  };

  const loadAdsConfig = async () => {
    try {
      const r: any = await api.get('/settings/ads');
      const configs: ConfigItem[] = r.data || [];
      const map = configsToMap(configs);
      adsForm.setFieldsValue({
        'ad.reward.enabled': parseBoolConfig(map['ad.reward.enabled']?.value),
        'ad.reward.points_per_watch': parseNumberConfig(map['ad.reward.points_per_watch']?.value, 10),
        'ad.reward.max_daily_count': parseNumberConfig(map['ad.reward.max_daily_count']?.value, 5),
        'ad.reward.ad_unit_id': map['ad.reward.ad_unit_id']?.value || '',
      });
    } catch {
      // 分组可能为空，正常
    }
  };

  const loadBonusConfig = async () => {
    try {
      const r: any = await api.get('/settings/points');
      const configs: ConfigItem[] = r.data || [];
      const map = configsToMap(configs);
      bonusForm.setFieldsValue({
        'points.new_user_bonus_points': parseNumberConfig(map['points.new_user_bonus_points']?.value, 50),
      });
    } catch {
      bonusForm.setFieldsValue({ 'points.new_user_bonus_points': 50 });
    }
  };

  const saveCheckinConfig = async () => {
    setCheckinSaving(true);
    try {
      const values = await checkinForm.validateFields();
      const normalRewards = rewardRowsToPoints(values.normalRewards);
      const superRewards = rewardRowsToPoints(values.superRewards);
      if (!normalRewards.length || !superRewards.length) {
        message.warning('请至少保留一条普通签到和超级签到奖励');
        return;
      }
      await api.post('/settings/signin', {
        'signin.enabled': values['signin.enabled'] ? 'true' : 'false',
        'signin.normal_enabled': values['signin.normal_enabled'] ? 'true' : 'false',
        'signin.super_enabled': values['signin.super_enabled'] ? 'true' : 'false',
        'signin.super_requires_ad': values['signin.super_requires_ad'] ? 'true' : 'false',
        'signin.rewards_json': JSON.stringify(normalRewards),
        'signin.super_rewards_json': JSON.stringify(superRewards),
        'signin.allow_makeup': values['signin.allow_makeup'] ? 'true' : 'false',
        'signin.makeup_cost_points': String(values['signin.makeup_cost_points'] ?? 0),
      });
      message.success('签到配置已保存');
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验失败，不弹错误
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setCheckinSaving(false);
    }
  };

  const saveAdsConfig = async () => {
    setAdsSaving(true);
    try {
      const values = await adsForm.validateFields();
      await api.post('/settings/ads', {
        'ad.reward.enabled': values['ad.reward.enabled'] ? 'true' : 'false',
        'ad.reward.points_per_watch': String(values['ad.reward.points_per_watch'] ?? 0),
        'ad.reward.max_daily_count': String(values['ad.reward.max_daily_count'] ?? 0),
        'ad.reward.ad_unit_id': values['ad.reward.ad_unit_id'] || '',
      });
      message.success('广告配置已保存');
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setAdsSaving(false);
    }
  };

  const saveBonusConfig = async () => {
    setBonusSaving(true);
    try {
      const values = await bonusForm.validateFields();
      await api.post('/settings/points', {
        'points.new_user_bonus_points': String(values['points.new_user_bonus_points'] ?? 50),
      });
      message.success('新用户奖励已保存');
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setBonusSaving(false);
    }
  };

  const renderRewardRows = (name: string, addText: string) => (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div style={{ maxWidth: 520 }}>
          {fields.map(({ key, name: fieldName, ...rest }, index) => (
            <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }} wrap>
              <span style={{ width: 72 }}>第 {index + 1} 次</span>
              <Form.Item
                {...rest}
                name={[fieldName, 'points']}
                rules={[{ required: true, message: '请输入奖励积分' }]}
              >
                <InputNumber min={0} precision={0} addonAfter="积分" style={{ width: 180 }} />
              </Form.Item>
              <Button type="link" danger disabled={fields.length <= 1} onClick={() => remove(fieldName)}>删除</Button>
            </Space>
          ))}
          <Button type="dashed" onClick={() => add({ points: 0 })}>{addText}</Button>
        </div>
      )}
    </Form.List>
  );

  const renderCheckinConfig = () => (
    <Card extra={<Button type="primary" loading={checkinSaving} onClick={saveCheckinConfig}>保存签到配置</Button>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="签到奖励会保存为后端已支持的 JSON 数组；超级签到广告只校验播放，不发放广告积分，也不占用广告积分次数。"
      />
      <Form form={checkinForm} layout="vertical">
        <Space size="large" wrap>
          <Form.Item name="signin.enabled" label="启用签到系统" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="signin.normal_enabled" label="允许普通签到" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="signin.super_enabled" label="允许超级签到" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="signin.super_requires_ad" label="超级签到需看广告" valuePropName="checked"><Switch checkedChildren="需要" unCheckedChildren="不需要" /></Form.Item>
          <Form.Item name="signin.allow_makeup" label="允许补签" valuePropName="checked"><Switch checkedChildren="允许" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="signin.makeup_cost_points" label="补签消耗积分"><InputNumber min={0} precision={0} style={{ width: 140 }} /></Form.Item>
        </Space>
        <Form.Item label="普通签到奖励" required extra="按连续签到次数依次发放；超过最后一档后继续使用最后一档奖励。">
          {renderRewardRows('normalRewards', '添加普通签到档位')}
        </Form.Item>
        <Form.Item label="超级签到奖励" required extra="按连续超级签到次数依次发放；超过最后一档后继续使用最后一档奖励。">
          {renderRewardRows('superRewards', '添加超级签到档位')}
        </Form.Item>
      </Form>
    </Card>
  );

  const renderAdsConfig = () => (
    <Card extra={<Button type="primary" loading={adsSaving} onClick={saveAdsConfig}>保存广告配置</Button>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前后端广告奖励按“每次观看固定积分 + 每日次数上限”计算；这里的次数只用于看广告得积分，超级签到独立统计。"
      />
      <Form form={adsForm} layout="vertical">
        <Space size="large" wrap>
          <Form.Item name="ad.reward.enabled" label="启用广告积分" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="ad.reward.points_per_watch" label="每次观看奖励积分" rules={[{ required: true, message: '请输入每次观看奖励' }]}>
            <InputNumber min={0} precision={0} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="ad.reward.max_daily_count" label="每日最多奖励次数" rules={[{ required: true, message: '请输入每日次数上限' }]}>
            <InputNumber min={0} precision={0} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="ad.reward.ad_unit_id" label="微信广告位 ID" extra="在微信公众平台申请激励视频广告位后获得；广告积分和超级签到都会用它播放广告。">
            <Input style={{ width: 280 }} />
          </Form.Item>
        </Space>
      </Form>
    </Card>
  );

  const renderBonusConfig = () => (
    <Card extra={<Button type="primary" loading={bonusSaving} onClick={saveBonusConfig}>保存新用户奖励</Button>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="该配置只影响后续首次登录/注册的新用户，已注册用户不会自动补发或扣回。"
      />
      <Form form={bonusForm} layout="vertical">
        <Form.Item
          name="points.new_user_bonus_points"
          label="新用户首次登录赠送积分"
          rules={[{ required: true, message: '请输入赠送积分' }]}
          extra="默认 50。保存后后端注册流程会实时读取该值。"
        >
          <InputNumber min={0} max={1000000} precision={0} addonAfter="积分" style={{ width: 220 }} />
        </Form.Item>
      </Form>
    </Card>
  );

  return (
    <div>
      <h2><GiftOutlined /> 积分管理</h2>

      <Tabs
        destroyInactiveTabPane={false}
        items={[
          {
            key: 'tasks',
            label: '积分任务',
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="这里配置小程序任务中心展示项；按钮只跳转到对应页面，积分由签到、广告、邀请和会员等原业务发放。"
                />
                <Card style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<GiftOutlined />} onClick={openTaskCreate}>新增任务</Button>
                </Card>
                <Table rowKey="id" columns={taskColumns} dataSource={tasks} loading={taskLoading} pagination={false} tableLayout="fixed" scroll={{ x: 1300 }} />
              </>
            ),
          },
          {
            key: 'packages',
            label: '积分套餐',
            children: (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<ShoppingOutlined />} onClick={openPackageCreate}>新增套餐</Button>
                </Card>
                <Table rowKey="id" columns={packageColumns} dataSource={packages} loading={loading} pagination={false} tableLayout="fixed" scroll={{ x: 1180 }} />
              </>
            ),
          },
          {
            key: 'checkin',
            label: '签到配置',
            children: renderCheckinConfig(),
          },
          {
            key: 'bonus',
            label: '新用户奖励',
            children: renderBonusConfig(),
          },
          {
            key: 'ads',
            label: '广告配置',
            children: renderAdsConfig(),
          },
        ]}
        onChange={(key) => {
          if (key === 'checkin') loadCheckinConfig();
          else if (key === 'bonus') loadBonusConfig();
          else if (key === 'ads') loadAdsConfig();
        }}
      />

      <Modal title={editingTask ? '编辑积分任务' : '新增积分任务'} open={taskModalOpen} onCancel={() => setTaskModalOpen(false)} onOk={saveTask} destroyOnClose>
        <Form form={taskForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="taskKey" label="任务标识" rules={[{ required: true, message: '请选择任务标识' }]}>
            <Select options={TASK_KEY_OPTIONS} disabled={!!editingTask} />
          </Form.Item>
          <Form.Item name="title" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input maxLength={64} placeholder="每日签到（0/1）" />
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle" wrap>
            <Form.Item name="group" label="任务分组" rules={[{ required: true, message: '请选择任务分组' }]}>
              <Select options={TASK_GROUP_OPTIONS} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="rewardPoints" label="展示积分" rules={[{ required: true, message: '请输入展示积分' }]}>
              <InputNumber min={0} precision={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="icon" label="图标">
              <Select options={TASK_ICON_OPTIONS} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle" wrap>
            <Form.Item name="actionText" label="按钮文案" rules={[{ required: true, message: '请输入按钮文案' }]}>
              <Input maxLength={16} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="resetCycle" label="周期" rules={[{ required: true, message: '请选择周期' }]}>
              <Select options={TASK_RESET_OPTIONS} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'disabled' }]} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} precision={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal title={editingPackage ? '编辑积分套餐' : '新增积分套餐'} open={packageModalOpen} onCancel={() => setPackageModalOpen(false)} onOk={savePackage} destroyOnClose>
        <Form form={packageForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请输入套餐名称' }]}>
            <Input placeholder="新手包" />
          </Form.Item>
          <Form.Item name="points" label="积分数量" rules={[{ required: true, message: '请输入积分数量' }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priceYuan" label="售价" rules={[{ required: true, message: '请输入售价' }]}>
            <InputNumber min={0} precision={2} addonBefore="¥" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="套餐描述" extra="最多 10 个字，用于小程序套餐介绍。" rules={[{ max: 10, message: '套餐描述最多 10 个字' }]}>
            <Input maxLength={10} placeholder="热门选择" />
          </Form.Item>
          <Form.Item
            name="firstPurchaseBonusType"
            label="营销活动"
            extra="首充按用户首次支付成功并完成积分发放的积分订单判断；活动二选一，不叠加。"
            rules={[{ required: true, message: '请选择营销活动' }]}
          >
            <Select
              options={[
                { label: '无活动', value: 'none' },
                { label: '首充双倍', value: 'double' },
                { label: '首充送固定积分', value: 'fixed' },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.firstPurchaseBonusType !== cur.firstPurchaseBonusType} noStyle>
            {({ getFieldValue }) => (
              getFieldValue('firstPurchaseBonusType') === 'fixed' ? (
                <Form.Item
                  name="firstPurchaseBonusPoints"
                  label="首充赠送积分"
                  rules={[{ required: true, message: '请输入首充赠送积分' }]}
                >
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            )}
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="enabled" label="上架销售" valuePropName="checked">
              <Switch checkedChildren="上架" unCheckedChildren="下架" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
