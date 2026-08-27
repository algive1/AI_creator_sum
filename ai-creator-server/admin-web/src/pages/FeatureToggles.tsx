import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Space, Switch, Tag, message } from 'antd';
import { ThunderboltOutlined, CrownOutlined, SafetyCertificateOutlined, BulbOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';

interface ToggleGroup {
  title: string;
  icon: React.ReactNode;
  intro: string;
  keys: string[];
  labels: Record<string, { label: string; hint: string; disabledWarning: string; messageKey?: string; defaultMessage?: string }>;
}

const GROUPS: ToggleGroup[] = [
  {
    title: '小程序过审模式',
    icon: <SafetyCertificateOutlined />,
    intro: '控制小程序审核期的商业化露出。开启过审模式后，小程序不展示购买入口、价格、套餐、付款、充值和会员购买文案，后端也拒绝下单和拉起支付。',
    keys: [
      'miniapp.review_mode_enabled',
      'miniapp.purchase_enabled',
    ],
    labels: {
      'miniapp.review_mode_enabled': {
        label: '过审模式',
        hint: '开启后强制隐藏并禁止所有购买能力；审核通过后关闭即可恢复原购买入口和接口。',
        disabledWarning: '关闭后小程序将按购买能力总开关、微信支付开关和会员开关恢复展示。',
      },
      'miniapp.purchase_enabled': {
        label: '购买能力总开关',
        hint: '关闭后积分购买、会员购买、微信支付下单均不可用；不影响 AI 创作、灵感、工具、历史记录等页面。',
        disabledWarning: '关闭后用户无法购买积分或会员；已有订单记录仍可查询。',
      },
    },
  },
  {
    title: 'AI 创作能力',
    icon: <ThunderboltOutlined />,
    intro: '控制小程序创作页的智能优化、提示词补全、剧本生成和分镜生成入口。开关通过 /public/app 下发，提示词内容在「内容管理 → 系统提示词」维护。',
    keys: [
      'ai.prompt_optimize.enabled',
      'ai.script_generate.enabled',
      'ai.prompt_generate.enabled',
      'ai.storyboard_generate.enabled',
    ],
    labels: {
      'ai.prompt_optimize.enabled': {
        label: '智能优化提示词',
        hint: '小程序生图/生视频输入框下方的“智能优化”按钮，对应 /tasks/optimize-prompt。',
        disabledWarning: '关闭后小程序创作页将不显示"智能优化"按钮，用户无法使用 AI 优化提示词功能。',
      },
      'ai.script_generate.enabled': {
        label: '剧本/脚本生成',
        hint: '为后续视频创作页提供“输入主题生成分镜脚本”的能力，对应 /tasks/script。',
        disabledWarning: '关闭后小程序视频创作页不应展示"剧本生成"入口。',
      },
      'ai.prompt_generate.enabled': {
        label: '提示词智能补全/生成',
        hint: '为后续提示词输入框提供智能补全或多版本提示词生成，对应 /tasks/prompt。',
        disabledWarning: '关闭后小程序提示词框不应展示"智能补全"或"提示词生成"入口。',
      },
      'ai.storyboard_generate.enabled': {
        label: 'AI 漫剧分镜能力（页内）',
        hint: '控制漫剧页内分镜/脚本生成能力，对应 /tasks/storyboard；不等同于首页“生漫剧入口”维护态。',
        disabledWarning: '关闭后小程序不应展示"AI漫剧分镜"生成入口；首页入口是否可进入请使用下方“首页生漫剧入口”。',
      },
    },
  },
  {
    title: '会员与商业',
    icon: <CrownOutlined />,
    intro: '控制会员体系和商业功能的开关。关闭后小程序将隐藏对应入口和页面。',
    keys: [
      'membership.enabled',
      'membership.prompt_optimize_member_only',
      'membership.template_save_use_member_only',
    ],
    labels: {
      'membership.enabled': {
        label: '会员体系',
        hint: '启用后小程序展示会员套餐、会员入口、会员专属模板和权益。',
        disabledWarning: '⚠ 关闭后小程序将完全不显示会员相关内容：个人中心无会员入口、创作页无会员标识、模板广场无会员专享标签。用户将无法看到和购买会员套餐。请确认会员套餐已配置完成后再开启。',
      },
      'membership.prompt_optimize_member_only': {
        label: '智能优化仅会员可用',
        hint: '开启后，非会员无法使用图片/视频创作页的“智能优化提示词”。',
        disabledWarning: '关闭后非会员可继续使用智能优化，按后台配置扣除积分。',
      },
      'membership.template_save_use_member_only': {
        label: '模板保存/使用仅会员可用',
        hint: '开启后，非会员可浏览和预览模板，但不能保存模板素材或使用模板生成同款。',
        disabledWarning: '关闭后，模板素材保存和使用模板不再按会员身份限制；生成结果保存始终不受该开关影响。',
      },
    },
  },
  {
    title: '内容安全',
    icon: <SafetyCertificateOutlined />,
    intro: '控制内容审核和安全相关功能。',
    keys: ['content.filter_enabled', 'security.captcha_enabled'],
    labels: {
      'content.filter_enabled': {
        label: '内容敏感词过滤',
        hint: '启用后创作提示词会经过敏感词检测，命中敏感词的任务将进入审核队列。',
        disabledWarning: '关闭后用户提交的提示词将不经过敏感词检测，可能产生违规内容。建议生产环境保持开启。',
      },
      'security.captcha_enabled': {
        label: '登录验证码',
        hint: '启用后登录时需要输入验证码，防止恶意登录攻击。',
        disabledWarning: '关闭后登录接口无验证码保护，存在被暴力破解的风险。建议生产环境保持开启。',
      },
    },
  },
  {
    title: '模板与灵感',
    icon: <BulbOutlined />,
    intro: '控制用户模板分享和灵感广场的权限。',
    keys: [
      'template.user_share_enabled',
      'template.user_public_enabled',
    ],
    labels: {
      'template.user_share_enabled': {
        label: '用户分享模板',
        hint: '允许用户将自己的作品分享为公开模板，供其他用户浏览和使用。',
        disabledWarning: '关闭后用户无法将作品分享为公开模板，"分享"按钮将被隐藏。',
      },
      'template.user_public_enabled': {
        label: '用户公开模板可见',
        hint: '在模板广场中展示用户分享的公开模板。关闭后仅展示官方模板。',
        disabledWarning: '关闭后模板广场仅展示官方模板，用户分享的模板不可见。适合内容审核能力不足时临时关闭。',
      },
    },
  },
  {
    title: '首页入口维护',
    icon: <ThunderboltOutlined />,
    intro: '控制小程序首页“生图 / 生视频 / 生漫剧”三个入口维护态。关闭后首页点击只提示后台配置文案，不跳转到对应功能页；不关闭生成接口或其它页面入口。',
    keys: [
      'miniapp.home_entry.image.enabled',
      'miniapp.home_entry.video.enabled',
      'miniapp.home_entry.comic.enabled',
    ],
    labels: {
      'miniapp.home_entry.image.enabled': {
        label: '首页生图入口',
        hint: '关闭后，首页 AI 生图入口不跳转到生图页，只提示维护文案。',
        disabledWarning: '关闭后用户无法从首页进入生图页；生图接口本身不受影响。',
        messageKey: 'miniapp.home_entry.image.message',
        defaultMessage: '生图功能维护中，请稍后再试',
      },
      'miniapp.home_entry.video.enabled': {
        label: '首页生视频入口',
        hint: '关闭后，首页 AI 视频入口不跳转到生视频页，只提示维护文案。',
        disabledWarning: '关闭后用户无法从首页进入生视频页；生视频接口本身不受影响。',
        messageKey: 'miniapp.home_entry.video.message',
        defaultMessage: '生视频功能维护中，请稍后再试',
      },
      'miniapp.home_entry.comic.enabled': {
        label: '首页生漫剧入口',
        hint: '关闭后，首页 AI 漫剧入口不跳转到 AI 漫剧页，只提示维护文案。',
        disabledWarning: '关闭后用户无法从首页进入 AI 漫剧页；AI 漫剧页面和生成接口本身不受影响。',
        messageKey: 'miniapp.home_entry.comic.message',
        defaultMessage: '生漫剧功能维护中，请稍后再试',
      },
    },
  },
];

const ALL_KEYS = GROUPS.flatMap(g => g.keys);
const ALL_MESSAGE_KEYS = GROUPS.flatMap(g => Object.values(g.labels).map(item => item.messageKey).filter(Boolean)) as string[];
const UNIMPLEMENTED_TOGGLES = new Set(['security.captcha_enabled']);

function groupForKey(key: string) {
  if (key.startsWith('ai.')) return 'ai';
  if (key.startsWith('security.')) return 'security';
  if (key.startsWith('miniapp.review_mode') || key.startsWith('miniapp.purchase')) return 'miniapp_review';
  if (key.startsWith('miniapp.home_entry.')) return 'miniapp_home_entry';
  if (key.startsWith('content.')) return 'general';
  if (key.startsWith('template.') || key.startsWith('inspiration.')) return 'general';
  if (key.startsWith('membership.')) return 'general';
  return 'general';
}

export default function FeatureToggles() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [entryMessages, setEntryMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savingMessages, setSavingMessages] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results: Record<string, boolean> = {};
      const messages: Record<string, string> = {};
      const groupsToFetch = [...new Set([...ALL_KEYS, ...ALL_MESSAGE_KEYS].map(groupForKey))];

      for (const group of groupsToFetch) {
        try {
          const r: any = await api.get('/settings/' + group);
          const configs = r.data || [];
          for (const c of configs) {
            if (ALL_KEYS.includes(c.key)) {
              results[c.key] = c.value === 'true' || c.value === '1';
            }
            if (ALL_MESSAGE_KEYS.includes(c.key)) {
              messages[c.key] = String(c.value || '');
            }
          }
        } catch { /* group might not exist yet */ }
      }
      setToggles(results);
      setEntryMessages(messages);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggle = async (key: string, checked: boolean) => {
    if (UNIMPLEMENTED_TOGGLES.has(key)) {
      message.warning('登录验证码暂未接入业务校验链路，当前版本不允许作为可生效开关启用');
      return;
    }
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await api.post('/settings/' + groupForKey(key), { [key]: String(checked) });
      setToggles(prev => ({ ...prev, [key]: checked }));
      message.success(checked ? `已开启「${getLabel(key)}」` : `已关闭「${getLabel(key)}」`);
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleMessageSave = async (key: string, fallback: string) => {
    const value = String(entryMessages[key] ?? fallback).trim();
    if (!value) {
      message.warning('维护提示文案不能为空');
      return;
    }
    setSavingMessages(prev => ({ ...prev, [key]: true }));
    try {
      await api.post('/settings/' + groupForKey(key), { [key]: value });
      setEntryMessages(prev => ({ ...prev, [key]: value }));
      message.success('维护提示文案已保存');
    } catch {
      message.error('维护提示文案保存失败');
    } finally {
      setSavingMessages(prev => ({ ...prev, [key]: false }));
    }
  };

  const getLabel = (key: string) => {
    for (const g of GROUPS) {
      if (g.labels[key]) return g.labels[key].label;
    }
    return key;
  };

  const getHint = (key: string) => {
    for (const g of GROUPS) {
      if (g.labels[key]) return g.labels[key].hint;
    }
    return '';
  };

  const getWarning = (key: string) => {
    for (const g of GROUPS) {
      if (g.labels[key]) return g.labels[key].disabledWarning;
    }
    return '';
  };

  // Check for critical features that are off
  const criticalOff: string[] = [];
  if (toggles['membership.enabled'] === false) criticalOff.push('会员体系');
  if (toggles['content.filter_enabled'] === false) criticalOff.push('内容过滤');

  return (
    <div>
      <h2><ThunderboltOutlined /> 功能开关</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>
        控制小程序各功能模块的启用和关闭。修改后实时生效，小程序端通过 <code>/public/app</code> 接口获取最新配置。
      </p>

      {criticalOff.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="以下功能当前处于关闭状态，可能影响小程序正常使用"
          description={
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {criticalOff.includes('会员体系') && <li><strong>会员体系</strong>：小程序个人中心无会员入口，用户无法购买会员套餐。</li>}
              {criticalOff.includes('内容过滤') && <li><strong>内容过滤</strong>：用户提交的提示词不经过敏感词检测，存在内容违规风险。</li>}
              {criticalOff.includes('验证码') && <li><strong>验证码</strong>：登录接口无验证码保护。</li>}
            </ul>
          }
          action={<Button size="small" icon={<ReloadOutlined />} onClick={fetchAll}>刷新</Button>}
        />
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="登录验证码暂未接入业务校验链路"
        description="当前后端登录接口没有验证码参数和校验逻辑，因此该开关已标记为未接入并禁止切换，避免只保存配置但业务不读取。"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="AI 文本能力的配置位置"
        description="本页只控制入口开关；模型 ID 和积分在「系统设置 → AI 文本能力」配置；具体提示词模板在「内容管理 → 系统提示词」配置。小程序端需要读取 /public/app 的 features 后再展示对应按钮。"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="工具箱配置已迁移"
        description="工具页总开关、工具增删排序、次数、广告解锁、积分收费、关闭提示和工具模型绑定，请在「微信配置 → 工具页配置」统一维护。"
        action={<Button size="small" type="primary" onClick={() => { window.location.href = '/wechat/tools'; }}>前往工具页配置</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {GROUPS.map(group => {
          const anyOff = group.keys.some(k => toggles[k] === false);
          return (
            <Card
              key={group.title}
              title={<Space>{group.icon}<span>{group.title}</span></Space>}
              loading={loading}
              extra={anyOff ? <Tag color="orange">部分关闭</Tag> : <Tag color="green">全部开启</Tag>}
            >
              <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>{group.intro}</p>
              <Row gutter={[16, 16]}>
                {group.keys.map(key => {
                  const notImplemented = UNIMPLEMENTED_TOGGLES.has(key);
                  return (
                  <Col span={12} key={key}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: toggles[key] === false ? '1px solid #ffd666' : '1px solid #e8e8e8' }}>
                      <Switch
                        checked={notImplemented ? false : toggles[key] !== false}
                        loading={saving[key]}
                        disabled={notImplemented}
                        onChange={(v) => handleToggle(key, v)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                          {getLabel(key)} {notImplemented && <Tag color="default">未接入</Tag>}
                        </div>
                        <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{getHint(key)}</div>
                        {notImplemented && (
                          <Alert type="info" message="当前版本不保存为可生效开关，待后端验证码接口接入后再开放。" style={{ fontSize: 11, padding: '6px 10px' }} showIcon={false} />
                        )}
                        {toggles[key] === false && (
                          <Alert type="warning" message={getWarning(key)} style={{ fontSize: 11, padding: '6px 10px' }} showIcon={false} />
                        )}
                        {group.labels[key]?.messageKey && (
                          <div style={{ marginTop: 8 }}>
                            <Input.TextArea
                              value={entryMessages[group.labels[key].messageKey!] ?? group.labels[key].defaultMessage}
                              rows={2}
                              maxLength={80}
                              showCount
                              placeholder="关闭入口时给用户看的提示"
                              onChange={(event) => {
                                const messageKey = group.labels[key].messageKey!;
                                setEntryMessages(prev => ({ ...prev, [messageKey]: event.target.value }));
                              }}
                            />
                            <Button
                              size="small"
                              style={{ marginTop: 8 }}
                              loading={savingMessages[group.labels[key].messageKey!]}
                              onClick={() => handleMessageSave(group.labels[key].messageKey!, group.labels[key].defaultMessage || '功能维护中，请稍后再试')}
                            >
                              保存提示文案
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Col>
                )})}
              </Row>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
