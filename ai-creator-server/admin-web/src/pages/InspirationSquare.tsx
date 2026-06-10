import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Image, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { BulbOutlined, DeleteOutlined, EditOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText, nowrapActionStyle } from '../utils/tableCells';

const POSITIONS = [
  { key: 'inspiration', label: '灵感广场' },
];

export default function InspirationSquare() {
  const [data, setData] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDisplayConfig, setBatchDisplayConfig] = useState<Record<string, any>>({});
  const [batchSaving, setBatchSaving] = useState(false);

  const [inspPagination, setInspPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<Array<string | number>>([]);
  const fetch = (page = 1) => { setLoading(true); setSelectedRowKeys([]); api.get('/templates', { params: { type: 'inspiration', page, pageSize: 20 } }).then((r: any) => { const d = r.data?.list || r.data || []; setData(Array.isArray(d) ? d : []); setInspPagination(p => ({ ...p, current: page, total: r.data?.pagination?.total || 0 })); }).finally(() => setLoading(false)); };
  const fetchCats = () => { api.get('/content/template-categories').then((r: any) => setCats(r.data || [])); };
  useEffect(() => { fetch(); fetchCats(); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ sortOrder: 0, status: 'active', displayMode: 'card' }); setModalOpen(true); };
  const openEdit = (item: any) => { setEditing(item); form.setFieldsValue({ title: item.title || item.name, prompt: item.prompt, coverUrl: item.coverUrl, categoryId: item.categoryId, displayMode: item.displayMode || 'card', sortOrder: item.sortOrder || 0, isRecommended: item.isRecommended || false, status: item.status || 'active' }); setModalOpen(true); };

  const save = async () => { try { setSaving(true); const v = await form.validateFields(); const body = { ...v, templateType: 'inspiration', displayConfig: { inspiration: { pinned: v.isRecommended, pinOrder: v.isRecommended ? v.sortOrder : 0 } } }; if (editing) await api.put('/templates/' + editing.id, body); else await api.post('/templates', body); message.success(editing ? '已保存' : '已创建'); setModalOpen(false); fetch(); } catch (e: any) { if (e?.errorFields) return; } finally { setSaving(false); } };
  const toggleStatus = async (r: any) => { const s = r.status === 'active' ? 'inactive' : 'active'; await api.put('/templates/' + r.id, { status: s }); message.success(s === 'active' ? '已启用' : '已停用'); fetch(); };
  const del = async (id: number) => { try { await api.delete('/templates/' + id); message.success('已删除'); fetch(); } catch { message.error('删除失败'); } };
  const batchDelete = async () => { try { await api.delete('/templates/batch', { data: { ids: selectedRowKeys } }); message.success(`已删除 ${selectedRowKeys.length} 个内容`); fetch(inspPagination.current); } catch { message.error('批量删除失败'); } };
  const toggleBatchDisplay = (k: string) => { setBatchDisplayConfig(p => p[k] ? (() => { const c = { ...p }; delete c[k]; return c; })() : { ...p, [k]: { pinned: false, pinOrder: 0 } }); };
  const toggleBatchPin = (k: string) => { setBatchDisplayConfig(p => { if (!p[k]) return p; return { ...p, [k]: { ...p[k], pinned: !p[k].pinned, pinOrder: p[k].pinned ? 0 : 1 } }; }); };
  const openBatchDisplay = () => { setBatchDisplayConfig({ inspiration: { pinned: false, pinOrder: 0 } }); setBatchModalOpen(true); };
  const saveBatchDisplay = async () => {
    if (!Object.keys(batchDisplayConfig).length) {
      message.warning('请选择至少一个展示位置');
      return;
    }
    try {
      setBatchSaving(true);
      const result: any = await api.put('/templates/batch/display-config', { ids: selectedRowKeys, displayConfig: batchDisplayConfig });
      message.success(`已更新 ${result?.data?.count || selectedRowKeys.length} 个内容的展示位置`);
      setBatchModalOpen(false);
      fetch(inspPagination.current);
    } catch (e: any) {
      message.error(e?.message || '批量设置展示位置失败');
    } finally {
      setBatchSaving(false);
    }
  };

  const cols = [
    { title: '封面', width: 70, render: (_: any, r: any) => r.coverUrl ? <Image src={r.coverUrl} width={48} height={48} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} /> : <div style={{ width: 48, height: 48, borderRadius: 4, background: '#f0f0f0' }} /> },
    { title: '名称', dataIndex: 'title', width: 190, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={168} strong /> },
    { title: '分类', dataIndex: 'categoryId', width: 100, render: (v: number) => { const c = cats.find(x => x.id === v); return c ? <Tag color="cyan">{c.name}</Tag> : '-'; }},
    { title: '展示模式', dataIndex: 'displayMode', width: 90, render: (v: string) => <Tag color={v === 'card' ? 'blue' : 'green'}>{v === 'card' ? '卡片' : '纯文本'}</Tag> },
    { title: '提示词', dataIndex: 'prompt', ellipsis: true, width: 280, render: (v: string) => <EllipsisText value={v} maxWidth={258} /> },
    { title: '引用', dataIndex: 'usageCount', width: 60 },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 210, render: (_: any, r: any) => (<Space size={4} style={nowrapActionStyle}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button><Switch checked={r.status === 'active'} onChange={() => toggleStatus(r)} checkedChildren="开" unCheckedChildren="关" /><Popconfirm title="确认删除？" onConfirm={() => del(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>)},
  ];

  return (
    <div><h2><BulbOutlined /> 灵感广场</h2>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增内容</Button>
        <Popconfirm title={`确认删除选中的 ${selectedRowKeys.length} 个内容？`} onConfirm={batchDelete} disabled={!selectedRowKeys.length}>
          <Button danger icon={<DeleteOutlined />} disabled={!selectedRowKeys.length}>批量删除</Button>
        </Popconfirm>
        <Button icon={<PushpinOutlined />} disabled={!selectedRowKeys.length} onClick={openBatchDisplay}>批量展示位置</Button>
      </Space>
      <Table rowKey="id" rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as Array<string | number>) }} columns={cols} dataSource={data} loading={loading} size="middle" pagination={inspPagination} tableLayout="fixed" scroll={{ x: 1180 }} onChange={(p: any) => fetch(p.current)} />
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
      <Modal title="批量设置展示位置" open={batchModalOpen} onCancel={() => setBatchModalOpen(false)} onOk={saveBatchDisplay} confirmLoading={batchSaving} destroyOnClose>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert type="info" showIcon message={`将覆盖已选 ${selectedRowKeys.length} 个内容当前展示位置，影响小程序灵感页露出位置；不会删除内容。`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {POSITIONS.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Checkbox checked={!!batchDisplayConfig[p.key]} onChange={() => toggleBatchDisplay(p.key)}>{p.label}</Checkbox>
                {batchDisplayConfig[p.key] && <><Checkbox checked={!!batchDisplayConfig[p.key].pinned} onChange={() => toggleBatchPin(p.key)} style={{ marginLeft: 16 }}>置顶</Checkbox>{batchDisplayConfig[p.key].pinned && <span style={{ fontSize: 12, color: '#999' }}>顺序 {batchDisplayConfig[p.key].pinOrder}</span>}</>}
              </div>
            ))}
          </div>
        </Space>
      </Modal>
    </div>
  );
}
