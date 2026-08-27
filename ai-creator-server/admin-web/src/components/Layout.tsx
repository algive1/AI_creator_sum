import { lazy, Suspense, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, theme, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined, UserOutlined, PictureOutlined, ShoppingCartOutlined,
  SafetyCertificateOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, HistoryOutlined,
  FileOutlined, SettingOutlined, CrownOutlined, GiftOutlined, BulbOutlined, CloudServerOutlined,
  CloudSyncOutlined, CheckCircleOutlined, FileProtectOutlined, ShareAltOutlined,
  WechatOutlined, ControlOutlined, CloudUploadOutlined,
} from '@ant-design/icons';

const pageLoaders = {
  Dashboard: () => import('../pages/Dashboard'),
  Users: () => import('../pages/Users'),
  Tasks: () => import('../pages/Tasks'),
  Orders: () => import('../pages/Orders'),
  Audit: () => import('../pages/Audit'),
  Files: () => import('../pages/Files'),
  Settings: () => import('../pages/settings'),
  Membership: () => import('../pages/Membership'),
  PointTasks: () => import('../pages/PointTasks'),
  Invite: () => import('../pages/Invite'),
  FeatureConfig: () => import('../pages/FeatureConfig'),
  ProviderModels: () => import('../pages/ProviderModels'),
  ModelTest: () => import('../pages/ModelTest'),
  ModelOverview: () => import('../pages/ModelOverview'),
  TemplateCategories: () => import('../pages/TemplateCategories'),
  ImageTemplates: () => import('../pages/ImageTemplates'),
  VideoTemplates: () => import('../pages/VideoTemplates'),
  InspirationSquare: () => import('../pages/InspirationSquare'),
  TemplateReview: () => import('../pages/TemplateReview'),
  ContentManagement: () => import('../pages/ContentManagement'),
  SystemUpdate: () => import('../pages/SystemUpdate'),
  LaunchCheck: () => import('../pages/LaunchCheck'),
  WechatSettings: () => import('../pages/WechatSettings'),
  WechatToolsSettings: () => import('../pages/WechatToolsSettings'),
  AuditLog: () => import('../pages/AuditLog'),
  StorageSettings: () => import('../pages/StorageSettings'),
  ApiReference: () => import('../pages/ApiReference'),
  FeatureToggles: () => import('../pages/FeatureToggles'),
  BackupManagement: () => import('../pages/BackupManagement'),
};

const Dashboard = lazy(pageLoaders.Dashboard);
const Users = lazy(pageLoaders.Users);
const Tasks = lazy(pageLoaders.Tasks);
const Orders = lazy(pageLoaders.Orders);
const Audit = lazy(pageLoaders.Audit);
const Files = lazy(pageLoaders.Files);
const Settings = lazy(pageLoaders.Settings);
const Membership = lazy(pageLoaders.Membership);
const PointTasks = lazy(pageLoaders.PointTasks);
const Invite = lazy(pageLoaders.Invite);
const FeatureConfig = lazy(pageLoaders.FeatureConfig);
const ProviderModels = lazy(pageLoaders.ProviderModels);
const ModelTest = lazy(pageLoaders.ModelTest);
const ModelOverview = lazy(pageLoaders.ModelOverview);
const TemplateCategories = lazy(pageLoaders.TemplateCategories);
const ImageTemplates = lazy(pageLoaders.ImageTemplates);
const VideoTemplates = lazy(pageLoaders.VideoTemplates);
const InspirationSquare = lazy(pageLoaders.InspirationSquare);
const TemplateReview = lazy(pageLoaders.TemplateReview);
const ContentManagement = lazy(pageLoaders.ContentManagement);
const SystemUpdate = lazy(pageLoaders.SystemUpdate);
const LaunchCheck = lazy(pageLoaders.LaunchCheck);
const WechatSettings = lazy(pageLoaders.WechatSettings);
const WechatToolsSettings = lazy(pageLoaders.WechatToolsSettings);
const AuditLog = lazy(pageLoaders.AuditLog);
const StorageSettings = lazy(pageLoaders.StorageSettings);
const ApiReference = lazy(pageLoaders.ApiReference);
const FeatureToggles = lazy(pageLoaders.FeatureToggles);
const BackupManagement = lazy(pageLoaders.BackupManagement);

