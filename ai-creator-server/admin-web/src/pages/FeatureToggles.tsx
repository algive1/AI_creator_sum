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
    intro: '控制小程序各创作功能的入口显示。关闭后小程序对应页面将隐藏该功能入口，用户无法使用。',
    keys: [
      'ai.prompt_optimize.enabled',
      'ai.script_generate.enabled',
      'ai.prompt_generate.enabled',
      'ai.storyboard_generate.enabled',
    ],
    labels: {
      'ai.prompt_optimize.enabled': {
        label: '智能优化提示词',
        hint: '在创作页提供 AI 优化提示词按钮。会员免费，非会员消耗积分。',
        disabledWarning: '关闭后小程序创作页将不显示"智能优化"按钮，用户无法使用 AI 优化提示词功能。',
      },
      'ai.script_generate.enabled': {
        label: '脚本生成',
        hint: '在视频创作页提供 AI 生成视频脚本功能，输入主题即可获得分镜脚本。',
        disabledWarning: '关闭后小程序视频创作页将不显示"脚本生成"入口。',
      },
      'ai.prompt_generate.enabled': {
        label: '提示词生成',
        hint: '提供创意提示词变体生成，用户输入 idea 即可获得多个可选 prompt。',
        disabledWarning: '关闭后小程序将不显示"提示词生成"功能入口。',
      },
      'ai.storyboard_generate.enabled': {
        label: 'AI 漫剧分镜',
        hint: '提供 AI 漫剧分镜脚本生成功能，输入故事脚本获得分镜列表。',
        disabledWarning: '关闭后小程序将不显示"AI漫剧"功能入口。',
      },
    },
  },
  {
    title: '会员与商业',
    icon: <CrownOutlined />,
    intro: '控制会员体系和商业功能的开关。关闭后小程序将隐藏对应入口和页面。',
    keys: ['membership.enabled'],
    labels: {
      'membership.enabled': {
        label: '会员体系',
        hint: '启用后小程序展示会员套餐、会员入口、会员专属模板和权益。',
        disabledWarning: '⚠ 关闭后小程序将完全不显示会员相关内容：个人中心无会员入口、创作页无会员标识、模板广场无会员专享标签。用户将无法看到和购买会员套餐。请确认会员套餐已配置完成后再开启。',
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
      'template.member_gate_enabled',
      'inspiration.member_gate_enabled',
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
      'template.member_gate_enabled': {
        label: '模板会员门槛',
        hint: '启用后可将模板设置为"会员专享"，非会员用户无法查看和使用。',
        disabledWarning: '关闭后所有模板均为免费可用，后台设置的会员专享模板也会对免费用户开放。',
      },
      'inspiration.member_gate_enabled': {
        label: '灵感广场会员门槛',
        hint: '启用后灵感广场可设置会员专享内容，非会员用户只能浏览免费内容。',
        disabledWarning: '关闭后灵感广场所有内容均免费开放，会员专享限制失效。',
      },
    },
  },
];

const ALL_KEYS = GROUPS.flatMap(g => g.keys);

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
  if (toggles['security.captcha_enabled'] === false) criticalOff.push('验证码');

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
                {group.keys.map(key => (
                  <Col span={12} key={key}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, background: '#fafafa', borderRadius: 8, border: toggles[key] === false ? '1px solid #ffd666' : '1px solid #e8e8e8' }}>
                      <Switch
                        checked={toggles[key] !== false}
                        loading={saving[key]}
                        onChange={(v) => handleToggle(key, v)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{getLabel(key)}</div>
                        <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{getHint(key)}</div>
                        {toggles[key] === false && (
                          <Alert type="warning" message={getWarning(key)} style={{ fontSize: 11, padding: '6px 10px' }} showIcon={false} />
                        )}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
