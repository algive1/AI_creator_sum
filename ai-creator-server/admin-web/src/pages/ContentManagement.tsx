import { useEffect, useState } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, Popconfirm, Select, Switch, Space,
  Tag, message,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../services/api';

const legalDocTypes = [
  { label: '用户协议', value: 'user_agreement' },
  { label: '隐私政策', value: 'privacy_policy' },
  { label: 'AI 生成内容规则', value: 'ai_content_rules' },
  { label: '公开模板规则', value: 'public_template_rules' },
];

const announcementTypes = [
  { label: '弹窗', value: 'popup' },
  { label: '首页', value: 'home' },
  { label: '个人中心', value: 'profile' },
  { label: '系统', value: 'system' },
  { label: '活动', value: 'activity' },
  { label: '维护', value: 'maintenance' },
];

const showFrequencies = [
  { label: '每天一次', value: 'once_per_day' },
  { label: '每次打开', value: 'every_open' },
  { label: '仅一次', value: 'once' },
  { label: '仅列表展示', value: 'list_only' },
];

const promptTypes = [
  { label: '系统', value: 'system' },
  { label: '优化', value: 'optimize' },
  { label: '风控', value: 'safety' },
  { label: '模板', value: 'template' },
  { label: '负面', value: 'negative' },
];

const features = [
  { label: '文生图', value: 'text_to_image' },
  { label: '图生图', value: 'image_to_image' },
  { label: '图片编辑', value: 'image_edit' },
  { label: '文生视频', value: 'text_to_video' },
  { label: '图生视频', value: 'image_to_video' },
  { label: '首尾帧视频', value: 'first_last_frame_video' },
  { label: '智能优化', value: 'prompt_optimize' },
  { label: '脚本生成', value: 'script_generate' },
  { label: '提示词生成', value: 'prompt_generate' },
  { label: 'AI 漫剧分镜', value: 'storyboard_generate' },
];

