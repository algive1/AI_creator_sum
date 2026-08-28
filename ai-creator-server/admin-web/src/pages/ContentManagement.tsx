import { useEffect, useState } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, Popconfirm, Select, Switch, Space,
  Tag, Alert, message,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText, TimeText, nowrapActionStyle } from '../utils/tableCells';

const legalDocTypes = [
  { label: '用户协议', value: 'user_agreement' },
  { label: '隐私政策', value: 'privacy_policy' },
  { label: 'AI 生成内容规则', value: 'ai_content_rules' },
  { label: '公开模板规则', value: 'public_template_rules' },
];

const announcementTypes = [
  { label: '首页弹窗', value: 'popup' },
  { label: '首页公告条', value: 'home' },
  { label: '个人中心公告', value: 'profile' },
  { label: '系统公告', value: 'system' },
  { label: '活动公告', value: 'activity' },
  { label: '维护公告', value: 'maintenance' },
];

const showFrequencies = [
  { label: '每天一次（推荐）', value: 'once_per_day' },
  { label: '每次打开（慎用）', value: 'every_open' },
  { label: '每个用户仅一次', value: 'once' },
  { label: '仅公告列表展示', value: 'list_only' },
];

const announcementTypeLabels = Object.fromEntries(announcementTypes.map(item => [item.value, item.label]));
const showFrequencyLabels = Object.fromEntries(showFrequencies.map(item => [item.value, item.label]));
const showFrequencyColors: Record<string, string> = {
  once_per_day: 'blue',
  every_open: 'red',
  once: 'green',
  list_only: 'default',
};

const promptTypes = [
  { label: '系统', value: 'system' },
  { label: '优化', value: 'optimize' },
  { label: '风控', value: 'safety' },
  { label: '模板', value: 'template' },
  { label: '负面', value: 'negative' },
];

const PROMPT_OPTIMIZE_TARGET_FEATURE = 'prompt_optimize';

