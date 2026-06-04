import { useCallback, useEffect, useRef, useState } from 'react';
import { Table, Tag, Space, Button, Modal, Select, Input, message, Card, Statistic, Row, Col, Image, Popconfirm } from 'antd';
import { FileOutlined, VideoCameraOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

const categoryLabels: Record<string, string> = {
  avatar: '头像', ref_image: '参考图', template_cover: '模板封面',
  ai_output: 'AI输出', ai_video: 'AI视频', general: '通用',
};
const categoryColors: Record<string, string> = {
  avatar: 'purple', ref_image: 'blue', template_cover: 'orange',
  ai_output: 'green', ai_video: 'cyan', general: 'default',
};

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

export default function Files() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [fileCategory, setFileCategory] = useState<string>();
  const [visibility, setVisibility] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const [stats, setStats] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fetch = useCallback((page = 1, keywordValue = keywordRef.current) => {
    setLoading(true);
    api.get('/files', { params: { page, pageSize: 20, fileCategory, visibility, keyword: keywordValue } }).then((r: any) => {
      setData(r.data.list || []); setPagination(prev => ({ ...prev, current: page, total: r.data.pagination?.total || 0 }));
    }).finally(() => setLoading(false));
  }, [fileCategory, visibility]);

  const fetchStats = useCallback(() => { api.get('/files/stats').then((r: any) => setStats(r.data || {})); }, []);

  useEffect(() => { fetch(); fetchStats(); }, [fetch, fetchStats]);

  const handleDelete = (id: number, name?: string) => {
    Modal.confirm({ title: '确认删除此文件？', content: name ? `文件名: ${name}` : '', onOk: () => {
      api.delete('/files/' + id).then(() => { message.success('已删除'); fetch(pagination.current); fetchStats(); });
    }});
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    Modal.confirm({ title: `确认删除选中的 ${selectedIds.length} 个文件？`, content: '此操作不可撤销。', okButtonProps: { danger: true }, onOk: () => {
      api.post('/files/batch-delete', { ids: selectedIds }).then(() => { message.success(`已删除 ${selectedIds.length} 个文件`); setSelectedIds([]); fetch(pagination.current); fetchStats(); });
    }});
  };

  const handleToggle = (id: number, cur: string) => {
    const v = cur === 'public' ? 'private' : 'public';
    api.put('/files/' + id + '/visibility', { visibility: v }).then(() => { fetch(pagination.current); });
  };

  const columns = [
    { title: '文件编号', dataIndex: 'fileNo', width: 140, ellipsis: true },
    { title: '预览', width: 70, render: (_: any, r: any) =>
      r.mimeType?.startsWith('video')
        ? <VideoCameraOutlined style={{ fontSize: 20, color: '#8b5cf6' }} />
        : (r.mimeType?.startsWith('image')
          ? <Image src={r.cdnUrl || r.accessUrl} width={36} height={36} style={{ objectFit: 'cover', borderRadius: 4 }} preview={{ mask: '🔍' }} />
          : <FileOutlined style={{ fontSize: 18, color: '#999' }} />)
    },
    { title: '文件名', dataIndex: 'originalName', ellipsis: true },
    { title: '类型', dataIndex: 'mimeType', width: 110, ellipsis: true },
    { title: '大小', dataIndex: 'fileSize', width: 90, render: (v: number) => formatSize(v) },
    { title: '分类', dataIndex: 'fileCategory', width: 90, render: (v: string) => <Tag color={categoryColors[v] || 'default'}>{categoryLabels[v] || v}</Tag> },
    { title: '可见性', dataIndex: 'visibility', width: 80, render: (v: string) => <Tag color={v === 'public' ? 'green' : 'default'}>{v === 'public' ? '公开' : '私有'}</Tag> },
    { title: '用户', dataIndex: 'nickname', width: 100 },
    { title: '关联任务', dataIndex: 'taskId', width: 80, render: (v: number) => v ? <a href={`/tasks`} onClick={e => { e.preventDefault(); }}>{v}</a> : '-' },
    { title: '时间', dataIndex: 'createdAt', width: 160 },
    { title: '操作', width: 160, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" onClick={() => handleToggle(r.id, r.visibility)}>{r.visibility === 'public' ? '设私有' : '设公开'}</Button>
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id, r.originalName)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <h2><FileOutlined /> 文件管理</h2>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总文件数" value={stats.totalFiles || 0} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="总大小" value={formatSize(stats.totalSize || 0)} /></Card></Col>
        {Object.entries(stats.byProvider || {}).map(([k, v]: any) => (
          <Col span={3} key={k}><Card size="small"><Statistic title={k} value={v} /></Card></Col>
        ))}
      </Row>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="分类" allowClear style={{ width: 120 }} value={fileCategory} onChange={setFileCategory} options={[
          { value: 'avatar', label: '头像' }, { value: 'ref_image', label: '参考图' }, { value: 'template_cover', label: '模板封面' },
          { value: 'ai_output', label: 'AI输出' }, { value: 'ai_video', label: 'AI视频' }, { value: 'general', label: '通用' },
        ]} />
        <Select placeholder="可见性" allowClear style={{ width: 100 }} value={visibility} onChange={setVisibility} options={[
          { value: 'public', label: '公开' }, { value: 'private', label: '私有' },
        ]} />
        <Input.Search placeholder="搜索文件名" style={{ width: 200 }} onSearch={(v) => { setKeyword(v); fetch(1, v); }} />
        {selectedIds.length > 0 && (
          <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>批量删除 ({selectedIds.length})</Button>
        )}
      </Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }}
        pagination={{ ...pagination, showSizeChanger: true, showTotal: (t) => `共 ${t} 个文件` }}
        onChange={(p: any) => fetch(p.current)} />
    </div>
  );
}
