import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Col, Collapse, Descriptions, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { BarChartOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined, ExclamationCircleOutlined, ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const { Text } = Typography;

const FEATURE_LABELS: Record<string, string> = {
  image_create: '文生图', image_to_image: '图生图', image_edit: '图片编辑',
  video_create: '文生视频', image_to_video: '图生视频',
  first_last_frame_video: '首尾帧视频', video_edit: '视频编辑',
  prompt_optimize: '提示词优化',
};

type FeatureStatus = 'ok' | 'partial' | 'none';

interface FeatureCheck {
  key: string;
  label: string;
  status: FeatureStatus;
  detail: string;
  link: string;
}

export default function ModelOverview() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('month');
  const [features, setFeatures] = useState<FeatureCheck[]>([]);
  const [checkLoading, setCheckLoading] = useState(true);
  const nav = useNavigate();

  // Cost data
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/models/cost-summary', { params: { range } });
      setData(r.data || []);
    } catch {
      setData([]);
      message.error('获取模型成本统计失败');
    }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { fetch(); }, [fetch]);

  // Feature readiness check
  const checkFeatures = async () => {
    setCheckLoading(true);
    try {
      const [featRes, tierRes, modelRes] = await Promise.all([
        api.get('/model-features'),
        api.get('/model-tiers'),
        api.get('/real-models'),
      ]);
      const featList: any[] = featRes.data || [];
      const tiers: any[] = tierRes.data || [];
      const models: any[] = modelRes.data || [];
      const modelMap = new Map(models.map((model: any) => [model.id, model]));

      const checks: FeatureCheck[] = featList.map((f: any) => {
        const ft = f.featureKey;
        const label = FEATURE_LABELS[ft] || f.featureName || ft;
        const myTiers = tiers.filter((t: any) => t.featureKey === ft && t.status === 'active');
        const hasTier = myTiers.length > 0;
        const boundTiers = myTiers.filter((t: any) => (t.bindings || []).length > 0);
        const hasModel = models.some((m: any) => m.status === 'active' && m.modelType === (ft.includes('video') ? 'video' : 'image'));
        const hasProvider = models.some((m: any) => m.status === 'active');
        const unavailableBoundCount = myTiers.flatMap((t: any) => t.bindings || []).filter((binding: any) => {
          const model = modelMap.get(binding.modelId);
          return !model || model.status !== 'active' || model.lastTestStatus === 'failed';
        }).length;

        let status: FeatureStatus;
        let detail: string;
        let link: string;

        if (!hasProvider) {
          status = 'none'; detail = '未添加任何供应商，请先添加供应商和 API Key'; link = '/ai-models/providers';
        } else if (!hasModel) {
          status = 'none'; detail = '没有可用的模型，请先添加供应商和模型'; link = '/ai-models/providers';
        } else if (!hasTier) {
          status = 'partial'; detail = '有模型但未创建档位，请前往功能页配置建档位'; link = '/ai-models/features';
        } else if (boundTiers.length === 0) {
          status = 'partial'; detail = `已有 ${myTiers.length} 个档位但未绑定模型，请绑定`; link = '/ai-models/features';
        } else if (unavailableBoundCount > 0) {
          status = 'partial'; detail = `已绑定模型中有 ${unavailableBoundCount} 个停用或异常，请检查功能页配置`; link = '/ai-models/features';
        } else {
          status = 'ok';
          const names = boundTiers.map((t: any) => t.tierName).join(' / ');
          detail = `${boundTiers.length} 个档位已就绪：${names}`;
          link = '/ai-models/features';
        }

        return { key: ft, label, status, detail, link };
      });

      setFeatures(checks);
    } catch {
      setFeatures([]);
      message.error('获取模型总览检查数据失败');
    } finally { setCheckLoading(false); }
  };
  useEffect(() => { checkFeatures(); }, []);

  const okCount = features.filter(f => f.status === 'ok').length;
  const partialCount = features.filter(f => f.status === 'partial').length;
  const noneCount = features.filter(f => f.status === 'none').length;

  const statusMeta: Record<FeatureStatus, { color: string; icon: React.ReactNode; text: string }> = {
    ok: { color: 'green', icon: <CheckCircleOutlined />, text: '已就绪' },
    partial: { color: 'orange', icon: <ExclamationCircleOutlined />, text: '待完善' },
    none: { color: 'red', icon: <CloseCircleOutlined />, text: '未配置' },
  };

  const totalCalls = data.reduce((s: number, i: any) => s + (i.callCount || 0), 0);
  const totalCost = data.reduce((s: number, i: any) => s + (i.totalCostYuan || 0), 0);
  const totalRevenue = data.reduce((s: number, i: any) => s + (i.totalPoints || 0), 0);
  const avgSuccess = data.length > 0
    ? Math.round(data.reduce((s: number, i: any) => s + (i.successRate || 0), 0) / data.length)
    : 0;

  const costCols = [
    { title: '模型', dataIndex: 'modelName', width: 160 },
    { title: '供应商', dataIndex: 'providerName', width: 120 },
    { title: '调用次数', dataIndex: 'callCount', width: 100 },
    { title: '成功次数', dataIndex: 'successCount', width: 100, render: (v: number) => <span style={{ color: '#3f8600' }}>{v || 0}</span> },
    { title: '失败次数', dataIndex: 'failCount', width: 100, render: (v: number) => <span style={{ color: '#cf1322' }}>{v || 0}</span> },
    { title: '成功率', dataIndex: 'successRate', width: 90, render: (v: number) => <Tag color={v >= 95 ? 'green' : v >= 80 ? 'orange' : 'red'}>{(v || 0).toFixed(1)}%</Tag> },
    { title: '总成本', dataIndex: 'totalCostYuan', width: 100, render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '总收入/积分', dataIndex: 'totalPoints', width: 120, render: (v: number) => <strong>{v || 0}</strong> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">AI模型管理 / </Text>
        <Text strong>模型总览</Text>
      </div>
      <h2><BarChartOutlined /> 模型总览</h2>

      {/* ===== 配置引导 ===== */}
      <Collapse
        ghost
        style={{ marginBottom: 16 }}
        items={[{
          key: 'guide',
          label: <Space><InfoCircleOutlined style={{ color: '#6366f1' }} /><Text strong>不知道怎么配置？点击查看操作步骤</Text></Space>,
          children: (
            <Card size="small" style={{ background: '#fafafa' }}>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label={<Tag color="blue">步骤 1</Tag>}>
                  <Text strong>添加供应商和 API Key</Text>
                  <br /><Text type="secondary">进入「供应商与模型」→ 点击预设供应商卡片（如巴格格AI/小马AI/OpenAI）→ 填入 API Key → 保存。模型会自动出现在下方列表。</Text>
                  <br /><a onClick={() => nav('/ai-models/providers')}>去添加供应商 →</a>
                </Descriptions.Item>
                <Descriptions.Item label={<Tag color="blue">步骤 2</Tag>}>
                  <Text strong>创建功能档位</Text>
                  <br /><Text type="secondary">进入「功能页配置」→ 切换到对应功能（如文生图）→ 点击「新增档位」→ 填写档位名称、积分价格、画质倍率定价 → 保存。</Text>
                  <br /><a onClick={() => nav('/ai-models/features')}>去功能页配置 →</a>
                </Descriptions.Item>
                <Descriptions.Item label={<Tag color="blue">步骤 3</Tag>}>
                  <Text strong>绑定模型到档位</Text>
                  <br /><Text type="secondary">在功能页配置中 → 点击档位旁的「绑定」按钮 → 勾选要使用的模型（第一个为主模型，其余为备用）→ 保存。</Text>
                  <br /><a onClick={() => nav('/ai-models/features')}>去功能页配置 →</a>
                </Descriptions.Item>
                <Descriptions.Item label={<Tag color="blue">步骤 4</Tag>}>
                  <Text strong>验证</Text>
                  <br /><Text type="secondary">在「模型测试」页面选择模型和提示词，点击测试 → 查看是否能正常返回图片/视频链接。测试成功说明配置正确。</Text>
                  <br /><a onClick={() => nav('/ai-models/test')}>去模型测试 →</a>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ),
        }]}
      />

      {/* ===== 功能就绪状态 ===== */}
      <Card
        size="small"
        title={<Space><CheckCircleOutlined />功能就绪状态</Space>}
        loading={checkLoading}
        style={{ marginBottom: 16 }}
        extra={
          <Space size={4}>
            <Tag color="green">{okCount} 就绪</Tag>
            {partialCount > 0 && <Tag color="orange">{partialCount} 待完善</Tag>}
            {noneCount > 0 && <Tag color="red">{noneCount} 未配置</Tag>}
          </Space>
        }
      >
        {noneCount > 0 && (
          <Alert
            type="warning" showIcon
            style={{ marginBottom: 8 }}
            message="还未配置供应商和模型，小程序创作功能无法使用。请按上方步骤完成配置。"
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {features.map(f => {
            const m = statusMeta[f.status];
            return (
              <Card
                key={f.key}
                size="small"
                hoverable
                onClick={() => nav(f.link)}
                style={{ width: 280, borderLeft: `3px solid ${m.color}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={4}>
                    <span style={{ color: m.color }}>{m.icon}</span>
                    <Text strong>{f.label}</Text>
                  </Space>
                  <Tag color={m.color}>{m.text}</Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>{f.detail}</Text>
              </Card>
            );
          })}
        </div>
      </Card>

      {/* ===== 成本统计 ===== */}
      <Select value={range} onChange={setRange} style={{ width: 120, marginBottom: 16 }}
        options={[{ label: '本月', value: 'month' }, { label: '本周', value: 'week' }, { label: '今日', value: 'today' }, { label: '全部', value: 'all' }]} />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="总调用次数" value={totalCalls} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="总成本" value={`¥${totalCost.toFixed(2)}`} prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="总收入/积分" value={totalRevenue} prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="平均成功率" value={`${avgSuccess}%`} prefix={avgSuccess >= 90 ? <CheckCircleOutlined /> : <CloseCircleOutlined />} valueStyle={{ color: avgSuccess >= 90 ? '#3f8600' : '#cf1322' }} /></Card></Col>
      </Row>

      <Table rowKey="modelName" columns={costCols} dataSource={data} loading={loading} size="middle" pagination={false} />
    </div>
  );
}
