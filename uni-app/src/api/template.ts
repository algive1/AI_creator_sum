import { get, post, request } from './request';

export function getTemplates<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates', params, { silent: true });
}

export function getInspirations<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/inspirations', params, { silent: true });
}

export function getHomeInspirations<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/home-inspirations', params, { silent: true });
}

export function getTopInspirations<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/inspirations/top', params, { silent: true });
}

export function getFavoriteTemplates<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/my-favorites', params, { silent: true });
}

export function getTemplateCategories<T = Record<string, unknown>>() {
  return get<T>('/templates/categories', undefined, { silent: true, cacheTtl: 60_000 });
}

export function useTemplate<T = Record<string, unknown>>(id: number) {
  return post<T>(`/templates/${id}/use`, undefined, { loading: '应用模板' });
}

export function favoriteTemplate<T = Record<string, unknown>>(id: number) {
  return post<T>(`/templates/${id}/favorite`, undefined, { silent: true });
}

export function unfavoriteTemplate<T = Record<string, unknown>>(id: number) {
  return request<T>({ url: `/templates/${id}/favorite`, method: 'DELETE', silent: true });
}

export function shareTemplate<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/templates/share', payload, { loading: '分享中' });
}

export function getNotificationUnreadCount<T = Record<string, unknown>>() {
  return get<T>('/notifications/unread-count', undefined, { silent: true });
}

export function getNotifications<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/notifications', params, { silent: true });
}

export function markNotificationRead<T = Record<string, unknown>>(id: number) {
  return post<T>(`/notifications/${id}/read`, {}, { silent: true });
}
