import { get, post } from './request';

export function getTemplateCategories<T = unknown[]>() {
  return get<T>('/templates/categories');
}

export function getTemplates<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates', params);
}

export function getRecommendedTemplates<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/recommended', params);
}

export function searchTemplates<T = Record<string, unknown>>(params: Record<string, unknown>) {
  return get<T>('/templates/search', params);
}

export function getInspirations<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/templates/inspirations', params);
}

export function getTemplateDetail<T = Record<string, unknown>>(id: number) {
  return get<T>(`/templates/${id}`);
}

export function useTemplate<T = Record<string, unknown>>(id: number) {
  return post<T>(`/templates/${id}/use`, undefined, { loading: '应用模板' });
}

export function shareTemplate<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/templates/share', payload, { loading: '分享中' });
}
