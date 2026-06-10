import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Form, InputNumber, Modal, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText, TimeText } from '../utils/tableCells';

const { Text } = Typography;

interface InviteRelation {
  id: number;
  inviterUserId: number;
  inviterNickname: string;
  inviteeUserId: number;
  inviteeNicknameMasked: string;
  inviteCode: string;
  status: string;
  source: string;
  createdAt: string;
  boundAt: string | null;
  invalidReason: string;
}

interface InviteReward {
  id: number;
  inviterUserId: number;
  inviterNickname: string;
  inviteeUserId: number;
  inviteeNicknameMasked: string;
  rewardType: string;
  points: number;
  status: string;
  reason: string;
  relatedOrderId: string;
  createdAt: string;
  grantedAt: string | null;
}

interface ConfigItem {
  key: string;
  value: string;
  isSecret: boolean;
}

const rewardTypeLabels: Record<string, string> = {
  use: '好友使用小程序',
  member_purchase: '好友开通会员',
};

const relationStatusLabels: Record<string, string> = {
  valid: '有效',
  invalid: '已失效',
};

const rewardStatusLabels: Record<string, string> = {
  granted: '已发放',
  skipped: '已跳过',
  failed: '发放失败',
  pending: '待发放',
};

const sourceLabels: Record<string, string> = {
  weapp_qrcode: '小程序码',
  share_link: '分享链接',
  wechat_share: '微信分享',
  manual: '手动绑定',
};

const statusColors: Record<string, string> = {
  granted: 'green',
  skipped: 'gold',
  failed: 'red',
  valid: 'blue',
  invalid: 'red',
};

