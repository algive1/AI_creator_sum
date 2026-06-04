import { useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../services/api';

export default function TemplateCategories() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetch = () => { setLoading(true); api.get('/content/template-categories').then((r: any) => setData(r.data || [])).finally(() => setLoading(false)); };
  useEffect(() => { fetch(); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ sortOrder: 0, status: 'active' }); setModalOpen(true); };
  const openEdit = (r: any) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const save = async () => { try { setSaving(true); const v = await form.validateFields(); if (editing) await api.put('/content/template-categories/' + editing.id, v); else await api.post('/content/template-categories', v); message.success(editing ? '已保存' : '已创建'); setModalOpen(false); fetch(); } catch (e: any) { if (e?.errorFields) return; } finally { setSaving(false); } };
  const toggleStatus = async (r: any) => { await api.put('/content/template-categories/' + r.id, { status: r.status === 'active' ? 'inactive' : 'active' }); message.success(r.status === 'active' ? '已停用' : '已启用'); fetch(); };
  const del = async (id: number) => { try { await api.delete('/content/template-categories/' + id); message.success('已删除'); fetch(); } catch { message.error('删除失败'); } };

  const cols = [
    { title: '分类名称', dataIndex: 'name', width: 150 },
    { title: '标识', dataIndex: 'categoryKey', width: 130, render: (v: string) => <code>{v}</code> },
    { title: '图标', dataIndex: 'icon', width: 100, render: (v: string) => v || '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 200, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
        <Switch checked={r.status === 'active'} onChange={() => toggleStatus(r)} checkedChildren="开" unCheckedChildren="关" />
        <Popconfirm title="确认删除？" onConfirm={() => del(r.id)}><Button size="small" danger>删除</Button></Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <h2>模板分类</h2>
      <p style={{ color: '#888', marginBottom: 12 }}>管理小程序模板广场的分类标签，如"电商主图""海报""详情页"等。小程序通过接口拉取展示。</p>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 12 }}>新增分类</Button>
      <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="middle" pagination={false} />
      <Modal title={editing ? '编辑分类' : '新增分类'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={save} confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true }]}><Input placeholder="电商主图" /></Form.Item>
          <Form.Item name="categoryKey" label="分类标识" rules={[{ required: true }]} extra="唯一英文标识，创建后不建议修改。"><Input disabled={!!editing} placeholder="ecommerce" /></Form.Item>
          <Form.Item name="icon" label="图标" extra="可选，emoji或图标名。"><Input /></Form.Item>
          <Form.Item name="sortOrder" label="排序"><InputNumber min={0} /></Form.Item>
          {editing && <Form.Item name="status" label="状态"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>}
        </Form>
      </Modal>
    </div>
  );
}
