import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Empty, Modal, Progress, Row, Space, Table, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, ExperimentOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const { Text, Paragraph } = Typography;

type ItemStatus = 'not_configured' | 'filled_untested' | 'failed' | 'passed' | 'risk' | 'manual_verified';

interface CheckItem {
  key: string;
  name: string;
  status: ItemStatus;
  summary: string;
  missingFields: string[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
  guide: string;
  configurePath?: string;
  testable?: boolean;
}

const statusMeta: Record<ItemStatus, { label: string; color: string }> = {
  not_configured: { label: '未配置', color: 'red' },
  filled_untested: { label: '已填写未测试', color: 'blue' },
  failed: { label: '配置错误', color: 'red' },
  passed: { label: '测试通过', color: 'green' },
  risk: { label: '存在风险', color: 'orange' },
  manual_verified: { label: '人工确认', color: 'cyan' },
};

function renderList(items: string[]) {
  if (!items?.length) return <Text type="secondary">无</Text>;
  return (
    <Space direction="vertical" size={2}>
      {items.map((item, index) => <Text key={`${item}-${index}`}>{item}</Text>)}
    </Space>
  );
}

export default function LaunchCheck() {
  const [loading, setLoading] = useState(false);
  const [testingKey, setTestingKey] = useState('');
  const [readiness, setReadiness] = useState(0);
  const [items, setItems] = useState<CheckItem[]>([]);
  const navigate = useNavigate();

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/config-check/overview');
      setReadiness(res.data?.readiness || 0);
      setItems(res.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOverview(); }, []);

  const counts = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const manualVerify = async (item: CheckItem) => {
    await api.post('/config-check/manual-verify', { targetKey: item.key, targetType: 'config' });
    message.success('已标记为人工确认');
    fetchOverview();
  };

  const runStorageTest = async () => {
    setTestingKey('storage');
    try {
      await api.post('/config-check/storage/test-connection');
      const upload: any = await api.post('/config-check/storage/test-upload');
      message.success(upload.data?.message || '对象存储测试通过');
      fetchOverview();
    } finally {
      setTestingKey('');
    }
  };

  const runAiTest = (kind: 'image' | 'video') => {
    Modal.confirm({
      title: '本次测试可能消耗接口额度，是否继续？',
      content: kind === 'image'
        ? '将调用一个已配置的生图模型生成测试图片。'
        : '将调用一个已配置的生视频模型生成测试视频。',
      okText: '继续测试',
      cancelText: '取消',
      onOk: async () => {
        setTestingKey(kind === 'image' ? 'ai-image-models' : 'ai-video-models');
        try {
          const modelsRes: any = await api.get('/real-models');
          const model = (modelsRes.data || []).find((m: any) => m.modelType === (kind === 'image' ? 'image' : 'video') && m.status === 'active');
          if (!model) {
            message.warning(kind === 'image' ? '没有启用的生图模型' : '没有启用的生视频模型');
            return;
          }
          await api.post(`/config-check/ai-models/test-${kind}`, { modelId: model.id, confirmRealCost: true });
          message.success('AI 模型测试已返回成功');
          fetchOverview();
        } finally {
          setTestingKey('');
        }
      },
    });
  };

  const runTest = (item: CheckItem) => {
    if (item.key === 'storage') return runStorageTest();
    if (item.key === 'ai-image-models') return runAiTest('image');
    if (item.key === 'ai-video-models') return runAiTest('video');
    if (item.key === 'wechat-pay') {
      message.info('微信支付本阶段只做配置检测，不创建真实订单、不扣款。');
      return fetchOverview();
    }
    return fetchOverview();
  };

  const columns = [
    {
      title: '配置项',
      dataIndex: 'name',
      width: 180,
      render: (value: string, item: CheckItem) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{item.guide}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: ItemStatus) => <Tag color={statusMeta[status]?.color}>{statusMeta[status]?.label || status}</Tag>,
    },
    { title: '当前情况', dataIndex: 'summary', width: 220 },
    { title: '缺少字段', dataIndex: 'missingFields', width: 180, render: renderList },
    { title: '风险 / 错误', width: 240, render: (_: any, item: CheckItem) => renderList([...(item.errors || []), ...(item.warnings || [])]) },
    { title: '下一步', dataIndex: 'nextSteps', width: 240, render: renderList },
    {
      title: '操作',
      width: 210,
      render: (_: any, item: CheckItem) => (
        <Space wrap>
          {item.configurePath && <Button size="small" onClick={() => navigate(item.configurePath!)}>去配置</Button>}
          {item.testable && <Button size="small" icon={<ExperimentOutlined />} loading={testingKey === item.key} onClick={() => runTest(item)}>测试</Button>}
          {['ai-image-models', 'ai-video-models'].includes(item.key) && <Button size="small" onClick={() => manualVerify(item)}>人工确认</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}><SafetyCertificateOutlined /> 上线配置检查</h2>
          <Text type="secondary">把上线前必须准备的微信、支付、存储、模型、积分和更新配置集中检查清楚。</Text>
        </div>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={fetchOverview}>重新检查</Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Progress type="dashboard" percent={readiness} strokeColor={readiness >= 80 ? '#10b981' : readiness >= 50 ? '#f59e0b' : '#ef4444'} />
            <Paragraph style={{ marginBottom: 0, textAlign: 'center' }}>上线准备度</Paragraph>
          </Card>
        </Col>
        <Col span={16}>
          <Card>
            <Descriptions column={3} size="small">
              <Descriptions.Item label="测试通过">{counts.passed || 0}</Descriptions.Item>
              <Descriptions.Item label="人工确认">{counts.manual_verified || 0}</Descriptions.Item>
              <Descriptions.Item label="已填写未测试">{counts.filled_untested || 0}</Descriptions.Item>
              <Descriptions.Item label="存在风险">{counts.risk || 0}</Descriptions.Item>
              <Descriptions.Item label="配置错误">{counts.failed || 0}</Descriptions.Item>
              <Descriptions.Item label="未配置">{counts.not_configured || 0}</Descriptions.Item>
            </Descriptions>
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="配置保存不强制测试；上线前请完成测试或人工确认。AI 生图、生视频测试可能消耗额度，必须手动确认。"
            />
          </Card>
        </Col>
      </Row>

      <Card title={<Space><CheckCircleOutlined /> 检查清单</Space>}>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无检查结果" /> }}
          scroll={{ x: 1450 }}
        />
      </Card>
    </div>
  );
}
