import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  List,
  Progress,
  Result,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import axios from 'axios';

type InstallState =
  | 'installed'
  | 'installing'
  | 'partial'
  | 'repair_required'
  | 'needs_finalize'
  | 'not_installed'
  | 'uninstalled'
  | 'env_missing'
  | 'db_unavailable'
  | 'db_not_ready'
  | 'config_missing'
  | 'unknown_error';

type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'partial_success';

type PersistentInstallStepKey =
  | 'writeConfig'
  | 'testDatabase'
  | 'migrateDatabase'
  | 'initSystemConfig'
  | 'createAdmin'
  | 'writeInstallLock'
  | 'startPm2';

type PersistentInstallStepStatus = 'pending' | 'running' | 'completed' | 'failed';

interface PersistentInstallState {
  version: 1;
  steps: Partial<Record<PersistentInstallStepKey, PersistentInstallStepStatus>>;
  lastError?: {
    step: PersistentInstallStepKey;
    message: string;
    time: string;
  };
  warnings?: string[];
  updatedAt: string;
}

interface InstallStatus {
  installed: boolean;
  state: InstallState;
  status: InstallState;
  message: string;
  environment?: {
    ok: boolean;
    missing?: string[];
    invalid?: string[];
  };
  database?: {
    connected: boolean;
    ready: boolean;
    error?: string;
    missingTables?: string[];
    missingConfigs?: string[];
    systemInstalledValue?: string | null;
    adminReady?: boolean;
  };
  installState?: PersistentInstallState | null;
  service?: {
    ready: boolean;
    port: number;
    pm2Home: string;
    pm2Status: string | null;
    pm2Cwd?: string;
    pm2ScriptPath?: string;
    healthCheckUrl?: string;
    healthOk: boolean;
    healthStatus?: string;
    healthReleaseVersion?: string;
    healthResponse?: string;
    error?: string;
  };
  diagnostics?: Record<string, unknown>;
}

interface EnvCheck {
  name: string;
  key: string;
  current?: string;
  required?: string;
  passed: boolean;
  level: 'required' | 'suggested' | 'info';
  suggestion?: string;
}

interface InstallTaskStep {
  key: string;
  title: string;
  status: TaskStatus;
  message?: string;
}

interface InstallTask {
  id: string;
  kind: 'install' | 'build';
  status: TaskStatus;
  step: string;
  steps: InstallTaskStep[];
  logs: string[];
  error?: string;
  installed?: boolean;
  result?: Record<string, unknown>;
}

interface InstallDraft {
  db: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  admin: {
    username: string;
    password: string;
    confirmPassword: string;
  };
  system: {
    port: number;
    siteName: string;
    adminTitle: string;
    timezone: string;
    storageProvider: string;
  };
}

type InstallDraftPatch = {
  db?: Partial<InstallDraft['db']>;
  admin?: Partial<InstallDraft['admin']>;
  system?: Partial<InstallDraft['system']>;
};

const api = axios.create({ baseURL: '/api/install' });
api.interceptors.response.use((res) => {
  if (res.data.code !== 0) {
    const err = new Error(res.data.message || '请求失败');
    (err as any).response = res;
    return Promise.reject(err);
  }
  return res.data.data;
});

const stepItems = [
  { title: '环境检测', icon: <SafetyCertificateOutlined /> },
  { title: '数据库配置', icon: <DatabaseOutlined /> },
  { title: '管理员配置', icon: <UserOutlined /> },
  { title: '系统配置', icon: <SettingOutlined /> },
  { title: '执行安装', icon: <PlayCircleOutlined /> },
  { title: '完成', icon: <CheckCircleOutlined /> },
];

