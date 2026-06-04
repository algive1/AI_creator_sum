import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { cancelTask, createImageTask, createVideoTask, getTaskById, getTasksList } from '../services/task.service';
import { generateScript, generatePrompt, generateStoryboard, optimizePrompt } from '../services/ai-feature.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { checkSensitiveWords } from '../services/content-check.service';

const router = Router();
const SENSITIVE_CONTENT_MESSAGE = '生成内容敏感，请勿生成违规内容。请修改后再次生成。';

async function hasSensitiveContent(...values: unknown[]): Promise<boolean> {
  const texts = values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  for (const text of texts) {
    const check = await checkSensitiveWords(text);
    if (!check.passed) return true;
  }
  return false;
}

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, status, keyword, page, pageSize } = req.query as any;
    const result = await getTasksList(req.user!.userId, {
      type,
      status,
      keyword,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, 'Failed to get task list');
  }
});

router.post('/optimize-prompt', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prompt, scene, featureKey, style, ratio, usage, negativePrompt, negative_prompt, context } = req.body;
    if (!prompt) {
      error(res, ErrorCodes.PARAM_ERROR, 'prompt is required');
      return;
    }

    const result = await optimizePrompt({
      userId: req.user!.userId,
      prompt,
      scene: scene || featureKey || 'image_create',
      style,
      ratio,
      usage,
      negativePrompt: negativePrompt || negative_prompt,
      context: context || {},
    });
    success(res, {
      optimizedPrompt: result.optimizedPrompt,
      negativePrompt: result.negativePrompt || '',
      styleSuggestions: result.styleSuggestions || [],
      charged: result.charged,
      pointsCost: result.pointsCost,
    });
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || 'Failed to optimize prompt');
  }
});

router.post('/script', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { topic, style, duration, characters } = req.body;
    if (!topic) {
      error(res, ErrorCodes.PARAM_ERROR, 'topic is required');
      return;
    }
    const result = await generateScript({
      userId: req.user!.userId,
      topic,
      style,
      duration,
      characters,
    });
    success(res, result);
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || '脚本生成失败');
  }
});

router.post('/prompt', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { idea, scene, style, count } = req.body;
    if (!idea) {
      error(res, ErrorCodes.PARAM_ERROR, 'idea is required');
      return;
    }
    const result = await generatePrompt({
      userId: req.user!.userId,
      idea,
      scene,
      style,
      count: count ? parseInt(count) : 3,
    });
    success(res, result);
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || '提示词生成失败');
  }
});

router.post('/storyboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { script, style, ratio } = req.body;
    if (!script) {
      error(res, ErrorCodes.PARAM_ERROR, 'script is required');
      return;
    }
    const result = await generateStoryboard({
      userId: req.user!.userId,
      script,
      style,
      ratio,
    });
    success(res, result);
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || '分镜生成失败');
  }
});

router.post('/image', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      subType, prompt, featureKey, tierKey, tierId, modelId, sizeMode, ratio, customWidth, customHeight,
      postprocessMode, aiOptimize, formData, params, editTool, uploadKeys, referenceKeys,
      maskFileId, mask_file_id, maskImage, maskUrl, mask_url, backgroundFileId, background_file_id, backgroundImage, backgroundUrl, background_url,
      scene, style, quality, imageType, optimizedPrompt, optimized_prompt, negativePrompt, negative_prompt, platformWatermarkEnabled,
    } = req.body;
    const finalSubType = subType || 'text2img';
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, 'prompt is required');
      return;
    }
    if (await hasSensitiveContent(prompt, optimizedPrompt || optimized_prompt, negativePrompt || negative_prompt)) {
      error(res, ErrorCodes.CONTENT_REVIEW_FAILED, SENSITIVE_CONTENT_MESSAGE);
      return;
    }
    if (!['text2img', 'img2img', 'edit'].includes(finalSubType)) {
      error(res, ErrorCodes.PARAM_ERROR, 'Unsupported image task type');
      return;
    }
    if (modelId) {
      error(res, ErrorCodes.PARAM_ERROR, 'modelId is not allowed; use tierKey or tierId');
      return;
    }
    if (!tierKey && !tierId) {
      error(res, ErrorCodes.PARAM_ERROR, 'tierKey or tierId is required');
      return;
    }
    // img2img: uploadKeys = 主图（必填1张），referenceKeys = 风格参考图（可选1-3张）
    if (finalSubType === 'img2img' && (!uploadKeys || uploadKeys.length === 0)) {
      error(res, ErrorCodes.PARAM_ERROR, '图生图需要至少上传1张主图');
      return;
    }
    // edit: uploadKeys = 待编辑图（必填1张），editTool 必填
    if (finalSubType === 'edit') {
      if (!uploadKeys || uploadKeys.length === 0) {
        error(res, ErrorCodes.PARAM_ERROR, '图片编辑需要上传1张待编辑的图片');
        return;
      }
      if (!editTool) {
        error(res, ErrorCodes.PARAM_ERROR, '图片编辑需要指定编辑工具(editTool)');
        return;
      }
    }

    const result = await createImageTask({
      userId: req.user!.userId,
      subType: finalSubType,
      prompt: prompt.trim(),
      featureKey: featureKey || (finalSubType === 'img2img' ? 'image_to_image' : finalSubType === 'edit' ? 'image_edit' : 'image_create'),
      tierKey,
      tierId: tierId ? parseInt(tierId) : undefined,
      sizeMode,
      ratio,
      customWidth,
      customHeight,
      postprocessMode,
      optimizedPrompt: optimizedPrompt || optimized_prompt,
      negativePrompt: negativePrompt || negative_prompt,
      aiOptimize,
      formData: formData || {},
      params: {
        ...(params || {}),
        scene,
        style,
        quality,
        imageType,
        maskFileId: maskFileId || mask_file_id,
        maskImage,
        maskUrl: maskUrl || mask_url,
        backgroundFileId: backgroundFileId || background_file_id,
        backgroundImage,
        backgroundUrl: backgroundUrl || background_url,
        negativePrompt: negativePrompt || negative_prompt,
      },
      editTool,
      uploadKeys,
      referenceKeys: Array.isArray(referenceKeys) ? referenceKeys : [],
      platformWatermarkEnabled,
    });
    success(res, result);
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || 'Failed to create image task');
  }
});

