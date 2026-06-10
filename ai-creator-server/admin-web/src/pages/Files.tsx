import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Image,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Paragraph, Text } = Typography;

const categoryLabels: Record<string, string> = {
  avatar: '头像',
  ref_image: '参考图',
  template_cover: '模板封面',
  ref_video: '参考视频',
  ai_output: 'AI 输出',
  ai_video: 'AI 视频',
  general: '通用',
};

const categoryColors: Record<string, string> = {
  avatar: 'purple',
  ref_image: 'blue',
  template_cover: 'orange',
  ref_video: 'geekblue',
  ai_output: 'green',
  ai_video: 'cyan',
  general: 'default',
};

const uploadCategories = [
  { value: 'general', label: '通用资源' },
  { value: 'template_cover', label: '模板封面' },
  { value: 'ref_image', label: '参考图' },
  { value: 'ref_video', label: '参考视频' },
  { value: 'ai_video', label: '视频资源' },
];

const imageVideoAccept = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
].join(',');

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function shortText(value: string, length = 18): string {
  const text = String(value || '').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function providerStats(value: any): Array<{ key: string; label: string; value: number }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const label = String(item?.provider || item?.fileCategory || item?.file_category || `provider-${index + 1}`);
      return { key: label, label, value: Number(item?.cnt || item?.count || 0) };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, count]) => ({ key, label: key, value: Number(count || 0) }));
  }
  return [];
}

function fileUrl(row: any): string {
  return absoluteBrowserUrl(String(row?.accessUrl || row?.previewUrl || row?.publicUrl || row?.rawUrl || row?.cdnUrl || row?.displayUrl || row?.url || '').trim());
}

function absoluteBrowserUrl(url: string): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  return new URL(value.startsWith('/') ? value : `/${value}`, window.location.origin).href;
}

function copyableFileUrl(row: any): string {
  return absoluteBrowserUrl(String(row?.copyUrl || row?.previewUrl || row?.accessUrl || row?.publicUrl || row?.rawUrl || row?.cdnUrl || fileUrl(row) || '').trim());
}

function isImage(row: any): boolean {
  return String(row?.mimeType || '').startsWith('image/');
}

function isVideo(row: any): boolean {
  return String(row?.mimeType || '').startsWith('video/');
}

function formatTime(value: unknown): string {
  return String(value || '').replace('T', ' ').replace(/\.\d{3}Z?$/, '').replace(/Z$/, '');
}

