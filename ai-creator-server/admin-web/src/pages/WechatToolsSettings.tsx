import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import FeatureConfig from './FeatureConfig';

const { Text, Title } = Typography;

type ToolKey =
  | 'prompt_reverse'
  | 'grid_cut'
  | 'image_compress'
  | 'watermark'
  | 'compare'
  | 'cutout'
  | 'resize'
  | 'phone_frame';

interface ToolItem {
  key: ToolKey;
  title: string;
  description: string;
  icon: string;
  category: 'ai' | 'image';
  enabled: boolean;
  memberDailyQuota: number;
  guestDailyQuota: number;
  adUnlockEnabled: boolean;
  pointsEnabled: boolean;
  pointsCost: number;
  message: string;
  featureKey?: string;
  modelBound?: boolean;
}

interface ToolsAdminConfig {
  enabled: boolean;
  bannerAdUnitId: string;
  visibleKeys: ToolKey[];
  tools: ToolItem[];
  hiddenTools: ToolItem[];
}

const emptyConfig: ToolsAdminConfig = {
  enabled: true,
  bannerAdUnitId: '',
  visibleKeys: [],
  tools: [],
  hiddenTools: [],
};

const toPayload = (config: ToolsAdminConfig) => ({
  enabled: config.enabled,
  bannerAdUnitId: config.bannerAdUnitId,
  visibleKeys: config.tools.map((item) => item.key),
  tools: [...config.tools, ...config.hiddenTools].map((item) => ({
    key: item.key,
    enabled: item.enabled,
    memberDailyQuota: item.memberDailyQuota,
    guestDailyQuota: item.guestDailyQuota,
    adUnlockEnabled: item.adUnlockEnabled,
    pointsEnabled: item.pointsEnabled,
    pointsCost: item.pointsCost,
    message: item.message,
  })),
});

