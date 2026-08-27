import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  CloudSyncOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Text, Paragraph } = Typography;

type CheckStatus = 'ok' | 'warning' | 'fail';
type PackageStatus = 'available' | 'invalid' | 'installed';
type InstallState = 'idle' | 'running' | 'success' | 'failed' | 'rollback_success' | 'rollback_failed' | 'stale';

interface UpdatePackage {
  filename: string;
  version: string;
  name: string;
  description: string;
  buildTime: string;
  uploadedAt?: string;
  size: number;
  status: PackageStatus;
  installed: boolean;
  isNewerThanCurrent: boolean;
  errors: string[];
  warnings: string[];
}

interface PrecheckItem {
  name: string;
  status: CheckStatus;
  message: string;
}

interface PrecheckResult {
  ok: boolean;
  filename: string;
  version: string;
  name?: string;
  description?: string;
  buildTime?: string;
  currentVersion: string;
  isNewerThanCurrent: boolean;
  installed: boolean;
  checks: PrecheckItem[];
  warnings: string[];
  errors: string[];
}

interface InstallStatus {
  installing: boolean;
  installId: string;
  version: string;
  filename: string;
  status: InstallState;
  step: string;
  startedAt: string | null;
  finishedAt: string | null;
  operator: string;
  error?: string;
  dbBackupPath?: string;
  codeBackupPath?: string;
  oldCurrentPath?: string;
  releaseDir?: string;
  dbMigrated?: boolean;
}

interface InstallLog {
  time: string;
  level: 'info' | 'warning' | 'error';
  step: string;
  message: string;
}

const checkColor: Record<CheckStatus, string> = { ok: 'green', warning: 'orange', fail: 'red' };
const packageColor: Record<PackageStatus, string> = { available: 'green', invalid: 'red', installed: 'blue' };
const installColor: Record<InstallState, string> = {
  idle: 'default',
  running: 'processing',
  success: 'green',
  failed: 'red',
  rollback_success: 'orange',
  rollback_failed: 'red',
  stale: 'orange',
};

const installText: Record<InstallState, string> = {
  idle: '空闲',
  running: '安装中',
  success: '安装成功',
  failed: '安装失败',
  rollback_success: '代码已回滚',
  rollback_failed: '回滚失败',
  stale: '安装中断',
};