const { Header, Sider, Content } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/tasks', icon: <PictureOutlined />, label: '任务管理' },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: '支付订单管理' },
  { key: '/files', icon: <FileOutlined />, label: '文件管理' },
  { key: '/audit', icon: <SafetyCertificateOutlined />, label: '审核管理' },
  { type: 'divider' } as any,
  {
    key: '/ai-models',
    icon: <CrownOutlined />,
    label: 'AI 模型管理',
    children: [
      { key: '/ai-models/features', label: '功能页配置' },
      { key: '/ai-models/providers', label: '供应商与模型' },
      { key: '/ai-models/test', label: '模型测试' },
      { key: '/ai-models/overview', label: '模型总览' },
    ],
  },
  { type: 'divider' } as any,
  { key: '/membership', icon: <CrownOutlined />, label: '会员套餐' },
  { key: '/point-tasks', icon: <GiftOutlined />, label: '积分管理' },
  { key: '/invite', icon: <ShareAltOutlined />, label: '邀请运营' },
  { type: 'divider' } as any,
  {
    key: '/templates',
    icon: <BulbOutlined />,
    label: '灵感模板',
    children: [
      { key: '/templates/categories', label: '模板分类' },
      { key: '/templates/images', label: '图片模板' },
      { key: '/templates/videos', label: '视频模板' },
      { key: '/templates/inspiration', label: '灵感广场' },
      { key: '/templates/review', label: '模板审核' },
    ],
  },
  { key: '/content', icon: <FileProtectOutlined />, label: '内容合规' },
  { type: 'divider' } as any,
  {
    key: '/wechat',
    icon: <WechatOutlined />,
    label: '微信配置',
    children: [
      { key: '/wechat/miniapp', label: '微信小程序' },
      { key: '/wechat/tools', label: '工具页配置' },
      { key: '/wechat/pay', label: '微信支付' },
      { key: '/wechat/customer-service', label: '微信客服' },
      { key: '/wechat/help', label: '使用帮助' },
      { key: '/wechat/visual-assets', label: '小程序素材' },
      { key: '/wechat/tabbar', label: '底部导航' },
      { key: '/wechat/api-reference', label: '小程序接口' },
    ],
  },
  {
    key: '/storage',
    icon: <CloudServerOutlined />,
    label: '对象存储',
    children: [
      { key: '/storage/tencent-cos', label: '腾讯云 COS' },
      { key: '/storage/aliyun-oss', label: '阿里云 OSS' },
      { key: '/storage/qiniu', label: '七牛云 Kodo' },
      { key: '/storage/upyun', label: '又拍云 USS' },
      { key: '/storage/eos', label: '移动云 EOS' },
      { key: '/storage/local', label: '本地存储' },
    ],
  },
  { key: '/launch-check', icon: <CheckCircleOutlined />, label: '上线配置检查' },
  { key: '/feature-toggles', icon: <ControlOutlined />, label: '功能开关' },
  { key: '/system-update', icon: <CloudSyncOutlined />, label: '系统更新' },
  { key: '/backup', icon: <CloudUploadOutlined />, label: '备份管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  { key: '/audit-log', icon: <HistoryOutlined />, label: '操作日志' },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  theme.useToken();

  const logout = () => { localStorage.removeItem('admin_token'); nav('/login'); };
  const selectedKey = (loc.pathname.startsWith('/wechat/') || loc.pathname.startsWith('/storage/') || loc.pathname.startsWith('/ai-models/') || loc.pathname.startsWith('/templates/')) ? loc.pathname : '/' + (loc.pathname.split('/')[1] || '');

  return (
    <AntLayout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e8f0fe 0%, #ede9fe 34%, #fce7f3 68%, #f0f9ff 100%)' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={230}
        style={{
          background: 'rgba(30,27,75,0.88)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '4px 0 40px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 4,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
            marginRight: collapsed ? 0 : 12,
            flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: -1 }}>AI</span>
          </div>
          {!collapsed && (
            <span style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
              AI 创作工坊
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={[...(loc.pathname.startsWith('/wechat/') ? ['/wechat'] : []), ...(loc.pathname.startsWith('/ai-models/') ? ['/ai-models'] : []), ...(loc.pathname.startsWith('/templates/') ? ['/templates'] : []), ...(loc.pathname.startsWith('/storage/') ? ['/storage'] : [])]}
          items={menuItems}
          onClick={({ key }) => nav(key)}
          style={{
            background: 'transparent',
            borderInlineEnd: 'none',
            padding: '8px 10px',
            fontSize: 13.5,
          }}
        />
      </Sider>

      <AntLayout style={{ background: 'rgba(248,250,255,0.72)' }}>
        <Header style={{
          height: 64,
          padding: '0 24px',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '12px 16px 0 16px',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(99,102,241,0.06)',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined style={{ fontSize: 18 }} /> : <MenuFoldOutlined style={{ fontSize: 18 }} />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: 40, height: 40, borderRadius: 10, color: '#6366f1',
              background: 'rgba(99,102,241,0.06)',
            }}
          />
          <Dropdown menu={{
            items: [
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: logout },
            ],
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '6px 14px', borderRadius: 12,
              background: 'rgba(99,102,241,0.06)', transition: 'all 0.2s',
            }}>
              <Avatar size={32} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 14, fontWeight: 700 }}>
                A
              </Avatar>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>超级管理员</div>
                <div style={{ fontSize: 11, color: '#8b5cf6' }}>后台管理</div>
              </div>
            </div>
          </Dropdown>
        </Header>

        <Content style={{
          margin: '16px',
          padding: 24,
          minHeight: 280,
          background: 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 2px 16px rgba(99,102,241,0.04)',
        }}>
          <Suspense fallback={<div style={{ padding: 24, color: '#6366f1' }}>页面加载中...</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<Users />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/files" element={<Files />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/ai-models/features" element={<FeatureConfig />} />
              <Route path="/ai-models/providers" element={<ProviderModels />} />
              <Route path="/ai-models/test" element={<ModelTest />} />
              <Route path="/ai-models/overview" element={<ModelOverview />} />
              <Route path="/membership" element={<Membership />} />
              <Route path="/point-tasks" element={<PointTasks />} />
              <Route path="/invite" element={<Invite />} />
              <Route path="/templates/categories" element={<TemplateCategories />} />
              <Route path="/templates/images" element={<ImageTemplates />} />
              <Route path="/templates/videos" element={<VideoTemplates />} />
              <Route path="/templates/inspiration" element={<InspirationSquare />} />
              <Route path="/templates/review" element={<TemplateReview />} />
              <Route path="/content" element={<ContentManagement />} />
              <Route path="/wechat/miniapp" element={<WechatSettings />} />
              <Route path="/wechat/tools" element={<WechatToolsSettings />} />
              <Route path="/wechat/pay" element={<WechatSettings />} />
              <Route path="/wechat/customer-service" element={<WechatSettings />} />
              <Route path="/wechat/help" element={<WechatSettings />} />
              <Route path="/wechat/visual-assets" element={<WechatSettings />} />
              <Route path="/wechat/tabbar" element={<WechatSettings />} />
              <Route path="/wechat/api-reference" element={<ApiReference />} />
              <Route path="/launch-check" element={<LaunchCheck />} />
              <Route path="/feature-toggles" element={<FeatureToggles />} />
              <Route path="/system-update" element={<SystemUpdate />} />
              <Route path="/backup" element={<BackupManagement />} />
              <Route path="/settings/*" element={<Settings />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/storage/tencent-cos" element={<StorageSettings />} />
              <Route path="/storage/aliyun-oss" element={<StorageSettings />} />
              <Route path="/storage/qiniu" element={<StorageSettings />} />
              <Route path="/storage/upyun" element={<StorageSettings />} />
              <Route path="/storage/eos" element={<StorageSettings />} />
              <Route path="/storage/local" element={<StorageSettings />} />
            </Routes>
          </Suspense>
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
