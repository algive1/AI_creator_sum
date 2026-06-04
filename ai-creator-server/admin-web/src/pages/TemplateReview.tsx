import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, message } from 'antd';

const REJECT_REASONS = ['违规内容', '政治敏感', '色情低俗', '侵权内容', '低质内容', '其他'];
import api from '../services/api';

export default function TemplateReview() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: number; reason: string; custom: string } | null>(null);

  const fetch = () => { setLoading(true); api.get('/content/template-reviews').then((r: any) => setData(r.data?.list || r.data || [])).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const approve = (id: number) => {
    Modal.confirm({ title: '确认通过？', onOk: () => { api.post('/content/templates/' + id + '/approve').then(() => { message.success('已通过'); fetch(); }); }});
  };
  const confirmReject = async () => {
    if (!rejectModal) return;
    const reason = rejectModal.reason === '其他' ? rejectModal.custom.trim() : rejectModal.reason;
    if (!reason) { message.warning('请输入拒绝原因'); return; }
    await api.post('/content/templates/' + rejectModal.id + '/reject', { reason });
    message.success('已拒绝'); setRejectModal(null); fetch();
  };

  const cols = [
    { title: '模板名称', dataIndex: 'title', width: 160 },
    { title: '类型', dataIndex: 'templateType', width: 80, render: (v: string) => v === 'video' ? '视频' : '图片' },
    { title: '提示词', dataIndex: 'prompt', ellipsis: true },
    { title: '用户', dataIndex: 'nickname', width: 100 },
    { title: '提交时间', dataIndex: 'createdAt', width: 170 },
    { title: '操作', width: 180, render: (_: any, r: any) => (
      <Space>
        <Button size="small" type="primary" onClick={() => approve(r.id)}>通过</Button>
        <Button size="small" danger onClick={() => setRejectModal({ id: r.id, reason: '违规内容', custom: '' })}>拒绝</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <h2>模板审核</h2>
      <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="middle" pagination={{ pageSize: 20 }} />
      <Modal title="审核拒绝" open={!!rejectModal} onOk={confirmReject} onCancel={() => setRejectModal(null)} destroyOnClose>
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>拒绝原因：</div>
          <Select value={rejectModal?.reason} onChange={(v) => setRejectModal(p => p ? { ...p, reason: v } : null)} style={{ width: '100%', marginBottom: 8 }}
            options={REJECT_REASONS.map(r => ({ label: r, value: r }))} />
          {rejectModal?.reason === '其他' && <Input.TextArea placeholder="请输入具体原因" value={rejectModal?.custom} onChange={e => setRejectModal(p => p ? { ...p, custom: e.target.value } : null)} rows={2} />}
        </div>
      </Modal>
    </div>
  );
}