export default function ContentManagement() {
  const [tab, setTab] = useState('legal');

  const [legalDocs, setLegalDocs] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [confirmations, setConfirmations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'legal' | 'announcement' | 'prompt'>('legal');
  const [editing, setEditing] = useState<any>(null);

  const [sensitiveWords, setSensitiveWords] = useState<any[]>([]);
  const [newWord, setNewWord] = useState('');

  const fetchWords = async () => {
    try {
      const r: any = await api.get('/content/sensitive-words');
      setSensitiveWords(r.data || []);
    } catch { setSensitiveWords([]); }
  };

  const addWord = async () => {
    const word = newWord.trim();
    if (!word) return;
    try {
      await api.post('/content/sensitive-words', { word });
      setNewWord('');
      fetchWords();
    } catch (e: any) { message.error(e?.response?.data?.message || '添加失败'); }
  };

  const deleteWord = async (id: number) => {
    await api.delete('/content/sensitive-words/' + id);
    fetchWords();
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [legal, announce, prompt, confirm] = await Promise.all([
        api.get('/content/legal-documents'),
        api.get('/content/announcements'),
        api.get('/content/system-prompts'),
        api.get('/content/compliance-confirmations'),
      ]);
      setLegalDocs(legal.data?.list || []);
      setAnnouncements(announce.data?.list || []);
      setPrompts(prompt.data?.list || []);
      setConfirmations(confirm.data?.list || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const openModal = (type: 'legal' | 'announcement' | 'prompt', row?: any) => {
    setModalType(type);
    setEditing(row || null);
    form.resetFields();
    if (row) {
      form.setFieldsValue({
        ...row,
        docType: row.docType,
        promptKey: row.promptKey,
        promptName: row.promptName,
        promptType: row.promptType,
        targetFeature: row.targetFeature,
        showFrequency: row.showFrequency,
        targetType: row.targetType,
        targetUserIds: Array.isArray(row.targetUserIds) ? row.targetUserIds.join(',') : '',
      });
    } else if (type === 'legal') {
      form.setFieldsValue({ enabled: true });
    } else if (type === 'announcement') {
      form.setFieldsValue({ enabled: true, type: 'popup', showFrequency: 'once_per_day', targetType: 'all', priority: 0, sortOrder: 0 });
    } else {
      form.setFieldsValue({ enabled: true, promptType: 'system', version: 'v1' });
    }
    setModalOpen(true);
  };

  const saveModal = async () => {
    try {
      const values = await form.validateFields();
      if (modalType === 'legal') {
        const body = { docType: values.docType, title: values.title, version: values.version, content: values.content, enabled: values.enabled !== false, effectiveAt: values.effectiveAt || null };
        if (editing) await api.put(`/content/legal-documents/${editing.id}`, body);
        else await api.post('/content/legal-documents', body);
      } else if (modalType === 'announcement') {
        const body = { title: values.title, content: values.content, type: values.type, enabled: values.enabled !== false, startAt: values.startAt || null, endAt: values.endAt || null, sortOrder: values.sortOrder || 0, priority: values.priority || 0, showFrequency: values.showFrequency, targetType: values.targetType, targetUserIds: values.targetUserIds ? String(values.targetUserIds).split(',').map((v: string) => v.trim()).filter(Boolean) : [] };
        if (editing) await api.put(`/content/announcements/${editing.id}`, body);
        else await api.post('/content/announcements', body);
      } else {
        const body = { promptKey: values.promptKey, promptName: values.promptName, promptType: values.promptType, targetFeature: values.targetFeature, content: values.content, enabled: values.enabled !== false, version: values.version || 'v1', remark: values.remark || '' };
        if (editing) await api.put(`/content/system-prompts/${editing.id}`, body);
        else await api.post('/content/system-prompts', body);
      }
      message.success('保存成功');
      setModalOpen(false);
      loadAll();
    } catch (e: any) { if (e?.errorFields) return; }
  };

  const legalColumns = [
    { title: '类型', dataIndex: 'docType', width: 140 },
    { title: '标题', dataIndex: 'title', width: 180 },
    { title: '版本', dataIndex: 'version', width: 90 },
    { title: '生效时间', dataIndex: 'effectiveAt', width: 180 },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 120, render: (_: any, row: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openModal('legal', row)}>编辑</Button> },
  ];

  const announceColumns = [
    { title: '标题', dataIndex: 'title', width: 180 },
    { title: '类型', dataIndex: 'type', width: 100 },
    { title: '频率', dataIndex: 'showFrequency', width: 120 },
    { title: '优先级', dataIndex: 'priority', width: 90 },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 180, render: (_: any, row: any) => (
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal('announcement', row)}>编辑</Button>
        <Popconfirm title="确认删除此公告？" onConfirm={async () => { await api.delete('/content/announcements/' + row.id); message.success('已删除'); loadAll(); }}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  const promptColumns = [
    { title: 'Key', dataIndex: 'promptKey', width: 160 },
    { title: '名称', dataIndex: 'promptName', width: 160 },
    { title: '类型', dataIndex: 'promptType', width: 100 },
    { title: '功能', dataIndex: 'targetFeature', width: 150 },
    { title: '版本', dataIndex: 'version', width: 90 },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 120, render: (_: any, row: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openModal('prompt', row)}>编辑</Button> },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(tab === 'legal' ? 'legal' : tab === 'announcement' ? 'announcement' : 'prompt')}>
          新增
        </Button>
        <Button onClick={loadAll}>刷新</Button>
      </Space>

      <Tabs
        activeKey={tab}
        onChange={(key) => { setTab(key); if (key === 'sensitive') fetchWords(); }}
        items={[
          { key: 'legal', label: '协议管理', children: <Table rowKey="id" columns={legalColumns} dataSource={legalDocs} loading={loading} size="middle" pagination={false} /> },
          { key: 'announcement', label: '公告管理', children: <Table rowKey="id" columns={announceColumns} dataSource={announcements} loading={loading} size="middle" pagination={false} /> },
          { key: 'prompt', label: '系统提示词', children: <Table rowKey="id" columns={promptColumns} dataSource={prompts} loading={loading} size="middle" pagination={false} /> },
          { key: 'confirm', label: '合规记录', children: <Table rowKey="id" columns={[
            { title: '场景', dataIndex: 'scene', width: 120 },
            { title: '用户ID', dataIndex: 'userId', width: 100 },
            { title: '任务ID', dataIndex: 'taskId', width: 100 },
            { title: '文件ID', dataIndex: 'fileId', width: 100 },
            { title: '模板ID', dataIndex: 'templateId', width: 100 },
            { title: '确认文本', dataIndex: 'confirmationText', width: 120 },
            { title: '版本', dataIndex: 'policyVersion', width: 100 },
            { title: '时间', dataIndex: 'confirmedAt', width: 180 },
          ]} dataSource={confirmations} loading={loading} size="middle" pagination={{ pageSize: 20 }} /> },
          {
            key: 'sensitive',
            label: '敏感词管理',
            children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Input
                    placeholder="输入敏感词"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onPressEnter={addWord}
                    style={{ width: 200 }}
                  />
                  <Button type="primary" onClick={addWord}>添加</Button>
                  <Button onClick={fetchWords}>刷新</Button>
                </Space>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sensitiveWords.map((item: any) => (
                    <Tag
                      key={item.id}
                      closable
                      color="red"
                      onClose={() => deleteWord(item.id)}
                    >
                      {item.word}
                    </Tag>
                  ))}
                  {sensitiveWords.length === 0 && <span style={{ color: '#999' }}>暂无敏感词</span>}
                </div>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑' : '新增'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveModal}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {modalType === 'legal' && (
            <>
              <Form.Item name="docType" label="协议类型" rules={[{ required: true }]}><Select options={legalDocTypes} /></Form.Item>
              <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="version" label="版本" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
              <Form.Item name="effectiveAt" label="生效时间"><Input placeholder="2026-05-22 12:00:00" /></Form.Item>
              <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
            </>
          )}
          {modalType === 'announcement' && (
            <>
              <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={6} /></Form.Item>
              <Form.Item name="type" label="类型"><Select options={announcementTypes} /></Form.Item>
              <Form.Item name="showFrequency" label="展示频率"><Select options={showFrequencies} /></Form.Item>
              <Form.Item name="targetType" label="目标用户"><Select options={[
                { label: '全部', value: 'all' },
                { label: '新用户', value: 'new_users' },
                { label: '会员', value: 'vip' },
                { label: '免费用户', value: 'free' },
                { label: '指定用户', value: 'specified' },
              ]} /></Form.Item>
              <Form.Item name="targetUserIds" label="指定用户ID（逗号分隔）"><Input /></Form.Item>
              <Space style={{ display: 'flex' }}>
                <Form.Item name="sortOrder" label="排序"><Input /></Form.Item>
                <Form.Item name="priority" label="优先级"><Input /></Form.Item>
                <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
              </Space>
              <Space style={{ display: 'flex' }}>
                <Form.Item name="startAt" label="开始时间"><Input /></Form.Item>
                <Form.Item name="endAt" label="结束时间"><Input /></Form.Item>
              </Space>
            </>
          )}
          {modalType === 'prompt' && (
            <>
              <Form.Item name="promptKey" label="提示词标识" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="promptName" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="promptType" label="类型"><Select options={promptTypes} /></Form.Item>
              <Form.Item name="targetFeature" label="功能" rules={[{ required: true }]}><Select options={features} /></Form.Item>
              <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
              <Space style={{ display: 'flex' }}>
                <Form.Item name="version" label="版本"><Input /></Form.Item>
                <Form.Item name="remark" label="备注"><Input /></Form.Item>
                <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
              </Space>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
