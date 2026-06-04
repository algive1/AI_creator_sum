import { get, post } from './request';

export function getPublicApp<T = Record<string, unknown>>() {
  return get<T>('/public/app', undefined, { silent: true });
}

export function getAppHome<T = Record<string, unknown>>() {
  return get<T>('/app/home', undefined, { silent: true });
}

export function getLegalDocuments<T = Record<string, unknown>>() {
  return get<T>('/legal/documents');
}

export function acceptLegalDocuments(documents: Array<{ docType: string; version: string }>, scene = 'profile_agreement') {
  return post('/legal/accept', { documents, scene });
}

export function acceptLegalDocument(docType: string, version: string, scene = 'profile_agreement') {
  return acceptLegalDocuments([{ docType, version }], scene);
}

export function getRequiredLegalStatus<T = Record<string, unknown>>() {
  return get<T>('/legal/required-status');
}

export function getAnnouncements<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/announcements', params);
}

export function markAnnouncementRead(id: number) {
  return post(`/announcements/${id}/read`);
}

export function confirmCompliance(payload: Record<string, unknown>) {
  return post('/compliance/confirm', payload);
}
