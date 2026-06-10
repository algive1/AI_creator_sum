import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Image, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Upload, message } from 'antd';
import { BulbOutlined, DeleteOutlined, EditOutlined, PlusOutlined, PushpinOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../services/api';
import { TEMPLATE_USAGE_SHORT } from '../utils/adminLabels';
import { EllipsisText, nowrapActionStyle } from '../utils/tableCells';

const VIDEO_USAGE_OPTIONS = [
  { label: '文生视频 — 从文字描述生成视频', value: 'generate' },
  { label: '图生视频 — 上传参考图/帧，生成视频', value: 'reference' },
  { label: '首尾帧视频 — 上传首帧和尾帧生成视频', value: 'first_last_frame' },
  { label: '视频编辑 — 基于已有视频进行编辑', value: 'video_edit' },
];

const POSITIONS = [
  { key: 'text_to_video', label: '文生视频' }, { key: 'image_to_video', label: '图生视频' },
  { key: 'first_last_frame_video', label: '首尾帧视频' }, { key: 'video_edit', label: '视频编辑' },
  { key: 'inspiration', label: '灵感广场' },
];
const USAGE_TARGET_FEATURES: Record<string, string> = {
  generate: 'text_to_video',
  reference: 'image_to_video',
  first_last_frame: 'first_last_frame_video',
  video_edit: 'video_edit',
};
const VIDEO_USAGE_SHORT: Record<string, string> = {
  generate: '文生视频',
  reference: '图生视频',
  first_last_frame: '首尾帧',
  video_edit: '视频编辑',
};
const RESOLUTIONS = ['480p', '720p', '1080p'];
const DURATIONS = ['3s', '5s', '8s', '10s', '15s', '30s'];

function resolveTargetFeature(usageType: string, config: Record<string, any>) {
  const selectedPosition = POSITIONS.find(item => item.key !== 'inspiration' && config[item.key]);
  return selectedPosition?.key || USAGE_TARGET_FEATURES[usageType] || 'text_to_video';
}

export default function VideoTemplates() {
  const [data, setData] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [displayConfig, setDisplayConfig] = useState<Record<string, any>>({});
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDisplayConfig, setBatchDisplayConfig] = useState<Record<string, any>>({});
  const [batchSaving, setBatchSaving] = useState(false);
  const coverUrl = Form.useWatch('coverUrl', form);
  const previewUrl = Form.useWatch('previewUrl', form);

  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<Array<string | number>>([]);
  const fetch = (page = 1) => { setLoading(true); setSelectedRowKeys([]); api.get('/templates', { params: { type: 'video', page, pageSize: 20 } }).then((r: any) => { const d = r.data?.list || r.data || []; setData(Array.isArray(d) ? d : []); setPagination(p => ({ ...p, current: page, total: r.data?.pagination?.total || 0 })); }).finally(() => setLoading(false)); };
  const fetchCats = () => { api.get('/content/template-categories').then((r: any) => setCats(r.data || [])); };
  useEffect(() => { fetch(); fetchCats(); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ sortOrder: 0, status: 'active', usageType: 'generate' }); setDisplayConfig({}); setModalOpen(true); };
  const openEdit = (item: any) => { setEditing(item); form.setFieldsValue({ title: item.title || item.name, prompt: item.prompt, coverUrl: item.coverUrl, previewUrl: item.previewUrl || '', categoryId: item.categoryId, resolution: item.resolution || '720p', duration: item.duration || '5s', ratio: item.ratio || '16:9', style: item.style || '', sortOrder: item.sortOrder || 0, isRecommended: item.isRecommended || false, status: item.status || 'active', usageType: item.usageType || 'generate' }); setDisplayConfig(item.displayConfig || {}); setModalOpen(true); };

  const toggleDisplay = (k: string) => { setDisplayConfig(p => p[k] ? (() => { const c = { ...p }; delete c[k]; return c; })() : { ...p, [k]: { pinned: false, pinOrder: 0 } }); };
  const togglePin = (k: string) => { setDisplayConfig(p => { if (!p[k]) return p; const max = Math.max(0, ...Object.values(p).map((x: any) => x?.pinOrder || 0)); return { ...p, [k]: { ...p[k], pinned: !p[k].pinned, pinOrder: p[k].pinned ? 0 : max + 1 } }; }); };
  const toggleBatchDisplay = (k: string) => { setBatchDisplayConfig(p => p[k] ? (() => { const c = { ...p }; delete c[k]; return c; })() : { ...p, [k]: { pinned: false, pinOrder: 0 } }); };
  const toggleBatchPin = (k: string) => { setBatchDisplayConfig(p => { if (!p[k]) return p; const max = Math.max(0, ...Object.values(p).map((x: any) => x?.pinOrder || 0)); return { ...p, [k]: { ...p[k], pinned: !p[k].pinned, pinOrder: p[k].pinned ? 0 : max + 1 } }; }); };
  const uploadTemplateAsset = (field: 'coverUrl' | 'previewUrl', category: 'template_cover' | 'ai_video', refType: string) => async (options: any) => {
    const file = options.file as File;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('refType', refType);
    try {
      setUploading(prev => ({ ...prev, [field]: true }));
      const result: any = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const fileInfo = result?.data || result;
      const url = fileInfo?.url || fileInfo?.cdnUrl;
      if (!url) throw new Error('上传成功但未返回文件地址');
      form.setFieldsValue({ [field]: url });
      message.success(field === 'coverUrl' ? '封面上传成功' : '视频资源上传成功');
      options.onSuccess?.(fileInfo, file);
    } catch (e: any) {
      message.error(e?.message || (field === 'coverUrl' ? '封面上传失败' : '视频资源上传失败'));
      options.onError?.(e);
    } finally {
      setUploading(prev => ({ ...prev, [field]: false }));
    }
  };

  const save = async () => { try { setSaving(true); const v = await form.validateFields(); const usageType = v.usageType || 'generate'; const body = { ...v, templateType: 'video', usageType, targetFeature: resolveTargetFeature(usageType, displayConfig), displayConfig: Object.keys(displayConfig).length > 0 ? displayConfig : null }; if (editing) await api.put('/templates/' + editing.id, body); else await api.post('/templates', body); message.success(editing ? '已保存' : '已创建'); setModalOpen(false); fetch(); } catch (e: any) { if (e?.errorFields) return; message.error(e?.message || '保存模板失败'); } finally { setSaving(false); } };
  const toggleStatus = async (r: any) => { try { const s = r.status === 'active' ? 'inactive' : 'active'; await api.put('/templates/' + r.id, { status: s }); message.success(s === 'active' ? '已启用' : '已停用'); fetch(); } catch (e: any) { message.error(e?.message || '更新模板状态失败'); } };
  const del = async (id: number) => { try { await api.delete('/templates/' + id); message.success('已删除'); fetch(); } catch (e: any) { message.error(e?.message || '删除模板失败'); } };
  const batchDelete = async () => { try { await api.delete('/templates/batch', { data: { ids: selectedRowKeys } }); message.success(`已删除 ${selectedRowKeys.length} 个模板`); fetch(pagination.current); } catch (e: any) { message.error(e?.message || '批量删除模板失败'); } };
  const openBatchDisplay = () => { setBatchDisplayConfig({}); setBatchModalOpen(true); };
  const saveBatchDisplay = async () => {
    if (!Object.keys(batchDisplayConfig).length) {
      message.warning('请选择至少一个展示位置');
      return;
    }
    try {
      setBatchSaving(true);
      const result: any = await api.put('/templates/batch/display-config', { ids: selectedRowKeys, displayConfig: batchDisplayConfig });
      message.success(`已更新 ${result?.data?.count || selectedRowKeys.length} 个模板的展示位置`);
      setBatchModalOpen(false);
      fetch(pagination.current);
    } catch (e: any) {
      message.error(e?.message || '批量设置展示位置失败');
    } finally {
      setBatchSaving(false);
    }
  };

  const cols = [
    { title: '封面', width: 70, render: (_: any, r: any) => r.coverUrl ? <Image src={r.coverUrl} width={48} height={48} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} /> : <div style={{ width: 48, height: 48, borderRadius: 4, background: '#f0f0f0' }} /> },
    { title: '名称', dataIndex: 'title', width: 190, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={168} strong /> },
    { title: '分类', dataIndex: 'categoryId', width: 100, render: (v: number) => { const c = cats.find(x => x.id === v); return c ? <Tag color="purple">{c.name}</Tag> : '-'; }},
    { title: '用法', dataIndex: 'usageType', width: 90, render: (v: string) => <Tag color={v === 'video_edit' ? 'orange' : v === 'reference' || v === 'first_last_frame' ? 'purple' : 'blue'}>{VIDEO_USAGE_SHORT[v] || TEMPLATE_USAGE_SHORT[v] || '文生视频'}</Tag> },
    { title: '展示位置', width: 180, render: (_: any, r: any) => { const cfg = r.displayConfig; if (!cfg || !Object.keys(cfg).length) return '-'; return <Space size={2} wrap>{Object.keys(cfg).map(k => <Tag key={k} color={cfg[k]?.pinned ? 'orange' : 'purple'}>{POSITIONS.find(p => p.key === k)?.label || k}{cfg[k]?.pinned ? ' 📌' : ''}</Tag>)}</Space>; }},
    { title: '分辨率', dataIndex: 'resolution', width: 80 },
    { title: '时长', dataIndex: 'duration', width: 60 },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 210, render: (_: any, r: any) => (<Space size={4} style={nowrapActionStyle}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button><Switch checked={r.status === 'active'} onChange={() => toggleStatus(r)} checkedChildren="开" unCheckedChildren="关" /><Popconfirm title="确认删除？" onConfirm={() => del(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>)},
  ];

  return (
    <div><h2><BulbOutlined /> 视频模板</h2>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模板</Button>
        <Popconfirm title={`确认删除选中的 ${selectedRowKeys.length} 个模板？`} onConfirm={batchDelete} disabled={!selectedRowKeys.length}>
          <Button danger icon={<DeleteOutlined />} disabled={!selectedRowKeys.length}>批量删除</Button>
        </Popconfirm>
        <Button icon={<PushpinOutlined />} disabled={!selectedRowKeys.length} onClick={openBatchDisplay}>批量展示位置</Button>
      </Space>
      <Table rowKey="id" rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as Array<string | number>) }} columns={cols} dataSource={data} loading={loading} size="middle" pagination={pagination} tableLayout="fixed" scroll={{ x: 1240 }} onChange={(p: any) => fetch(p.current)} />
      <Modal title={editing ? '编辑模板' : '新增模板'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={save} confirmLoading={saving} width={640} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="prompt" label="提示词" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item label="封面图片" extra="支持上传 jpg、png、webp，也可以手动填写图片 URL。">
            <Space align="start" size={12} style={{ width: '100%' }}>
              {coverUrl ? <Image src={coverUrl} width={112} height={72} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 112, height: 72, borderRadius: 6, background: '#f5f5f5', border: '1px dashed #d9d9d9' }} />}
              <div style={{ flex: 1 }}>
                <Space style={{ marginBottom: 8 }}>
                  <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} customRequest={uploadTemplateAsset('coverUrl', 'template_cover', 'template_cover')} maxCount={1}>
                    <Button icon={<UploadOutlined />} loading={!!uploading.coverUrl}>上传封面</Button>
                  </Upload>
                </Space>
                <Form.Item name="coverUrl" noStyle><Input placeholder="https://..." /></Form.Item>
              </div>
            </Space>
          </Form.Item>
          <Form.Item label="视频预览资源" extra="支持上传 mp4、mov、webm、avi，也可以手动填写视频 URL。">
            <Space align="start" size={12} style={{ width: '100%' }}>
              {previewUrl ? <video src={previewUrl} controls style={{ width: 160, height: 90, borderRadius: 6, background: '#000', objectFit: 'cover' }} /> : <div style={{ width: 160, height: 90, borderRadius: 6, background: '#f5f5f5', border: '1px dashed #d9d9d9' }} />}
              <div style={{ flex: 1 }}>
                <Space style={{ marginBottom: 8 }}>
                  <Upload accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" showUploadList={false} customRequest={uploadTemplateAsset('previewUrl', 'ai_video', 'template_preview')} maxCount={1}>
                    <Button icon={<UploadOutlined />} loading={!!uploading.previewUrl}>上传视频</Button>
                  </Upload>
                </Space>
                <Form.Item name="previewUrl" noStyle><Input placeholder="https://..." /></Form.Item>
              </div>
            </Space>
          </Form.Item>
          <Form.Item name="usageType" label="模板用法" extra="决定模板出现在小程序的哪个功能页中。" rules={[{ required: true }]}>
            <Select options={VIDEO_USAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="categoryId" label="分类"><Select allowClear options={cats.map((c: any) => ({ label: c.name, value: c.id }))} /></Form.Item>
          <Form.Item label="展示位置">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {POSITIONS.map(p => (<div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Checkbox checked={!!displayConfig[p.key]} onChange={() => toggleDisplay(p.key)}>{p.label}</Checkbox>{displayConfig[p.key] && <><Checkbox checked={!!displayConfig[p.key].pinned} onChange={() => togglePin(p.key)} style={{ marginLeft: 16 }}>置顶</Checkbox>{displayConfig[p.key].pinned && <span style={{ fontSize: 12, color: '#999' }}>顺序 {displayConfig[p.key].pinOrder}</span>}</>}</div>))}
            </div>
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="resolution" label="分辨率"><Select options={RESOLUTIONS.map(r => ({ label: r, value: r }))} style={{ width: 100 }} /></Form.Item>
            <Form.Item name="duration" label="时长"><Select options={DURATIONS.map(d => ({ label: d, value: d }))} style={{ width: 90 }} /></Form.Item>
            <Form.Item name="ratio" label="比例"><Input style={{ width: 80 }} /></Form.Item>
            <Form.Item name="style" label="风格"><Input style={{ width: 100 }} /></Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="sortOrder" label="排序"><InputNumber min={0} style={{ width: 80 }} /></Form.Item>
            <Form.Item name="isRecommended" label="推荐" valuePropName="checked"><Switch /></Form.Item>
            {editing && <Form.Item name="status" label="状态"><Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 100 }} /></Form.Item>}
          </Space>
        </Form>
      </Modal>
      <Modal title="批量设置展示位置" open={batchModalOpen} onCancel={() => setBatchModalOpen(false)} onOk={saveBatchDisplay} confirmLoading={batchSaving} destroyOnClose>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert type="info" showIcon message={`将覆盖已选 ${selectedRowKeys.length} 个模板当前展示位置，影响小程序对应页面的模板露出位置；不会删除模板内容。`} />
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