export default function Invite() {
  const [configItems, setConfigItems] = useState<ConfigItem[]>([]);
  const [relations, setRelations] = useState<InviteRelation[]>([]);
  const [rewardLogs, setRewardLogs] = useState<InviteReward[]>([]);
  const [relationLoading, setRelationLoading] = useState(false);
  const [rewardLoading, setRewardLoading] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configForm] = Form.useForm();
  const [relationPagination, setRelationPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [rewardPagination, setRewardPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const configMap = useMemo(() => {
    return configItems.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
  }, [configItems]);

  const fetchConfig = useCallback(async () => {
    try {
      const res: any = await api.get('/settings/invite');
      setConfigItems((res.data || []).map((row: any) => ({
        key: row.key,
        value: row.isSecret ? row.maskedValue || '' : String(row.value ?? ''),
        isSecret: !!row.isSecret,
      })));
    } catch {
      setConfigItems([]);
    }
  }, []);

  const fetchRelations = useCallback(async (page = 1) => {
    setRelationLoading(true);
    try {
      const res: any = await api.get('/invite/relations', { params: { page, pageSize: relationPagination.pageSize } });
      setRelations(res.data?.list || []);
      setRelationPagination(prev => ({
        ...prev,
        current: page,
        total: res.data?.pagination?.total || 0,
      }));
    } catch {
      setRelations([]);
    } finally {
      setRelationLoading(false);
    }
  }, [relationPagination.pageSize]);

  const fetchRewardLogs = useCallback(async (page = 1) => {
    setRewardLoading(true);
    try {
      const res: any = await api.get('/invite/reward-logs', { params: { page, pageSize: rewardPagination.pageSize } });
      setRewardLogs(res.data?.list || []);
      setRewardPagination(prev => ({
        ...prev,
        current: page,
        total: res.data?.pagination?.total || 0,
      }));
    } catch {
      setRewardLogs([]);
    } finally {
      setRewardLoading(false);
    }
  }, [rewardPagination.pageSize]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchConfig(), fetchRelations(1), fetchRewardLogs(1)]);
  }, [fetchConfig, fetchRelations, fetchRewardLogs]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const relationColumns = [
    { title: '邀请人', dataIndex: 'inviterNickname', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '被邀请人', dataIndex: 'inviteeNicknameMasked', width: 140, render: (v: string) => <EllipsisText value={v} maxWidth={118} /> },
    { title: '邀请码', dataIndex: 'inviteCode', width: 120, render: (v: string) => <Text code>{v}</Text> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v] || 'default'}>{relationStatusLabels[v] || v}</Tag> },
    { title: '来源', dataIndex: 'source', width: 110, render: (v: string) => sourceLabels[v] || v },
    { title: '绑定时间', dataIndex: 'boundAt', width: 170, render: (v: string) => v ? <TimeText value={v} /> : '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => <TimeText value={v} /> },
    { title: '失效原因', dataIndex: 'invalidReason', width: 220, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={198} /> },
  ];

  const rewardColumns = [
    { title: '邀请人', dataIndex: 'inviterNickname', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '被邀请人', dataIndex: 'inviteeNicknameMasked', width: 140, render: (v: string) => <EllipsisText value={v} maxWidth={118} /> },
    { title: '奖励类型', dataIndex: 'rewardType', width: 130, render: (v: string) => <Tag color="blue">{rewardTypeLabels[v] || v}</Tag> },
    { title: '积分', dataIndex: 'points', width: 90, render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>+{v}</span> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v] || 'default'}>{rewardStatusLabels[v] || v}</Tag> },
    { title: '原因', dataIndex: 'reason', width: 220, render: (v: string) => <EllipsisText value={v} maxWidth={198} /> },
    { title: '关联订单', dataIndex: 'relatedOrderId', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '奖励时间', dataIndex: 'grantedAt', width: 170, render: (v: string) => v ? <TimeText value={v} /> : '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => <TimeText value={v} /> },
  ];

  const tabs = [
    {
      key: 'relations',
      label: '邀请关系',
      children: (
        <Table
          rowKey="id"
          columns={relationColumns}
          dataSource={relations}
          loading={relationLoading}
          size="middle"
          pagination={{
            current: relationPagination.current,
            pageSize: relationPagination.pageSize,
            total: relationPagination.total,
            onChange: (page) => fetchRelations(page),
          }}
          tableLayout="fixed"
          scroll={{ x: 1290 }}
        />
      ),
    },
    {
      key: 'rewards',
      label: '奖励记录',
      children: (
        <Table
          rowKey="id"
          columns={rewardColumns}
          dataSource={rewardLogs}
          loading={rewardLoading}
          size="middle"
          pagination={{
            current: rewardPagination.current,
            pageSize: rewardPagination.pageSize,
            total: rewardPagination.total,
            onChange: (page) => fetchRewardLogs(page),
          }}
          tableLayout="fixed"
          scroll={{ x: 1390 }}
        />
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="start" wrap>
        <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
        <Button type="primary" icon={<EditOutlined />} onClick={() => {
          configForm.setFieldsValue({
            'invite.enabled': configMap['invite.enabled'] === 'true',
            'invite.reward_on_use_enabled': configMap['invite.reward_on_use_enabled'] === 'true',
            'invite.reward_on_use_points': Number(configMap['invite.reward_on_use_points'] || 20),
            'invite.reward_on_member_enabled': configMap['invite.reward_on_member_enabled'] === 'true',
            'invite.reward_on_member_points': Number(configMap['invite.reward_on_member_points'] || 100),
            'invite.max_reward_per_day': Number(configMap['invite.max_reward_per_day'] || 20),
          });
          setConfigModalOpen(true);
        }}>编辑配置</Button>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="邀请功能">{configMap['invite.enabled'] === 'true' ? <Tag color="green">开启</Tag> : <Tag color="default">关闭</Tag>}</Descriptions.Item>
          <Descriptions.Item label="好友使用奖励">{configMap['invite.reward_on_use_enabled'] === 'true' ? <Tag color="green">开启</Tag> : <Tag color="default">关闭</Tag>}</Descriptions.Item>
          <Descriptions.Item label="好友使用积分">{configMap['invite.reward_on_use_points'] ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="会员奖励开关">{configMap['invite.reward_on_member_enabled'] === 'true' ? <Tag color="green">开启</Tag> : <Tag color="default">关闭</Tag>}</Descriptions.Item>
          <Descriptions.Item label="会员奖励积分">{configMap['invite.reward_on_member_points'] ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="每日上限">{configMap['invite.max_reward_per_day'] ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal title="编辑邀请配置" open={configModalOpen} onCancel={() => setConfigModalOpen(false)}
        onOk={async () => {
          setConfigSaving(true);
          try {
            const values = await configForm.validateFields();
            const payload: Record<string, string> = {};
            for (const [k, v] of Object.entries(values)) {
              payload[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '');
            }
            await api.post('/settings/invite', payload);
            message.success('配置已保存');
            setConfigModalOpen(false);
            fetchConfig();
          } catch (e: any) {
            if (!e?.errorFields) message.error('保存失败');
          } finally { setConfigSaving(false); }
        }}
        confirmLoading={configSaving}
      >
        <Form form={configForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="invite.enabled" label="启用邀请功能" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="invite.reward_on_use_enabled" label="好友绑定后奖励积分" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="invite.reward_on_use_points" label="绑定奖励积分数"><InputNumber min={0} style={{ width: 160 }} /></Form.Item>
          <Form.Item name="invite.reward_on_member_enabled" label="好友购买会员后奖励积分" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          <Form.Item name="invite.reward_on_member_points" label="购买会员奖励积分数"><InputNumber min={0} style={{ width: 160 }} /></Form.Item>
          <Form.Item name="invite.max_reward_per_day" label="每日最多奖励次数" extra="限制邀请人每天最多获得几次邀请积分。"><InputNumber min={0} style={{ width: 160 }} /></Form.Item>
        </Form>
      </Modal>

      <Card size="small">
        <Tabs items={tabs} />
      </Card>
    </div>
  );
}
