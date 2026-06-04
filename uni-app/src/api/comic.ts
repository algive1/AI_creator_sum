import { createVideoTask, type VideoTaskPayload } from './ai-video';

export function createComicTask<T = Record<string, unknown>>(payload: VideoTaskPayload) {
  return createVideoTask<T>({
    ...payload,
    subType: payload.subType || 'comic',
    params: {
      ...(payload.params || {}),
      sceneType: 'comic'
    }
  });
}
