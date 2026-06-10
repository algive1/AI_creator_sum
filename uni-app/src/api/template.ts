import { get, post } from './request';

export function getTemplates<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates', params, { silent: true, cacheTtl: 60_000 });
}

export function getInspirations<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/inspirations', params, { silent: true, cacheTtl: 30_000 });
}

export function getTemplateCategories<T = Record<string, unknown>>() {
  return get<T>('/templates/categories', undefined, { silent: true, cacheTtl: 60_000 });
}

export function useTemplate<T = Record<string, unknown>>(id: number) {
  return post<T>(`/templates/${id}/use`, undefined, { loading: '应用模板' });
}

export function shareTemplate<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/templates/share', payload, { loading: '分享中' });
}