export default function WechatToolsSettings() {
  const [config, setConfig] = useState<ToolsAdminConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const allTools = useMemo(() => [...config.tools, ...config.hiddenTools], [config]);
  const enabledCount = config.tools.filter((item) => item.enabled).length;
  const billableCount = config.tools.filter((item) => item.pointsEnabled && item.pointsCost > 0).length;

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/tools/config');
      setConfig(res.data || emptyConfig);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const patchConfig = (updater: (draft: ToolsAdminConfig) => ToolsAdminConfig) => {
    setConfig((prev) => updater({
      enabled: prev.enabled,
      bannerAdUnitId: prev.bannerAdUnitId,
      visibleKeys: [...prev.visibleKeys],
      tools: prev.tools.map((item) => ({ ...item })),
      hiddenTools: prev.hiddenTools.map((item) => ({ ...item })),
    }));
    setDirty(true);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res: any = await api.put('/tools/config', toPayload(config));
      setConfig(res.data || emptyConfig);
      setDirty(false);
      message.success('工具页配置已保存');
    } finally {
      setSaving(false);
    }
  };

  const updateTool = (key: ToolKey, patch: Partial<ToolItem>) => {
    patchConfig((draft) => ({
      ...draft,
      tools: draft.tools.map((item) => item.key === key ? { ...item, ...patch } : item),
      hiddenTools: draft.hiddenTools.map((item) => item.key === key ? { ...item, ...patch } : item),
    }));
  };

  const moveTool = (index: number, direction: -1 | 1) => {
    patchConfig((draft) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.tools.length) return draft;
      const nextTools = [...draft.tools];
      [nextTools[index], nextTools[nextIndex]] = [nextTools[nextIndex], nextTools[index]];
      return { ...draft, tools: nextTools, visibleKeys: nextTools.map((item) => item.key) };
    });
  };

  const removeTool = (tool: ToolItem) => {
    Modal.confirm({
      title: `移出「${tool.title}」？`,
      content: '本次操作只会暂存到当前页面，点击右上角“保存配置”后才会生效。移出后小程序工具页不再显示该入口，用户直接访问运行页也会被拦截；历史次数、日志、提示文案和模型绑定都会保留。',
      okText: '暂存移出',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        patchConfig((draft) => {
          const nextTools = draft.tools.filter((item) => item.key !== tool.key);
          const existsHidden = draft.hiddenTools.some((item) => item.key === tool.key);
          return {
            ...draft,
            tools: nextTools,
            hiddenTools: existsHidden ? draft.hiddenTools : [...draft.hiddenTools, tool],
            visibleKeys: nextTools.map((item) => item.key),
          };
        });
        message.info('已暂存，请点击右上角“保存配置”后生效');
      },
    });
  };

  const addTool = (tool: ToolItem) => {
    patchConfig((draft) => {
      const nextTool = { ...tool, enabled: true };
      const nextTools = [...draft.tools, nextTool];
      return {
        ...draft,
        tools: nextTools,
        hiddenTools: draft.hiddenTools.filter((item) => item.key !== tool.key),
        visibleKeys: nextTools.map((item) => item.key),
      };
    });
  };

  const toggleGlobal = (enabled: boolean) => {
    if (enabled) {
      patchConfig((draft) => ({ ...draft, enabled: true }));
      return;
    }
    Modal.confirm({
      title: '关闭工具页总开关？',
      content: '本次操作只会暂存到当前页面，点击右上角“保存配置”后才会生效。关闭后小程序工具页会进入维护状态，所有工具入口和直接访问运行页都会不可用；底部导航是否显示仍由底部导航配置控制。',
      okText: '暂存关闭',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        patchConfig((draft) => ({ ...draft, enabled: false }));
        message.info('已暂存，请点击右上角“保存配置”后生效');
      },
    });
  };

  const columns: ColumnsType<ToolItem> = [
    {
      title: '排序',
      width: 92,
      render: (_value, _record, index) => (
        <Space size={4}>
          <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveTool(index, -1)} />
          <Button size="small" icon={<ArrowDownOutlined />} disabled={index === config.tools.length - 1} onClick={() => moveTool(index, 1)} />
        </Space>
      ),
    },
    {
      title: '工具',
      dataIndex: 'title',
      width: 190,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Space>
            <Text strong>{record.title}</Text>
            <Tag color={record.category === 'ai' ? 'purple' : 'blue'}>{record.category === 'ai' ? 'AI' : '图片'}</Tag>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
        </Space>
      ),
    },
    {
      title: '启用',
      width: 78,
      render: (_value, record) => (
        <Switch checked={record.enabled} checkedChildren="开" unCheckedChildren="关" onChange={(value) => updateTool(record.key, { enabled: value })} />
      ),
    },
    {
      title: '免费次数',
      width: 210,
      render: (_value, record) => (
        <Space direction="vertical" size={6}>
          <Space>
            <Text type="secondary">会员</Text>
            <InputNumber min={0} precision={0} value={record.memberDailyQuota} onChange={(value) => updateTool(record.key, { memberDailyQuota: Number(value || 0) })} />
          </Space>
          <Space>
            <Text type="secondary">非会员</Text>
            <InputNumber min={0} precision={0} value={record.guestDailyQuota} onChange={(value) => updateTool(record.key, { guestDailyQuota: Number(value || 0) })} />
          </Space>
        </Space>
      ),
    },
    {
      title: '解锁/积分',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={8}>
          <Space>
            <Text type="secondary">广告</Text>
            <Switch checked={record.adUnlockEnabled} checkedChildren="开" unCheckedChildren="关" onChange={(value) => updateTool(record.key, { adUnlockEnabled: value })} />
          </Space>
          <Space>
            <Text type="secondary">积分收费</Text>
            <Switch checked={record.pointsEnabled} checkedChildren="开" unCheckedChildren="关" onChange={(value) => updateTool(record.key, { pointsEnabled: value })} />
          </Space>
          <InputNumber
            min={0}
            precision={0}
            addonAfter="积分"
            value={record.pointsCost}
            disabled={!record.pointsEnabled}
            onChange={(value) => updateTool(record.key, { pointsCost: Number(value || 0) })}
          />
        </Space>
      ),
    },
    {
      title: '模型',
      width: 118,
      render: (_value, record) => record.featureKey ? (
        <Tag color={record.modelBound ? 'success' : 'warning'}>{record.modelBound ? '已绑定' : '未绑定'}</Tag>
      ) : <Text type="secondary">无需绑定</Text>,
    },
    {
      title: '关闭提示',
      dataIndex: 'message',
      width: 260,
      render: (_value, record) => (
        <Input.TextArea
          rows={2}
          maxLength={80}
          value={record.message}
          onChange={(event) => updateTool(record.key, { message: event.target.value })}
        />
      ),
    },
    {
      title: '操作',
      width: 92,
      fixed: 'right',
      render: (_value, record) => (
        <Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeTool(record)}>移出</Button>
      ),
    },
  ];

  return (
    <div style={{ background: '#f5f7fb', margin: -24, padding: 24, minHeight: 'calc(100vh - 112px)' }}>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">微信配置 / </Text>
        <Text strong>工具页配置</Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>工具页配置</Title>
          <Text type="secondary">管理小程序工具箱内置工具的展示集合、排序、额度、广告解锁、积分收费和模型绑定</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadConfig}>刷新</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={saveConfig}>保存配置</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8 }}
        message="工具页只管理 8 个内置工具，不接管底部导航，也不开放标题、说明、图标和运行逻辑编辑。"
        description="移出工具仅从 tools.visible_keys 删除，历史次数、日志、提示文案、积分收费配置和模型绑定都会保留；重新添加时会追加到工具箱末尾并默认启用。"
      />

      <Row gutter={16} align="top">
        <Col xs={24} xl={18}>
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <div style={{ padding: 18, borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Space>
                <ToolOutlined />
                <Text strong>工具箱功能</Text>
                {dirty && <Tag color="orange">有未保存修改</Tag>}
              </Space>
              <Space>
                <Text type="secondary">总开关</Text>
                <Switch checked={config.enabled} checkedChildren="开" unCheckedChildren="关" onChange={toggleGlobal} />
              </Space>
            </div>
            <div style={{ padding: 18, borderBottom: '1px solid #eef2f7' }}>
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <Text strong>工具页横幅广告位 ID</Text>
                <Input
                  allowClear
                  value={config.bannerAdUnitId}
                  placeholder="未配置时小程序工具页不展示横幅广告"
                  onChange={(event) => patchConfig((draft) => ({ ...draft, bannerAdUnitId: event.target.value.trim() }))}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>仅用于工具执行页底部横幅广告，不影响非会员看广告解锁使用的激励视频广告位。</Text>
              </Space>
            </div>
            <Table
              rowKey="key"
              columns={columns}
              dataSource={config.tools}
              loading={loading}
              pagination={false}
              scroll={{ x: 1260 }}
              locale={{ emptyText: <Empty description="工具箱内暂无工具，请从右侧重新添加" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} xl={6}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card title="当前状态" style={{ borderRadius: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>总开关：<Tag color={config.enabled ? 'success' : 'error'}>{config.enabled ? '开启' : '关闭'}</Tag></Text>
                <Text>工具箱内：<Text strong>{config.tools.length}</Text> 个</Text>
                <Text>已启用：<Text strong>{enabledCount}</Text> 个</Text>
                <Text>积分收费：<Text strong>{billableCount}</Text> 个</Text>
                <Text>已移出：<Text strong>{config.hiddenTools.length}</Text> 个</Text>
              </Space>
            </Card>

            <Card title="添加已移出工具" style={{ borderRadius: 8 }}>
              {!config.hiddenTools.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有已移出的工具" />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {config.hiddenTools.map((tool) => (
                    <Button key={tool.key} block icon={<PlusOutlined />} onClick={() => addTool(tool)}>
                      添加 {tool.title}
                    </Button>
                  ))}
                </Space>
              )}
            </Card>

            <Card title="配置键" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={6}>
                <Text code>tools.visible_keys</Text>
                <Text code>tools.*.points_enabled</Text>
                <Text code>tools.*.points_cost</Text>
                <Text type="secondary">当前可见顺序：{config.tools.map((item) => item.key).join(' / ') || '空'}</Text>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      <Card title="工具模型绑定" style={{ borderRadius: 8, marginTop: 16 }} bodyStyle={{ padding: 18 }}>
        <FeatureConfig scope="tools" embedded />
      </Card>

      <div style={{ display: 'none' }}>{allTools.length}</div>
    </div>
  );
}
