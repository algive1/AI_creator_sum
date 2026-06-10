import { useCallback, useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Image, Select, Space, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import api from '../services/api';
import { EllipsisText, TimeText } from '../utils/tableCells';

const STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  queued: 'blue',
  processing: 'processing',
  completed: 'green',
  failed: 'red',
  cancelled: 'orange',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  queued: '排队中',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export default function Tasks() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [status, setStatus] = useState<string>();
  const [taskType, setTaskType] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const fetch = useCallback((page = 1) => {
    setLoading(true);
    api.get('/tasks', { params: { page, pageSize: 20, status, taskType } }).then((r: any) => {
      setData(r.data.list);
      setPagination({ current: page, pageSize: 20, total: r.data.pagination.total });
    }).finally(() => setLoading(false));
  }, [status, taskType]);

  const openDetail = async (taskId: number) => {
    const res: any = await api.get(`/tasks/${taskId}`);
    setDetail(res.data);
    setDetailOpen(true);
  };

  useEffect(() => { fetch(); }, [fetch]);

  const columns = [
    { title: '任务号', dataIndex: 'taskNo', width: 190, render: (v: string) => <EllipsisText value={v} maxWidth={168} code /> },
    { title: '用户', dataIndex: 'userNickname', width: 120, render: (v: string) => <EllipsisText value={v} maxWidth={98} /> },
    { title: '类型', dataIndex: 'taskType', width: 90, render: (v: string) => ({ image: '生图', video: '生视频', manga: '漫剧', storyboard: '故事板' }[v] || v) },
    { title: '标题', dataIndex: 'title', width: 260, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
    { title: '档位', dataIndex: 'tierName', width: 120, render: (v: string) => v || '-' },
    { title: '真实模型', dataIndex: 'modelName', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '积分', dataIndex: 'pointsCost', width: 80 },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '进度', dataIndex: 'progress', width: 80, render: (v: number) => `${v || 0}%` },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (v: string) => <TimeText value={v} /> },
    { title: '操作', width: 90, render: (_: any, row: any) => <Button size="small" onClick={() => openDetail(row.taskId)}>详情</Button> },
  ];

  return (
    <div>
      <h2>任务管理</h2>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="任务类型" allowClear style={{ width: 150 }} onChange={setTaskType} options={[
          { value: 'image', label: '生图' },
          { value: 'video', label: '生视频' },
        ]} />
        <Select placeholder="状态筛选" allowClear style={{ width: 150 }} onChange={setStatus} options={[
          { value: 'pending', label: '待处理' },
          { value: 'queued', label: '排队中' },
          { value: 'processing', label: '生成中' },
          { value: 'completed', label: '已完成' },
          { value: 'failed', label: '失败' },
          { value: 'cancelled', label: '已取消' },
        ]} />
      </Space>
      <Table rowKey="taskId" columns={columns} dataSource={data} loading={loading} pagination={pagination} tableLayout="fixed" scroll={{ x: 1500 }} onChange={(p: any) => fetch(p.current)} />
      <TaskDetailDrawer open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />
    </div>
  );
}

