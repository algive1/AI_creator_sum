import { downloadFile, uploadFile } from './request';

export function uploadAsset<T = Record<string, unknown>>(filePath: string, fileCategory = 'general', visibility: 'public' | 'private' = 'private') {
  return uploadFile<T>({ filePath, fileCategory, visibility, loading: '上传中' });
}

export { downloadFile };