export default function Files() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('general');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [fileCategory, setFileCategory] = useState<string>();
  const [visibility, setVisibility] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [stats, setStats] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<any | null>(null);
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;

  const fetch = useCallback((page = 1, keywordValue = keywordRef.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    api.get('/files', { params: { page, pageSize, fileCategory, visibility, keyword: keywordValue } }).then((r: any) => {
      setData(r.data.list || []);
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: r.data.pagination?.total || 0,
      }));
    }).finally(() => setLoading(false));
  }, [fileCategory, visibility, pagination.pageSize]);

  const fetchStats = useCallback(() => {
    api.get('/files/stats').then((r: any) => setStats(r.data || {}));
  }, []);

  useEffect(() => {
    fetch();
    fetchStats();
  }, [fetch, fetchStats]);

  const handleUpload = async (options: any) => {
    const file = options.file as File | undefined;
    if (!file) {
      options.onError?.(new Error('未找到上传文件'));
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('category', uploadCategory);
    form.append('refType', 'admin_upload');
    try {
      const result: any = await api.post('/files/upload', form);
      const uploaded = result.data || result;
      message.success(uploaded.url ? '上传成功，已生成可复制链接' : '上传成功');
      options.onSuccess?.(uploaded);
      fetch(1);
      fetchStats();
    } catch (err: any) {
      options.onError?.(err);
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async (row: any) => {
    const url = copyableFileUrl(row);
    if (!url) {
      message.warning('当前文件没有可复制链接');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
    } catch {
      Modal.info({
        title: '复制链接',
        content: <Paragraph copyable={{ text: url }}>{url}</Paragraph>,
      });
    }
  };

  const handleDelete = (id: number, name?: string) => {
    Modal.confirm({
      title: '确认删除此文件？',
      content: name ? `文件名：${name}` : '',
      okButtonProps: { danger: true },
      onOk: () => {
        api.delete('/files/' + id).then(() => {
          message.success('已删除');
          fetch(pagination.current);
          fetchStats();
        });
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    Modal.confirm({
      title: `确认删除选中的 ${selectedIds.length} 个文件？`,
      content: '此操作会软删除文件记录。',
      okButtonProps: { danger: true },
      onOk: () => {
        api.post('/files/batch-delete', { ids: selectedIds }).then(() => {
          message.success(`已删除 ${selectedIds.length} 个文件`);
          setSelectedIds([]);
          fetch(pagination.current);
          fetchStats();
        });
      },
    });
  };

  const handleToggle = (id: number, cur: string) => {
    const next = cur === 'public' ? 'private' : 'public';
    api.put('/files/' + id + '/visibility', { visibility: next }).then(() => {
      fetch(pagination.current);
    });
  };

  const columns = [
    { title: '文件编号', dataIndex: 'fileNo', width: 130, ellipsis: true },
    {
      title: '预览',
      width: 76,
      render: (_: any, row: any) => {
        const url = fileUrl(row);
        if (isVideo(row)) {
          return <Button size="small" icon={<VideoCameraOutlined />} onClick={() => setDetailFile(row)}>预览</Button>;
        }
        if (isImage(row) && url) {
          return <Image src={url} width={42} height={42} style={{ objectFit: 'cover', borderRadius: 4 }} />;
        }
        return <FileOutlined style={{ fontSize: 18, color: '#999' }} />;
      },
    },
    {
      title: '文件名',
      dataIndex: 'originalName',
      width: 180,
      ellipsis: true,
      render: (value: string) => (
        <Tooltip title={value}>
          <Text style={{ display: 'block', maxWidth: 160 }} ellipsis>{value}</Text>
        </Tooltip>
      ),
    },
    { title: '类型', dataIndex: 'mimeType', width: 120, ellipsis: true },
    { title: '大小', dataIndex: 'fileSize', width: 90, render: (value: number) => formatSize(value) },
    {
      title: '分类',
      dataIndex: 'fileCategory',
      width: 92,
      render: (value: string) => <Tag color={categoryColors[value] || 'default'}>{categoryLabels[value] || value}</Tag>,
    },
    {
      title: '可见性',
      dataIndex: 'visibility',
      width: 82,
      render: (value: string) => <Tag color={value === 'public' ? 'green' : 'default'}>{value === 'public' ? '公开' : '私有'}</Tag>,
    },
    { title: '用户', dataIndex: 'nickname', width: 90, render: (value: string) => value || '系统' },
    {
      title: '提示词',
      width: 230,
      render: (_: any, row: any) => {
        if (!row.generated) return <Text type="secondary">-</Text>;
        const prompt = String(row.generatedPrompt || '').trim();
        if (!prompt) return <Text type="secondary">无提示词</Text>;
        return (
          <Tooltip title="查看完整提示词">
            <Button
              type="link"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => setDetailFile(row)}
              style={{ maxWidth: 220, paddingInline: 0 }}
            >
              <span style={{ display: 'inline-block', maxWidth: 178, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                {shortText(prompt, 28)}
              </span>
            </Button>
          </Tooltip>
        );
      },
    },
    { title: '关联任务', dataIndex: 'taskId', width: 90, render: (value: number) => value || '-' },
    { title: '时间', dataIndex: 'createdAt', width: 190, render: (value: string) => <Text style={{ whiteSpace: 'nowrap' }}>{formatTime(value)}</Text> },
    {
      title: '操作',
      width: 250,
      render: (_: any, row: any) => (
        <Space size={4} style={{ whiteSpace: 'nowrap' }}>
          <Tooltip title="查看内容">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailFile(row)} />
          </Tooltip>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyLink(row)}>复制链接</Button>
          <Button size="small" onClick={() => handleToggle(row.id, row.visibility)}>{row.visibility === 'public' ? '设私有' : '设公开'}</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(row.id, row.originalName)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detailUrl = fileUrl(detailFile);
  const detailPrompt = String(detailFile?.generatedPrompt || '').trim();

  return (
    <div>
      <h2><FileOutlined /> 文件管理</h2>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总文件数" value={stats.totalFiles || 0} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="总大小" value={formatSize(stats.totalSize || 0)} /></Card></Col>
        {providerStats(stats.byProvider).map(item => (
          <Col span={3} key={item.key}><Card size="small"><Statistic title={item.label} value={item.value} /></Card></Col>
        ))}
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          value={uploadCategory}
          onChange={setUploadCategory}
          style={{ width: 140 }}
          options={uploadCategories}
        />
        <Upload accept={imageVideoAccept} showUploadList={false} customRequest={handleUpload} maxCount={1}>
          <Button type="primary" icon={<UploadOutlined />} loading={uploading}>上传图片/视频</Button>
        </Upload>
        <Select
          placeholder="分类"
          allowClear
          style={{ width: 120 }}
          value={fileCategory}
          onChange={setFileCategory}
          options={[
            { value: 'avatar', label: '头像' },
            { value: 'ref_image', label: '参考图' },
            { value: 'template_cover', label: '模板封面' },
            { value: 'ref_video', label: '参考视频' },
            { value: 'ai_output', label: 'AI 输出' },
            { value: 'ai_video', label: 'AI 视频' },
            { value: 'general', label: '通用' },
          ]}
        />
        <Select
          placeholder="可见性"
          allowClear
          style={{ width: 110 }}
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'public', label: '公开' },
            { value: 'private', label: '私有' },
          ]}
        />
        <Input.Search
          placeholder="搜索文件名/编号"
          style={{ width: 220 }}
          onSearch={(value) => {
            setKeyword(value);
            fetch(1, value);
          }}
        />
        {selectedIds.length > 0 && (
          <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>批量删除 ({selectedIds.length})</Button>
        )}
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        tableLayout="fixed"
        scroll={{ x: 1680 }}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: total => `共 ${total} 个文件`,
        }}
        onChange={(next: any) => fetch(next.current, keywordRef.current, next.pageSize)}
      />

      <Modal
        title={detailFile?.originalName || '文件详情'}
        open={!!detailFile}
        onCancel={() => setDetailFile(null)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} disabled={!detailUrl} onClick={() => copyLink(detailFile)}>复制链接</Button>,
          <Button key="close" type="primary" onClick={() => setDetailFile(null)}>关闭</Button>,
        ]}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {detailUrl && isImage(detailFile) && (
            <Image src={detailUrl} style={{ maxHeight: 420, objectFit: 'contain' }} />
          )}
          {detailUrl && isVideo(detailFile) && (
            <video src={detailUrl} controls style={{ width: '100%', maxHeight: 420, borderRadius: 8, background: '#000' }} />
          )}
          {detailUrl && (
            <Paragraph copyable={{ text: detailUrl }} style={{ marginBottom: 0 }}>
              <Text type="secondary">链接：</Text>{detailUrl}
            </Paragraph>
          )}
          {detailFile?.generated && (
            <Card size="small" title="生成提示词">
              {detailPrompt ? (
                <Paragraph copyable={{ text: detailPrompt }} style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {detailPrompt}
                </Paragraph>
              ) : (
                <Text type="secondary">没有记录提示词</Text>
              )}
            </Card>
          )}
        </Space>
      </Modal>
    </div>
  );
}
