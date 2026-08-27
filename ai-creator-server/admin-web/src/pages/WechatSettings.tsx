import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Form, Image, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import { CopyOutlined, CustomerServiceOutlined, DeleteOutlined, EditOutlined, MinusCircleOutlined, PayCircleOutlined, PictureOutlined, PlusOutlined, QuestionCircleOutlined, UploadOutlined, WechatOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { pickUploadUrl, uploadAdminAsset } from '../services/upload';
import { sanitizeHelpHtml } from '../utils/htmlSanitizer';

const { Text } = Typography;

const VISUAL_ASSET_FIELDS = [
  {
    name: 'homeBannerUrl',
    key: 'miniapp_visual_assets.home_banner_url',
    label: '首页顶部 Banner',
    hint: '首页首屏大图。为空时小程序使用本地 JPG 和 CSS 绘制兜底。',
  },
  {
    name: 'homeMemberUpsellUrl',
    key: 'miniapp_visual_assets.home_member_upsell_url',
    label: '首页会员悬浮引导',
    hint: '未开通会员时首页底部悬浮引导图。为空时使用小程序 CSS 兜底。',
  },
  {
    name: 'inspirationBannerUrl',
    key: 'miniapp_visual_assets.inspiration_banner_url',
    label: '灵感页顶部 Banner',
    hint: '发现灵感页顶部运营图。为空时使用页面原 CSS 灯泡 Banner。',
  },
  {
    name: 'comicBannerUrl',
    key: 'miniapp_visual_assets.comic_banner_url',
    label: 'AI漫剧页顶部 Banner',
    hint: 'AI漫剧页顶部运营图。为空时使用页面原 CSS 猫咪 Banner。',
  },
  {
    name: 'profileMemberOfferBannerUrl',
    key: 'miniapp_visual_assets.profile_member_offer_banner_url',
    label: '我的页会员套餐入口 Banner',
    hint: '我的页用户卡片下方会员套餐入口图。为空时使用当前 CSS 会员入口卡片。',
  },
] as const;

type ConfigRow = {
  key: string;
  value: string;
  isSecret?: boolean;
  maskedValue?: string;
};

type HelpItemForm = {
  id?: string;
  title?: string;
  subtitle?: string;
  contentHtml?: string;
  mediaType?: 'image' | 'video' | '';
  mediaUrl?: string;
  mediaRatio?: string;
  copyText?: string;
  copyLabel?: string;
};

type PromptGuideForm = {
  enabled?: boolean;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  contentHtml?: string;
  copyText?: string;
  copyLabel?: string;
  helpId?: string;
};

const PROMPT_GUIDE_MODES = [
  { key: 'ai_image.text2img', label: 'AI 生图 · 文生图', defaultPlaceholder: '写点什么... 输入完成1秒后自动保存，最多2000字' },
  { key: 'ai_image.img2img', label: 'AI 生图 · 图生图', defaultPlaceholder: '写点什么... 输入完成1秒后自动保存，最多2000字' },
  { key: 'ai_image.edit', label: 'AI 生图 · 图片编辑', defaultPlaceholder: '点击下方一键编辑，或写下你想怎么编辑图片' },
  { key: 'ai_video.text2video', label: 'AI 视频 · 文生视频', defaultPlaceholder: '描述视频画面、镜头运动、主体动作和风格' },
  { key: 'ai_video.img2video', label: 'AI 视频 · 图生视频', defaultPlaceholder: '描述图片接下来发生什么，补充动作、镜头和氛围' },
  { key: 'ai_video.reference', label: 'AI 视频 · 参考生视频', defaultPlaceholder: '描述参考素材的使用方式、主体动作和成片风格' },
  { key: 'ai_video.first_last_frame', label: 'AI 视频 · 首尾帧', defaultPlaceholder: '描述首帧到尾帧之间的变化、动作和镜头节奏' },
  { key: 'ai_video.edit', label: 'AI 视频 · 视频编辑', defaultPlaceholder: '描述你想如何编辑源视频，例如裁剪节奏、换场景或增强画质' },
  { key: 'comic.story', label: 'AI 漫剧 · 剧情梗概', defaultPlaceholder: '例如：普通少女误入异能学院，发现自己能听见画面里的旁白。' },
] as const;

const HELP_MEDIA_TYPE_OPTIONS = [
  { label: '无媒体', value: '' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
];

const HELP_RATIO_OPTIONS = [
  { label: '16:9 横图/视频', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16 竖图/视频', value: '9:16' },
];

function asBool(value: any, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function findValue(rows: ConfigRow[], key: string, fallback = '') {
  const row = rows.find(item => item.key === key);
  return row?.value || fallback;
}

function secretText(rows: ConfigRow[], key: string) {
  const row = rows.find(item => item.key === key);
  return row?.maskedValue || '未配置';
}

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function defaultHelpItem(): HelpItemForm {
  return {
    title: '',
    subtitle: '',
    contentHtml: '',
    mediaType: '',
    mediaUrl: '',
    mediaRatio: '16:9',
    copyText: '',
    copyLabel: '复制',
  };
}

function defaultPromptGuideItem(defaultPlaceholder = ''): PromptGuideForm {
  return {
    enabled: true,
    placeholder: defaultPlaceholder,
    title: '提示词写作帮助',
    subtitle: '',
    contentHtml: '',
    copyText: '',
    copyLabel: '复制示例',
    helpId: '',
  };
}

function normalizeHelpItemsFromConfig(itemsJson: string, contentHtml: string): HelpItemForm[] {
  const items = parseJsonArray(itemsJson).map(normalizeHelpItemForForm).filter(hasHelpItemFormContent);
  if (items.length) return items;
  return String(contentHtml || '').trim()
    ? [{ ...defaultHelpItem(), title: '使用帮助', subtitle: '常见操作说明', contentHtml }]
    : [{ ...defaultHelpItem(), title: '快速开始' }];
}

function normalizePromptGuideItemsFromConfig(itemsJson: string): Record<string, PromptGuideForm> {
  const rawItems = parseJsonObject(itemsJson);
  return Object.fromEntries(PROMPT_GUIDE_MODES.map((mode) => {
    const raw = rawItems[mode.key];
    const normalized = normalizePromptGuideItemForForm(raw, mode.defaultPlaceholder);
    return [mode.key, normalized];
  }));
}

function normalizeHelpItemForForm(item: any): HelpItemForm {
  const mediaType = ['image', 'video'].includes(String(item?.mediaType || '')) ? item.mediaType : '';
  return {
    id: String(item?.id || ''),
    title: String(item?.title || ''),
    subtitle: String(item?.subtitle || item?.subTitle || item?.description || ''),
    contentHtml: String(item?.contentHtml || item?.content_html || item?.content || ''),
    mediaType,
    mediaUrl: String(item?.mediaUrl || item?.media_url || ''),
    mediaRatio: normalizeHelpRatio(item?.mediaRatio || item?.media_ratio || '16:9'),
    copyText: String(item?.copyText || item?.copy_text || ''),
    copyLabel: String(item?.copyLabel || item?.copy_label || '复制'),
  };
}

function normalizePromptGuideItemForForm(item: any, defaultPlaceholder = ''): PromptGuideForm {
  const row = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  return {
    enabled: row.enabled !== false,
    placeholder: String(row.placeholder || defaultPlaceholder || ''),
    title: String(row.title || '提示词写作帮助'),
    subtitle: String(row.subtitle || ''),
    contentHtml: String(row.contentHtml || row.content_html || row.content || ''),
    copyText: String(row.copyText || row.copy_text || ''),
    copyLabel: String(row.copyLabel || row.copy_label || '复制示例'),
    helpId: String(row.helpId || row.help_id || ''),
  };
}

function normalizeHelpItemsForSave(items: any[]): HelpItemForm[] {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const normalized = normalizeHelpItemForForm(item);
      return {
        ...normalized,
        id: normalized.id || `help_${Date.now()}_${index}`,
        title: normalized.title || `帮助 ${index + 1}`,
        contentHtml: sanitizeHelpHtml(String(normalized.contentHtml || '')),
        copyLabel: normalized.copyLabel || '复制',
      };
    })
    .filter(hasHelpItemFormContent);
}

function normalizePromptGuideItemsForSave(items: Record<string, PromptGuideForm> = {}) {
  return Object.fromEntries(PROMPT_GUIDE_MODES.map((mode) => {
    const item = normalizePromptGuideItemForForm(items[mode.key], mode.defaultPlaceholder);
    return [mode.key, {
      ...item,
      contentHtml: sanitizeHelpHtml(String(item.contentHtml || '')),
      copyLabel: item.copyLabel || '复制示例',
    }];
  }));
}

function hasHelpItemFormContent(item: HelpItemForm) {
  return Boolean(String(item.subtitle || '').trim() || String(item.contentHtml || '').trim() || String(item.mediaUrl || '').trim() || String(item.copyText || '').trim());
}

function normalizeHelpRatio(value: any) {
  const text = String(value || '').trim();
  return /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text) ? text : '16:9';
}

export default function WechatSettings() {
  const location = useLocation();
  const page = useMemo(() => {
    if (location.pathname.includes('/wechat/pay')) return 'pay';
    if (location.pathname.includes('/wechat/customer-service')) return 'customer';
    if (location.pathname.includes('/wechat/help')) return 'help';
    if (location.pathname.includes('/wechat/tabbar')) return 'tabbar';
    if (location.pathname.includes('/wechat/visual-assets')) return 'visualAssets';
    return 'miniapp';
  }, [location.pathname]);
  const [form] = Form.useForm();
  const [configs, setConfigs] = useState<Record<string, ConfigRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingAppSecret, setCopyingAppSecret] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<Record<string, boolean>>({});
  const [helpItemsState, setHelpItemsState] = useState<HelpItemForm[]>([]);
  const [helpItemModalOpen, setHelpItemModalOpen] = useState(false);
  const [editingHelpItemIndex, setEditingHelpItemIndex] = useState<number | null>(null);
  const [helpItemForm] = Form.useForm<HelpItemForm>();

  // tabBar
  const [tabItems, setTabItems] = useState<any[]>([]);
  const [profileWorkbenchEnabled, setProfileWorkbenchEnabled] = useState(true);
  const [profilePointsTasksEnabled, setProfilePointsTasksEnabled] = useState(true);
  const [profileMemberEntryEnabled, setProfileMemberEntryEnabled] = useState(true);
  const [freeQuotaEnabled, setFreeQuotaEnabled] = useState(false);
  const [freeQuotaDailyLimit, setFreeQuotaDailyLimit] = useState(1);
  const [freeQuotaTotalLimit, setFreeQuotaTotalLimit] = useState(3);
  const [freeQuotaAllowedTierKeys, setFreeQuotaAllowedTierKeys] = useState('image_standard,image_pro');
  const [freeQuotaShowInDailyTasks, setFreeQuotaShowInDailyTasks] = useState(true);
  const [freeQuotaExhaustedMessage, setFreeQuotaExhaustedMessage] = useState('今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。');
  const [tabModal, setTabModal] = useState(false);
  const [editingTab, setEditingTab] = useState<any>(null);
  const [tabForm] = Form.useForm();

  const PAGE_OPTIONS = [
    { label: '首页', value: '/pages/home/index' },
    { label: '灵感', value: '/pages/inspiration/index' },
    { label: '工具', value: '/pages/tools/index' },
    { label: '漫剧', value: '/pages/comic/index' },
    { label: '记录', value: '/pages/history/index' },
    { label: '我的', value: '/pages/profile/index' },
  ];

  const DEFAULT_TAB_ITEMS = [
    { text: '首页', pagePath: '/pages/home/index', icon: 'home', iconPath: '', selectedIconPath: '', enabled: true },
    { text: '灵感', pagePath: '/pages/inspiration/index', icon: 'spark', iconPath: '', selectedIconPath: '', enabled: true },
    { text: '工具', pagePath: '/pages/tools/index', icon: 'tools', iconPath: '', selectedIconPath: '', enabled: true },
    { text: '记录', pagePath: '/pages/history/index', icon: 'record', iconPath: '', selectedIconPath: '', enabled: true },
    { text: '我的', pagePath: '/pages/profile/index', icon: 'mine', iconPath: '', selectedIconPath: '', enabled: true },
  ];

  const enabledTabCount = (items: any[]) => items.filter(item => item.enabled !== false).length;
  const normalizeFreeQuotaTierKeys = (value: string) => {
    const text = String(value || '').trim();
    let rawItems: unknown[] = [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        rawItems = [];
      }
    } else {
      rawItems = text.split(/[,\n，\s]+/).filter(Boolean);
    }
    const seen = new Set<string>();
    return rawItems
      .map(item => String(item || '').trim().toLowerCase())
      .filter(item => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .join(',');
  };

  const fetchTabBar = useCallback(async () => {
    try {
      const res: any = await api.get('/settings/general');
      const row = (res.data || []).find((r: any) => r.key === 'miniapp.tab_bar');
      const workbenchRow = (res.data || []).find((r: any) => r.key === 'miniapp.profile_workbench_enabled');
      const pointsTasksRow = (res.data || []).find((r: any) => r.key === 'miniapp.profile_points_tasks_enabled');
      const memberEntryRow = (res.data || []).find((r: any) => r.key === 'miniapp.profile_member_entry_enabled');
      const freeQuotaEnabledRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.enabled');
      const freeQuotaDailyRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.daily_limit');
      const freeQuotaTotalRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.total_limit');
      const freeQuotaAllowedTierKeysRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.allowed_tier_keys');
      const freeQuotaShowRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.show_in_daily_tasks');
      const freeQuotaMessageRow = (res.data || []).find((r: any) => r.key === 'free_image_quota.exhausted_message');
      setProfileWorkbenchEnabled(asBool(workbenchRow?.value ?? 'true', true));
      setProfilePointsTasksEnabled(asBool(pointsTasksRow?.value ?? 'true', true));
      setProfileMemberEntryEnabled(asBool(memberEntryRow?.value ?? 'true', true));
      setFreeQuotaEnabled(asBool(freeQuotaEnabledRow?.value ?? 'false', false));
      setFreeQuotaDailyLimit(Math.max(0, Number(freeQuotaDailyRow?.value || 1)));
      setFreeQuotaTotalLimit(Math.max(0, Number(freeQuotaTotalRow?.value || 3)));
      setFreeQuotaAllowedTierKeys(String(freeQuotaAllowedTierKeysRow?.value || 'image_standard,image_pro'));
      setFreeQuotaShowInDailyTasks(asBool(freeQuotaShowRow?.value ?? 'true', true));
      setFreeQuotaExhaustedMessage(String(freeQuotaMessageRow?.value || '今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。'));
      if (row?.value) {
        try {
          const parsed = JSON.parse(row.value);
          setTabItems(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TAB_ITEMS);
        } catch {
          setTabItems(DEFAULT_TAB_ITEMS);
        }
      } else {
        setTabItems(DEFAULT_TAB_ITEMS);
      }
    } catch { setTabItems(DEFAULT_TAB_ITEMS); }
  }, []);

  const openTabEdit = (item?: any) => {
    setEditingTab(item || null);
    tabForm.setFieldsValue(item
      ? { ...item, enabled: item.enabled !== false }
      : { text: '', pagePath: '/pages/home/index', icon: '', iconPath: '', selectedIconPath: '', enabled: true });
    setTabModal(true);
  };

  const saveTab = async () => {
    const values = await tabForm.validateFields();
    const normalizedValues = { ...values, enabled: values.enabled !== false };
    const newItems = editingTab
      ? tabItems.map((t, i) => i === tabItems.indexOf(editingTab) ? normalizedValues : t)
      : [...tabItems, normalizedValues];
    if (newItems.length < 2) { message.warning('至少需要 2 个导航项'); return; }
    const visibleCount = enabledTabCount(newItems);
    if (visibleCount < 2) { message.warning('至少需要 2 个启用导航项'); return; }
    if (visibleCount > 5) message.info('小程序底部导航仅展示前 5 个启用项，超出的导航会保存在后台但端上不显示。');
    setTabItems(newItems);
    setTabModal(false);
    message.info('导航项已暂存，请点击“保存配置”后生效');
  };

  const deleteTab = (idx: number) => {
    if (tabItems.length <= 2) { message.warning('至少保留 2 个导航项'); return; }
    const newItems = tabItems.filter((_, i) => i !== idx);
    if (enabledTabCount(newItems) < 2) { message.warning('至少保留 2 个启用导航项'); return; }
    setTabItems(newItems);
    message.info('删除已暂存，请点击“保存配置”后生效');
  };

  const saveTabBar = async () => {
    setSaving(true);
    try {
      const normalizedAllowedTierKeys = normalizeFreeQuotaTierKeys(freeQuotaAllowedTierKeys) || 'image_standard,image_pro';
      await api.post('/settings/general', {
        'miniapp.tab_bar': JSON.stringify(tabItems),
        'miniapp.profile_workbench_enabled': String(profileWorkbenchEnabled),
        'miniapp.profile_points_tasks_enabled': String(profilePointsTasksEnabled),
        'miniapp.profile_member_entry_enabled': String(profileMemberEntryEnabled),
        'free_image_quota.enabled': String(freeQuotaEnabled),
        'free_image_quota.daily_limit': String(Math.max(0, Math.floor(Number(freeQuotaDailyLimit) || 0))),
        'free_image_quota.total_limit': String(Math.max(0, Math.floor(Number(freeQuotaTotalLimit) || 0))),
        'free_image_quota.allowed_tier_keys': normalizedAllowedTierKeys,
        'free_image_quota.show_in_daily_tasks': String(freeQuotaShowInDailyTasks),
        'free_image_quota.exhausted_message': freeQuotaExhaustedMessage || '',
      });
      setFreeQuotaAllowedTierKeys(normalizedAllowedTierKeys);
      message.success('导航栏配置已保存');
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (page === 'tabbar') fetchTabBar(); }, [fetchTabBar, page]);

  const fetchGroup = useCallback(async (group: string) => {
    const res: any = await api.get('/settings/' + group);
    return res.data || [];
  }, []);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const groups = ['wechat', 'wechat_pay', 'customer_service', 'miniapp_help', 'miniapp_prompt_guides', 'miniapp_visual_assets', 'general', 'storage'];
      const result: Record<string, ConfigRow[]> = {};
      await Promise.all(groups.map(async group => { result[group] = await fetchGroup(group); }));
      setConfigs(result);
      const nextHelpItems = normalizeHelpItemsFromConfig(
        findValue(result.miniapp_help || [], 'miniapp_help.items_json'),
        findValue(result.miniapp_help || [], 'miniapp_help.content_html'),
      );
      setHelpItemsState(nextHelpItems);
      form.setFieldsValue({
        loginEnabled: asBool(findValue(result.wechat || [], 'wechat.login_enabled', 'true'), true),
        appId: findValue(result.wechat || [], 'wechat.app_id'),
        appSecret: '',
        apiDomain: findValue(result.general || [], 'site.api_domain'),
        fileDomain: findValue(result.storage || [], 'storage.file_domain'),

        payEnabled: asBool(findValue(result.wechat_pay || [], 'wechat_pay.enabled', 'false'), false),
        payAppId: findValue(result.wechat_pay || [], 'wechat_pay.appid'),
        mchId: findValue(result.wechat_pay || [], 'wechat_pay.mchid'),
        apiV3Key: '',
        merchantSerialNo: findValue(result.wechat_pay || [], 'wechat_pay.merchant_serial_no'),
        privateKey: '',
        notifyUrl: findValue(result.wechat_pay || [], 'wechat_pay.notify_url', '/api/v1/payments/wechat/notify'),

        customerEnabled: asBool(findValue(result.customer_service || [], 'customer_service.enabled', 'true'), true),
        showInProfile: asBool(findValue(result.customer_service || [], 'customer_service.show_in_profile', 'true'), true),
        customerTitle: findValue(result.customer_service || [], 'customer_service.title', '联系客服'),
        customerSubtitle: findValue(result.customer_service || [], 'customer_service.subtitle', '订单、会员、生成问题都可以咨询'),
        customerIcon: findValue(result.customer_service || [], 'customer_service.icon', 'customer-service'),
        sessionFrom: findValue(result.customer_service || [], 'customer_service.session_from', 'profile'),
        showMessageCard: asBool(findValue(result.customer_service || [], 'customer_service.show_message_card', 'true'), true),
        sendMessageTitle: findValue(result.customer_service || [], 'customer_service.send_message_title', 'AI创作助手客服咨询'),
        sendMessagePath: findValue(result.customer_service || [], 'customer_service.send_message_path', '/pages/user/index'),
        sendMessageImg: findValue(result.customer_service || [], 'customer_service.send_message_img'),

        helpEnabled: asBool(findValue(result.miniapp_help || [], 'miniapp_help.enabled', 'true'), true),
        helpTitle: findValue(result.miniapp_help || [], 'miniapp_help.title', '使用帮助'),
        helpContentHtml: findValue(result.miniapp_help || [], 'miniapp_help.content_html'),
        helpItems: nextHelpItems,
        promptGuideEnabled: asBool(findValue(result.miniapp_prompt_guides || [], 'miniapp_prompt_guides.enabled', 'true'), true),
        promptGuideItems: normalizePromptGuideItemsFromConfig(
          findValue(result.miniapp_prompt_guides || [], 'miniapp_prompt_guides.items_json', '{}'),
        ),

        homeBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.home_banner_url'),
        homeMemberUpsellUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.home_member_upsell_url'),
        inspirationBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.inspiration_banner_url'),
        comicBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.comic_banner_url'),
        profileMemberOfferBannerUrl: findValue(result.miniapp_visual_assets || [], 'miniapp_visual_assets.profile_member_offer_banner_url'),
      });
    } finally {
      setLoading(false);
    }
  }, [fetchGroup, form]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs, page]);

  const postNormal = (group: string, body: Record<string, string>) => api.post('/settings/' + group, body);
  const postSecret = (group: string, body: Record<string, string>) => {
    const filtered = Object.fromEntries(Object.entries(body).filter(([, value]) => String(value || '').trim()));
    if (Object.keys(filtered).length === 0) return Promise.resolve();
    return api.post('/settings/' + group + '/secure', filtered);
  };

  const copyWechatAppSecret = async () => {
    if (copyingAppSecret) return;
    setCopyingAppSecret(true);
    try {
      const res: any = await api.post('/settings/secrets/copy', { key: 'wechat.app_secret' });
      const value = String(res.data?.value || '');
      if (!value) {
        message.warning('AppSecret 未配置');
        return;
      }
      await copyTextToClipboard(value);
      message.success('AppSecret 已复制');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '复制 AppSecret 失败');
    } finally {
      setCopyingAppSecret(false);
    }
  };

  const saveMiniapp = async () => {
    const values = await form.validateFields(['loginEnabled', 'appId', 'appSecret', 'apiDomain', 'fileDomain']);
    setSaving(true);
    try {
      await Promise.all([
        postNormal('wechat', {
          'wechat.login_enabled': String(!!values.loginEnabled),
          'wechat.app_id': values.appId || '',
        }),
        postSecret('wechat', { 'wechat.app_secret': values.appSecret || '' }),
        postNormal('general', { 'site.api_domain': values.apiDomain || '' }),
        postNormal('storage', { 'storage.file_domain': values.fileDomain || '' }),
      ]);
      message.success('微信小程序配置已保存');
      void fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const savePay = async () => {
    const values = await form.validateFields(['payEnabled', 'payAppId', 'mchId', 'apiV3Key', 'merchantSerialNo', 'privateKey', 'notifyUrl']);
    if (values.payEnabled && (!values.payAppId || !values.mchId || !values.merchantSerialNo || !values.notifyUrl)) {
      message.error('启用微信支付前，请先填写 AppID、商户号、证书序列号和回调地址');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        postNormal('wechat_pay', {
          'wechat_pay.enabled': String(!!values.payEnabled),
          'wechat_pay.appid': values.payAppId || '',
          'wechat_pay.mchid': values.mchId || '',
          'wechat_pay.merchant_serial_no': values.merchantSerialNo || '',
          'wechat_pay.notify_url': values.notifyUrl || '',
        }),
        postSecret('wechat_pay', {
          'wechat_pay.api_v3_key': values.apiV3Key || '',
          'wechat_pay.private_key': values.privateKey || '',
        }),
      ]);
      message.success('微信支付配置已保存');
      void fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveCustomer = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await postNormal('customer_service', {
        'customer_service.enabled': String(!!values.customerEnabled),
        'customer_service.show_in_profile': String(!!values.showInProfile),
        'customer_service.title': values.customerTitle || '联系客服',
        'customer_service.subtitle': values.customerSubtitle || '',
        'customer_service.icon': values.customerIcon || 'customer-service',
        'customer_service.session_from': values.sessionFrom || 'profile',
        'customer_service.show_message_card': String(!!values.showMessageCard),
        'customer_service.send_message_title': values.sendMessageTitle || '',
        'customer_service.send_message_path': values.sendMessagePath || '',
        'customer_service.send_message_img': values.sendMessageImg || '',
      });
      message.success('微信客服配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveHelp = async () => {
    const values = await form.validateFields(['helpEnabled', 'helpTitle']);
    const helpItems = normalizeHelpItemsForSave(helpItemsState);
    const legacyContentHtml = helpItems[0]?.contentHtml || '';
    setSaving(true);
    try {
      await postNormal('miniapp_help', {
        'miniapp_help.enabled': String(!!values.helpEnabled),
        'miniapp_help.title': values.helpTitle || '使用帮助',
        'miniapp_help.content_html': legacyContentHtml,
        'miniapp_help.items_json': JSON.stringify(normalizeHelpItemsForSave(helpItems)),
      });
      message.success('使用帮助配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const savePromptGuides = async () => {
    const values = await form.validateFields(['promptGuideEnabled', 'promptGuideItems']);
    const promptGuideItems = normalizePromptGuideItemsForSave(values.promptGuideItems || {});
    setSaving(true);
    try {
      await postNormal('miniapp_prompt_guides', {
        'miniapp_prompt_guides.enabled': String(!!values.promptGuideEnabled),
        'miniapp_prompt_guides.items_json': JSON.stringify(promptGuideItems),
      });
      message.success('生成页提示词引导已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const saveVisualAssets = async () => {
    const fieldNames = VISUAL_ASSET_FIELDS.map(item => item.name);
    const values = await form.validateFields(fieldNames);
    setSaving(true);
    try {
      await postNormal('miniapp_visual_assets', Object.fromEntries(
        VISUAL_ASSET_FIELDS.map(item => [item.key, values[item.name] || '']),
      ));
      message.success('小程序素材配置已保存');
      fetchConfigs();
    } finally {
      setSaving(false);
    }
  };

  const uploadVisualAsset = (fieldName: string) => async (options: any) => {
    const file = options.file as File;
    try {
      setUploadingAsset(prev => ({ ...prev, [fieldName]: true }));
      const fileInfo: any = await uploadAdminAsset(file, { category: 'general', refType: 'miniapp_visual_asset' });
      const url = pickUploadUrl(fileInfo);
      if (!url) throw new Error('上传成功但未返回文件地址');
      form.setFieldsValue({ [fieldName]: url });
      message.success('素材上传成功，请确认 URL 为 HTTPS 后保存');
      options.onSuccess?.(fileInfo, file);
    } catch (e: any) {
      message.error(e?.message || '素材上传失败');
      options.onError?.(e);
    } finally {
      setUploadingAsset(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const renderHint = (title: string, content: string) => (
    <div style={{ marginBottom: 8 }}>
      <Text strong>{title}</Text>
      <div><Text type="secondary">{content}</Text></div>
    </div>
  );

  const miniapp = (
    <Card loading={loading} title={<Space><WechatOutlined />微信小程序</Space>}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="只填写小程序运行必须的信息。合法域名需要到微信公众平台单独配置。" />
      <Form form={form} layout="vertical">
        <Form.Item name="loginEnabled" label="启用微信登录" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item name="appId" label="AppID" extra="微信公众平台 -> 开发管理 -> 开发设置中获取。" rules={[{ required: true, message: '请输入小程序 AppID' }]}>
          <Input placeholder="wx..." />
        </Form.Item>
        <Form.Item
          name="appSecret"
          label="AppSecret"
          extra={
            <Space wrap>
              <Text type="secondary">当前状态：{secretText(configs.wechat || [], 'wechat.app_secret')}。留空不会修改原密钥。</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={copyingAppSecret}
                disabled={secretText(configs.wechat || [], 'wechat.app_secret') === '未配置'}
                onClick={copyWechatAppSecret}
              >
                复制
              </Button>
            </Space>
          }
        >
          <Input.Password placeholder="需要更换时再填写" />
        </Form.Item>
        <Form.Item name="apiDomain" label="后端 API 域名" extra="用于微信 request / uploadFile 合法域名，建议填写 https:// 开头的公网域名。">
          <Input placeholder="https://api.example.com" />
        </Form.Item>
        <Form.Item name="fileDomain" label="文件访问域名" extra="用于 downloadFile 合法域名，通常是对象存储或 CDN 域名。">
          <Input placeholder="https://cdn.example.com" />
        </Form.Item>
        <Button type="primary" loading={saving} onClick={saveMiniapp}>保存微信小程序配置</Button>
      </Form>
    </Card>
  );

  const pay = (
    <Card loading={loading} title={<Space><PayCircleOutlined />微信支付</Space>}>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="线上收款前请确认小程序已绑定商户号。密钥保存后不会明文显示。" />
      <Form form={form} layout="vertical">
        <Form.Item name="payEnabled" label="启用微信支付" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item name="payAppId" label="小程序 AppID">
          <Input placeholder="wx..." />
        </Form.Item>
        <Form.Item name="mchId" label="商户号">
          <Input placeholder="例如 1900000001" />
        </Form.Item>
        <Form.Item name="apiV3Key" label="API v3 Key" extra={`当前状态：${secretText(configs.wechat_pay || [], 'wechat_pay.api_v3_key')}。留空不会修改原密钥。`}>
          <Input.Password placeholder="32 位 API v3 Key" />
        </Form.Item>
        <Form.Item name="merchantSerialNo" label="商户证书序列号">
          <Input />
        </Form.Item>
        <Form.Item name="privateKey" label="商户私钥" extra={`当前状态：${secretText(configs.wechat_pay || [], 'wechat_pay.private_key')}。留空不会修改原密钥。`}>
          <Input.TextArea rows={5} placeholder="-----BEGIN PRIVATE KEY-----" />
        </Form.Item>
        <Form.Item name="notifyUrl" label="支付回调地址" extra="推荐填写完整 HTTPS 地址；如填相对路径，需要先配置后端 API 域名。">
          <Input placeholder="https://your-domain.com/api/v1/payments/wechat/notify" />
        </Form.Item>
        <Button type="primary" loading={saving} onClick={savePay}>保存微信支付配置</Button>
      </Form>
    </Card>
  );

  const customer = (
    <Card loading={loading} title={<Space><CustomerServiceOutlined />微信客服</Space>}>
      <Form form={form} layout="vertical">
        <Space size={32} wrap>
          <Form.Item name="customerEnabled" label="开启客服入口" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="showInProfile" label="显示在个人中心" valuePropName="checked">
            <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
          </Form.Item>
        </Space>
        <Form.Item name="customerTitle" label="入口名称" rules={[{ required: true, message: '请输入入口名称' }]}>
          <Input maxLength={24} placeholder="联系客服" />
        </Form.Item>
        <Form.Item name="customerSubtitle" label="入口描述">
          <Input maxLength={80} placeholder="订单、会员、生成问题都可以咨询" />
        </Form.Item>
        <Collapse ghost items={[{
          key: 'advanced',
          label: '高级配置',
          children: (
            <>
              {renderHint('这些配置通常不用改', '只有当小程序客服卡片或埋点来源有特殊要求时再调整。')}
              <Form.Item name="customerIcon" label="图标标识">
                <Input placeholder="customer-service" />
              </Form.Item>
              <Form.Item name="sessionFrom" label="sessionFrom">
                <Input placeholder="profile" />
              </Form.Item>
              <Form.Item name="showMessageCard" label="发送小程序卡片" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sendMessageTitle" label="卡片标题">
                <Input placeholder="AI创作助手客服咨询" />
              </Form.Item>
              <Form.Item name="sendMessagePath" label="卡片路径" rules={[{ pattern: /^$|^\//, message: '卡片路径必须以 / 开头' }]}>
                <Input placeholder="/pages/user/index" />
              </Form.Item>
              <Form.Item name="sendMessageImg" label="卡片图片" rules={[{ pattern: /^$|^https:\/\//i, message: '卡片图片必须是 https:// URL' }]}>
                <Input placeholder="可选填 HTTPS 图片 URL" />
              </Form.Item>
            </>
          ),
        }]} />
        <Button type="primary" loading={saving} onClick={saveCustomer}>保存微信客服配置</Button>
      </Form>
    </Card>
  );

  const normalizedPreviewHelpItems = useMemo(() => normalizeHelpItemsForSave(helpItemsState), [helpItemsState]);
  const promptGuideItems = Form.useWatch('promptGuideItems', form) || {};
  const promptGuideConfiguredCount = useMemo(() => {
    const normalized = normalizePromptGuideItemsForSave(promptGuideItems);
    return Object.values(normalized).filter(item => String(item.placeholder || item.contentHtml || item.copyText || item.helpId || '').trim()).length;
  }, [promptGuideItems]);

  const openHelpItemEditor = (index?: number) => {
    const isEditing = typeof index === 'number' && index >= 0;
    const current = isEditing ? helpItemsState[index] : undefined;
    setEditingHelpItemIndex(isEditing ? index : null);
    helpItemForm.setFieldsValue({
      ...defaultHelpItem(),
      ...(current || {}),
    });
    setHelpItemModalOpen(true);
  };

  const saveHelpItemEditor = async () => {
    const values = await helpItemForm.validateFields();
    const normalized = normalizeHelpItemForForm({
      ...values,
      id: values.id || `help_${Date.now()}`,
    });
    if (!hasHelpItemFormContent(normalized)) {
      message.warning('请至少填写副标题、富文本、媒体地址或可复制文本中的一项');
      return;
    }
    setHelpItemsState(prev => {
      if (editingHelpItemIndex === null) return [...prev, normalized];
      return prev.map((item, index) => index === editingHelpItemIndex ? normalized : item);
    });
    setHelpItemModalOpen(false);
    setEditingHelpItemIndex(null);
    helpItemForm.resetFields();
  };

  const deleteHelpItem = (index: number) => {
    setHelpItemsState(prev => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const helpItemColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      width: 180,
      render: (value: string, item: HelpItemForm, index: number) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value || `帮助 ${index + 1}`}</Text>
          {item.subtitle ? <Text type="secondary">{item.subtitle}</Text> : null}
        </Space>
      ),
    },
    {
      title: '富文本',
      dataIndex: 'contentHtml',
      width: 100,
      render: (value: string) => value ? <Tag color="green">已填写</Tag> : <Tag>未填写</Tag>,
    },
    {
      title: '媒体',
      width: 140,
      render: (_: unknown, item: HelpItemForm) => item.mediaUrl
        ? <Tag color={item.mediaType === 'video' ? 'purple' : 'blue'}>{item.mediaType === 'video' ? '视频' : '图片'} {item.mediaRatio || '16:9'}</Tag>
        : <Tag>无</Tag>,
    },
    {
      title: '复制文本',
      dataIndex: 'copyText',
      width: 110,
      render: (value: string) => value ? <Tag color="cyan">已配置</Tag> : <Tag>无</Tag>,
    },
    {
      title: '操作',
      width: 150,
      render: (_: unknown, __: HelpItemForm, index: number) => (
        <Space size={6}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              openHelpItemEditor(index);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除这条帮助？"
            onConfirm={() => deleteHelpItem(index)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(event) => event.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const help = (
    <Card loading={loading} title={<Space><QuestionCircleOutlined />使用帮助</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里分开维护小程序使用帮助内容和生成页提示词帮助按钮。保存后通过 /public/app 下发。"
      />
      <Form form={form} layout="vertical">
        <Form.Item name="helpContentHtml" hidden>
          <Input.TextArea />
        </Form.Item>
        <Tabs
          items={[
            {
              key: 'helpContent',
              label: '使用帮助内容',
              children: (
                <>
                  <Form.Item name="helpEnabled" label="启用使用帮助内容" valuePropName="checked">
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                  <Form.Item name="helpTitle" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                    <Input maxLength={40} placeholder="使用帮助" />
                  </Form.Item>
                  <Space style={{ marginBottom: 12 }}>
                    <Button icon={<PlusOutlined />} onClick={() => openHelpItemEditor()}>
                      添加帮助
                    </Button>
                    <Text type="secondary">点击表格行可编辑富文本、媒体和复制内容。</Text>
                  </Space>
                  <Table<HelpItemForm>
                    rowKey={(item, index) => item.id || `help_${index}`}
                    columns={helpItemColumns}
                    dataSource={helpItemsState}
                    pagination={false}
                    size="middle"
                    tableLayout="fixed"
                    scroll={{ x: 760 }}
                    onRow={(_, index) => ({
                      onClick: () => openHelpItemEditor(index),
                    })}
                  />
                  <Card size="small" title="预览" style={{ margin: '16px 0' }}>
                    {normalizedPreviewHelpItems.length ? normalizedPreviewHelpItems.map((item, index) => (
                      <Card key={item.id || index} size="small" title={item.title || `帮助 ${index + 1}`} style={{ marginBottom: 12 }}>
                        {item.subtitle ? <Text type="secondary">{item.subtitle}</Text> : null}
                        {item.contentHtml ? <div style={{ color: '#1f2937', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: sanitizeHelpHtml(String(item.contentHtml)) }} /> : null}
                        {item.mediaUrl ? (
                          <div style={{ width: 260, aspectRatio: String(item.mediaRatio || '16:9').replace(':', ' / '), borderRadius: 8, overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', marginTop: 8 }}>
                            {item.mediaType === 'video' ? '视频预览区域' : <Image src={item.mediaUrl} preview={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                          </div>
                        ) : null}
                        {item.copyText ? <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: '#111827', color: '#f9fafb', whiteSpace: 'pre-wrap' }}>{item.copyText}</pre> : null}
                      </Card>
                    )) : <Text type="secondary">暂无内容</Text>}
                  </Card>
                  <Button type="primary" loading={saving} onClick={saveHelp}>保存使用帮助配置</Button>
                </>
              ),
            },
            {
              key: 'promptGuides',
              label: '功能页帮助按钮',
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="这里维护生成页“不会写提示词？”弹层和主提示词输入框占位文案。每个生成模式独立配置。"
                  />
                  <Form.Item name="promptGuideEnabled" label="启用提示词引导" valuePropName="checked">
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                  <Tag color="blue" style={{ marginBottom: 12 }}>已配置 {promptGuideConfiguredCount} 个模式</Tag>
                  {PROMPT_GUIDE_MODES.map((mode) => (
                    <Card key={mode.key} size="small" title={mode.label} style={{ marginBottom: 14 }}>
                      <Space size={16} wrap align="start">
                        <Form.Item name={['promptGuideItems', mode.key, 'enabled']} label="启用弹层" valuePropName="checked" style={{ width: 130 }}>
                          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item name={['promptGuideItems', mode.key, 'helpId']} label="完整帮助 ID" style={{ width: 220 }}>
                          <Input maxLength={80} placeholder="例如 prompt_text2img" />
                        </Form.Item>
                      </Space>
                      <Form.Item
                        name={['promptGuideItems', mode.key, 'placeholder']}
                        label="主提示词占位文字"
                        extra="留空时小程序使用页面原默认文案。"
                      >
                        <Input.TextArea rows={2} maxLength={220} showCount placeholder={mode.defaultPlaceholder} />
                      </Form.Item>
                      <Space size={16} wrap align="start">
                        <Form.Item name={['promptGuideItems', mode.key, 'title']} label="弹层标题" style={{ width: 260 }}>
                          <Input maxLength={60} placeholder="提示词写作帮助" />
                        </Form.Item>
                        <Form.Item name={['promptGuideItems', mode.key, 'subtitle']} label="弹层副标题" style={{ width: 360 }}>
                          <Input maxLength={120} placeholder="用一句话说明这个模式怎么写更容易出效果" />
                        </Form.Item>
                      </Space>
                      <Form.Item
                        name={['promptGuideItems', mode.key, 'contentHtml']}
                        label="弹层富文本 HTML 内容"
                        extra="支持安全富文本标签。建议写 3-5 条短提示，不要做成长教程。"
                      >
                        <Input.TextArea rows={5} placeholder="<p>写清楚主体、场景、风格、细节和画面比例。</p>" />
                      </Form.Item>
                      <Form.Item name={['promptGuideItems', mode.key, 'copyText']} label="可复制示例">
                        <Input.TextArea rows={3} maxLength={2000} placeholder="例如：一位穿白色连衣裙的少女，站在雨后的霓虹街道..." />
                      </Form.Item>
                      <Form.Item name={['promptGuideItems', mode.key, 'copyLabel']} label="复制按钮文案">
                        <Input maxLength={12} placeholder="复制示例" />
                      </Form.Item>
                    </Card>
                  ))}
                  <Button type="primary" loading={saving} onClick={savePromptGuides}>保存功能页帮助按钮配置</Button>
                </>
              ),
            },
          ]}
        />
      </Form>
      <Modal
        title={editingHelpItemIndex === null ? '添加使用帮助' : '编辑使用帮助'}
        open={helpItemModalOpen}
        onOk={saveHelpItemEditor}
        onCancel={() => {
          setHelpItemModalOpen(false);
          setEditingHelpItemIndex(null);
          helpItemForm.resetFields();
        }}
        destroyOnClose
        width={760}
      >
        <Form form={helpItemForm} layout="vertical">
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="小标题" rules={[{ required: true, message: '请输入帮助标题' }]}>
            <Input maxLength={60} placeholder="如何保存作品？" />
          </Form.Item>
          <Form.Item name="subtitle" label="副标题">
            <Input maxLength={100} placeholder="例如：生成后保存、分享和再次编辑的常见说明" />
          </Form.Item>
          <Form.Item
            name="contentHtml"
            label="富文本 HTML 内容"
            extra="支持 h3、p、ul、li、strong、a、img、code、pre 等安全标签。图片/视频建议使用下方媒体字段，可控比例更稳定。"
          >
            <Input.TextArea rows={8} placeholder="<p>生成完成后进入结果页，点击保存到相册。</p>" />
          </Form.Item>
          <Space size={16} wrap align="start">
            <Form.Item name="mediaType" label="媒体类型" style={{ width: 160 }}>
              <Select options={HELP_MEDIA_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="mediaRatio" label="媒体比例" style={{ width: 180 }}>
              <Select options={HELP_RATIO_OPTIONS} />
            </Form.Item>
          </Space>
          <Form.Item
            name="mediaUrl"
            label="图片/视频 URL"
            rules={[{ pattern: /^$|^(https?:\/\/|\/)/i, message: '请填写 http(s) 或 / 开头的媒体地址' }]}
            extra="图片会完整显示，视频使用 contain，不会因裁切导致比例错误。"
          >
            <Input placeholder="https://cdn.example.com/help/demo.mp4" />
          </Form.Item>
          <Form.Item name="copyText" label="可复制文本">
            <Input.TextArea rows={3} placeholder="例如：客服微信号、兑换码、提示词模板、命令片段" />
          </Form.Item>
          <Form.Item name="copyLabel" label="复制按钮文案">
            <Input maxLength={12} placeholder="复制" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );

  const visualAssets = (
    <Card loading={loading} title={<Space><PictureOutlined />小程序素材配置</Space>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这些图片通过 /public/app 下发给小程序。为空时小程序使用本地 JPG 或 CSS 绘制兜底，首屏不会空白。"
        description="生产环境请使用 HTTPS 公网图片，并把图片域名配置到微信公众平台 downloadFile 合法域名。后台上传复用当前对象存储配置；如果返回本地 /static 地址，请先配置公网文件域名或对象存储后再用于真机。"
      />
      <Form form={form} layout="vertical">
        {VISUAL_ASSET_FIELDS.map(item => (
          <Card key={item.key} size="small" style={{ marginBottom: 14 }} title={item.label}>
            <Form.Item
              name={item.name}
              label="图片 URL"
              extra={item.hint}
              rules={[{ pattern: /^$|^https:\/\//i, message: '请填写 https:// 开头的图片 URL，或留空使用小程序兜底' }]}
            >
              <Input placeholder="https://cdn.example.com/miniapp/banner.jpg" />
            </Form.Item>
            <Space align="start" size={16} wrap>
              <Upload accept="image/jpeg,image/png" showUploadList={false} customRequest={uploadVisualAsset(item.name)} maxCount={1}>
                <Button icon={<UploadOutlined />} loading={!!uploadingAsset[item.name]}>上传 JPG/PNG</Button>
              </Upload>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) => {
                  const url = String(getFieldValue(item.name) || '').trim();
                  return url
                    ? <Image src={url} width={220} height={82} style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(99,102,241,0.12)' }} />
                    : <div style={{ width: 220, height: 82, borderRadius: 10, background: 'linear-gradient(135deg, #f7f4ff, #fff)', border: '1px dashed rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8fa3' }}>使用小程序兜底</div>;
                }}
              </Form.Item>
            </Space>
          </Card>
        ))}
        <Button type="primary" loading={saving} onClick={saveVisualAssets}>保存素材配置</Button>
      </Form>
    </Card>
  );

  const tabbar = (
    <div>
      <h2>底部导航栏配置</h2>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="配置小程序底部导航栏的图标和页面。最少 2 个，最多 5 个。图标支持粘贴图片 URL 或上传 SVG/PNG 文件。尺寸建议 81×81 像素。小程序仅支持 HTTPS 域名的图标。" />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space align="center" size={16} wrap>
            <Switch
              checked={profileWorkbenchEnabled}
              checkedChildren="显示"
              unCheckedChildren="隐藏"
              onChange={setProfileWorkbenchEnabled}
            />
            <div>
              <div style={{ fontWeight: 600 }}>我的页“我的创作台”入口</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>关闭后小程序“我的”页不显示该区块，不影响创作页面本身。</div>
            </div>
          </Space>
          <Space align="center" size={16} wrap>
            <Switch
              checked={profilePointsTasksEnabled}
              checkedChildren="显示"
              unCheckedChildren="隐藏"
              onChange={setProfilePointsTasksEnabled}
            />
            <div>
              <div style={{ fontWeight: 600 }}>我的页“今日积分任务”卡片</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>关闭后小程序“我的”页不显示今日积分任务卡片，不影响积分、签到或广告任务接口。</div>
            </div>
          </Space>
          <Space align="center" size={16} wrap>
            <Switch
              checked={profileMemberEntryEnabled}
              checkedChildren="显示"
              unCheckedChildren="隐藏"
              onChange={setProfileMemberEntryEnabled}
            />
            <div>
              <div style={{ fontWeight: 600 }}>我的页会员卡片入口</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>关闭后小程序“我的”页不显示会员套餐入口卡片，不影响会员状态、权益或支付页面。</div>
            </div>
          </Space>
          <div style={{ height: 1, background: '#f0f0f0', width: '100%' }} />
          <Alert
            type="warning"
            showIcon
            message="非会员免费生图额度会产生真实模型调用成本，建议先用每日 1 张、总 3 张小流量开启。"
          />
          <Space align="center" size={16} wrap>
            <Switch
              checked={freeQuotaEnabled}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              onChange={setFreeQuotaEnabled}
            />
            <div>
              <div style={{ fontWeight: 600 }}>非会员免费生图额度</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>开启后，非会员图片生成会优先使用独立免费额度账本；会员仍走会员积分体系。</div>
            </div>
          </Space>
          <Space align="center" size={16} wrap>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>每日免费张数</div>
              <InputNumber min={0} max={100} value={freeQuotaDailyLimit} onChange={(value) => setFreeQuotaDailyLimit(Number(value || 0))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>总免费张数</div>
              <InputNumber min={0} max={1000} value={freeQuotaTotalLimit} onChange={(value) => setFreeQuotaTotalLimit(Number(value || 0))} />
            </div>
            <Space align="center" size={12}>
              <Switch
                checked={freeQuotaShowInDailyTasks}
                checkedChildren="显示"
                unCheckedChildren="隐藏"
                onChange={setFreeQuotaShowInDailyTasks}
              />
              <div>
                <div style={{ fontWeight: 600 }}>每日任务中显示剩余额度</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>只控制我的页展示，不影响免费额度是否生效。</div>
              </div>
            </Space>
          </Space>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>免费适用档位 tierKey</div>
            <Input
              value={freeQuotaAllowedTierKeys}
              onChange={(event) => setFreeQuotaAllowedTierKeys(event.target.value)}
              placeholder="image_standard,image_pro"
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              逗号分隔。默认仅标准生图和专业生图免费；例如不填写 image_top，则顶级/超分生图继续使用积分。
            </div>
          </div>
          <Input.TextArea
            rows={2}
            value={freeQuotaExhaustedMessage}
            maxLength={120}
            showCount
            onChange={(event) => setFreeQuotaExhaustedMessage(event.target.value)}
            placeholder="今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。"
          />
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="小程序底部导航只展示前 5 个启用项"
          description="后台可以继续新增、停用或删除导航项。超过 5 个启用项时，配置会保存，但小程序端只取排序靠前的 5 个。"
        />
        {tabItems.map((item, idx) => {
          const enabledIndex = tabItems.slice(0, idx + 1).filter(nav => nav.enabled !== false).length;
          const shownInMini = item.enabled !== false && enabledIndex <= 5;
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6', minWidth: 32 }}>{idx + 1}</span>
              <div style={{ flex: 1 }}>
                <Space size={8} wrap style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{item.text || '未命名'}</span>
                  {item.enabled === false ? <Tag>已停用</Tag> : <Tag color={shownInMini ? 'green' : 'orange'}>{shownInMini ? '端上展示' : '已保存，不展示'}</Tag>}
                  {item.icon ? <Tag color="blue">内置图标：{item.icon}</Tag> : null}
                </Space>
                <div style={{ fontSize: 12, color: '#888' }}>
                  页面：{PAGE_OPTIONS.find(p => p.value === item.pagePath)?.label || item.pagePath}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>默认</div>
                    {item.iconPath ? <Image src={item.iconPath} width={32} height={32} preview={false} style={{ borderRadius: 4 }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>无</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>选中</div>
                    {item.selectedIconPath ? <Image src={item.selectedIconPath} width={32} height={32} preview={false} style={{ borderRadius: 4 }} /> : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>无</div>}
                  </div>
                </div>
              </div>
              <Space>
                <Button size="small" onClick={() => openTabEdit(item)}>编辑</Button>
                <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => deleteTab(idx)} disabled={tabItems.length <= 2}>删除</Button>
              </Space>
            </div>
          );
        })}
        <div style={{ marginTop: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => openTabEdit()}>添加导航项</Button>
        </div>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" loading={saving} onClick={saveTabBar}>保存配置</Button>
        </div>
      </Card>

      <Modal title={editingTab ? '编辑导航项' : '添加导航项'} open={tabModal} onCancel={() => setTabModal(false)} onOk={saveTab} destroyOnClose>
        <Form form={tabForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="text" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="首页" />
          </Form.Item>
          <Form.Item name="pagePath" label="页面路径" rules={[{ required: true }]}>
            <Select options={PAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="icon" label="内置图标标识" extra="使用小程序内置 SVG 图标时填写，例如 home、spark、tools、record、mine。自定义 URL 优先级更高。">
            <Input placeholder="tools" />
          </Form.Item>
          <Form.Item name="iconPath" label="未选中图标 URL" extra="粘贴 HTTPS 图片链接，或通过文件管理上传后复制链接。支持 SVG/PNG。">
            <Input placeholder="https://cdn.example.com/icons/home.svg" />
          </Form.Item>
          <Form.Item name="selectedIconPath" label="选中图标 URL" extra="导航项被选中时显示的图标，颜色/样式通常与未选中不同。">
            <Input placeholder="https://cdn.example.com/icons/home-active.svg" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  return page === 'pay' ? pay : page === 'customer' ? customer : page === 'help' ? help : page === 'visualAssets' ? visualAssets : page === 'tabbar' ? tabbar : miniapp;
}