const persistentStepItems: Array<{ key: PersistentInstallStepKey; taskKey: string; title: string }> = [
  { key: 'writeConfig', taskKey: 'write_config', title: '正在写入配置' },
  { key: 'testDatabase', taskKey: 'test_database', title: '正在测试数据库' },
  { key: 'migrateDatabase', taskKey: 'create_tables', title: '正在创建数据表' },
  { key: 'initSystemConfig', taskKey: 'init_config', title: '正在初始化系统配置' },
  { key: 'createAdmin', taskKey: 'create_admin', title: '正在创建管理员' },
  { key: 'writeInstallLock', taskKey: 'write_lock', title: '正在写入安装锁' },
  { key: 'startPm2', taskKey: 'pm2', title: '正在启动 PM2 服务' },
];

const defaultDraft: InstallDraft = {
  db: {
    host: '127.0.0.1',
    port: 3306,
    database: 'ai_creator',
    username: 'root',
    password: '',
  },
  admin: {
    username: 'admin',
    password: '',
    confirmPassword: '',
  },
  system: {
    port: 3000,
    siteName: 'AI创作工坊',
    adminTitle: 'AI创作工坊后台',
    timezone: 'Asia/Shanghai',
    storageProvider: 'local',
  },
};

function apiErrorMessage(e: any, fallback: string) {
  return e?.response?.data?.message || e?.message || fallback;
}

function statusHint(status?: InstallStatus | null) {
  if (!status || status.installed) return '';
  if (status.state === 'partial') return status.message || '基础安装已完成，但服务启动失败，可继续安装或重试启动服务。';
  if (status.state === 'repair_required' || status.state === 'needs_finalize') return status.message || '安装状态需要修复，请重新执行安装收尾。';
  if (status.state === 'installing') return '安装任务正在执行，请等待当前步骤完成。';
  if (status.state === 'env_missing') return '当前还没有完整的环境配置文件，安装执行时会自动生成安全密钥并写入配置，无需手动处理。';
  if (status.state === 'db_unavailable') return status.database?.error || '数据库当前不可用，请在数据库配置步骤填写正确账号。';
  if (status.state === 'db_not_ready') return '数据库表结构还未初始化，执行安装后会自动创建表和迁移。';
  if (status.state === 'config_missing') return '系统配置或管理员账号未初始化，请继续执行安装。';
  return status.message;
}

function percent(task?: InstallTask | null) {
  if (!task?.steps?.length) return 0;
  const done = task.steps.filter((item) => item.status === 'success').length;
  return Math.round((done / task.steps.length) * 100);
}

function stepsFromInstallState(state?: PersistentInstallState | null): InstallTaskStep[] {
  const steps = state?.steps || {};
  return persistentStepItems.map((item) => {
    const persisted = steps[item.key] || 'pending';
    const status: TaskStatus =
      persisted === 'completed' ? 'success' :
        persisted === 'failed' ? 'failed' :
          persisted === 'running' ? 'running' : 'pending';
    return {
      key: item.taskKey,
      title: item.title,
      status,
      message: item.key === state?.lastError?.step ? state.lastError.message : undefined,
    };
  });
}

async function getInstallStatus(): Promise<InstallStatus> {
  return api.get('/status') as unknown as Promise<InstallStatus>;
}

async function getTask(id: string): Promise<InstallTask> {
  return api.get(`/tasks/${id}`) as unknown as Promise<InstallTask>;
}