const stepText: Record<string, string> = {
  precheck: '预检查',
  lock: '发布锁',
  backup_database: '备份数据库',
  backup_code: '备份代码',
  extract_release: '解压版本',
  prepare_env: '准备环境变量',
  install_dependencies: '安装依赖',
  build_or_check: '构建检查',
  check_encoding: '编码检查',
  run_migration: '执行迁移',
  switch_current: '切换 current',
  pm2_reload: 'PM2 reload',
  health_check: '健康检查',
  write_release_record: '写入记录',
  cleanup: '清理',
  rollback: '代码回滚',
  idle: '空闲',
};

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatSize(value?: number) {
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatUptime(seconds?: number) {
  const total = Math.floor(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function CheckTag({ status }: { status: CheckStatus }) {
  return <Tag color={checkColor[status]}>{status === 'ok' ? '通过' : status === 'warning' ? '警告' : '失败'}</Tag>;
}

function renderMessages(items?: string[]) {
  if (!items || items.length === 0) return '-';
  return (
    <Space direction="vertical" size={2}>
      {items.map((item, index) => <Text key={`${item}-${index}`}>{item}</Text>)}
    </Space>
  );
}

export default function SystemUpdate() {
  const [version, setVersion] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [packagesData, setPackagesData] = useState<any>(null);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [installLogs, setInstallLogs] = useState<InstallLog[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [precheckLoading, setPrecheckLoading] = useState('');
  const [installLoading, setInstallLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const packages = useMemo<UpdatePackage[]>(() => packagesData?.packages || [], [packagesData]);
  const installing = installStatus?.installing || installStatus?.status === 'running';
  const updateBusy = installing || uploading;
  const selectedPackage = precheck ? packages.find(item => item.filename === precheck.filename) : null;
  const restoreAllowedStatus = installStatus ? ['failed', 'rollback_success', 'rollback_failed', 'stale'].includes(installStatus.status) : false;
  const canRestoreDatabase = !!installStatus?.dbBackupPath && restoreAllowedStatus && !updateBusy;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [versionRes, checkRes]: any[] = await Promise.all([
        api.get('/system/version'),
        api.get('/system/check'),
      ]);
      setVersion(versionRes.data || {});
      setHealth(checkRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    setPackageLoading(true);
    try {
      const res: any = await api.get('/system/update-packages');
      setPackagesData(res.data || {});
      setPrecheck(null);
    } finally {
      setPackageLoading(false);
    }
  };

  const fetchInstallStatus = async () => {
    const res: any = await api.get('/system/update-packages/install-status');
    setInstallStatus(res.data || null);
    const id = res.data?.installId;
    if (id) {
      const logRes: any = await api.get('/system/update-packages/install-logs', { params: { installId: id } });
      setInstallLogs(logRes.data?.logs || []);
    }
  };

  const runPrecheck = async (filename: string) => {
    setPrecheckLoading(filename);
    try {
      const res: any = await api.post('/system/update-packages/precheck', { filename });
      setPrecheck(res.data || null);
    } finally {
      setPrecheckLoading('');
    }
  };

  const startInstall = async () => {
    if (!precheck) return;
    setInstallLoading(true);
    try {
      const res: any = await api.post('/system/update-packages/install', {
        filename: precheck.filename,
        confirmText,
      });
      message.success(res.data?.message || '安装任务已开始');
      setConfirmOpen(false);
      setConfirmText('');
      await fetchInstallStatus();
    } finally {
      setInstallLoading(false);
    }
  };

  const restoreDatabase = async () => {
    if (!installStatus?.dbBackupPath) return;
    setRestoreLoading(true);
    try {
      const res: any = await api.post('/system/update-packages/restore-database', {
        backupPath: installStatus.dbBackupPath,
      });
      message.success(res.message || res.data?.message || '数据库备份导入完成');
      await Promise.all([fetchInstallStatus(), fetchPackages()]);
    } finally {
      setRestoreLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: '.tar.gz',
    maxCount: 1,
    showUploadList: false,
    disabled: updateBusy,
    customRequest: async (options) => {
      const formData = new FormData();
      formData.append('file', options.file as File);
      setUploading(true);
      try {
        const res: any = await api.post('/system/update-packages/upload', formData);
        message.success(res.message || '更新包上传成功');
        options.onSuccess?.(res);
        await fetchPackages();
      } catch (err: any) {
        options.onError?.(err);
      } finally {
        setUploading(false);
      }
    },
  };

  useEffect(() => {
    fetchData();
    fetchInstallStatus();
  }, []);

  useEffect(() => {
    if (!installing) return undefined;
    const timer = window.setInterval(fetchInstallStatus, 3000);
    return () => window.clearInterval(timer);
  }, [installing]);

  const packageColumns = [
    { title: '文件名', dataIndex: 'filename', width: 280, render: (value: string) => <Text code>{value}</Text> },
    { title: '版本', dataIndex: 'version', width: 130, render: (value: string) => value || '-' },
    { title: '构建时间', dataIndex: 'buildTime', width: 180, render: formatTime },
    { title: '上传时间', dataIndex: 'uploadedAt', width: 180, render: formatTime },
    { title: '大小', dataIndex: 'size', width: 100, render: formatSize },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: PackageStatus) => <Tag color={packageColor[value]}>{value === 'available' ? '可预检' : value === 'invalid' ? '无效' : '已安装'}</Tag>,
    },
    {
      title: '提示',
      width: 260,
      render: (_: any, item: UpdatePackage) => (
        <Space direction="vertical" size={2}>
          {item.errors?.length ? <Text type="danger">{item.errors.join('；')}</Text> : null}
          {item.warnings?.length ? <Text type="warning">{item.warnings.join('；')}</Text> : null}
          {!item.errors?.length && !item.warnings?.length ? <Text type="secondary">-</Text> : null}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 210,
      render: (_: any, item: UpdatePackage) => (
        <Space>
          <Button
            size="small"
            icon={<SafetyCertificateOutlined />}
            loading={precheckLoading === item.filename}
            disabled={!item.filename || updateBusy}
            onClick={() => runPrecheck(item.filename)}
          >
            预检查
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CloudSyncOutlined />}
            disabled={updateBusy || !precheck?.ok || precheck.filename !== item.filename}
            onClick={() => setConfirmOpen(true)}
          >
            安装
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}><SyncOutlined /> 系统更新</h2>
          <Text type="secondary">扫描服务器本地 release 包，预检查后由超级管理员执行安装。</Text>
        </div>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>刷新状态</Button>
      </Space>

      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message="本阶段只安装服务器 update-packages 目录中的本地 release 包"
        description="请先在本地生成 release 包，再上传到服务器 update-packages 目录。本页面不提供远程下载或灰度发布；安装失败后可从安装状态中一键导入数据库备份。"
        style={{ marginBottom: 16 }}
      />

      <Card
        title="更新包"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={uploading} disabled={updateBusy}>上传更新包</Button>
            </Upload>
            <Button icon={<ReloadOutlined />} loading={packageLoading} disabled={uploading} onClick={fetchPackages}>检查更新</Button>
          </Space>
        }
      >
        <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
          <Descriptions.Item label="扫描目录">{packagesData?.packageDir || '-'}</Descriptions.Item>
          <Descriptions.Item label="当前版本">{packagesData?.currentVersion || version?.version || '-'}</Descriptions.Item>
        </Descriptions>

        <Table
          rowKey="filename"
          columns={packageColumns}
          dataSource={packages}
          loading={packageLoading}
          size="small"
          pagination={false}
          locale={{ emptyText: <Empty description="未检测到更新包" /> }}
          scroll={{ x: 1200 }}
        />

        {precheck && (
          <Card size="small" title={`预检查：${precheck.filename}`} style={{ marginTop: 16 }}>
            <Alert
              type={precheck.ok ? 'success' : 'error'}
              showIcon
              message={precheck.ok ? '预检查通过，可以进入二次确认' : '预检查失败，禁止安装'}
              description={precheck.ok ? '存在警告时仍可继续，但请先人工确认。安装失败只自动回滚代码，不自动恢复数据库。' : precheck.errors.join('；')}
              style={{ marginBottom: 12 }}
            />
            <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="目标版本">{precheck.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="当前版本">{precheck.currentVersion || '-'}</Descriptions.Item>
              <Descriptions.Item label="构建时间">{formatTime(precheck.buildTime || selectedPackage?.buildTime)}</Descriptions.Item>
              <Descriptions.Item label="说明">{precheck.description || selectedPackage?.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="警告">{renderMessages(precheck.warnings)}</Descriptions.Item>
              <Descriptions.Item label="错误">{renderMessages(precheck.errors)}</Descriptions.Item>
            </Descriptions>
            <Row gutter={[12, 12]}>
              {precheck.checks.map((item) => (
                <Col span={8} key={`${item.name}-${item.message}`}>
                  <Card size="small" title={<Space><span>{item.name}</span><CheckTag status={item.status} /></Space>}>
                    <Paragraph style={{ marginBottom: 0 }}>{item.message}</Paragraph>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </Card>

      <Card
        title="安装状态"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Popconfirm
              title="确认导入数据库备份？"
              description="该操作会把当前数据库恢复到所选 SQL 备份内容，请确认已停止安装任务。"
              okText="导入备份"
              cancelText="取消"
              disabled={!canRestoreDatabase || restoreLoading}
              onConfirm={restoreDatabase}
            >
              <Button
                icon={<DatabaseOutlined />}
                loading={restoreLoading}
                disabled={!canRestoreDatabase || restoreLoading}
              >
                导入数据库备份
              </Button>
            </Popconfirm>
            <Button onClick={fetchInstallStatus}>刷新日志</Button>
          </Space>
        }
      >
        <Descriptions column={3} size="small" style={{ marginBottom: 12 }}>
          <Descriptions.Item label="状态"><Tag color={installColor[installStatus?.status || 'idle']}>{installText[installStatus?.status || 'idle']}</Tag></Descriptions.Item>
          <Descriptions.Item label="步骤">{stepText[installStatus?.step || 'idle'] || installStatus?.step || '-'}</Descriptions.Item>
          <Descriptions.Item label="installId">{installStatus?.installId || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本">{installStatus?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="文件">{installStatus?.filename || '-'}</Descriptions.Item>
          <Descriptions.Item label="操作者">{installStatus?.operator || '-'}</Descriptions.Item>
          <Descriptions.Item label="数据库备份">{installStatus?.dbBackupPath || '-'}</Descriptions.Item>
          <Descriptions.Item label="代码备份">{installStatus?.codeBackupPath || '-'}</Descriptions.Item>
          <Descriptions.Item label="数据库迁移">{installStatus?.dbMigrated ? '已执行' : '-'}</Descriptions.Item>
          <Descriptions.Item label="错误">{installStatus?.error || '-'}</Descriptions.Item>
        </Descriptions>
        <Timeline
          items={installLogs.map((log) => ({
            color: log.level === 'error' ? 'red' : log.level === 'warning' ? 'orange' : 'blue',
            children: (
              <Space direction="vertical" size={0}>
                <Text type="secondary">{formatTime(log.time)} · {stepText[log.step] || log.step} · {log.level}</Text>
                <Text>{log.message}</Text>
              </Space>
            ),
          }))}
        />
      </Card>

      <Spin spinning={loading && !version && !health}>
        <Row gutter={16}>
          <Col span={6}><Card size="small"><Descriptions column={1} size="small"><Descriptions.Item label="当前版本">{version?.version || '-'}</Descriptions.Item></Descriptions></Card></Col>
          <Col span={6}><Card size="small"><Descriptions column={1} size="small"><Descriptions.Item label="运行环境">{version?.nodeEnv || '-'}</Descriptions.Item></Descriptions></Card></Col>
          <Col span={6}><Card size="small"><Descriptions column={1} size="small"><Descriptions.Item label="运行时长">{formatUptime(version?.uptime)}</Descriptions.Item></Descriptions></Card></Col>
          <Col span={6}><Card size="small"><Descriptions column={1} size="small"><Descriptions.Item label="系统状态"><Tag color={health?.status === 'fail' ? 'red' : health?.status === 'warning' ? 'orange' : 'green'}>{health?.status || '-'}</Tag></Descriptions.Item></Descriptions></Card></Col>
        </Row>
      </Spin>

      <Modal
        title="确认安装 release 包"
        open={confirmOpen}
        okText="开始安装"
        okButtonProps={{ disabled: updateBusy || confirmText !== precheck?.version, loading: installLoading }}
        onOk={startInstall}
        onCancel={() => setConfirmOpen(false)}
      >
        <Alert
          type="warning"
          showIcon
          message="安装会备份数据库和代码，执行 npm ci、migration、切换 current、PM2 reload 和健康检查。"
          description="失败后只自动回滚代码；如数据库已迁移，可回到安装状态中一键导入数据库备份。请确认当前不是业务高峰。"
          style={{ marginBottom: 12 }}
        />
        <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
          <Descriptions.Item label="当前版本">{precheck?.currentVersion || '-'}</Descriptions.Item>
          <Descriptions.Item label="目标版本">{precheck?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="文件名">{precheck?.filename || '-'}</Descriptions.Item>
          <Descriptions.Item label="构建时间">{formatTime(precheck?.buildTime || selectedPackage?.buildTime)}</Descriptions.Item>
          <Descriptions.Item label="更新说明">{precheck?.description || selectedPackage?.description || '-'}</Descriptions.Item>
        </Descriptions>
        <Paragraph>请输入目标版本号以确认安装：</Paragraph>
        <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={precheck?.version || ''} />
      </Modal>
    </div>
  );
}
