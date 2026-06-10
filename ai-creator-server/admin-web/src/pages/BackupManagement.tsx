import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, message,
  Modal, Popconfirm, Row, Space, Switch, Table, Tag, Typography,
} from 'antd';
import {
  CloudUploadOutlined, HistoryOutlined, MailOutlined,
  PlayCircleOutlined, ReloadOutlined, SaveOutlined, SendOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import { EllipsisText } from '../utils/tableCells';

const { Title, Text } = Typography;

interface BackupFile {
  name: string;
  location?: string;
  size: number;
  sizeMB: number;
  mtime: string;
}

interface BackupConfig {
  enabled: boolean;
  dir: string;
  autoDir: string;
  retentionDays: number;
  autoHour: number;
  timeoutSeconds: number;
}

interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  to: string;
  passConfigured?: boolean;
  passMasked?: string;
}

interface SettingsForm {
  backupEnabled: boolean;
  backupDir: string;
  retentionDays: number;
  autoHour: number;
  timeoutSeconds: number;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  from: string;
  to: string;
}

const DEFAULT_BACKUP: BackupConfig = {
  enabled: true,
  dir: '',
  autoDir: '',
  retentionDays: 7,
  autoHour: 3,
  timeoutSeconds: 300,
};

const DEFAULT_EMAIL: EmailConfig = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  from: '',
  to: '',
  passConfigured: false,
  passMasked: '',
};

function buildForm(backup: BackupConfig, email: EmailConfig): SettingsForm {
  return {
    backupEnabled: backup.enabled,
    backupDir: backup.dir || '',
    retentionDays: backup.retentionDays || 7,
    autoHour: backup.autoHour ?? 3,
    timeoutSeconds: backup.timeoutSeconds || 300,
    emailEnabled: email.enabled,
    smtpHost: email.host || '',
    smtpPort: email.port || 465,
    smtpSecure: email.secure !== false,
    smtpUser: email.user || '',
    smtpPass: '',
    from: email.from || '',
    to: email.to || '',
  };
}

function unwrapResponseData<T extends Record<string, any>>(res: any): T {
  return (res?.data && typeof res.data === 'object' ? res.data : res || {}) as T;
}

function normalizeBackupFiles(files: any[]): BackupFile[] {
  return (Array.isArray(files) ? files : []).map((file) => ({
    name: String(file.name || ''),
    location: file.location,
    size: Number(file.size || 0),
    sizeMB: Number(file.sizeMB ?? (Number(file.size || 0) / 1024 / 1024).toFixed(2)),
    mtime: String(file.mtime || ''),
  }));
}