function TaskDetailDrawer({ open, detail, onClose }: { open: boolean; detail: any; onClose: () => void }) {
  const task = detail?.task;
  const input = detail?.input;
  const outputs = detail?.outputs || [];
  const logs = detail?.logs || [];
  const callLogs = detail?.callLogs || [];
  const pointLogs = detail?.pointLogs || [];
  const pointStatus = detail?.pointStatus;

  return (
    <Drawer title="任务详情" open={open} onClose={onClose} width={860}>
      {!task ? null : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="任务号">{task.task_no}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_COLORS[task.status]}>{STATUS_LABELS[task.status] || task.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="用户">{task.nickname} #{task.user_id}</Descriptions.Item>
            <Descriptions.Item label="任务类型">{({ image: '生图', video: '生视频', manga: '漫剧', storyboard: '故事板' } as Record<string, string>)[task.task_type] || task.task_type}</Descriptions.Item>
            <Descriptions.Item label="档位">{task.tier_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="真实模型">{task.actual_model_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="供应商">{task.provider_name || '-'}</Descriptions.Item>
            {task.task_type === 'video' && (
              <>
                <Descriptions.Item label="视频模式">{task.video_mode || task.sub_type || '-'}</Descriptions.Item>
                <Descriptions.Item label="上游任务 ID">
                  <Typography.Text copyable>{task.provider_task_id || '-'}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="供应商状态">{task.provider_status || '-'}</Descriptions.Item>
                <Descriptions.Item label="查询次数">{task.poll_count || 0}</Descriptions.Item>
                <Descriptions.Item label="最近查询">{task.last_polled_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="下次查询">{task.next_poll_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="提交供应商">{task.provider_started_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="视频参数">{`${task.video_ratio || '-'} / ${task.video_duration || '-'}s`}</Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="积分">{task.points_cost}，已退 {task.points_refunded}</Descriptions.Item>
            <Descriptions.Item label="积分状态">
              {pointStatus ? <Tag color={pointStatus.color}>{pointStatus.label}</Tag> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{task.created_at}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{task.completed_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="失败原因" span={2}>{task.fail_reason || '-'}</Descriptions.Item>
            {task.task_type === 'video' && (
              <Descriptions.Item label="供应商说明" span={2}>{task.provider_status_message || '-'}</Descriptions.Item>
            )}
          </Descriptions>

          <Tabs items={[
            {
              key: 'input',
              label: '输入',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Typography.Text strong>Prompt</Typography.Text>
                  <Typography.Paragraph copyable>{input?.prompt || '-'}</Typography.Paragraph>
                  {task.task_type === 'video' && (
                    <>
                      <Typography.Text strong>视频追踪</Typography.Text>
                      <Typography.Paragraph copyable>{`videoMode: ${parseMaybeJson(input?.params).videoMode || task.sub_type || '-'}\nproviderTaskId: ${task.provider_task_id || '-'}`}</Typography.Paragraph>
                    </>
                  )}
                  <Typography.Text strong>参数</Typography.Text>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(parseMaybeJson(input?.params), null, 2)}</pre>
                </Space>
              ),
            },
            {
              key: 'outputs',
              label: '输出结果',
              children: outputs.length ? (
                <Space wrap>
                  {outputs.map((item: any) => {
                    const meta = parseMaybeJson(item.metadata);
                    const url = meta.deliveryUrl || item.cdn_url || item.cos_key;
                    if (item.output_type === 'video') {
                      return (
                        <Space key={item.id} direction="vertical" style={{ width: 260 }}>
                          <video src={url} controls style={{ width: 260, maxHeight: 180, background: '#000' }} />
                          <Typography.Link href={url} target="_blank" copyable>{item.output_name || '视频结果'}</Typography.Link>
                          <Typography.Text type="secondary">
                            {item.file_no || '-'} {item.mime_type || ''} {item.file_size ? `${Math.round(item.file_size / 1024 / 1024)}MB` : ''}
                          </Typography.Text>
                        </Space>
                      );
                    }
                    return <Image key={item.id} width={180} src={url} alt={item.output_name} />;
                  })}
                </Space>
              ) : <Typography.Text type="secondary">暂无输出</Typography.Text>,
            },
            {
              key: 'calls',
              label: '模型调用',
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={callLogs}
                  columns={[
                    { title: '类型', dataIndex: 'call_type', width: 90 },
                    { title: '模型', dataIndex: 'model_name', width: 180, render: (v: string) => <EllipsisText value={v} maxWidth={158} /> },
                    { title: '供应商', dataIndex: 'provider_name', width: 140, render: (v: string) => <EllipsisText value={v} maxWidth={118} /> },
                    { title: '结果', dataIndex: 'is_success', width: 80, render: (v: number) => v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
                    { title: '耗时', dataIndex: 'latency_ms', width: 90, render: (v: number) => `${v || 0}ms` },
                    { title: '错误摘要', dataIndex: 'error_message', width: 260, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
                  ]}
                  tableLayout="fixed"
                  scroll={{ x: 900 }}
                />
              ),
            },
            {
              key: 'points',
              label: '积分流水',
              children: (
                <Table
                  size="small"
                  rowKey={(row: any) => `${row.ref_type}-${row.created_at}`}
                  pagination={false}
                  dataSource={pointLogs}
                  columns={[
                    { title: '类型', dataIndex: 'type', width: 90 },
                    { title: '金额', dataIndex: 'amount', width: 90 },
                    { title: '余额变化', width: 160, render: (_: any, row: any) => `${row.balance_before} -> ${row.balance_after}` },
                    { title: '冻结变化', width: 160, render: (_: any, row: any) => `${row.frozen_before} -> ${row.frozen_after}` },
                    { title: '说明', dataIndex: 'title', width: 260, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
                    { title: '时间', dataIndex: 'created_at', width: 180, render: (v: string) => <TimeText value={v} /> },
                  ]}
                  tableLayout="fixed"
                  scroll={{ x: 920 }}
                />
              ),
            },
            {
              key: 'logs',
              label: '任务日志',
              children: (
                <Timeline items={logs.map((log: any) => ({
                  children: <span><Tag>{log.event}</Tag>{log.message}<br /><Typography.Text type="secondary">{log.created_at}</Typography.Text></span>,
                }))} />
              ),
            },
          ]} />
        </Space>
      )}
    </Drawer>
  );
}

function parseMaybeJson(value: any) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
