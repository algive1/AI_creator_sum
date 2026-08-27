import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  ConfigProvider,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Menu,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  GiftOutlined,
  HomeOutlined,
  LogoutOutlined,
  PictureOutlined,
  ReloadOutlined,
  RocketOutlined,
  ScissorOutlined,
  SearchOutlined,
  ToolOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  AuthSession,
  USER_CACHE_KEY,
  api,
  authApi,
  cacheSessionUser,
  clearTokens,
  getAccessToken,
  normalizeApiError,
  readCachedSession,
  unwrapData,
  uploadFile,
  uploadKeyOf,
  UploadResult,
} from './services/api';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const POINTS_INSUFFICIENT = 1002;
const TEMPLATE_DRAFT_KEY = 'user_web_template_draft';
const LOCAL_AUTH_SAMPLE = {
  email: 'tester@ooa8.test',
  password: 'Ooa8Test2026',
  nickname: '本地测试创作者',
};

type CreatorMode = 'image' | 'video' | 'comic';
type AuthContextValue = {
  user: any;
  points: any;
  membership: any;
  loading: boolean;
  updateSession: (session: AuthSession) => void;
  refreshMe: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const navItems = [
  { key: '/dashboard', label: '产品首页', icon: <HomeOutlined /> },
  { key: '/image', label: 'AI 生图工作台', icon: <PictureOutlined /> },
  { key: '/video', label: 'AI 生视频工作台', icon: <VideoCameraOutlined /> },
  { key: '/comic', label: 'AI 漫剧资产', icon: <BookOutlined /> },
  { key: '/templates', label: '灵感模板广场', icon: <BulbOutlined /> },
  { key: '/works', label: '资产与记录', icon: <AppstoreOutlined /> },
  { key: '/tools', label: '工具箱', icon: <ToolOutlined /> },
  { key: '/points', label: '会员积分商城', icon: <GiftOutlined /> },
  { key: '/profile', label: '个人中心', icon: <UserOutlined /> },
];

const ratioOptions = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'].map(value => ({ value, label: value }));
const imageResolutions = ['standard', 'high', 'ultra'].map(value => ({ value, label: resolutionLabel(value) }));
const videoDurations = [5, 8, 10, 15].map(value => ({ value, label: `${value} 秒` }));

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: '#116a7b',
          colorSuccess: '#2f9e44',
          colorWarning: '#c77700',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <MobileOnlyNotice />
        <AuthProvider>
          <div className="desktop-shell">
            <Routes>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedWorkbench><DashboardPage /></ProtectedWorkbench>} />
              <Route path="/image" element={<ProtectedWorkbench><CreatorPage mode="image" /></ProtectedWorkbench>} />
              <Route path="/video" element={<ProtectedWorkbench><CreatorPage mode="video" /></ProtectedWorkbench>} />
              <Route path="/comic" element={<ProtectedWorkbench><CreatorPage mode="comic" /></ProtectedWorkbench>} />
              <Route path="/templates" element={<ProtectedWorkbench><TemplatesPage /></ProtectedWorkbench>} />
              <Route path="/works" element={<ProtectedWorkbench><WorksPage /></ProtectedWorkbench>} />
              <Route path="/tasks/:id" element={<ProtectedWorkbench><TaskDetailPage /></ProtectedWorkbench>} />
              <Route path="/tools" element={<ProtectedWorkbench><ToolsPage /></ProtectedWorkbench>} />
              <Route path="/points" element={<ProtectedWorkbench><PointsPage /></ProtectedWorkbench>} />
              <Route path="/profile" element={<ProtectedWorkbench><ProfilePage /></ProtectedWorkbench>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
}

