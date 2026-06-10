import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Switch, Tag, message } from 'antd';
import { ThunderboltOutlined, CrownOutlined, SafetyCertificateOutlined, BulbOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';

interface ToggleGroup {
  title: string;
  icon: React.ReactNode;
  intro: string;
  keys: string[];
  labels: Record<string, { label: string; hint: string; disabledWarning: string }>;
}

const GROUPS: ToggleGroup[] = [
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
        label: 'AI 漫剧分镜生成',
        hint: '输入脚本后生成镜头画面、运镜、光影说明，对应 /tasks/storyboard。',
        disabledWarning: '关闭后小程序不应展示"AI漫剧分镜"生成入口。',
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
];

const ALL_KEYS = GROUPS.flatMap(g => g.keys);
const UNIMPLEMENTED_TOGGLES = new Set(['security.captcha_enabled']);

export default function FeatureToggles() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results: Record<string, boolean> = {};
      const groupsToFetch = [...new Set(GROUPS.map(g => {
        // Map config keys to their groups
        if (g.keys.some(k => k.startsWith('ai.'))) return 'ai';
        if (g.keys.some(k => k.startsWith('membership.'))) return 'general';
        if (g.keys.some(k => k.startsWith('content.') || k.startsWith('security.'))) return 'security';
        if (g.keys.some(k => k.startsWith('template.') || k.startsWith('inspiration.'))) return 'general';
        return 'general';
      }))];

      for (const group of groupsToFetch) {
        try {
          const r: any = await api.get('/settings/' + group);
          const configs = r.data || [];
          for (const c of configs) {
            if (ALL_KEYS.includes(c.key)) {
              results[c.key] = c.value === 'true' || c.value === '1';
            }
          }
        } catch { /* group might not exist yet */ }
      }
      setToggles(results);
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
      // Determine the correct config group for this key
      let group = 'general';
      if (key.startsWith('ai.')) group = 'ai';
      else if (key.startsWith('content.')) group = 'general';
      else if (key.startsWith('security.')) group = 'security';
      else if (key.startsWith('template.') || key.startsWith('inspiration.')) group = 'general';
      else if (key.startsWith('membership.')) group = 'general';

      await api.post('/settings/' + group, { [key]: String(checked) });
      setToggles(prev => ({ ...prev, [key]: checked }));
      message.success(checked ? `已开启「${getLabel(key)}」` : `已关闭「${getLabel(key)}」`);
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
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