export default function BackupManagement() {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [backupConfig, setBackupConfig] = useState<BackupConfig>(DEFAULT_BACKUP);
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(DEFAULT_EMAIL);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(buildForm(DEFAULT_BACKUP, DEFAULT_EMAIL));
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/backup/history') as any;
      const payload = unwrapResponseData<{ files?: any[]; backup?: BackupConfig; email?: EmailConfig }>(res);
      const nextBackup = payload.backup || DEFAULT_BACKUP;
      const nextEmail = payload.email || DEFAULT_EMAIL;
      setFiles(normalizeBackupFiles(payload.files || []));
      setBackupConfig(nextBackup);
      setEmailConfig(nextEmail);
      setSettingsForm(buildForm(nextBackup, nextEmail));
    } catch {
      message.error('加载备份数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      await api.post('/backup/trigger');
      message.success('备份完成，历史记录已刷新');
      await fetchData();
    } catch {
      message.error('备份失败，请检查数据库连接、mysqldump 和备份目录权限');
    } finally {
      setTriggering(false);
    }
  };

  const openSettingsModal = () => {
    setSettingsForm(buildForm(backupConfig, emailConfig));
    setSettingsModalOpen(true);
  };

  const saveSettingsConfig = async () => {
    setSettingsSaving(true);
    try {
      await api.put('/backup/email-config', settingsForm);
      message.success('备份配置已保存');
      setSettingsModalOpen(false);
      fetchData();
    } catch {
      message.error('保存失败，请检查填写内容');
    } finally {
      setSettingsSaving(false);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await api.post('/backup/test-email');
      message.success('测试邮件已发送');
    } catch {
      message.error('发送失败，请检查 SMTP 配置，并确认已经有至少一条备份历史');
    } finally {
      setTesting(false);
    }
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
  };

  const columns = [
    { title: '文件名', dataIndex: 'name', key: 'name', width: 260, ellipsis: true, render: (v: string) => <EllipsisText value={v} maxWidth={238} /> },
    { title: '位置', dataIndex: 'location', key: 'location', width: 260, ellipsis: true, render: (v: string) => <EllipsisText value={v || 'auto'} maxWidth={238} /> },
    { title: '大小', dataIndex: 'sizeMB', key: 'sizeMB', width: 100, render: (v: number) => `${v} MB` },
    {
      title: '备份时间', dataIndex: 'mtime', key: 'mtime', width: 180,
      render: (v: string) => formatTime(v),
    },
  ];

  const emailReady = Boolean(emailConfig.enabled && emailConfig.host && emailConfig.user && emailConfig.passConfigured && emailConfig.from && emailConfig.to);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>备份管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button icon={<SaveOutlined />} onClick={openSettingsModal}>备份配置</Button>
          <Popconfirm title="确定要立即执行一次数据库备份吗？" onConfirm={triggerBackup}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={triggering}>立即备份</Button>
          </Popconfirm>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="备份配置已改为后台管理"
        description="备份目录、保留天数、自动备份时间和 SMTP 邮件通知都在本页配置。保存后立即写入数据库，自动备份和手动备份都会读取最新配置。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<><HistoryOutlined style={{ marginRight: 8 }} />备份历史</>}
            style={{ marginBottom: 16 }}
          >
            <Table
              dataSource={files}
              columns={columns}
              rowKey={(row) => `${row.location || row.name}-${row.mtime}`}
              loading={loading}
              pagination={{ pageSize: 15 }}
              locale={{ emptyText: <Empty description="暂无备份记录，点击「立即备份」创建" /> }}
              size="middle"
              tableLayout="fixed"
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<><CloudUploadOutlined style={{ marginRight: 8 }} />自动备份</>}
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="状态">
                {backupConfig.enabled ? <Tag color="green">已开启</Tag> : <Tag color="default">已关闭</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="执行时间">
                每天 {String(backupConfig.autoHour).padStart(2, '0')}:00
              </Descriptions.Item>
              <Descriptions.Item label="保留天数">{backupConfig.retentionDays} 天</Descriptions.Item>
              <Descriptions.Item label="备份目录">
                <Text code style={{ fontSize: 12 }}>{backupConfig.autoDir || '未配置'}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title={<><MailOutlined style={{ marginRight: 8 }} />邮件通知</>}
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态">
                {emailConfig.enabled ? <Tag color="green">已开启</Tag> : <Tag color="default">未开启</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="SMTP">
                <Text style={{ fontSize: 12 }}>{emailConfig.host || '未配置'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="发件人">
                <Text style={{ fontSize: 12 }}>{emailConfig.from || '未配置'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="收件人">
                <Text style={{ fontSize: 12 }}>{emailConfig.to || '未配置'}</Text>
              </Descriptions.Item>
            </Descriptions>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button icon={<SendOutlined />} onClick={openSettingsModal} block>配置备份和邮件</Button>
              <Button onClick={testEmail} loading={testing} disabled={!emailReady} block>发送测试邮件</Button>
            </Space>
            {!emailReady && emailConfig.enabled && (
              <Alert
                style={{ marginTop: 12 }}
                type="warning"
                showIcon
                message="邮件通知尚未配置完整"
                description="请填写 SMTP 服务器、账号、密码、发件人和收件人后再发送测试邮件。"
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="备份配置"
        open={settingsModalOpen}
        onOk={saveSettingsConfig}
        onCancel={() => setSettingsModalOpen(false)}
        confirmLoading={settingsSaving}
        width={720}
      >
        <Form layout="vertical">
          <Card size="small" title="数据库备份" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="自动备份">
                  <Switch
                    checked={settingsForm.backupEnabled}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(v) => setSettingsForm({ ...settingsForm, backupEnabled: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="每天几点备份">
                  <InputNumber
                    min={0}
                    max={23}
                    precision={0}
                    style={{ width: '100%' }}
                    value={settingsForm.autoHour}
                    onChange={(v) => setSettingsForm({ ...settingsForm, autoHour: Number(v ?? 3) })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="保留天数">
                  <InputNumber
                    min={1}
                    max={365}
                    precision={0}
                    style={{ width: '100%' }}
                    value={settingsForm.retentionDays}
                    onChange={(v) => setSettingsForm({ ...settingsForm, retentionDays: Number(v ?? 7) })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item label="备份保存目录" extra="留空时使用安装目录下的 backups/db。生产环境请确认该目录对 Node 进程可写。">
                  <Input
                    value={settingsForm.backupDir}
                    placeholder="/www/wwwroot/ai-creator/backups/db"
                    onChange={(e) => setSettingsForm({ ...settingsForm, backupDir: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="备份超时秒数">
                  <InputNumber
                    min={30}
                    max={3600}
                    precision={0}
                    style={{ width: '100%' }}
                    value={settingsForm.timeoutSeconds}
                    onChange={(v) => setSettingsForm({ ...settingsForm, timeoutSeconds: Number(v ?? 300) })}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="邮件通知">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="邮件通知">
                  <Switch
                    checked={settingsForm.emailEnabled}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(v) => setSettingsForm({ ...settingsForm, emailEnabled: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="SSL 加密">
                  <Switch
                    checked={settingsForm.smtpSecure}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(v) => setSettingsForm({ ...settingsForm, smtpSecure: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="SMTP 端口">
                  <InputNumber
                    min={1}
                    max={65535}
                    precision={0}
                    style={{ width: '100%' }}
                    value={settingsForm.smtpPort}
                    onChange={(v) => setSettingsForm({ ...settingsForm, smtpPort: Number(v ?? 465) })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="SMTP 服务器">
              <Input
                value={settingsForm.smtpHost}
                placeholder="smtp.qq.com"
                onChange={(e) => setSettingsForm({ ...settingsForm, smtpHost: e.target.value })}
              />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="SMTP 账号">
                  <Input
                    value={settingsForm.smtpUser}
                    placeholder="your@email.com"
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpUser: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="SMTP 密码或授权码" extra={emailConfig.passConfigured ? `当前已配置：${emailConfig.passMasked || '****'}` : '邮箱服务商一般要求填写授权码，不是网页登录密码。'}>
                  <Input.Password
                    value={settingsForm.smtpPass}
                    placeholder={emailConfig.passConfigured ? '留空不修改原密码' : '请输入邮箱授权码'}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpPass: e.target.value })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="发件人">
                  <Input
                    value={settingsForm.from}
                    placeholder='"AI Creator" <your@email.com>'
                    onChange={(e) => setSettingsForm({ ...settingsForm, from: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="收件人">
                  <Input
                    value={settingsForm.to}
                    placeholder="admin@email.com,admin2@email.com"
                    onChange={(e) => setSettingsForm({ ...settingsForm, to: e.target.value })}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>多个地址用英文逗号分隔。</Text>
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