function AuthProvider({ children }: { children: ReactNode }) {
  const cached = readCachedSession();
  const [user, setUser] = useState<any>(cached?.user || null);
  const [points, setPoints] = useState<any>(cached?.points || null);
  const [membership, setMembership] = useState<any>(cached?.membership || null);
  const [loading, setLoading] = useState(true);

  const updateSession = useCallback((session: AuthSession) => {
    cacheSessionUser(session);
    setUser(session.user);
    setPoints(session.points || null);
    setMembership(session.membership || null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = unwrapData(await api.get('/users/me/full'));
      const next = {
        user: data.user || data,
        points: data.points || data.user?.points || null,
        membership: data.membership || null,
      };
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(next));
      setUser(next.user);
      setPoints(next.points);
      setMembership(next.membership);
    } catch (err) {
      const normalized = normalizeApiError(err);
      if (normalized.status === 401 || normalized.code === 401) {
        clearTokens();
        setUser(null);
        setPoints(null);
        setMembership(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
    setPoints(null);
    setMembership(null);
  }, []);

  const value = useMemo(() => ({
    user,
    points,
    membership,
    loading,
    updateSession,
    refreshMe,
    signOut,
  }), [loading, membership, points, refreshMe, signOut, updateSession, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthContext missing');
  return value;
}

function ProtectedWorkbench({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center-spin"><Spin /></div>;
  if (!user || !getAccessToken()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <WorkbenchShell>{children}</WorkbenchShell>;
}

function WorkbenchShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { points, signOut, user } = useAuth();
  const activeKey = navItems.find(item => location.pathname.startsWith(item.key))?.key || '/dashboard';
  const activeLabel = navItems.find(item => item.key === activeKey)?.label || '产品首页';

  return (
    <Layout className="workspace-layout">
      <Sider width={260} className="workspace-sider">
        <div className="workspace-sider-content">
          <button className="brand-lockup" onClick={() => navigate('/dashboard')} type="button">
            <span className="brand-mark">AI</span>
            <span>
              <strong>AI 艺术生成工坊</strong>
              <small>ooa8.com</small>
            </span>
          </button>
          <SidebarProfileCard user={user} points={points} />
          <Menu
            className="workspace-menu"
            mode="inline"
            selectedKeys={[activeKey]}
            items={navItems.map(item => ({ key: item.key, icon: item.icon, label: item.label }))}
            onClick={({ key }) => navigate(String(key))}
          />
          <MembershipPromoCard onOpen={() => navigate('/points')} />
        </div>
      </Sider>
      <Layout>
        <Header className="workspace-header">
          <Space size={14} className="workspace-header-left">
            <Text className="workspace-breadcrumb">产品首页 <span>/</span> {activeLabel}</Text>
            <Input
              className="workspace-search"
              prefix={<SearchOutlined />}
              placeholder="搜索模板、作品、功能..."
              readOnly
            />
          </Space>
          <Space size={12} className="workspace-header-actions">
            <Tag className="service-status">服务状态：良好</Tag>
            <Statistic value={Number(points?.balance || 0)} suffix="积分" valueStyle={{ fontSize: 18, color: '#f6c85f' }} />
            <Avatar icon={<UserOutlined />} src={user?.avatarUrl} />
            <Text strong>{user?.nickname || user?.email || '创作者'}</Text>
            <Button className="create-now-button" type="primary" icon={<RocketOutlined />} onClick={() => navigate('/image')}>立即创作</Button>
            <Tooltip title="退出登录">
              <Button
                icon={<LogoutOutlined />}
                onClick={() => {
                  signOut();
                  navigate('/login');
                }}
              />
            </Tooltip>
          </Space>
        </Header>
        <Layout className="workspace-main">
          <Content className="workspace-content">{children}</Content>
          <aside className="task-rail">
            <TaskQueue />
          </aside>
        </Layout>
      </Layout>
    </Layout>
  );
}

function SidebarProfileCard({ user, points }: { user: any; points: any }) {
  return (
    <section className="sidebar-profile-card">
      <div className="sidebar-profile-main">
        <Avatar size={58} icon={<UserOutlined />} src={user?.avatarUrl} />
        <div>
          <strong>{user?.nickname || user?.email || '创作者用户'}</strong>
          <Tag className="sidebar-member-tag" icon={<GiftOutlined />}>专业会员 · 42天</Tag>
        </div>
      </div>
      <div className="sidebar-profile-stats">
        <div>
          <span>可用积分</span>
          <strong>{Number(points?.balance || 0).toLocaleString()}</strong>
        </div>
        <div>
          <span>本月作品</span>
          <strong>28</strong>
        </div>
      </div>
    </section>
  );
}

function MembershipPromoCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="membership-promo-card">
      <span className="membership-gem">◆</span>
      <strong>开通尊享会员</strong>
      <Text>解锁高清输出、优先队列和专属模型。</Text>
      <Button type="primary" onClick={onOpen}>立即升级</Button>
    </section>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateSession } = useAuth();
  const isRegister = mode === 'register';
  const inviteCode = searchParams.get('inviteCode') || '';

  useEffect(() => {
    if (inviteCode) form.setFieldValue('inviteCode', inviteCode);
  }, [form, inviteCode]);

  function fillLocalSample() {
    form.setFieldsValue({
      email: LOCAL_AUTH_SAMPLE.email,
      password: LOCAL_AUTH_SAMPLE.password,
      ...(isRegister ? { nickname: LOCAL_AUTH_SAMPLE.nickname } : {}),
    });
    message.info(isRegister ? '已填入示例账号，提交后会创建本地网页账号' : '已填入示例账号；如果还没注册，请先创建一次');
  }

  async function handleSubmit(values: any) {
    setSubmitting(true);
    try {
      const session = isRegister
        ? await authApi.register(values)
        : await authApi.login({ email: values.email, password: values.password });
      updateSession(session);
      message.success(isRegister ? '注册成功' : '登录成功');
      const redirect = searchParams.get('redirect') || '/dashboard';
      navigate(redirect, { replace: true });
    } catch (err) {
      const normalized = normalizeApiError(err);
      message.error(normalized.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="brand-lockup auth-brand">
          <span className="brand-mark">oo</span>
          <span>
            <strong>ooa8.com</strong>
            <small>AI 图像与视频创作</small>
          </span>
        </div>
        <div className="auth-shot">
          <div className="shot-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="shot-grid">
            <div className="shot-panel main" />
            <div className="shot-panel warm" />
            <div className="shot-panel cool" />
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <Title level={2}>{isRegister ? '创建网页账号' : '登录工作台'}</Title>
        <Paragraph type="secondary">网页端账号独立于小程序账号，适合在电脑上完成批量创作和作品整理。</Paragraph>
        {import.meta.env.DEV && (
          <div className="local-dev-auth-help">
            <Text strong>本地开发提示</Text>
            <Paragraph type="secondary">
              没有默认测试账号。首次进入请先注册一个邮箱账号，邮箱不需要验证码；之后用同一邮箱和密码登录。
            </Paragraph>
            <Space size={[8, 8]} wrap>
              <Tag color="blue">{LOCAL_AUTH_SAMPLE.email}</Tag>
              <Tag color="gold">{LOCAL_AUTH_SAMPLE.password}</Tag>
              <Button size="small" onClick={fillLocalSample}>填入示例信息</Button>
            </Space>
          </div>
        )}
        <Form layout="vertical" form={form} onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input size="large" placeholder="name@example.com" autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位密码' }]}>
            <Input.Password size="large" placeholder="至少 8 位" autoComplete={isRegister ? 'new-password' : 'current-password'} />
          </Form.Item>
          {isRegister && (
            <>
              <Form.Item name="nickname" label="昵称">
                <Input size="large" placeholder="创作者昵称" />
              </Form.Item>
              <Form.Item name="inviteCode" label="邀请码">
                <Input size="large" placeholder="可选" />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
            {isRegister ? '注册并进入' : '登录'}
          </Button>
        </Form>
        <Divider />
        {isRegister ? (
          <Button type="link" onClick={() => navigate('/login')}>已有账号，去登录</Button>
        ) : (
          <Button type="link" onClick={() => navigate(`/register${inviteCode ? `?inviteCode=${inviteCode}` : ''}`)}>没有账号，立即注册</Button>
        )}
      </section>
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { points } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    api.get('/tasks', { params: { pageSize: 6 } }).then(response => {
      setTasks(normalizeList(unwrapData(response)));
    }).catch(() => undefined);
    api.get('/templates/recommended', { params: { pageSize: 6 } }).then(response => {
      setTemplates(normalizeList(unwrapData(response)));
    }).catch(() => undefined);
  }, []);

  return (
    <div className="page-stack dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Text className="dashboard-kicker">欢迎来到 AI 艺术生成工坊</Text>
          <Title level={1}>从提示词到商业创意<br /><span>一站式 AI 创作工作台</span></Title>
          <Paragraph>
            更大的桌面创作空间，精选模板、丰富资产、异步任务和会员加速集中在一个工作台。
          </Paragraph>
          <div className="dashboard-hero-actions">
            <Button type="primary" size="large" icon={<PictureOutlined />} onClick={() => navigate('/image')}>开始 AI 生图</Button>
            <Button size="large" icon={<VideoCameraOutlined />} onClick={() => navigate('/video')}>制作 5 秒视频</Button>
            <Button size="large" icon={<AppstoreOutlined />} onClick={() => navigate('/templates')}>逛模板广场</Button>
          </div>
        </div>
        <div className="dashboard-hero-preview">
          <div className="hero-preview-card">
            <div className="hero-preview-heading">
              <Text strong>作品预览</Text>
              <Tag color="purple">4K</Tag>
            </div>
            <div className="hero-preview-image">
              <span>梦幻城堡场景生成</span>
            </div>
            <div className="hero-preview-thumbs">
              {['天空城', '赛博城', '山水', '角色'].map(item => <span key={item}>{item}</span>)}
            </div>
          </div>
          <div className="hero-mini-queue">
            <Text strong>任务队列</Text>
            {['梦幻城堡场景生成', '赛博城市夜景视频', '国风山水插画'].map((item, index) => (
              <div key={item}>
                <span className={`hero-queue-dot hero-queue-dot-${index}`} />
                <Text>{item}</Text>
                <small>{index === 0 ? '进行中' : index === 1 ? '排队中' : '已完成'}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="dashboard-metric-grid">
        <DashboardMetricCard icon={<ToolOutlined />} value="7" title="创作入口" text="覆盖图像、视频、资产等场景" />
        <DashboardMetricCard icon={<VideoCameraOutlined />} value="1K-4K" title="画质输出" text="超清画质，细节尽显" />
        <DashboardMetricCard icon={<PictureOutlined />} value="10" title="图参参考" text="多图参考，精准可控" />
        <DashboardMetricCard icon={<ReloadOutlined />} value="异步轮询" title="任务队列处理" text="后台生成，完成后可回看" />
      </div>

      <div className="dashboard-feature-grid">
        <DashboardFeatureCard
          icon={<PictureOutlined />}
          title="AI 生图"
          tags={['文生图', '图生图']}
          text="描述你的想法，AI 为你生成高质量图像，支持多模型、多尺寸和高清输出。"
          action="立即创作"
          onClick={() => navigate('/image')}
        />
        <DashboardFeatureCard
          icon={<VideoCameraOutlined />}
          title="AI 生视频"
          tags={['文生视频', '图生视频']}
          text="将创意转化为动态短视频，覆盖 5 秒、10 秒、1080P 等常用生产场景。"
          action="制作视频"
          onClick={() => navigate('/video')}
        />
        <DashboardFeatureCard
          icon={<BookOutlined />}
          title="AI 漫剧资产"
          tags={['角色', '场景', '道具']}
          text="一键生成漫剧所需角色、场景和道具，快速构建你的短剧世界。"
          action="生成资产"
          onClick={() => navigate('/comic')}
        />
      </div>

      <div className="dashboard-bottom-grid">
        <section className="workflow-panel">
          <PanelTitle title="创作工作流（五步轻松完成）" />
          <div className="workflow-steps">
            <WorkflowStep icon={<BulbOutlined />} title="灵感输入" text="描述想法或上传参考" />
            <WorkflowStep icon={<ToolOutlined />} title="参数设置" text="模型、尺寸、风格等" />
            <WorkflowStep icon={<RocketOutlined />} title="提交任务" text="加入任务队列" />
            <WorkflowStep icon={<ReloadOutlined />} title="异步生成" text="后台处理，实时进度" />
            <WorkflowStep icon={<CloudUploadOutlined />} title="查看结果" text="下载或加入资产" />
          </div>
          <div className="workflow-tip">
            <CheckCircleOutlined />
            <Text>当前可用 {Number(points?.balance || 0).toLocaleString()} 积分，积分不足时可签到、邀请或联系客服处理。</Text>
            <Button type="link" onClick={() => navigate('/points')}>查看会员权益</Button>
          </div>
        </section>

        <section className="recent-generation-panel">
          <PanelTitle title="最近生成" action={<Button type="link" onClick={() => navigate('/works')}>查看全部</Button>} />
          <TaskList tasks={tasks} compact />
          <Divider />
          <PanelTitle title="灵感模板" action={<Button type="link" onClick={() => navigate('/templates')}>进入模板</Button>} />
          <TemplateList templates={templates.slice(0, 3)} />
        </section>
      </div>
    </div>
  );
}

function DashboardMetricCard({ icon, value, title, text }: { icon: ReactNode; value: string; title: string; text: string }) {
  return (
    <section className="dashboard-metric-card">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <Text>{title}</Text>
        <small>{text}</small>
      </div>
    </section>
  );
}

function DashboardFeatureCard({
  icon,
  title,
  tags,
  text,
  action,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  tags: string[];
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button className="dashboard-feature-card" onClick={onClick} type="button">
      <span className="dashboard-feature-icon">{icon}</span>
      <strong>{title}</strong>
      <div>{tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div>
      <Text>{text}</Text>
      <small>{action} →</small>
    </button>
  );
}

function WorkflowStep({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="workflow-step">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
  );
}

function QuickAction({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button className="quick-action" onClick={onClick} type="button">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </button>
  );
}

function CreatorPage({ mode }: { mode: CreatorMode }) {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [tiers, setTiers] = useState<any[]>([]);
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const featureKey = mode === 'image' ? 'image_create' : 'video_create';
  const title = mode === 'image' ? 'AI 生图' : mode === 'video' ? 'AI 生视频' : 'AI 漫剧';
  const endpoint = mode === 'image' ? '/tasks/image' : '/tasks/video';
  const watchedTierKey = Form.useWatch('tierKey', form);

  useEffect(() => {
    setLoadingTiers(true);
    api.get('/public/model-tiers', { params: { feature: featureKey, clientType: 'web' } })
      .then(response => {
        const list = normalizeList(unwrapData(response)).filter((item: any) => item?.webVisible !== false && item?.web_visible !== false);
        setTiers(list);
        const defaultTier = list.find((item: any) => item.isDefault || item.is_default) || list[0];
        if (defaultTier && !form.getFieldValue('tierKey')) {
          form.setFieldValue('tierKey', tierKeyOf(defaultTier));
        }
      })
      .catch(err => message.warning(normalizeApiError(err).message))
      .finally(() => setLoadingTiers(false));
  }, [featureKey, form]);

  useEffect(() => {
    const raw = localStorage.getItem(TEMPLATE_DRAFT_KEY);
    if (!raw) return;
    try {
      const template = JSON.parse(raw);
      if ((mode === 'image' && template.templateType === 'video') || (mode !== 'image' && template.templateType === 'image')) return;
      form.setFieldsValue({
        prompt: template.prompt || template.promptTemplate || '',
        negativePrompt: template.negativePrompt || '',
        ratio: template.ratio || '1:1',
        duration: template.duration || 5,
      });
      localStorage.removeItem(TEMPLATE_DRAFT_KEY);
      message.success('已填入模板参数');
    } catch {
      localStorage.removeItem(TEMPLATE_DRAFT_KEY);
    }
  }, [form, mode]);

  const uploadProps: UploadProps = {
    multiple: true,
    maxCount: mode === 'image' ? 4 : 2,
    customRequest: async (options) => {
      try {
        const file = options.file as File & { uid?: string };
        const category = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
        const result = await uploadFile(file, category);
        const withUid = { ...result, uid: file.uid, url: result.url || result.cdnUrl || result.accessUrl };
        setUploads(prev => [...prev.filter(item => item.uid !== file.uid), withUid]);
        options.onSuccess?.(withUid);
      } catch (err) {
        options.onError?.(normalizeApiError(err));
      }
    },
    onRemove: (file) => {
      setUploads(prev => prev.filter(item => item.uid !== file.uid));
      return true;
    },
  };

  async function handleCreate(values: any) {
    const tierKey = values.tierKey || tierKeyOf(tiers[0]);
    if (!tierKey) {
      message.error(`请先选择${creatorModelLabel(mode)}`);
      return;
    }
    setSubmitting(true);
    try {
      const uploadKeys = uploads.map(uploadKeyOf).filter(Boolean);
      const basePayload: any = {
        prompt: values.prompt,
        tierKey,
        ratio: values.ratio || '1:1',
        negativePrompt: values.negativePrompt || '',
        formData: { source: 'user-web', mode },
        params: {
          source: 'user-web',
          ratio: values.ratio || '1:1',
          resolution: values.resolution || 'high',
          quality: values.resolution || 'high',
        },
      };
      if (mode === 'image') {
        basePayload.subType = values.subType || (uploadKeys.length ? 'img2img' : 'text2img');
        basePayload.featureKey = basePayload.subType === 'img2img' ? 'image_to_image' : 'image_create';
        basePayload.resolutionPreset = values.resolution || 'high';
        basePayload.uploadKeys = uploadKeys;
        basePayload.referenceKeys = [];
      } else {
        const firstFile = uploads[0];
        basePayload.subType = mode === 'comic' ? 'comic_story' : values.subType || (uploadKeys.length ? 'img2video' : 'text2video');
        basePayload.featureKey = 'video_create';
        basePayload.duration = Number(values.duration || 5);
        basePayload.resolution = values.resolution || 'high';
        basePayload.uploadKeys = uploadKeys;
        basePayload.firstFrameFileId = firstFile?.fileId || firstFile?.id;
        basePayload.params = {
          ...basePayload.params,
          duration: Number(values.duration || 5),
          resolution: values.resolution || 'high',
          creationMode: mode,
          audioMode: values.audioMode || 'none',
        };
      }

      const result = unwrapData(await api.post(endpoint, basePayload));
      message.success('任务已提交');
      window.dispatchEvent(new Event('user-web:tasks-refresh'));
      await refreshMe();
      const taskId = result?.taskId || result?.id;
      if (taskId) navigate(`/tasks/${taskId}`);
    } catch (err) {
      const normalized = normalizeApiError(err);
      if (normalized.code === POINTS_INSUFFICIENT) {
        showPointsInsufficient();
      } else {
        message.error(normalized.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTier = tiers.find(item => tierKeyOf(item) === watchedTierKey) || tiers[0];

  return (
    <div className="creator-grid">
      <section className="tool-panel">
        <PanelTitle title={title} extra={<Tag color="cyan">{mode === 'comic' ? '视频任务' : featureLabel(featureKey)}</Tag>} />
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ ratio: '1:1', resolution: 'high', duration: 5, audioMode: 'none' }}
          requiredMark={false}
        >
          <Form.Item name="tierKey" label={creatorModelLabel(mode)} rules={[{ required: true, message: `请选择${creatorModelLabel(mode)}` }]}>
            <Select
              className="model-tier-select"
              popupClassName="model-tier-dropdown"
              loading={loadingTiers}
              optionLabelProp="title"
              popupMatchSelectWidth={false}
              options={tiers.map((tier: any) => ({
                value: tierKeyOf(tier),
                title: realModelName(tier),
                label: renderModelTierOption(tier, mode),
              }))}
              placeholder={`选择${creatorModelLabel(mode)}`}
            />
          </Form.Item>
          <Form.Item name="prompt" label={mode === 'comic' ? '剧情与镜头' : '提示词'} rules={[{ required: true, message: '请输入创作内容' }]}>
            <Input.TextArea rows={7} placeholder={mode === 'comic' ? '主角、场景、冲突、镜头节奏' : '画面主体、风格、镜头、氛围'} />
          </Form.Item>
          <div className="form-row">
            {mode === 'image' ? (
              <Form.Item name="subType" label="模式">
                <Select options={[
                  { value: 'text2img', label: '文生图' },
                  { value: 'img2img', label: '图生图' },
                  { value: 'edit', label: '图片编辑' },
                ]} />
              </Form.Item>
            ) : (
              <Form.Item name="subType" label="模式">
                <Select options={[
                  { value: 'text2video', label: '文生视频' },
                  { value: 'img2video', label: '图生视频' },
                  { value: 'first_last_frame', label: '首尾帧' },
                ]} disabled={mode === 'comic'} />
              </Form.Item>
            )}
            <Form.Item name="ratio" label="比例">
              <Select options={ratioOptions} />
            </Form.Item>
          </div>
          <div className="form-row">
            <Form.Item name="resolution" label="清晰度">
              <Select options={imageResolutions} />
            </Form.Item>
            {mode !== 'image' && (
              <Form.Item name="duration" label="时长">
                <Select options={videoDurations} />
              </Form.Item>
            )}
          </div>
          {mode !== 'image' && (
            <Form.Item name="audioMode" label="声音">
              <Select options={[
                { value: 'none', label: '不生成声音' },
                { value: 'preserve', label: '保留原声' },
                { value: 'auto', label: '自动生成' },
              ]} />
            </Form.Item>
          )}
          <Form.Item name="negativePrompt" label="负面提示词">
            <Input placeholder="可选" />
          </Form.Item>
          <Dragger {...uploadProps} className="upload-zone">
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p>上传参考素材</p>
            <p className="ant-upload-hint">图片、视频或音频会作为任务素材传入</p>
          </Dragger>
          <div className="creator-footer">
            <Space wrap>
              <Tag color="gold">预估 {Number(selectedTier?.pointsCost ?? selectedTier?.points_cost ?? 0)} 积分</Tag>
              <Tag>{uploads.length} 个素材</Tag>
            </Space>
            <Button type="primary" htmlType="submit" loading={submitting} icon={<RocketOutlined />}>
              提交任务
            </Button>
          </div>
        </Form>
      </section>
      <section className="guide-panel creator-preview-panel">
        <div className="creator-preview-header">
          <Title level={5}>{mode === 'image' ? '图片预览' : '视频预览'}</Title>
          <Tag color={mode === 'image' ? 'purple' : 'blue'}>{mode === 'image' ? '未生成' : '分镜预览'}</Tag>
        </div>
        <div className={`creator-preview-stage creator-preview-stage-${mode}`}>
          <div className="creator-preview-media">
            {mode === 'image' ? <PictureOutlined /> : <VideoCameraOutlined />}
            <strong>{mode === 'image' ? '等待生成图片' : '等待生成视频'}</strong>
            <Text>{selectedTier ? realModelName(selectedTier) : '请选择模型后提交任务'}</Text>
          </div>
          {mode !== 'image' && (
            <div className="creator-storyboard">
              {[1, 2, 3, 4, 5].map(item => <span key={item}>镜头 {item}</span>)}
            </div>
          )}
        </div>
        <div className="creator-panel-section">
          <Title level={5}>参数与输出</Title>
          <DescriptionList rows={[
            ['当前模型', selectedTier ? realModelName(selectedTier) : '待选择'],
            ['预计消耗', `${modelTierPoints(selectedTier)} 积分`],
            ['能力标签', selectedTier ? modelTierTags(selectedTier, mode).join(' / ') : '待选择'],
            ['接口', endpoint],
            ['结果位置', '右侧任务队列与资产记录'],
            ['网页支付', '暂不开放'],
          ]} />
        </div>
        <div className="creator-panel-section">
          <Title level={5}>素材</Title>
          {uploads.length ? (
            <List
              size="small"
              dataSource={uploads}
              renderItem={(item) => (
                <List.Item>
                  <Text ellipsis>{String(uploadKeyOf(item))}</Text>
                </List.Item>
              )}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无素材" />}
        </div>
      </section>
    </div>
  );
}

function TaskQueue() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) return;
    setLoading(true);
    try {
      const data = unwrapData(await api.get('/tasks', { params: { pageSize: 8 } }));
      setTasks(normalizeList(data));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    window.addEventListener('user-web:tasks-refresh', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('user-web:tasks-refresh', refresh);
    };
  }, [refresh]);

  return (
    <section className="queue-panel">
      <PanelTitle
        title="任务队列"
        extra={<Button icon={<ReloadOutlined />} size="small" onClick={refresh} loading={loading} />}
      />
      <TaskList tasks={tasks} compact onOpen={(task) => navigate(`/tasks/${task.id || task.taskId}`)} />
    </section>
  );
}

function TaskList({ tasks, compact = false, onOpen }: { tasks: any[]; compact?: boolean; onOpen?: (task: any) => void }) {
  if (!tasks.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />;
  return (
    <List
      className={compact ? 'compact-list' : ''}
      dataSource={tasks}
      renderItem={(task) => {
        const id = task.id || task.taskId;
        const progress = taskProgressOf(task);
        const status = String(task.status || '');
        return (
          <List.Item
            className={`task-list-item task-status-${statusClassName(status)}`}
            actions={[
              <Button key="open" type="link" size="small" onClick={() => onOpen?.(task)}>详情</Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<StatusBadge status={status} />}
              title={<Text className="task-title">{task.title || task.prompt || `任务 #${id}`}</Text>}
              description={(
                <div className="task-meta">
                  <Space size={6} wrap><Tag>{task.taskType || task.type || 'AI'}</Tag><Text type="secondary">{formatDate(task.createdAt || task.created_at)}</Text></Space>
                  {progress !== null && (
                    <div className="task-progress" aria-label={`任务进度 ${progress}%`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              )}
            />
          </List.Item>
        );
      }}
    />
  );
}

function WorksPage() {
  const [activeType, setActiveType] = useState('all');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get('/tasks', {
      params: {
        pageSize: 30,
        type: activeType === 'all' ? undefined : activeType,
      },
    }).then(response => {
      setTasks(normalizeList(unwrapData(response)));
    }).catch(err => message.error(normalizeApiError(err).message))
      .finally(() => setLoading(false));
  }, [activeType]);

  return (
    <section className="tool-panel">
      <PanelTitle title="作品库" extra={<Button onClick={() => navigate('/image')}>新建作品</Button>} />
      <Tabs
        activeKey={activeType}
        onChange={setActiveType}
        items={[
          { key: 'all', label: '全部' },
          { key: 'image', label: '图片' },
          { key: 'video', label: '视频' },
        ]}
      />
      <Spin spinning={loading}>
        <TaskList tasks={tasks} onOpen={(task) => navigate(`/tasks/${task.id || task.taskId}`)} />
      </Spin>
    </section>
  );
}

function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadTask = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setTask(unwrapData(await api.get(`/tasks/${id}`)));
    } catch (err) {
      message.error(normalizeApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  async function cancelTask() {
    if (!id) return;
    try {
      await api.post(`/tasks/${id}/cancel`);
      message.success('已取消');
      await loadTask();
    } catch (err) {
      message.error(normalizeApiError(err).message);
    }
  }

  const urls = collectMediaUrls(task);

  return (
    <section className="tool-panel">
      <PanelTitle
        title={`任务详情 #${id}`}
        extra={<Space><Button onClick={() => navigate('/works')}>返回作品库</Button><Button danger onClick={cancelTask}>取消任务</Button></Space>}
      />
      <Spin spinning={loading}>
        {task ? (
          <div className="detail-grid">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="状态"><StatusText status={task.status} /></Descriptions.Item>
              <Descriptions.Item label="类型">{task.taskType || task.type || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(task.createdAt || task.created_at)}</Descriptions.Item>
              <Descriptions.Item label="提示词">{task.prompt || task.input?.prompt || '-'}</Descriptions.Item>
            </Descriptions>
            <MediaGrid urls={urls} />
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到任务" />}
      </Spin>
    </section>
  );
}

function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const navigate = useNavigate();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/templates', {
        params: { pageSize: 24, keyword: keyword || undefined },
      });
      setTemplates(normalizeList(unwrapData(response)));
    } catch (err) {
      message.error(normalizeApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function useTemplate(template: any) {
    try {
      const data = template.id ? unwrapData(await api.post(`/templates/${template.id}/use`)) : template;
      localStorage.setItem(TEMPLATE_DRAFT_KEY, JSON.stringify({ ...template, ...data }));
      const type = template.templateType || template.template_type || data.templateType;
      navigate(type === 'video' ? '/video' : '/image');
    } catch (err) {
      message.error(normalizeApiError(err).message);
    }
  }

  return (
    <section className="tool-panel">
      <PanelTitle title="灵感模板" extra={<Input.Search placeholder="搜索模板" allowClear onSearch={setKeyword} style={{ width: 280 }} />} />
      <Spin spinning={loading}>
        <TemplateList
          templates={templates}
          onUse={useTemplate}
          onPreview={(template) => setSelectedTemplate(template)}
        />
      </Spin>
      <TemplatePreviewModal
        template={selectedTemplate}
        open={!!selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onUse={useTemplate}
      />
    </section>
  );
}

function TemplateList({ templates, onUse, onPreview }: { templates: any[]; onUse?: (template: any) => void; onPreview?: (template: any) => void }) {
  if (!templates.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" />;
  return (
    <div className="template-grid">
      {templates.map((template) => (
        <article
          className="template-card"
          key={template.id || template.templateId || template.title}
          role={onPreview ? 'button' : undefined}
          tabIndex={onPreview ? 0 : undefined}
          onClick={() => onPreview?.(template)}
          onKeyDown={(event) => {
            if (!onPreview) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPreview(template);
            }
          }}
        >
          <div className="template-cover">
            {template.coverUrl || template.previewUrl ? <img src={template.coverUrl || template.previewUrl} alt="" /> : <BulbOutlined />}
          </div>
          <div className="template-body">
            <Text strong ellipsis>{template.title || template.name || '灵感模板'}</Text>
            <Paragraph ellipsis={{ rows: 2 }}>{template.description || template.prompt || template.promptTemplate || '可直接填入创作表单'}</Paragraph>
            <Space>
              <Tag>{template.templateType || template.template_type || 'image'}</Tag>
              {onUse && (
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUse(template);
                  }}
                >
                  使用
                </Button>
              )}
            </Space>
          </div>
        </article>
      ))}
    </div>
  );
}

function TemplatePreviewModal({
  template,
  open,
  onClose,
  onUse,
}: {
  template: any;
  open: boolean;
  onClose: () => void;
  onUse?: (template: any) => void | Promise<void>;
}) {
  const title = template?.title || template?.name || '灵感模板';
  const type = String(template?.templateType || template?.template_type || 'image');
  const prompt = String(template?.prompt || template?.promptTemplate || template?.description || '');
  const mediaUrl = String(template?.previewUrl || template?.preview_url || template?.coverUrl || template?.cover_url || '');
  const tags = normalizeTemplateTags(template);
  const video = type === 'video' || isVideoUrl(mediaUrl);

  return (
    <Modal
      className="template-preview-modal"
      width={980}
      open={open}
      title={title}
      onCancel={onClose}
      footer={[
        prompt ? <Button key="copy" onClick={() => copyText(prompt)}>复制提示词</Button> : null,
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button
          key="use"
          type="primary"
          onClick={() => {
            if (template) onUse?.(template);
            onClose();
          }}
        >
          使用模板
        </Button>,
      ].filter(Boolean)}
    >
      <div className="template-preview-layout">
        <div className="template-preview-stage">
          {mediaUrl ? (
            video ? <video src={mediaUrl} controls playsInline preload="metadata" /> : <img src={mediaUrl} alt={title} />
          ) : (
            <div className="template-preview-empty">
              <BulbOutlined />
              <Text>暂无预览素材</Text>
            </div>
          )}
        </div>
        <aside className="template-preview-meta">
          <Space wrap>
            <Tag color={video ? 'blue' : 'purple'}>{video ? '视频模板' : '图片模板'}</Tag>
            {tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
          </Space>
          <Divider />
          <Descriptions column={1} size="small">
            <Descriptions.Item label="模板类型">{type}</Descriptions.Item>
            <Descriptions.Item label="使用方式">{template?.usageType || template?.usage_type || 'generate'}</Descriptions.Item>
            <Descriptions.Item label="热度">{Number(template?.usageCount || template?.usage_count || 0)}</Descriptions.Item>
          </Descriptions>
          <Divider />
          <Text strong>提示词</Text>
          <Paragraph className="template-preview-prompt">{prompt || '该模板未配置提示词，可先查看预览素材后决定是否使用。'}</Paragraph>
        </aside>
      </div>
    </Modal>
  );
}

function PointsPage() {
  const { points, user, refreshMe } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inviteLink = `https://ooa8.com/register?inviteCode=${encodeURIComponent(user?.inviteCode || '')}`;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(unwrapData(await api.get('/checkin/status')));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function checkin() {
    setLoading(true);
    try {
      await api.post('/checkin/normal');
      message.success('签到成功');
      await Promise.all([loadStatus(), refreshMe()]);
    } catch (err) {
      message.error(normalizeApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="summary-band">
        <Statistic title="积分余额" value={Number(points?.balance || 0)} suffix="积分" />
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={checkin} loading={loading} disabled={Boolean(status?.todayChecked || status?.checkedToday)}>
          {status?.todayChecked || status?.checkedToday ? '今日已签到' : '每日签到'}
        </Button>
      </section>
      <section className="tool-panel">
        <PanelTitle title="积分获取" />
        <div className="quick-grid">
          <QuickAction icon={<CheckCircleOutlined />} title="签到" text="每日可领取积分" onClick={checkin} />
          <QuickAction icon={<GiftOutlined />} title="邀请" text="复制邀请链接给朋友" onClick={() => copyText(inviteLink)} />
          <QuickAction icon={<UserOutlined />} title="联系客服" text="人工处理充值与异常" onClick={() => message.info('请在小程序或后台客服入口联系')} />
        </div>
      </section>
    </div>
  );
}

function ToolsPage() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/tools/config')
      .then(response => setTools(normalizeTools(unwrapData(response))))
      .catch(err => message.error(normalizeApiError(err).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="tool-panel">
      <PanelTitle title="工具箱" />
      <Spin spinning={loading}>
        {tools.length ? (
          <div className="quick-grid">
            {tools.map(tool => (
              <button className="quick-action" key={tool.key} type="button" onClick={() => message.info('工具处理入口将复用现有 /tools/process 接口')}>
                <span><ScissorOutlined /></span>
                <strong>{tool.name}</strong>
                <small>{tool.description || `${tool.pointsCost || 0} 积分/次`}</small>
              </button>
            ))}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用工具" />}
      </Spin>
    </section>
  );
}

function ProfilePage() {
  const { user, points, membership, refreshMe } = useAuth();
  const inviteLink = `https://ooa8.com/register?inviteCode=${encodeURIComponent(user?.inviteCode || '')}`;
  return (
    <div className="page-stack">
      <section className="profile-hero">
        <Avatar size={72} icon={<UserOutlined />} src={user?.avatarUrl} />
        <div>
          <Title level={3}>{user?.nickname || user?.email || '创作者'}</Title>
          <Text type="secondary">ID {user?.displayId || user?.id}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refreshMe}>刷新资料</Button>
      </section>
      <section className="tool-panel">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="邮箱">{user?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="积分">{Number(points?.balance || 0)}</Descriptions.Item>
          <Descriptions.Item label="会员">{membership?.level || membership?.membershipLevel || 'free'}</Descriptions.Item>
          <Descriptions.Item label="邀请码">{user?.inviteCode || '-'}</Descriptions.Item>
          <Descriptions.Item label="邀请链接">
            <Space>
              <Text copyable>{inviteLink}</Text>
              <Button onClick={() => copyText(inviteLink)}>复制</Button>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </section>
    </div>
  );
}

function MobileOnlyNotice() {
  return (
    <main className="mobile-only">
      <div className="mobile-card">
        <span className="brand-mark">oo</span>
        <Title level={3}>ooa8 AI 创作工作台</Title>
        <Paragraph>建议使用电脑访问，或打开小程序继续创作。</Paragraph>
        <Text type="secondary">网页端第一版专注 PC 创作、任务管理和作品整理。</Text>
      </div>
    </main>
  );
}

function PanelTitle({ title, action, extra }: { title: string; action?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="panel-title">
      <Title level={4}>{title}</Title>
      <Space>{extra}{action}</Space>
    </div>
  );
}

function DescriptionList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="description-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return <Badge color={color} text={<ClockCircleOutlined />} />;
}

function StatusText({ status }: { status: string }) {
  return <Tag color={statusColor(status)}>{statusLabel(status)}</Tag>;
}

function MediaGrid({ urls }: { urls: string[] }) {
  if (!urls.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无结果文件" />;
  return (
    <div className="media-grid">
      {urls.map(url => (
        <a className="media-tile" href={url} target="_blank" rel="noreferrer" key={url}>
          {isVideoUrl(url) ? <video src={url} controls /> : <img src={url} alt="" />}
          <span>下载/预览</span>
        </a>
      ))}
    </div>
  );
}

function showPointsInsufficient() {
  Modal.info({
    title: '积分不足',
    content: (
      <div className="modal-copy">
        <p>网页端暂不创建支付订单。</p>
        <p>可以通过每日签到、邀请好友、联系客服，或前往小程序处理积分。</p>
      </div>
    ),
  });
}

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function normalizeTools(data: any): any[] {
  const source = data?.tools || data?.list || data?.items || [];
  if (Array.isArray(source)) return source;
  return Object.entries(source).map(([key, value]: [string, any]) => ({ key, ...value }));
}

function normalizeTemplateTags(template: any): string[] {
  const raw = template?.tags || template?.tag || template?.tagsJson || template?.tags_json || [];
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[,，\s]+/);
  return list.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5);
}

function tierKeyOf(tier: any): string {
  return String(tier?.tierKey || tier?.tier_key || tier?.key || tier?.id || '');
}

function creatorModelLabel(mode: CreatorMode): string {
  if (mode === 'image') return '生图模型';
  if (mode === 'video') return '视频模型';
  return '漫剧模型';
}

function realModelName(tier: any): string {
  return String(
    tier?.webDisplayName
    || tier?.web_display_name
    || tier?.modelName
    || tier?.model_name
    || tier?.displayName
    || tier?.display_name
    || tier?.name
    || tier?.apiModelName
    || tier?.api_model_name
    || tier?.upstreamModelCode
    || tier?.upstream_model_code
    || tier?.tierName
    || tier?.tier_name
    || tier?.tierKey
    || tier?.tier_key
    || '未命名模型',
  );
}

function modelTierName(tier: any): string {
  return String(tier?.tierName || tier?.tier_name || realModelName(tier));
}

function modelTierPoints(tier: any): number {
  return Number(tier?.pointsCost ?? tier?.points_cost ?? tier?.costPoints ?? tier?.cost_points ?? 0);
}

function modelTierTags(tier: any, mode: CreatorMode): string[] {
  const tags = new Set<string>();
  tags.add(mode === 'image' ? '图片模型' : '视频模型');
  if (tier?.isDefault || tier?.is_default || tier?.isRecommended || tier?.is_recommended) tags.add('推荐');
  if (tier?.membershipOnly || tier?.membership_only || /pro|plus|会员|专业/i.test(modelTierName(tier))) tags.add('Pro');
  const maxReferenceImages = Number(tier?.maxReferenceImages ?? tier?.max_reference_images ?? 0);
  if (maxReferenceImages > 0 || tier?.supportReference || tier?.support_reference) tags.add('参考图');
  const resolution = tier?.maxResolution || tier?.max_resolution || tier?.resolution || tier?.quality;
  if (resolution) tags.add(String(resolution).toUpperCase());
  const duration = tier?.maxDuration || tier?.max_duration || tier?.duration;
  if (duration && mode !== 'image') tags.add(`${duration}s`);
  return Array.from(tags).slice(0, 4);
}

function renderModelTierOption(tier: any, mode: CreatorMode) {
  const points = modelTierPoints(tier);
  return (
    <div className="model-tier-option">
      <div className="model-tier-option-main">
        <span className="model-tier-option-name">{realModelName(tier)}</span>
        <span className="model-tier-option-points">{points} 积分</span>
      </div>
      <div className="model-tier-option-tags">
        {modelTierTags(tier, mode).map(tag => <span key={tag}>{tag}</span>)}
      </div>
    </div>
  );
}

function taskProgressOf(task: any): number | null {
  const raw = task?.progress ?? task?.progressPercent ?? task?.progress_percent ?? task?.percent;
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value > 0 && value <= 1 ? Math.round(value * 100) : Math.round(value)));
}

function statusClassName(status: string) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'success', 'succeeded'].includes(value)) return 'success';
  if (['failed', 'error', 'cancelled'].includes(value)) return 'danger';
  if (['processing', 'running'].includes(value)) return 'active';
  return 'pending';
}

function resolutionLabel(value: string) {
  if (value === 'standard') return '标准';
  if (value === 'ultra') return '超清';
  return '高清';
}

function featureLabel(value: string) {
  return value === 'image_create' ? '图片模型' : '视频模型';
}

function statusColor(status: string) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'success', 'succeeded'].includes(value)) return 'green';
  if (['failed', 'error', 'cancelled'].includes(value)) return 'red';
  if (['processing', 'running'].includes(value)) return 'blue';
  return 'gold';
}

function statusLabel(status: string) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'success', 'succeeded'].includes(value)) return '已完成';
  if (['failed', 'error'].includes(value)) return '失败';
  if (value === 'cancelled') return '已取消';
  if (['processing', 'running'].includes(value)) return '处理中';
  return status || '排队中';
}

function formatDate(value: string) {
  if (!value) return '-';
  return dayjs(value).isValid() ? dayjs(value).format('MM-DD HH:mm') : value;
}

function collectMediaUrls(input: any): string[] {
  const urls = new Set<string>();
  const keys = new Set(['url', 'cdnUrl', 'accessUrl', 'outputUrl', 'deliveryUrl', 'previewUrl', 'coverUrl', 'thumbnailUrl']);
  function visit(value: any, depth: number, keyName = ''): void {
    if (!value || depth > 4) return;
    if (typeof value === 'string') {
      if ((keys.has(keyName) || isMediaUrl(value)) && isMediaUrl(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => visit(item, depth + 1, key));
    }
  }
  visit(input, 0);
  return Array.from(urls);
}

function isMediaUrl(value: string) {
  return /^(https?:)?\/\//.test(value) || value.startsWith('/static/') || value.startsWith('/uploads/');
}

function isVideoUrl(value: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(value);
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    message.success('已复制');
  } catch {
    message.warning('复制失败');
  }
}

export default App;
