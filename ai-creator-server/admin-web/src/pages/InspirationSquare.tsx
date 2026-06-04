import { useEffect, useState } from 'react';
import { Button, Form, Image, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { BulbOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../services/api';

export default function InspirationSquare() {
  const [data, setData] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [inspPagination, setInspPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const fetch = (page = 1) => { setLoading(true); api.get('/templates', { params: { type: 'inspiration', page, pageSize: 20 } }).then((r: any) => { const d = r.data?.list || r.data || []; setData(Array.isArray(d) ? d : []); setInspPagination(p => ({ ...p, current: page, total: r.data?.pagination?.total || 0 })); }).finally(() => setLoading(false)); };
  const fetchCats = () => { api.get('/content/template-categories').then((r: any) => setCats(r.data || [])); };
  useEffect(() => { fetch(); fetchCats(); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ sortOrder: 0, status: 'active', displayMode: 'card' }); setModalOpen(true); };
  const openEdit = (item: any) => { setEditing(item); form.setFieldsValue({ title: item.title || item.name, prompt: item.prompt, coverUrl: item.coverUrl, categoryId: item.categoryId, displayMode: item.displayMode || 'card', sortOrder: item.sortOrder || 0, isRecommended: item.isRecommended || false, status: item.status || 'active' }); setModalOpen(true); };

  const save = async () => { try { setSaving(true); const v = await form.validateFields(); const body = { ...v, templateType: 'inspiration', displayConfig: { inspiration: { pinned: v.isRecommended, pinOrder: v.isRecommended ? v.sortOrder : 0 } } }; if (editing) await api.put('/templates/' + editing.id, body); else await api.post('/templates', body); message.success(editing ? '已保存' : '已创建'); setModalOpen(false); fetch(); } catch (e: any) { if (e?.errorFields) return; } finally { setSaving(false); } };
  const toggleStatus = async (r: any) => { const s = r.status === 'active' ? 'inactive' : 'active'; await api.put('/templates/' + r.id, { status: s }); message.success(s === 'active' ? '已启用' : '已停用'); fetch(); };
  const del = async (id: number) => { try { await api.delete('/templates/' + id); message.success('已删除'); fetch(); } catch { message.error('删除失败'); } };

  const cols = [
    { title: '封面', width: 70, render: (_: any, r: any) => r.coverUrl ? <Image src={r.coverUrl} width={48} height={48} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} /> : <div style={{ width: 48, height: 48, borderRadius: 4, background: '#f0f0f0' }} /> },
    { title: '名称', dataIndex: 'title', width: 150, ellipsis: true },
    { title: '分类', dataIndex: 'categoryId', width: 100, render: (v: number) => { const c = cats.find(x => x.id === v); return c ? <Tag color="cyan">{c.name}</Tag> : '-'; }},
    { title: '展示模式', dataIndex: 'displayMode', width: 90, render: (v: string) => <Tag color={v === 'card' ? 'blue' : 'green'}>{v === 'card' ? '卡片' : '纯文本'}</Tag> },
    { title: '提示词', dataIndex: 'prompt', ellipsis: true, width: 200 },
    { title: '引用', dataIndex: 'usageCount', width: 60 },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 200, render: (_: any, r: any) => (<Space size={4}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button><Switch checked={r.status === 'active'} onChange={() => toggleStatus(r)} checkedChildren="开" unCheckedChildren="关" /><Popconfirm title="确认删除？" onConfirm={() => del(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>)},
  ];

  return (
    <div><h2><BulbOutlined /> 灵感广场</h2>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 12 }}>新增内容</Button>
      <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="middle" pagination={inspPagination} onChange={(p: any) => fetch(p.current)} />
      <Modal title={editing ? '编辑内容' : '新增内容'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={save} confirmLoading={saving} width={560} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true }]} extra="用户可复制学习或直接使用。"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="coverUrl" label="封面图片 URL" extra="纯文本模式可不填。"><Input /></Form.Item>
          <Form.Item name="categoryId" label="分类"><Select allowClear options={cats.map((c: any) => ({ label: c.name, value: c.id }))} /></Form.Item>
          <Form.Item name="displayMode" label="展示模式" extra="卡片模式需封面图。纯文本只展示提示词。"><Select options={[{ label: '卡片', value: 'card' }, { label: '纯文本', value: 'text' }]} /></Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="sortOrder" label="排序"><InputNumber min={0} style={{ width: 80 }} /></Form.Item>
            <Form.Item name="isRecommended" label="推荐" valuePropName="checked"><Switch /></Form.Item>
            {editing && <Form.Item name="status" label="状态"><Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 100 }} /></Form.Item>}
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
