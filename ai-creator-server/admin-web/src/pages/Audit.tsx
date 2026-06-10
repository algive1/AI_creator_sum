import { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Space, Button, Modal, Input, message, Image, Select } from 'antd';
import api from '../services/api';
import { EllipsisText, TimeText, nowrapActionStyle } from '../utils/tableCells';

const REJECT_REASONS = ['违规内容', '政治敏感', '色情低俗', '暴力恐怖', '侵权内容', '低质生成', '其他'];

export default function Audit() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [rejectModal, setRejectModal] = useState<{ taskId: number; reason: string; customReason: string } | null>(null);

  const fetch = useCallback((page = 1) => {
    setLoading(true);
    api.get('/audits', { params: { page, pageSize: 20 } }).then((r: any) => {
      setData(r.data.list); setPagination(prev => ({ ...prev, current: page, total: r.data.pagination.total }));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handlePass = (taskId: number) => {
    Modal.confirm({ title: '确认通过？', onOk: () => {
      api.post('/audits/' + taskId + '/action', { action: 'pass' }).then(() => { message.success('已通过'); fetch(pagination.current); });
    }});
  };

  const openReject = (taskId: number) => {
    setRejectModal({ taskId, reason: '违规内容', customReason: '' });
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    const finalReason = rejectModal.reason === '其他' ? rejectModal.customReason.trim() : rejectModal.reason;
    if (!finalReason) { message.warning('请输入拒绝原因'); return; }
    await api.post('/audits/' + rejectModal.taskId + '/action', { action: 'reject', reason: finalReason });
    message.success('已拒绝');
    setRejectModal(null);
    fetch(pagination.current);
  };

  const riskColors: Record<string, string> = { high: 'red', medium: 'orange', low: 'green' };

  const columns = [
    { title: '任务ID', dataIndex: 'task_id', width: 80 },
    { title: '输出预览', width: 80, render: (_: any, r: any) => {
      const url = r.thumbnail_url || r.cdn_url;
      return url ? <Image src={url} width={48} height={48} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <span style={{ color: '#999' }}>无</span>;
    }},
    { title: '用户', dataIndex: 'nickname', width: 120 },
    { title: '风险等级', dataIndex: 'risk_level', width: 100, render: (v: string) => <Tag color={riskColors[v]}>{v === 'high' ? '高' : v === 'medium' ? '中' : '低'}</Tag> },
    { title: '风险标签', dataIndex: 'risk_label', width: 160, render: (v: string) => <EllipsisText value={v} maxWidth={138} /> },
    { title: '标题', dataIndex: 'title', width: 260, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
    { title: '时间', dataIndex: 'created_at', width: 180, render: (v: string) => <TimeText value={v} /> },
    { title: '操作', width: 150, render: (_: any, r: any) => (
      <Space style={nowrapActionStyle}><Button size="small" type="primary" onClick={() => handlePass(r.task_id)}>通过</Button><Button size="small" danger onClick={() => openReject(r.task_id)}>拒绝</Button></Space>
    )},
  ];

  return (
    <div><h2>内容审核</h2>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={pagination} tableLayout="fixed" scroll={{ x: 1320 }} onChange={(p: any) => fetch(p.current)} />

      <Modal title="审核拒绝" open={!!rejectModal} onOk={confirmReject} onCancel={() => setRejectModal(null)} destroyOnClose>
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>拒绝原因：</div>
          <Select
            value={rejectModal?.reason}
            onChange={(v) => setRejectModal(prev => prev ? { ...prev, reason: v } : null)}
            style={{ width: '100%', marginBottom: 8 }}
            options={REJECT_REASONS.map(r => ({ label: r, value: r }))}
          />
          {rejectModal?.reason === '其他' && (
            <Input.TextArea
              placeholder="请输入具体原因"
              value={rejectModal?.customReason}
              onChange={(e) => setRejectModal(prev => prev ? { ...prev, customReason: e.target.value } : null)}
              rows={2}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