router.post('/video', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      subType, videoMode, generationType, mode, prompt, featureKey, tierKey, tierId, modelId,
      sizeMode, ratio, customWidth, customHeight, duration, fps, firstFrameFileId,
      lastFrameFileId, imageId, referenceImage, videoFileId, videoId, videoUrl, video_url, referenceVideo, referenceVideoUrl, editTool, motionStrength, cameraMove, style,
      quality, resolution, aiOptimize, autoScript, formData, params, uploadKeys, audioMode, preserveAudio, inputAssets,
      optimizedPrompt, optimized_prompt, negativePrompt, negative_prompt,
    } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, 'prompt is required');
      return;
    }
    if (await hasSensitiveContent(prompt, optimizedPrompt || optimized_prompt, negativePrompt || negative_prompt)) {
      error(res, ErrorCodes.CONTENT_REVIEW_FAILED, SENSITIVE_CONTENT_MESSAGE);
      return;
    }
    if (modelId) {
      error(res, ErrorCodes.PARAM_ERROR, 'modelId is not allowed; use tierKey or tierId');
      return;
    }
    if (!tierKey && !tierId) {
      error(res, ErrorCodes.PARAM_ERROR, 'tierKey or tierId is required');
      return;
    }

    const result = await createVideoTask({
      userId: req.user!.userId,
      subType,
      videoMode,
      generationType,
      mode,
      prompt: prompt.trim(),
      featureKey,
      tierKey,
      tierId: tierId ? parseInt(tierId) : undefined,
      sizeMode,
      ratio,
      customWidth,
      customHeight,
      duration,
      fps,
      firstFrameFileId,
      lastFrameFileId,
      imageId,
      referenceImage,
      audioMode,
      preserveAudio,
      inputAssets,
      optimizedPrompt: optimizedPrompt || optimized_prompt,
      negativePrompt: negativePrompt || negative_prompt,
      aiOptimize,
      autoScript,
      formData: formData || {},
      params: {
        ...(params || {}),
        videoFileId,
        videoId,
        videoUrl: videoUrl || video_url,
        referenceVideo,
        referenceVideoUrl,
        editTool,
        motionStrength,
        cameraMove,
        style,
        quality,
        resolution,
        audioMode,
        preserveAudio,
        inputAssets,
        negativePrompt: negativePrompt || negative_prompt,
      },
      uploadKeys,
    });
    success(res, result);
  } catch (err: any) {
    error(res, err.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err.message || 'Failed to create video task');
  }
});

router.get('/:id(\\d+)', authMiddleware, async (req: Request, res: Response) => {
  try {
    const task = await getTaskById(parseInt(req.params.id), req.user!.userId);
    if (!task) {
      error(res, ErrorCodes.NOT_FOUND, 'Task not found', 404);
      return;
    }
    success(res, task);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, 'Failed to get task detail');
  }
});

router.post('/:id(\\d+)/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const cancelled = await cancelTask(parseInt(req.params.id, 10), req.user!.userId);
    if (!cancelled) {
      error(res, ErrorCodes.PARAM_ERROR, '任务不可取消或不存在');
      return;
    }
    success(res, { cancelled: true });
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '取消任务失败');
  }
});

export default router;
