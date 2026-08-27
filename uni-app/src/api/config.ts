import { get, post } from './request';

export function getPublicApp<T = Record<string, unknown>>() {
  return get<T>('/public/app', undefined, { silent: true });
}

export function getAppHome<T = Record<string, unknown>>() {
  return get<T>('/app/home', undefined, { silent: true, cacheTtl: 30_000 });
}

export function getLegalDocuments<T = Record<string, unknown>>() {
  return get<T>('/legal/documents');
}

export function acceptLegalDocuments(documents: Array<{ docType: string; version: string }>, scene = 'profile_agreement') {
  return post('/legal/accept', { documents, scene });
}

export function getAnnouncements<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/announcements', params);
}

export function getAnnouncementDetail<T = Record<string, unknown>>(id: number) {
  return get<T>(`/announcements/${id}`);
}

export function markAnnouncementRead(id: number) {
  return post(`/announcements/${id}/read`);
}

export function confirmCompliance(payload: Record<string, unknown>) {
  return post('/compliance/confirm', payload);
}