export default function Install() {
  const [step, setStep] = useState(() => Math.min(parseInt(sessionStorage.getItem('install_step') || '0', 10), stepItems.length - 1));
  const [draft, setDraft] = useState<InstallDraft>(defaultDraft);
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const navigate = useNavigate();

  useEffect(() => { sessionStorage.setItem('install_step', step.toString()); }, [step]);

  useEffect(() => {
    getInstallStatus().then((r) => {
      setStatus(r);
      if (r?.installed) navigate('/login', { replace: true });
      else if (r?.state === 'partial' || r?.state === 'installing' || r?.state === 'repair_required' || r?.state === 'needs_finalize') setStep(4);
    }).catch(() => undefined);
  }, [navigate]);

  const updateDraft = (patch: InstallDraftPatch) => {
    setDraft((old) => ({
      db: { ...old.db, ...(patch.db || {}) },
      admin: { ...old.admin, ...(patch.admin || {}) },
      system: { ...old.system, ...(patch.system || {}) },
    }));
  };

  return (
    <div className="install-shell">
      <style>{installStyles}</style>
      <div className="install-panel">
        <div className="install-header">
          <div>
            <Typography.Text className="install-kicker">AI 创作工坊 · 安装向导</Typography.Text>
            <Typography.Title level={2}>AI创作工坊安装向导</Typography.Title>
          </div>
          <Tag color={status?.installed ? 'green' : status?.state === 'partial' || status?.state === 'repair_required' || status?.state === 'needs_finalize' ? 'gold' : 'blue'}>
            {status?.installed ? '已安装' : status?.state === 'repair_required' || status?.state === 'needs_finalize' ? '待修复' : status?.state === 'partial' ? '部分完成' : '待安装'}
          </Tag>
        </div>

        {status && !status.installed && statusHint(status) && (
          <Alert className="install-alert" type="info" showIcon message={statusHint(status)} />
        )}

        <Steps current={step} items={stepItems} className="install-steps" />

        <Card className="install-card">
          {step === 0 && <StepEnvironment onNext={() => setStep(1)} />}
          {step === 1 && <StepDatabase draft={draft} updateDraft={updateDraft} onPrev={() => setStep(0)} onNext={() => setStep(2)} />}
          {step === 2 && <StepAdmin draft={draft} updateDraft={updateDraft} onPrev={() => setStep(1)} onNext={() => setStep(3)} />}
          {step === 3 && <StepSystem draft={draft} updateDraft={updateDraft} onPrev={() => setStep(2)} onNext={() => setStep(4)} />}
          {step === 4 && <StepExecute draft={draft} status={status} onStatusChange={setStatus} onPrev={() => setStep(3)} onDone={() => setStep(5)} />}
          {step === 5 && <StepComplete onBack={() => setStep(4)} />}
        </Card>
      </div>
    </div>
  );
}

function StepEnvironment({ onNext }: { onNext: () => void }) {
  const [checks, setChecks] = useState<EnvCheck[]>([]);
  const [allPassed, setAllPassed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buildTask, setBuildTask] = useState<InstallTask | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/check-env');
      setChecks(r.checks || []);
      setAllPassed(!!r.allPassed);
    } catch (e: any) {
      message.error(apiErrorMessage(e, '环境检测失败'));
    } finally {
      setLoading(false);
    }
  };

  const startBuild = async () => {
    try {
      const task = await api.post('/build') as unknown as InstallTask;
      setBuildTask(task);
      void pollBuild(task.id);
    } catch (e: any) {
      message.error(apiErrorMessage(e, '构建任务启动失败'));
    }
  };

  const pollBuild = async (id: string) => {
    for (;;) {
      const task = await getTask(id);
      setBuildTask(task);
      if (task.status === 'success') {
        message.success('构建完成');
        await runCheck();
        return;
      }
      if (task.status === 'failed') return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  };

  useEffect(() => { runCheck(); }, []);

  const missingDist = checks.some((item) => ['admin_dist', 'server_dist'].includes(item.key) && !item.passed);

  return (
    <div>
      <Typography.Title level={4}>第一步：环境检测</Typography.Title>
      <List
        dataSource={checks}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              avatar={item.passed ? <CheckCircleOutlined className="ok-icon" /> : <CloudServerOutlined className="bad-icon" />}
              title={<Space><span>{item.name}</span><Tag>{item.level === 'required' ? '必需' : item.level === 'suggested' ? '建议' : '信息'}</Tag></Space>}
              description={<div>{item.current || item.required}{item.suggestion ? <div className="danger-text">{item.suggestion}</div> : null}</div>}
            />
            <Tag color={item.passed ? 'green' : item.level === 'required' ? 'red' : 'gold'}>{item.passed ? '通过' : '待处理'}</Tag>
          </List.Item>
        )}
      />

      {missingDist && (
        <Alert
          type="warning"
          showIcon
          className="install-alert"
          message="当前部署包缺少构建产物"
          description="默认安装要求 release 包已经包含 admin-web/dist 和 server/dist。可以换用 release 构建包，或在高级操作里重新构建。"
        />
      )}

      <Collapse
        ghost
        items={[{
          key: 'build',
          label: <Space><ToolOutlined />高级操作：重新构建</Space>,
          children: (
            <div>
              <Button onClick={startBuild} disabled={buildTask?.status === 'running'} loading={buildTask?.status === 'running'}>
                执行 npm ci && npm run build
              </Button>
              {buildTask && (
                <div className="task-box">
                  <Progress percent={percent(buildTask)} status={buildTask.status === 'failed' ? 'exception' : buildTask.status === 'success' ? 'success' : 'active'} />
                  <StepList steps={buildTask.steps} />
                  <pre className="log-box">{buildTask.logs.join('\n')}</pre>
                </div>
              )}
            </div>
          ),
        }]}
      />

      <Space className="actions">
        <Button icon={<ReloadOutlined />} onClick={runCheck} loading={loading}>重新检测</Button>
        <Button type="primary" onClick={onNext} disabled={!allPassed}>下一步</Button>
      </Space>
    </div>
  );
}

