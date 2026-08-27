export type PromptGuideModeKey =
  | 'ai_image.text2img'
  | 'ai_image.img2img'
  | 'ai_image.edit'
  | 'ai_video.text2video'
  | 'ai_video.img2video'
  | 'ai_video.reference'
  | 'ai_video.first_last_frame'
  | 'ai_video.edit'
  | 'comic.story';

export interface PromptGuide {
  key: PromptGuideModeKey;
  enabled: boolean;
  placeholder: string;
  title: string;
  subtitle: string;
  contentHtml: string;
  copyText: string;
  copyLabel: string;
  helpId: string;
}

type PublicPromptGuideConfig = {
  enabled?: boolean;
  items?: Record<string, Partial<PromptGuide>>;
};

const DEFAULT_GUIDE_TITLE = '提示词写作帮助';

export function getPromptGuide(
  publicConfig: Record<string, unknown>,
  key: PromptGuideModeKey,
  defaultPlaceholder: string,
): PromptGuide {
  const promptGuides = normalizePromptGuideConfig(publicConfig.promptGuides);
  const item = promptGuides.enabled === false ? null : promptGuides.items?.[key];
  if (!item || item.enabled === false) return emptyPromptGuide(key, defaultPlaceholder);
  return {
    key,
    enabled: true,
    placeholder: stringOrDefault(item.placeholder, defaultPlaceholder),
    title: stringOrDefault(item.title, DEFAULT_GUIDE_TITLE),
    subtitle: stringOrDefault(item.subtitle, ''),
    contentHtml: stringOrDefault(item.contentHtml, ''),
    copyText: stringOrDefault(item.copyText, ''),
    copyLabel: stringOrDefault(item.copyLabel, '复制示例'),
    helpId: stringOrDefault(item.helpId, ''),
  };
}

export function hasPromptGuideDialog(guide: PromptGuide) {
  return guide.enabled && Boolean(
    guide.subtitle.trim()
    || guide.contentHtml.trim()
    || guide.copyText.trim()
    || guide.helpId.trim()
  );
}

function normalizePromptGuideConfig(value: unknown): PublicPromptGuideConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as PublicPromptGuideConfig;
}

function emptyPromptGuide(key: PromptGuideModeKey, placeholder: string): PromptGuide {
  return {
    key,
    enabled: false,
    placeholder,
    title: DEFAULT_GUIDE_TITLE,
    subtitle: '',
    contentHtml: '',
    copyText: '',
    copyLabel: '复制示例',
    helpId: '',
  };
}

function stringOrDefault(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text || fallback;
}
