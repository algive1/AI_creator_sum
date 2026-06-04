import { downloadFile, get, post, uploadFile } from './request';

export function getUploadConfig<T = Record<string, unknown>>() {
  return get<T>('/files/upload-config');
}

export function getUploadCredential<T = Record<string, unknown>>(params: Record<string, unknown>) {
  return get<T>('/files/credential', params);
}

export function uploadAsset<T = Record<string, unknown>>(filePath: string, fileCategory = 'general', visibility: 'public' | 'private' = 'private') {
  return uploadFile<T>({ filePath, fileCategory, visibility, loading: '上传中' });
}

export function confirmDirectUpload<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/files/notify', payload);
}

export function exportFile<T = Record<string, unknown>>(id: number) {
  return post<T>(`/files/${id}/export`, undefined, { loading: '导出中' });
}

export function getExportStatus<T = Record<string, unknown>>(id: number) {
  return get<T>(`/files/${id}/export-status`);
}

export { downloadFile };