function StepDatabase({ draft, updateDraft, onPrev, onNext }: { draft: InstallDraft; updateDraft: (patch: InstallDraftPatch) => void; onPrev: () => void; onNext: () => void }) {
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const setDb = (values: Partial<InstallDraft['db']>) => {
    updateDraft({ db: values });
    setTested(false);
  };

  const testDb = async () => {
    setTesting(true);
    try {
      const r: any = await api.post('/test-db', {
        host: draft.db.host,
        port: draft.db.port,
        database: draft.db.database,
        username: draft.db.username,
        password: draft.db.password,
        autoCreate: true,
      });
      setTestResult(r);
      setTested(!!r.success);
      if (r.success) message.success(r.message || '数据库连接成功');
      else message.error(r.message || '数据库连接失败');
    } catch (e: any) {
      setTestResult(null);
      setTested(false);
      message.error(apiErrorMessage(e, '数据库连接失败'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4}>第二步：数据库配置</Typography.Title>
      <Form layout="vertical" initialValues={draft.db}>
        <Form.Item label="数据库地址" required extra="通常是 127.0.0.1（本地数据库）。"><Input value={draft.db.host} onChange={(e) => setDb({ host: e.target.value })} placeholder="127.0.0.1" /></Form.Item>
        <Form.Item label="数据库端口" required extra="MySQL 默认端口 3306。"><InputNumber min={1} max={65535} value={draft.db.port} onChange={(v) => setDb({ port: Number(v || 3306) })} className="full-input" /></Form.Item>
        <Form.Item label="数据库名称" required extra="安装向导会自动创建该数据库（如果不存在）。"><Input value={draft.db.database} onChange={(e) => setDb({ database: e.target.value })} placeholder="ai_creator" /></Form.Item>
        <Form.Item label="数据库用户名" required><Input value={draft.db.username} onChange={(e) => setDb({ username: e.target.value })} placeholder="root" /></Form.Item>
        <Form.Item label="数据库密码" extra="宝塔面板创建数据库时可设置密码。"><Input.Password value={draft.db.password} onChange={(e) => setDb({ password: e.target.value })} /></Form.Item>
      </Form>
      {testResult?.warning && <Alert type="warning" showIcon message={testResult.warning} />}
      <Space className="actions">
        <Button onClick={onPrev}>上一步</Button>
        <Button onClick={testDb} loading={testing}>测试连接</Button>
        <Button type="primary" onClick={onNext} disabled={!tested}>下一步</Button>
      </Space>
    </div>
  );
}

function StepAdmin({ draft, updateDraft, onPrev, onNext }: { draft: InstallDraft; updateDraft: (patch: InstallDraftPatch) => void; onPrev: () => void; onNext: () => void }) {
  const setAdmin = (values: Partial<InstallDraft['admin']>) => updateDraft({ admin: values });
  const validate = () => {
    if (draft.admin.username.length < 3 || draft.admin.username.length > 32) {
      message.error('管理员账号需 3-32 个字符');
      return;
    }
    if (draft.admin.password.length < 8) {
      message.error('管理员密码至少 8 个字符');
      return;
    }
    if (draft.admin.password !== draft.admin.confirmPassword) {
      message.error('两次密码不一致');
      return;
    }
    onNext();
  };

  return (
    <div>
      <Typography.Title level={4}>第三步：管理员配置</Typography.Title>
      <Form layout="vertical">
        <Form.Item label="管理员账号" required><Input value={draft.admin.username} onChange={(e) => setAdmin({ username: e.target.value })} /></Form.Item>
        <Form.Item label="管理员密码" required><Input.Password value={draft.admin.password} onChange={(e) => setAdmin({ password: e.target.value })} /></Form.Item>
        <Form.Item label="确认密码" required><Input.Password value={draft.admin.confirmPassword} onChange={(e) => setAdmin({ confirmPassword: e.target.value })} /></Form.Item>
      </Form>
      <Alert type="info" showIcon message="JWT_SECRET 和 ENCRYPTION_KEY 将由后端自动生成，不需要手动填写。" />
      <Space className="actions">
        <Button onClick={onPrev}>上一步</Button>
        <Button type="primary" onClick={validate}>下一步</Button>
      </Space>
    </div>
  );
}

function StepSystem({ draft, updateDraft, onPrev, onNext }: { draft: InstallDraft; updateDraft: (patch: InstallDraftPatch) => void; onPrev: () => void; onNext: () => void }) {
  const setSystem = (values: Partial<InstallDraft['system']>) => updateDraft({ system: values });

  return (
    <div>
      <Typography.Title level={4}>第四步：系统配置</Typography.Title>
      <Form layout="vertical">
        <Form.Item label="后端服务端口" required extra="Nginx 反向代理将指向此端口，一般用默认 3000 即可。"><InputNumber min={1} max={65535} value={draft.system.port} onChange={(v) => setSystem({ port: Number(v || 3000) })} className="full-input" /></Form.Item>
        <Form.Item label="站点名称" required extra="用于小程序和管理后台展示。"><Input value={draft.system.siteName} onChange={(e) => setSystem({ siteName: e.target.value })} placeholder="AI创作工坊" /></Form.Item>
        <Form.Item label="后台管理页面标题" required><Input value={draft.system.adminTitle} onChange={(e) => setSystem({ adminTitle: e.target.value })} placeholder="AI创作工坊后台" /></Form.Item>
        <Form.Item label="站点时区" required extra="中国服务器填 Asia/Shanghai。"><Input value={draft.system.timezone} onChange={(e) => setSystem({ timezone: e.target.value })} placeholder="Asia/Shanghai" /></Form.Item>
        <Form.Item label="文件存储方式" required extra="选 local 表示文件保存在服务器本地磁盘，无需配置第三方云存储即可使用。后期可在后台切换。">
          <Select value={draft.system.storageProvider} onChange={(v) => setSystem({ storageProvider: v })} options={[{ label: '本地存储（推荐新手使用）', value: 'local' }]} />
        </Form.Item>
      </Form>
      <Space className="actions">
        <Button onClick={onPrev}>上一步</Button>
        <Button type="primary" onClick={onNext}>下一步</Button>
      </Space>
    </div>
  );
}

function StepExecute({
  draft,
  status,
  onStatusChange,
  onPrev,
  onDone,
}: {
  draft: InstallDraft;
  status: InstallStatus | null;
  onStatusChange: (status: InstallStatus) => void;
  onPrev: () => void;
  onDone: () => void;
}) {
  const [task, setTask] = useState<InstallTask | null>(null);
  const [starting, setStarting] = useState(false);
  const partial = status?.state === 'partial';
  const needsRepair = status?.state === 'repair_required' || status?.state === 'needs_finalize';
  const repairNeedsPm2 = needsRepair && status?.database?.ready && !status?.service?.ready;
  const stateSteps = useMemo(() => stepsFromInstallState(status?.installState), [status?.installState]);
  const displaySteps = task?.steps || (status?.installState ? stateSteps : undefined);
  const displayProgressTask = task || (displaySteps ? { steps: displaySteps } as InstallTask : null);

  const payload = useMemo(() => ({
    db: draft.db,
    admin: draft.admin,
    system: draft.system,
    port: status?.service?.port || draft.system.port,
  }), [draft, status?.service?.port]);

  const start = async () => {
    setStarting(true);
    try {
      if (needsRepair && !repairNeedsPm2) {
        const res: any = await api.post('/finalize');
        message.success(res.message || res.data?.message || '安装收尾修复完成，系统已恢复为已安装状态。');
        const nextStatus = await getInstallStatus();
        onStatusChange(nextStatus);
        if (nextStatus.installed) {
          sessionStorage.removeItem('install_step');
          onDone();
        }
        return;
      }

      const nextTask = await api.post(partial || repairNeedsPm2 ? '/retry-pm2' : '/tasks', { ...payload, port: payload.port }) as unknown as InstallTask;
      setTask(nextTask);
      void pollInstall(nextTask.id);
    } catch (e: any) {
      message.error(apiErrorMessage(e, '安装任务启动失败'));
    } finally {
      setStarting(false);
    }
  };

  const pollInstall = async (id: string) => {
    for (;;) {
      const latest = await getTask(id);
      setTask(latest);
      if (latest.status === 'success') {
        const status = await getInstallStatus();
        onStatusChange(status);
        if (status.installed) {
          sessionStorage.removeItem('install_step');
          onDone();
        } else {
          message.error(status.message || '安装任务完成，但安装状态仍未就绪');
        }
        return;
      }
      if (latest.status === 'partial_success') {
        const nextStatus = await getInstallStatus();
        onStatusChange(nextStatus);
        message.warning('基础安装已完成，但 PM2 服务启动失败，可重试启动服务。');
        return;
      }
      if (latest.status === 'failed') {
        const nextStatus = await getInstallStatus().catch(() => null);
        if (nextStatus) onStatusChange(nextStatus);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  };

  return (
    <div>
      <Typography.Title level={4}>第五步：执行安装</Typography.Title>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="数据库">{draft.db.host}:{draft.db.port}/{draft.db.database}</Descriptions.Item>
        <Descriptions.Item label="管理员">{draft.admin.username}</Descriptions.Item>
        <Descriptions.Item label="站点">{draft.system.siteName}</Descriptions.Item>
        <Descriptions.Item label="端口">{status?.service?.port || draft.system.port}</Descriptions.Item>
        {status?.service?.pm2Home && <Descriptions.Item label="PM2_HOME">{status.service.pm2Home}</Descriptions.Item>}
      </Descriptions>

      {partial && (
        <Alert
          className="install-alert"
          type="warning"
          showIcon
          message="基础安装已完成，但服务启动失败"
          description="可以直接重试启动服务；已完成的数据库、配置、管理员和安装锁步骤不会重复破坏性执行。"
        />
      )}

      {needsRepair && (
        <Alert
          className="install-alert"
          type="warning"
          showIcon
          message="安装状态需要修复"
          description={repairNeedsPm2 ? '数据库已初始化，但服务健康检查未通过。将先重试启动 PM2，再补写 shared/.env.installed。' : '数据库和服务已就绪，将只执行安全检查并补写 shared/.env.installed，不会重新初始化数据库或创建管理员。'}
        />
      )}

      <div className="task-box">
        <Progress
          percent={percent(displayProgressTask)}
          status={task?.status === 'failed' ? 'exception' : task?.status === 'success' ? 'success' : partial ? 'exception' : task ? 'active' : 'normal'}
        />
        {displaySteps ? <StepList steps={displaySteps} /> : <Alert type="info" showIcon message="点击开始后，后端会自动写入 .env、初始化数据库、创建管理员、写入安装锁并处理 PM2。" />}
        {task?.error && <Alert type="error" showIcon message="安装失败" description={task.error} />}
        {!task?.error && status?.installState?.lastError && (
          <Alert className="install-alert" type="error" showIcon message="上次失败摘要" description={status.installState.lastError.message} />
        )}
        {status?.installState?.warnings?.length ? (
          <Alert className="install-alert" type="warning" showIcon message="权限处理提示" description={status.installState.warnings.slice(-3).join('\n')} />
        ) : null}
        {task?.logs?.length ? <pre className="log-box">{task.logs.join('\n')}</pre> : null}
      </div>

      <Space className="actions">
        <Button onClick={onPrev} disabled={partial || task?.status === 'running'}>上一步</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={start} loading={starting || task?.status === 'running'} disabled={task?.status === 'running'}>
          {needsRepair ? (repairNeedsPm2 ? '重试启动服务并修复' : '修复安装状态') : partial ? '重试启动服务' : task ? '继续安装' : '开始安装'}
        </Button>
      </Space>
    </div>
  );
}

function StepComplete({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await getInstallStatus();
      setStatus(r);
    } catch (e: any) {
      message.error(apiErrorMessage(e, '安装状态读取失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (!loading && status && !status.installed) {
    return (
      <Result
        status="error"
        title="安装状态未完成"
        subTitle={status.message}
        extra={<Space><Button onClick={onBack}>返回执行安装</Button><Button onClick={refresh}>重新检查</Button></Space>}
      />
    );
  }

  return (
    <Result
      status="success"
      title="安装完成"
      subTitle="系统已写入安装锁并确认 /api/install/status 返回 installed=true。"
      extra={<Button type="primary" size="large" href="/login">进入后台登录</Button>}
    />
  );
}

function StepList({ steps }: { steps: InstallTaskStep[] }) {
  return (
    <List
      size="small"
      dataSource={steps}
      renderItem={(item) => (
        <List.Item>
          <Space>
            <Tag color={item.status === 'success' ? 'green' : item.status === 'failed' ? 'red' : item.status === 'running' ? 'blue' : 'default'}>
              {item.status === 'success' ? '完成' : item.status === 'failed' ? '失败' : item.status === 'running' ? '进行中' : '等待'}
            </Tag>
            <span>{item.title}</span>
          </Space>
          {item.message ? <Typography.Text type={item.status === 'failed' ? 'danger' : 'secondary'}>{item.message}</Typography.Text> : null}
        </List.Item>
      )}
    />
  );
}

const installStyles = `
.install-shell {
  min-height: 100vh;
  padding: 36px 20px;
  background:
    radial-gradient(circle at top left, rgba(20, 184, 166, 0.18), transparent 32%),
    linear-gradient(135deg, #f8fafc 0%, #eef2ff 48%, #f7fee7 100%);
}
.install-panel {
  max-width: 980px;
  margin: 0 auto;
}
.install-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.install-header h2 {
  margin: 4px 0 0;
  color: #172554;
}
.install-kicker {
  color: #0f766e;
  font-weight: 700;
  letter-spacing: 0;
}
.install-alert {
  margin-bottom: 18px;
}
.install-steps {
  margin: 20px 0 24px;
}
.install-card {
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}
.actions {
  margin-top: 24px;
}
.full-input {
  width: 100%;
}
.ok-icon {
  color: #10b981;
  font-size: 20px;
}
.bad-icon {
  color: #ef4444;
  font-size: 20px;
}
.danger-text {
  color: #b91c1c;
  margin-top: 4px;
}
.task-box {
  margin-top: 18px;
}
.log-box {
  margin-top: 12px;
  max-height: 260px;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #d1fae5;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}
@media (max-width: 720px) {
  .install-shell {
    padding: 20px 12px;
  }
  .install-header {
    flex-direction: column;
  }
}
`;
