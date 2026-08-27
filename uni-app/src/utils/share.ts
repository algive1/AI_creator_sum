import { PAGE_ROUTES } from './constants';

export const DEFAULT_SHARE_IMAGE = '/static/home/home_banner.jpg';
export const DEFAULT_SHARE_TITLE = 'AI艺术生成工坊';

export interface PageShareOptions {
  title?: string;
  path?: string;
  imageUrl?: string;
  query?: string;
}

type ShareMenuItem = 'shareAppMessage' | 'shareTimeline';

export function withQuery(path: string, params: Record<string, unknown> = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}

export function pathToTimelineQuery(path: string) {
  const [, rawQuery = ''] = path.split('?');
  return rawQuery;
}

export function createShareMessage(options: PageShareOptions = {}) {
  return {
    title: options.title || DEFAULT_SHARE_TITLE,
    path: options.path || PAGE_ROUTES.home,
    imageUrl: options.imageUrl || DEFAULT_SHARE_IMAGE
  };
}

export function createShareTimeline(options: PageShareOptions = {}) {
  const path = options.path || PAGE_ROUTES.home;
  return {
    title: options.title || DEFAULT_SHARE_TITLE,
    query: options.query || pathToTimelineQuery(path),
    imageUrl: options.imageUrl || DEFAULT_SHARE_IMAGE
  };
}

export function shareMenuItems(enableTimeline = true): ShareMenuItem[] {
  return enableTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'];
}

export function enableShareMenu(enableTimeline = true) {
  // #ifdef MP-WEIXIN
  uni.showShareMenu({
    withShareTicket: true,
    menus: shareMenuItems(enableTimeline)
  });
  // #endif
}
