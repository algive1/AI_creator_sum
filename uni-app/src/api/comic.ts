import { post } from './request';
import { createVideoTask, type VideoTaskPayload } from './ai-video';

export function createComicTask<T = Record<string, unknown>>(payload: VideoTaskPayload) {
  const params = payload.params || {};
  const comicContext = [
    params.genre ? `漫剧题材：${String(params.genre).trim()}` : '',
    payload.style ? `画面风格：${String(payload.style).trim()}` : '',
    params.character ? `角色设定：${String(params.character).trim()}` : '',
    payload.ratio ? `画面比例：${String(payload.ratio).trim()}` : '',
    payload.duration ? `目标时长：${String(payload.duration).trim()}` : '',
  ].filter(Boolean).join('；');
  const basePrompt = String(payload.prompt || '').trim();
  const prompt = comicContext
    ? `${basePrompt.slice(0, Math.max(0, 2000 - comicContext.length - 1))}\n漫剧创作要求：${comicContext}`.trim()
    : basePrompt;

  return createVideoTask<T>({
    ...payload,
    prompt,
    subType: payload.subType || 'comic',
    params: {
      ...params,
      sceneType: 'comic',
      genre: params.genre,
      character: params.character,
    }
  });
}

export interface ComicScriptPayload {
  topic: string;
  style?: string;
  duration?: string;
  characters?: string;
}

export interface ComicStoryboardPayload {
  script: string;
  style?: string;
  ratio?: string;
}

export function generateComicScript<T = Record<string, unknown>>(payload: ComicScriptPayload) {
  return post<T>('/tasks/script', payload, { loading: '正在生成剧本' });
}

export function generateComicStoryboard<T = Record<string, unknown>>(payload: ComicStoryboardPayload) {
  return post<T>('/tasks/storyboard', payload, { loading: '正在拆分分镜' });
}