export default function ContentManagement() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get('tab') === 'prompt' ? 'prompt' : 'legal';
  const [tab, setTab] = useState(initialTab);

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
      form.setFieldsValue({
        enabled: true,
        promptType: 'system',
        version: 'v1',
        promptKey: 'prompt_optimize_system',
        promptName: '提示词优化系统提示词',
        targetFeature: PROMPT_OPTIMIZE_TARGET_FEATURE,
      });
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
        const body = { promptKey: values.promptKey, promptName: values.promptName, promptType: values.promptType, targetFeature: PROMPT_OPTIMIZE_TARGET_FEATURE, content: values.content, enabled: values.enabled !== false, version: values.version || 'v1', remark: values.remark || '' };
        if (editing) await api.put(`/content/system-prompts/${editing.id}`, body);
        else await api.post('/content/system-prompts', body);
      }
      message.success('保存成功');
      setModalOpen(false);
      loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || e?.message || '保存失败，请检查内容配置');
    }
  };

  const legalColumns = [
    { title: '类型', dataIndex: 'docType', width: 140 },
    { title: '标题', dataIndex: 'title', width: 240, render: (v: string) => <EllipsisText value={v} maxWidth={218} strong /> },
    { title: '版本', dataIndex: 'version', width: 90 },
    { title: '生效时间', dataIndex: 'effectiveAt', width: 180, render: (v: string) => <TimeText value={v} /> },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 120, render: (_: any, row: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openModal('legal', row)}>编辑</Button> },
  ];

  const announceColumns = [
    { title: '标题', dataIndex: 'title', width: 240, render: (v: string) => <EllipsisText value={v} maxWidth={218} strong /> },
    { title: '类型', dataIndex: 'type', width: 120, render: (v: string) => announcementTypeLabels[v] || v },
    {
      title: '频率',
      dataIndex: 'showFrequency',
      width: 160,
      render: (v: string) => <Tag color={showFrequencyColors[v] || 'default'}>{showFrequencyLabels[v] || v}</Tag>,
    },
    { title: '优先级', dataIndex: 'priority', width: 90 },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 180, render: (_: any, row: any) => (
      <Space size={4} style={nowrapActionStyle}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal('announcement', row)}>编辑</Button>
        <Popconfirm title="确认删除此公告？" onConfirm={async () => { await api.delete('/content/announcements/' + row.id); message.success('已删除'); loadAll(); }}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  const promptColumns = [
    { title: 'Key', dataIndex: 'promptKey', width: 200, render: (v: string) => <EllipsisText value={v} maxWidth={178} code /> },
    { title: '名称', dataIndex: 'promptName', width: 180, render: (v: string) => <EllipsisText value={v} maxWidth={158} strong /> },
    { title: '类型', dataIndex: 'promptType', width: 100 },
    { title: '功能', dataIndex: 'targetFeature', width: 170, render: () => <Tag color="blue">提示词优化</Tag> },
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
        onChange={(key) => {
          setTab(key);
          if (key === 'sensitive') fetchWords();
        }}
        items={[
          { key: 'legal', label: '协议管理', children: <Table rowKey="id" columns={legalColumns} dataSource={legalDocs} loading={loading} size="middle" pagination={false} tableLayout="fixed" scroll={{ x: 980 }} /> },
          { key: 'announcement', label: '公告管理', children: <Table rowKey="id" columns={announceColumns} dataSource={announcements} loading={loading} size="middle" pagination={false} tableLayout="fixed" scroll={{ x: 980 }} /> },
          {
            key: 'prompt',
            label: '系统提示词',
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="提示词优化系统提示词"
                  description="这里的系统提示词只注入“提示词优化”功能，不会扩散到生图、生视频、脚本生成、提示词生成、分镜或工具等其他功能；系统内置补全规则仍会自动保留。"
                  action={(
                    <Button size="small" type="primary" onClick={() => openModal('prompt')}>新增优化规则</Button>
                  )}
                />
                <Table rowKey="id" columns={promptColumns} dataSource={prompts} loading={loading} size="middle" pagination={false} tableLayout="fixed" scroll={{ x: 1020 }} />
              </>
            ),
          },
          { key: 'confirm', label: '合规记录', children: <Table rowKey="id" columns={[
            { title: '场景', dataIndex: 'scene', width: 120 },
            { title: '用户ID', dataIndex: 'userId', width: 100 },
            { title: '任务ID', dataIndex: 'taskId', width: 100 },
            { title: '文件ID', dataIndex: 'fileId', width: 100 },
            { title: '模板ID', dataIndex: 'templateId', width: 100 },
            { title: '确认文本', dataIndex: 'confirmationText', width: 240, render: (v: string) => <EllipsisText value={v} maxWidth={218} /> },
            { title: '版本', dataIndex: 'policyVersion', width: 100 },
            { title: '时间', dataIndex: 'confirmedAt', width: 180, render: (v: string) => <TimeText value={v} /> },
          ]} dataSource={confirmations} loading={loading} size="middle" pagination={{ pageSize: 20 }} tableLayout="fixed" scroll={{ x: 1260 }} /> },
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
        title={modalType === 'prompt' ? (editing ? '编辑系统提示词' : '新增系统提示词') : (editing ? '编辑' : '新增')}
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
              <Form.Item
                name="content"
                label="内容"
                rules={[{ required: true }]}
                extra="如果功能选择“智能优化”，这里的内容会与系统内置的深度补全规则合并后注入文本模型。"
              >
                <Input.TextArea rows={8} />
              </Form.Item>
              <Form.Item name="effectiveAt" label="生效时间"><Input placeholder="2026-05-22 12:00:00" /></Form.Item>
              <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
            </>
          )}
          {modalType === 'announcement' && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="公告展示规则"
                description="类型选“首页弹窗”才会在小程序首页居中弹出；所有非停用、未过期且命中目标用户的公告都会进入公告列表。“仅公告列表展示”不会进入首页公告条，也不会弹窗。"
              />
              <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item
                name="content"
                label="内容"
                rules={[{ required: true }]}
                extra="支持普通文本，也支持 h1、h2、p、ul、li、strong 等基础 HTML 标签。"
              >
                <Input.TextArea rows={6} />
              </Form.Item>
              <Form.Item
                name="type"
                label="展示位置"
                extra="首页弹窗会居中弹出；首页公告条只显示在 banner 下方；其他类型主要进入公告列表。"
              >
                <Select options={announcementTypes} />
              </Form.Item>
              <Form.Item
                name="showFrequency"
                label="弹窗频率"
                extra="只控制首页弹窗的自动弹出次数。公告条不会因为已读或关闭而隐藏；仅列表展示会从首页隐藏。"
              >
                <Select options={showFrequencies} />
              </Form.Item>
              <Form.Item name="targetType" label="目标用户"><Select options={[
                { label: '全部', value: 'all' },
                { label: '新用户（注册7天内）', value: 'new_users' },
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
                <Form.Item name="startAt" label="开始时间"><Input placeholder="2026-06-10 09:00:00" /></Form.Item>
                <Form.Item name="endAt" label="结束时间"><Input placeholder="2026-06-30 23:59:59" /></Form.Item>
              </Space>
            </>
          )}
          {modalType === 'prompt' && (
            <>
              <Form.Item name="promptKey" hidden><Input /></Form.Item>
              <Form.Item name="promptName" label="名称" rules={[{ required: true }]}>
                <Input
                  onChange={(e) => {
                    const name = e.target.value;
                    const rights = form.getFieldValue('promptKey');
                    // Auto-generate promptKey from name if key is empty or looks auto-generated
                    const looksAuto = !rights || /^prompt_\d{13}$/.test(rights) || /^[a-z0-9_]+$/.test(rights);
                    if (looksAuto) {
                      const slug = name
                        .toLowerCase()
                        .replace(/[^a-z0-9一-鿿]+/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .replace(/_+/g, '_')
                        .substring(0, 32);
                      form.setFieldValue('promptKey', slug || `prompt_${Date.now()}`);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="promptType" label="类型"><Select options={promptTypes} /></Form.Item>
              <Form.Item name="targetFeature" hidden><Input /></Form.Item>
              <Form.Item label="功能"><Input value="提示词优化" readOnly /></Form.Item>
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
