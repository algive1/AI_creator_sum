import { useState } from 'react';
import { Space, Tag } from 'antd';
import { ApiOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';

interface ApiItem { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; label: string; auth: boolean; }

const GROUPS: { title: string; intro?: string; items: ApiItem[] }[] = [
  {
    title: '用户与认证', intro: '微信登录、Token 续期、用户信息管理。',
    items: [
      { method: 'POST', path: '/auth/wechat-login', label: '微信登录（code 换 token + 用户信息），可选传 inviteCode 绑定邀请', auth: false },
      { method: 'POST', path: '/auth/refresh-token', label: '刷新令牌（用 refreshToken 换新 access token + refresh token）', auth: true },
      { method: 'GET', path: '/users/me', label: '获取当前用户基本信息（昵称/头像/openid）', auth: true },
      { method: 'PUT', path: '/users/me', label: '修改用户信息（昵称/头像/偏好设置）', auth: true },
      { method: 'GET', path: '/users/me/full', label: '个人中心聚合数据（用户/积分/会员/资产/邀请/菜单入口）', auth: true },
    ],
  },
  {
    title: 'AI 创作', intro: '文生图、图生图、图片编辑、文生视频、图生视频、首尾帧视频、视频编辑，以及文本 AI 辅助功能。档位信息推荐直接从 /public/app 的 modelTiers 字段一次性获取，无需按 feature 逐个请求。',
    items: [
      { method: 'GET', path: '/public/model-tiers?feature=image_create', label: '获取单个功能的档位列表（含能力配置和积分价格，capabilities.maxReferenceImages 控制参考图上限）。也可用 /public/app 的 modelTiers 一次性获取全部', auth: false },
      { method: 'POST', path: '/tasks/image', label: '创建图片生成任务。img2img/edit 的 uploadKeys 可传上传返回的 fileId、fileNo 或 url；edit 可额外传 maskFileId/maskUrl、backgroundFileId/backgroundUrl', auth: true },
      { method: 'POST', path: '/tasks/video', label: '创建视频任务。支持 text_to_video、image_to_video、first_last_frame_video、video_edit；video_edit 可传 videoFileId、videoUrl 或 uploadKeys', auth: true },
      { method: 'POST', path: '/tasks/optimize-prompt', label: '智能优化提示词（会员免费，非会员消耗积分。返回优化后 prompt + 风格建议）', auth: true },
      { method: 'POST', path: '/tasks/script', label: 'AI 生成视频脚本（传入主题/风格/时长/角色，返回分镜脚本）', auth: true },
      { method: 'POST', path: '/tasks/prompt', label: 'AI 生成创意提示词变体（传入 idea 返回多个可选 prompt）', auth: true },
      { method: 'POST', path: '/tasks/storyboard', label: 'AI 生成分镜描述（传入脚本返回分镜列表）', auth: true },
      { method: 'GET', path: '/tasks', label: '我的任务列表（分页，支持 type/status 筛选和 keyword 搜索，返回 pointsCost/pointsRefunded）', auth: true },
      { method: 'GET', path: '/tasks/:id', label: '任务详情（含输入参数、输出结果、审核状态、失败原因、积分消耗和已退还积分）', auth: true },
    ],
  },
  {
    title: '积分与签到', intro: '积分余额查询、积分流水、签到（普通/超级/补签）。',
    items: [
      { method: 'GET', path: '/points/balance', label: '查询积分余额（含总获得/总消费）', auth: true },
      { method: 'GET', path: '/points/transactions', label: '积分流水记录（分页，支持 type=earn/spend 和 source 筛选）', auth: true },
      { method: 'GET', path: '/checkin/status', label: '今日签到状态（是否已签、连续天数、规则配置）', auth: true },
      { method: 'POST', path: '/checkin', label: '普通签到（连续签到奖励递增）', auth: true },
      { method: 'POST', path: '/checkin/super', label: '超级签到（需传入看完广告的 sessionId，奖励更高）', auth: true },
      { method: 'POST', path: '/checkin/makeup', label: '补签（消耗积分，默认补昨天，可传 targetDate 指定日期）', auth: true },
    ],
  },
  {
    title: '激励广告', intro: '观看激励视频广告换取积分奖励。',
    items: [
      { method: 'GET', path: '/ads/status', label: '今日广告观看状态（已看次数/剩余次数/单次奖励积分）', auth: true },
      { method: 'POST', path: '/ads/session', label: '创建广告观看会话（获取 sessionId 用于前端拉起广告）', auth: true },
      { method: 'POST', path: '/ads/reward', label: '看完广告后领取积分奖励（传入 sessionId + completed=true）', auth: true },
    ],
  },
  {
    title: '邀请好友', intro: '邀请码生成、绑定、邀请统计。',
    items: [
      { method: 'GET', path: '/invite/my-code', label: '获取我的邀请码（含分享路径和分享文案）', auth: true },
      { method: 'POST', path: '/invite/bind', label: '绑定好友邀请码（注册时或注册后均可，传 inviteCode）', auth: true },
      { method: 'GET', path: '/invite/summary', label: '我的邀请概览（成功邀请人数/累计获得积分）', auth: true },
      { method: 'GET', path: '/invite/records', label: '邀请奖励记录（分页，含邀请人/被邀请人/奖励积分/状态）', auth: true },
    ],
  },
  {
    title: '灵感模板', intro: '浏览、搜索、使用、分享模板。读接口无需登录，写操作需登录。模板含 usageType(generate=文生图/reference=图生图/edit=编辑)用于区分适用场景。',
    items: [
      { method: 'GET', path: '/templates/categories', label: '模板分类列表（含分类 ID/名称/图标）', auth: false },
      { method: 'GET', path: '/templates', label: '模板列表（分页，支持 templateType/categoryId/keyword 筛选，sortBy=recommended/hot/new。返回含 usageType）', auth: false },
      { method: 'GET', path: '/templates/recommended', label: '推荐模板（前 8 条，按推荐和热度排序。返回含 usageType）', auth: false },
      { method: 'GET', path: '/templates/search?keyword=xxx', label: '搜索模板（匹配标题/描述/提示词。返回含 usageType）', auth: false },
      { method: 'GET', path: '/templates/inspirations', label: '灵感广场模板列表（template_type=inspiration 的官方内容）', auth: false },
      { method: 'GET', path: '/templates/:id', label: '模板详情（含会员权限校验、使用次数、收藏数、usageType）', auth: false },
      { method: 'POST', path: '/templates/:id/use', label: '记录模板使用（使用次数+1，返回 prompt/参数供创作使用）', auth: true },
      { method: 'POST', path: '/templates/share', label: '分享作品为公开模板（传入 taskId/outputId，需先完成合规确认）', auth: true },
      { method: 'POST', path: '/templates/:id/cancel-public', label: '取消自己分享的公开模板（改为私密）', auth: true },
      { method: 'GET', path: '/templates/my-templates', label: '我分享的模板列表（含审核状态）', auth: true },
      { method: 'GET', path: '/public/templates?type=image&feature=text_to_image', label: '公开模板（按 templateType 和 display_config 的 feature 筛选，置顶优先。返回含 usageType）', auth: false },
    ],
  },
  {
    title: '会员', intro: '套餐浏览、会员状态、权益查询。',
    items: [
      { method: 'GET', path: '/membership/plans', label: '会员套餐列表（含价格/周期/标签）', auth: true },
      { method: 'GET', path: '/membership/plans/:id', label: '会员套餐详情（含权益列表和积分规则）', auth: true },
      { method: 'GET', path: '/membership/me', label: '我的会员状态（等级/到期时间/是否过期/剩余天数）', auth: true },
      { method: 'GET', path: '/membership/rights', label: '我的会员权益明细（图片/视频/队列等各维度权益值）', auth: true },
    ],
  },
  {
    title: '商城与支付', intro: '积分套餐、会员套餐浏览，下单，微信支付。',
    items: [
      { method: 'GET', path: '/shop/point-packages', label: '积分充值套餐列表（无需登录）', auth: false },
      { method: 'GET', path: '/shop/member-plans', label: '会员购买套餐列表（无需登录）', auth: false },
      { method: 'POST', path: '/orders', label: '创建订单（orderType=points 或 membership，传入 productId）', auth: true },
      { method: 'GET', path: '/orders', label: '我的订单列表（分页，支持 orderType/payStatus/status 筛选）', auth: true },
      { method: 'GET', path: '/orders/:orderNo', label: '订单详情（含支付状态/权益发放状态）', auth: true },
      { method: 'POST', path: '/orders/:orderNo/cancel', label: '取消未支付订单', auth: true },
      { method: 'POST', path: '/payments/wechat/jsapi', label: '发起微信 JSAPI 支付（传入 orderNo，返回 prepay_id + 签名参数用于 wx.requestPayment）', auth: true },
      { method: 'POST', path: '/payments/wechat/query', label: '主动查询微信支付订单状态（同步支付结果）', auth: true },
    ],
  },
  {
    title: '文件管理', intro: '上传、查看、删除、导出文件。支持服务端中转上传和客户端直传两种模式。',
    items: [
      { method: 'GET', path: '/files/upload-config', label: '获取上传配置（存储平台/文件大小限制/支持格式/上传模式）', auth: true },
      { method: 'GET', path: '/files/credential', label: '获取客户端直传临时凭证（直传模式使用，传入 fileCategory/originalName/fileSize/contentType）', auth: true },
      { method: 'POST', path: '/files/upload', label: '服务端中转上传文件（multipart/form-data，字段 file + fileCategory/visibility）', auth: true },
      { method: 'POST', path: '/files/notify', label: '客户端直传完成后通知后端（传入 storageKey/provider/etag/fileSize）', auth: true },
      { method: 'GET', path: '/files/:fileNo', label: '获取文件信息（URL/尺寸/类型/大小）', auth: true },
      { method: 'GET', path: '/files/:fileNo/url', label: '获取文件访问 URL（公开文件无需登录，私密文件需 Token）', auth: false },
      { method: 'DELETE', path: '/files/:fileNo', label: '删除文件（软删除，支持存储端同步删除）', auth: true },
      { method: 'POST', path: '/files/batch-delete', label: '批量删除文件（传入 fileNos 数组，最多 50 个）', auth: true },
      { method: 'POST', path: '/files/:id/export', label: '导出图片文件（去除 EXIF 元数据和平台水印，重新编码为 PNG）', auth: true },
      { method: 'GET', path: '/files/:id/export-status', label: '查询文件导出状态（导出完成后返回新 fileNo 和 URL）', auth: true },
    ],
  },
  {
    title: '公告', intro: '弹窗公告、公告列表、标记已读。',
    items: [
      { method: 'GET', path: '/announcements/popup', label: '获取弹窗公告（按 show_frequency 频率规则控制，每天/每次/仅一次）', auth: false },
      { method: 'GET', path: '/announcements', label: '公告列表（分页，page/pageSize 参数）', auth: false },
      { method: 'GET', path: '/announcements/:id', label: '公告详情', auth: false },
      { method: 'POST', path: '/announcements/:id/read', label: '标记公告已读', auth: true },
      { method: 'POST', path: '/announcements/:id/close', label: '关闭弹窗公告（当天不再弹出）', auth: true },
    ],
  },
  {
    title: '法律与合规', intro: '用户协议、隐私政策、AI 内容规则确认，导出/分享合规确认。',
    items: [
      { method: 'GET', path: '/legal/documents', label: '获取所有已生效法律协议（含 requiredDocTypes 列表）', auth: false },
      { method: 'GET', path: '/legal/required-status', label: '检查用户是否还需确认协议（返回 missing 列表）', auth: true },
      { method: 'POST', path: '/legal/accept', label: '同意协议（传入 documents 数组，每项含 docType + version）', auth: true },
      { method: 'POST', path: '/compliance/confirm', label: '合规确认（scene=export_save/share/public_template，需输入"我确认"或勾选）', auth: true },
      { method: 'GET', path: '/compliance/confirmations', label: '我的合规确认历史记录', auth: true },
    ],
  },
  {
    title: '应用配置与首页', intro: '全局配置（含所有功能档位完整信息）、首页聚合数据。推荐小程序启动时调一次 /public/app 并缓存。',
    items: [
      { method: 'GET', path: '/public/app', label: '应用全局配置。含 featureKeys、modelTiers、功能开关、客服配置、使用帮助 help、运营素材 visualAssets、底部导航栏、会员入口。切换Tab无需额外请求档位', auth: false },
      { method: 'GET', path: '/app/home', label: '首页聚合数据（弹窗公告/首页公告/功能入口/推荐模板/热门模板/灵感分类/用户摘要/最近作品/积分中心/会员入口）', auth: false },
    ],
  },
];

const methodColors: Record<string, string> = { GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red' };

export default function ApiReference() {
  const [filter, setFilter] = useState<'all' | 'public' | 'auth'>('all');

  const publicCount = GROUPS.reduce((s, g) => s + g.items.filter(i => !i.auth).length, 0);
  const authCount = GROUPS.reduce((s, g) => s + g.items.filter(i => i.auth).length, 0);
  const totalCount = publicCount + authCount;

  const filteredGroups = GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => filter === 'all' ? true : filter === 'public' ? !item.auth : item.auth),
  })).filter(g => g.items.length > 0);

  return (
    <div>
      <h2><ApiOutlined /> 小程序接口文档</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>
        以下接口供微信小程序前端调用。基础地址 <code>https://你的域名/api/v1</code>。
        部分接口标记为 <Tag color="green" style={{ fontSize: 11 }}><UnlockOutlined /> 无需登录</Tag>，其余需在 Header 中传 <code>Authorization: Bearer &lt;token&gt;</code>。
        登录接口 <code>/auth/wechat-login</code> 和 <code>/auth/refresh-token</code> 使用了独立的严格限流（每分钟每 IP 最多 10 次），建议做好重试逻辑。
      </p>

      <Space style={{ marginBottom: 16 }}>
        {(['all', 'public', 'auth'] as const).map(k => (
          <Tag key={k} color="blue" style={{ cursor: 'pointer', padding: '4px 14px', fontSize: 13, opacity: filter === k ? 1 : 0.45 }}
            onClick={() => setFilter(k)}>
            {k === 'all' ? `全部 ${totalCount} 个接口` : k === 'public' ? `🔓 无需登录 ${publicCount} 个` : `🔒 需要登录 ${authCount} 个`}
          </Tag>
        ))}
      </Space>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredGroups.map(g => (
          <div key={g.title} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{g.title}</div>
            {g.intro && <div style={{ color: '#999', fontSize: 12, marginBottom: 10 }}>{g.intro}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 10px', borderRadius: 6, background: '#fafafa' }}>
                  <Tag color={methodColors[item.method]} style={{ minWidth: 52, textAlign: 'center', fontWeight: 600, fontSize: 11, flexShrink: 0, marginTop: 2 }}>{item.method}</Tag>
                  <code style={{ minWidth: 230, fontSize: 12, flexShrink: 0, wordBreak: 'break-all', lineHeight: '22px' }}>{item.path}</code>
                  <span style={{ color: '#555', fontSize: 12, flex: 1, lineHeight: '22px' }}>{item.label}</span>
                  {item.auth
                    ? <Tag icon={<LockOutlined />} color="orange" style={{ fontSize: 11, flexShrink: 0 }}>需要登录</Tag>
                    : <Tag icon={<UnlockOutlined />} color="green" style={{ fontSize: 11, flexShrink: 0 }}>无需登录</Tag>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
