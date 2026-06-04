import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Input, message,
  Modal, Popconfirm, Row, Space, Spin, Switch, Table, Tag, Typography,
} from 'antd';
import {
  CloudUploadOutlined, HistoryOutlined, MailOutlined,
  PlayCircleOutlined, ReloadOutlined, SendOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Title, Text } = Typography;

interface BackupFile {
  name: string;
  size: number;
  sizeMB: number;
  mtime: string;
}

interface EmailConfig {
  enabled: boolean;
  from: string;
  to: string;
}

export default function BackupManagement() {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({ enabled: false, from: '', to: '' });
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState<EmailConfig>({ enabled: false, from: '', to: '' });
  const [emailSaving, setEmailSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/backup/history') as any;
      setFiles(res.files || []);
      setEmailConfig(res.email || { enabled: false, from: '', to: '' });
    } catch { message.error('加载备份数据失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      await api.post('/backup/trigger');
      message.success('备份完成');
      fetchData();
    } catch { message.error('备份失败'); }
    finally { setTriggering(false); }
  };

  const openEmailModal = () => {
    setEmailForm({ ...emailConfig });
    setEmailModalOpen(true);
  };

  const saveEmailConfig = async () => {
    setEmailSaving(true);
    try {
      await api.put('/backup/email-config', emailForm);
      message.success('邮件配置已保存');
      setEmailModalOpen(false);
      fetchData();
    } catch { message.error('保存失败'); }
    finally { setEmailSaving(false); }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await api.post('/backup/test-email');
      message.success('测试邮件已发送');
    } catch { message.error('发送失败，请检查 SMTP 配置'); }
    finally { setTesting(false); }
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
  };

  const columns = [
    { title: '文件名', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '大小', dataIndex: 'sizeMB', key: 'sizeMB', width: 100, render: (v: number) => `${v} MB` },
    {
      title: '时间', dataIndex: 'mtime', key: 'mtime', width: 180,
      render: (v: string) => formatTime(v),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>备份管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Popconfirm title="确定要立即执行数据库备份吗？" onConfirm={triggerBackup}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={triggering}>立即备份</Button>
          </Popconfirm>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={16}>
          <Card
            title={<><HistoryOutlined style={{ marginRight: 8 }} />备份历史</>}
            style={{ marginBottom: 16 }}
          >
            <Table
              dataSource={files}
              columns={columns}
              rowKey="name"
              loading={loading}
              pagination={{ pageSize: 15 }}
              locale={{ emptyText: <Empty description="暂无备份记录，点击「立即备份」创建" /> }}
              size="middle"
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card
            title={<><MailOutlined style={{ marginRight: 8 }} />邮件通知</>}
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态">
                {emailConfig.enabled
                  ? <Tag color="green">已开启</Tag>
                  : <Tag color="default">未开启</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="发件人">
                <Text style={{ fontSize: 12 }}>{emailConfig.from || '未配置'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="收件人">
                <Text style={{ fontSize: 12 }}>{emailConfig.to || '未配置'}</Text>
              </Descriptions.Item>
            </Descriptions>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button icon={<SendOutlined />} onClick={openEmailModal} block>配置邮件</Button>
              <Button onClick={testEmail} loading={testing} disabled={!emailConfig.enabled} block>发送测试邮件</Button>
            </Space>
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="SMTP 服务器配置在 .env 文件中（BACKUP_EMAIL_SMTP_HOST/PORT/USER/PASS），此处只管理开关和收发地址。"
            />
          </Card>

          <Card title={<><CloudUploadOutlined style={{ marginRight: 8 }} />备份说明</>}>
            <ul style={{ paddingLeft: 16, fontSize: 13, color: '#666', lineHeight: 2 }}>
              <li>每天凌晨 3 点自动备份数据库</li>
              <li>保留最近 7 天的备份，过期自动清理</li>
              <li>备份文件存储在服务器 <code>backups/db/auto/</code></li>
              <li>系统更新时也会自动备份</li>
              <li>开启邮件后，备份成功会 gzip 压缩发送</li>
              <li>压缩后超 20MB 不发附件，仅通知</li>
            </ul>
          </Card>
        </Col>
      </Row>

      <Modal
        title="邮件通知配置"
        open={emailModalOpen}
        onOk={saveEmailConfig}
        onCancel={() => setEmailModalOpen(false)}
        confirmLoading={emailSaving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>开启邮件通知</Text>
            <Switch
              style={{ marginLeft: 16 }}
              checked={emailForm.enabled}
              onChange={(v) => setEmailForm({ ...emailForm, enabled: v })}
            />
          </div>
          <div>
            <Text strong>发件人地址</Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder='"AI Creator" <your@email.com>'
              value={emailForm.from}
              onChange={(e) => setEmailForm({ ...emailForm, from: e.target.value })}
            />
          </div>
          <div>
            <Text strong>收件人地址</Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder="admin@email.com,admin2@email.com"
              value={emailForm.to}
              onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>多个地址用逗号分隔</Text>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
