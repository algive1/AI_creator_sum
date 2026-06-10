import fs from 'fs';
import { getConnection, queryOne, query } from '../utils/db';
import { selectTierModel, TierModelResult, RealModelInfo, TierCapabilities } from './tier-router.service';
import { resolveImageSize, SizePlan } from './image-size-resolver.service';
import { postprocessImage } from './image-postprocess.service';
import { enqueue } from './task-queue.service';
import { AdapterRegistry } from './adapters/adapter.registry';
import { StorageService } from './storage/storage.service';
import { resolveTaskSystemPrompt } from './system-prompt.service';
import { findImageSizeOption, isResolutionPreset, normalizeResolutionPreset } from './image-size-options.service';

const TASK_STEPS = ['准备任务', '提交模型', '生成结果', '保存文件'];
const MAX_PROMPT_LENGTH = 2000;
const QUEUE_FULL_MESSAGE = '任务队列繁忙，请稍后重试';
const RECOVERY_LOCK_MINUTES = 2;
const ALLOWED_PARAM_KEYS = new Set([
  'ratio',
  'sizeMode',
  'customWidth',
  'customHeight',
  'scene',
  'style',
  'quality',
  'resolutionPreset',
  'resolutionLabel',
  'sizeKey',
  'imageType',
  'imageCount',
  'negativePrompt',
  'postprocessMode',
  'seed',
  'maskFileId',
  'backgroundFileId',
  'maskImage',
  'backgroundImage',
  'maskUrl',
  'backgroundUrl',
  'mask_url',
  'background_url',
  'platformWatermarkEnabled',
  'qualityPreset',
  'qualityLabel',
]);

const VIDEO_MODES = ['text_to_video', 'image_to_video', 'first_last_frame_video', 'video_edit'] as const;
type VideoMode = typeof VIDEO_MODES[number];

const ALLOWED_VIDEO_PARAM_KEYS = new Set([
  'ratio',
  'sizeMode',
  'customWidth',
  'customHeight',
  'duration',
  'durationRaw',
  'durationText',
  'durationSeconds',
  'fps',
  'seed',
  'motionStrength',
  'cameraMove',
  'style',
  'quality',
  'resolution',
  'firstFrameFileId',
  'lastFrameFileId',
  'imageId',
  'referenceImage',
  'videoFileId',
  'videoId',
  'videoUrl',
  'video_url',
  'audioUrl',
  'audio_url',
  'audioFileId',
  'audio_file_id',
  'referenceVideo',
  'referenceVideoUrl',
  'uploadKeys',
  'editTool',
  'negativePrompt',
  'audioMode',
  'preserveAudio',
  'inputAssets',
  'referenceMode',
]);

interface PreparedTask {
  taskId: number;
  taskNo: string;
  pointsCost: number;
  pointsRemaining: number;
}

interface CreateImageTaskParams {
  userId: number;
  subType: string;
  prompt: string;
  optimizedPrompt?: string;
  negativePrompt?: string;
  featureKey?: string;
  tierKey?: string;
  tierId?: number;
  sizeMode?: string;
  ratio?: string;
  customWidth?: number | null;
  customHeight?: number | null;
  postprocessMode?: string;
  resolutionPreset?: string;
  sizeKey?: string;
  systemPrompt?: string;
  aiOptimize?: boolean;
  formData?: any;
  params?: any;
  editTool?: string;
  uploadKeys?: any[];
  referenceKeys?: string[];
  modelId?: number;
  platformWatermarkEnabled?: boolean;
}

function imageFeatureKeyForSubType(subType: string): string {
  if (subType === 'img2img') return 'image_to_image';
  if (subType === 'edit') return 'image_edit';
  return 'image_create';
}

export async function createImageTask(input: CreateImageTaskParams) {
  if (input.modelId) throw paramError('前端禁止直接传真实模型 ID，请传 tierKey 或 tierId');
  const originalPrompt = String(input.prompt || '').trim();
  const optimizedPrompt = String(input.optimizedPrompt || '').trim();
  if (optimizedPrompt) input.prompt = optimizedPrompt;
  if (!input.prompt || !input.prompt.trim()) throw paramError('提示词不能为空');
  if (input.prompt.length > MAX_PROMPT_LENGTH) throw paramError(`提示词最多 ${MAX_PROMPT_LENGTH} 字`);
  if (input.negativePrompt) input.params = { ...(input.params || {}), negativePrompt: String(input.negativePrompt).trim() };
  const featureKey = input.featureKey || imageFeatureKeyForSubType(input.subType || 'text2img');
  const tierKeyOrId = input.tierId || input.tierKey;
  if (!tierKeyOrId) throw paramError('缺少 tierKey 或 tierId');

  const mergedParams = filterImageParams(input.params || {});
  normalizeImageResolutionParams(mergedParams, input);
  const isEditWatermarkRemoval = input.subType === 'edit' && String(input.editTool || '') === '去水印';
  const platformWatermarkEnabled = isEditWatermarkRemoval
    ? false
    : booleanFlag(input.platformWatermarkEnabled, booleanFlag(mergedParams.platformWatermarkEnabled, true));
  mergedParams.platformWatermarkEnabled = platformWatermarkEnabled;
  mergedParams.platformWatermarkRemoved = !platformWatermarkEnabled;

  // 一次调用 selectTierModel，避免两次调用之间的 TOC/TOU 窗口
  const tierResult = await selectTierModel(featureKey, tierKeyOrId, input.userId, {
    ratio: input.ratio || mergedParams.ratio,
    quality: mergedParams.quality,
    resolutionPreset: mergedParams.resolutionPreset,
    sizeKey: mergedParams.sizeKey,
    style: mergedParams.style,
    imageCount: mergedParams.imageCount,
    referenceImageCount: input.subType === 'img2img' ? countImageReferences(input.uploadKeys, input.referenceKeys) : undefined,
    sizeMode: input.sizeMode || mergedParams.sizeMode,
    targetWidth: input.customWidth ?? mergedParams.customWidth,
    targetHeight: input.customHeight ?? mergedParams.customHeight,
    fromCustomPixels: !!(input.customWidth || mergedParams.customWidth),
    postprocessMode: input.postprocessMode || mergedParams.postprocessMode,
  });
  const selectedSizeOption = findImageSizeOption(
    tierResult.capabilities.sizeOptions,
    mergedParams.sizeKey,
    input.sizeMode === 'auto' || mergedParams.sizeMode === 'auto' ? 'auto' : input.ratio || mergedParams.ratio,
    mergedParams.resolutionPreset,
  );
  if (selectedSizeOption) {
    mergedParams.sizeKey = selectedSizeOption.key;
    mergedParams.resolutionPreset = selectedSizeOption.resolutionPreset;
    mergedParams.sizeOption = selectedSizeOption;
  }
  const imageCount = normalizeImageCount(mergedParams.imageCount, tierResult.capabilities.maxImages);
  mergedParams.imageCount = imageCount;
  const pricedTierResult = applyImageCountPricing(tierResult, imageCount);

  const sizePlan = resolveImageSize({
    prompt: input.prompt,
    sizeMode: input.sizeMode || mergedParams.sizeMode,
    ratio: input.ratio || mergedParams.ratio,
    customWidth: input.customWidth ?? mergedParams.customWidth,
    customHeight: input.customHeight ?? mergedParams.customHeight,
    postprocessMode: input.postprocessMode || mergedParams.postprocessMode,
    tierDefaultRatio: tierResult.capabilities.defaultRatio,
    nativeSizes: tierResult.capabilities.nativeSizes,
    allowPostprocess: tierResult.capabilities.allowPostprocess,
  });

  // 本地验证：resolveImageSize 可能改变了 ratio/sizeMode/尺寸，用已加载的 caps 做二次校验，不重新查库
  validateResolvedImageSize(tierResult.tierName, tierResult.capabilities, sizePlan);
  if (input.subType === 'edit' && countImageReferences(input.uploadKeys) > 1) {
    throw paramError('图片编辑只能上传一张待编辑图');
  }

  mergedParams.ratio = selectedSizeOption?.ratio === 'auto' ? 'auto' : sizePlan.targetRatio;
  mergedParams.sizePlan = sizePlan;
  mergedParams.sizeWarnings = sizePlan.warnings;
  const imageReferences = await resolveImageReferenceImages(input.userId, input.subType || 'text2img', input.uploadKeys, input.referenceKeys);
  const editReferences = input.subType === 'edit'
    ? await resolveImageEditAuxiliaryReferences(input.userId, mergedParams)
    : { metadata: [] as any[] };
  const systemPrompt = await resolveTaskSystemPrompt('image', input.subType);
  const referenceMetadata = [...imageReferences.metadata, ...editReferences.metadata];

  const prepared = await createTierTask({
    userId: input.userId,
    taskType: 'image',
    subType: input.subType || 'text2img',
    title: input.formData?.brand || input.formData?.scene || 'AI 生图任务',
    prompt: originalPrompt || input.prompt,
    optimizedPrompt: optimizedPrompt || null,
    negativePrompt: String(input.negativePrompt || '').trim() || null,
    systemPrompt,
    formData: input.formData || {},
    params: { ...mergedParams, referenceImages: referenceMetadata, uploadKeys: imageReferences.urls },
    editTool: input.editTool || null,
    tierResult: pricedTierResult,
  });

  const queued = enqueue(prepared.taskId, {
    taskId: prepared.taskId,
    input: {
      ...input,
      optimizedPrompt: optimizedPrompt || null,
      params: { ...mergedParams, referenceImages: referenceMetadata, uploadKeys: imageReferences.urls },
      sizePlan,
      uploadKeys: imageReferences.urls,
    },
    tierResult,
    pointsCost: prepared.pointsCost,
    taskType: 'image',
  }, processTask);
  if (!queued) {
    await finalizeTaskFailure(prepared.taskId, prepared.pointsCost, QUEUE_FULL_MESSAGE);
    throw Object.assign(new Error(QUEUE_FULL_MESSAGE), { code: 429 });
  }

  return {
    taskId: prepared.taskId,
    taskNo: prepared.taskNo,
    status: 'queued',
    pointsCost: prepared.pointsCost,
    basePointsCost: tierResult.basePointsCost,
    memberDiscountPercent: tierResult.memberDiscountPercent,
    memberDiscountApplied: tierResult.memberDiscountApplied,
    pointsRemaining: prepared.pointsRemaining,
    estimatedSeconds: 15,
    tierKey: tierResult.tierKey,
    sizePlan,
    message: 'AI 生图任务已提交',
  };
}

export async function createVideoTask(input: {
  userId: number;
  subType?: string;
  videoMode?: string;
  generationType?: string;
  mode?: string;
  prompt: string;
  optimizedPrompt?: string;
  negativePrompt?: string;
  featureKey?: string;
  tierKey?: string;
  tierId?: number;
  sizeMode?: string;
  ratio?: string;
  customWidth?: number | null;
  customHeight?: number | null;
  duration?: number | string;
  fps?: number;
  seed?: number | string;
  firstFrameFileId?: number;
  lastFrameFileId?: number;
  imageId?: number;
  referenceImage?: string;
  audioUrl?: string;
  audio_url?: string;
  audioFileId?: number;
  audio_file_id?: number;
  systemPrompt?: string;
  aiOptimize?: boolean;
  autoScript?: boolean;
  formData?: any;
  params?: any;
  uploadKeys?: any[];
  editTool?: string;
  audioMode?: string;
  preserveAudio?: boolean;
  inputAssets?: any[];
  referenceMode?: string;
  modelId?: number;
}) {
  if (input.modelId) throw paramError('前端禁止直接传真实模型 ID，请传 tierKey 或 tierId');
  const originalPrompt = String(input.prompt || '').trim();
  const optimizedPrompt = String(input.optimizedPrompt || '').trim();
  if (optimizedPrompt) input.prompt = optimizedPrompt;
  if (!input.prompt || !input.prompt.trim()) throw paramError('提示词不能为空');
  if (input.prompt.length > MAX_PROMPT_LENGTH) throw paramError(`提示词最多 ${MAX_PROMPT_LENGTH} 字`);
  const videoMode = normalizeVideoMode(input.videoMode || input.generationType || input.mode || input.subType);
  const featureKey = input.featureKey || videoFeatureKeyForMode(videoMode);
  const tierKeyOrId = input.tierId || input.tierKey;
  if (!tierKeyOrId) throw paramError('缺少 tierKey 或 tierId');
  const params = filterVideoParams({
    ...(input.params || {}),
    ratio: input.ratio ?? input.params?.ratio,
    sizeMode: input.sizeMode ?? input.params?.sizeMode,
    customWidth: input.customWidth ?? input.params?.customWidth,
    customHeight: input.customHeight ?? input.params?.customHeight,
    duration: input.duration ?? input.params?.duration,
    fps: input.fps ?? input.params?.fps,
    seed: input.seed ?? input.params?.seed,
    firstFrameFileId: input.firstFrameFileId ?? input.params?.firstFrameFileId,
    lastFrameFileId: input.lastFrameFileId ?? input.params?.lastFrameFileId,
    imageId: input.imageId ?? input.params?.imageId,
    referenceImage: input.referenceImage ?? input.params?.referenceImage,
    videoFileId: input.params?.videoFileId,
    videoId: input.params?.videoId,
    videoUrl: input.params?.videoUrl,
    video_url: input.params?.video_url,
    audioUrl: input.audioUrl ?? input.params?.audioUrl,
    audio_url: input.audio_url ?? input.params?.audio_url,
    audioFileId: input.audioFileId ?? input.params?.audioFileId,
    audio_file_id: input.audio_file_id ?? input.params?.audio_file_id,
    referenceVideo: input.params?.referenceVideo,
    referenceVideoUrl: input.params?.referenceVideoUrl,
    uploadKeys: input.uploadKeys ?? input.params?.uploadKeys,
    editTool: input.editTool ?? input.params?.editTool,
    videoMode,
    negativePrompt: input.negativePrompt ?? input.params?.negativePrompt,
    audioMode: input.audioMode ?? input.params?.audioMode,
    preserveAudio: input.preserveAudio ?? input.params?.preserveAudio,
    inputAssets: input.inputAssets ?? input.params?.inputAssets,
    referenceMode: input.referenceMode ?? input.params?.referenceMode,
  });
  const requestedRatio = String(params.ratio || '').trim();
  const adaptiveRatio = requestedRatio.toLowerCase() === 'adaptive';

  // 一次调用 selectTierModel，避免两次调用之间的 TOC/TOU 窗口
  let tierResult = await selectTierModel(featureKey, tierKeyOrId, input.userId, {
    ratio: params.ratio,
    duration: params.duration,
    quality: params.resolution || params.quality,
    cameraMove: params.cameraMove,
    audioMode: params.audioMode,
    referenceImageCount: videoMode === 'image_to_video' ? countImageReferences(params.uploadKeys) : undefined,
  });

  const sizePlan = resolveImageSize({
    prompt: input.prompt,
    sizeMode: params.sizeMode,
    ratio: adaptiveRatio ? undefined : params.ratio,
    customWidth: params.customWidth,
    customHeight: params.customHeight,
    tierDefaultRatio: tierResult.capabilities.defaultRatio,
    nativeSizes: tierResult.capabilities.nativeSizes,
    allowPostprocess: false,
  });
  const durationPlan = resolveVideoDuration(params.duration, tierResult.capabilities);

  // 本地验证解析后的尺寸参数
  validateResolvedImageSize(tierResult.tierName, tierResult.capabilities, sizePlan);

  params.ratio = adaptiveRatio ? 'adaptive' : sizePlan.targetRatio;
  params.sizePlan = sizePlan;
  params.sizeWarnings = sizePlan.warnings;
  params.duration = durationPlan.durationText;
  params.durationRaw = durationPlan.durationRaw;
  params.durationSeconds = durationPlan.duration;
  params.durationSource = durationPlan.source;
  params.videoMode = videoMode;

  const referenceImages = await resolveVideoReferenceImages(input.userId, videoMode, params);
  if (referenceImages.warnings.length) {
    params.sizeWarnings = [...(params.sizeWarnings || []), ...referenceImages.warnings];
  }

  if (!modelSupportsVideoMode(tierResult.primaryModel, videoMode)) {
    throw paramError(`当前模型不支持视频模式 ${videoMode}`);
  }
  tierResult = {
    ...tierResult,
    fallbackModels: tierResult.fallbackModels.filter(model => modelSupportsVideoMode(model, videoMode)),
  };
  const systemPrompt = await resolveTaskSystemPrompt('video', videoMode);

  const prepared = await createTierTask({
    userId: input.userId,
    taskType: 'video',
    subType: videoMode,
    title: input.formData?.brand || 'AI 视频任务',
    prompt: originalPrompt || input.prompt.trim(),
    optimizedPrompt: optimizedPrompt || null,
    negativePrompt: String(input.negativePrompt || '').trim() || null,
    systemPrompt,
    formData: input.formData || {},
    params: { ...params, autoScript: input.autoScript, referenceImages: referenceImages.metadata, uploadKeys: referenceImages.urls },
    editTool: null,
    tierResult,
  });

  const queued = enqueue(prepared.taskId, {
    taskId: prepared.taskId,
    input: { ...input, subType: videoMode, optimizedPrompt: optimizedPrompt || null, params, sizePlan, uploadKeys: referenceImages.urls },
    tierResult,
    pointsCost: prepared.pointsCost,
    taskType: 'video',
  }, processTask);
  if (!queued) {
    await finalizeTaskFailure(prepared.taskId, prepared.pointsCost, QUEUE_FULL_MESSAGE);
    throw Object.assign(new Error(QUEUE_FULL_MESSAGE), { code: 429 });
  }

  return {
    taskId: prepared.taskId,
    taskNo: prepared.taskNo,
    status: 'queued',
    pointsCost: prepared.pointsCost,
    basePointsCost: tierResult.basePointsCost,
    memberDiscountPercent: tierResult.memberDiscountPercent,
    memberDiscountApplied: tierResult.memberDiscountApplied,
    pointsRemaining: prepared.pointsRemaining,
    estimatedSeconds: 45,
    tierKey: tierResult.tierKey,
    videoMode,
    sizePlan,
    durationPlan,
    message: 'AI 视频任务已提交',
  };
}

async function createTierTask(input: {
  userId: number;
  taskType: 'image' | 'video' | 'manga' | 'storyboard';
  subType: string;
  title: string;
  prompt: string;
  optimizedPrompt?: string | null;
  negativePrompt?: string | null;
  systemPrompt: string;
  formData: any;
  params: any;
  editTool: string | null;
  tierResult: TierModelResult;
}): Promise<PreparedTask> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [accRows] = await conn.execute(
      'SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE',
      [input.userId],
    ) as any;
    const account = accRows?.[0];
    if (!account) throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
    if (account.balance < input.tierResult.pointsCost) throw Object.assign(new Error('积分余额不足'), { code: 1002 });

    const pointsCost = input.tierResult.pointsCost;
    const balanceBefore = account.balance;
    const balanceAfter = balanceBefore - pointsCost;
    const frozenBefore = account.frozen_balance || 0;
    const frozenAfter = frozenBefore + pointsCost;

    const [updateResult] = await conn.execute(
      `UPDATE point_accounts
          SET balance = ?, frozen_balance = frozen_balance + ?, version = version + 1, updated_at = NOW(3)
        WHERE user_id = ? AND version = ?`,
      [balanceAfter, pointsCost, input.userId, account.version],
    );
    if ((updateResult as any).affectedRows === 0) throw Object.assign(new Error('积分账户并发更新失败，请重试'), { code: 429 });

    const taskNo = generateTaskNo();
    const [taskResult] = await conn.execute(
      `INSERT INTO ai_tasks
       (task_no, user_id, task_type, tier_id, sub_type, model_id, title, status, progress, points_cost,
        price_snapshot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NOW(3), NOW(3))`,
      [
        taskNo,
        input.userId,
        input.taskType,
        input.tierResult.tierId,
        input.subType,
        input.tierResult.primaryModel.id,
        input.title,
        pointsCost,
        JSON.stringify({
          tierId: input.tierResult.tierId,
          tierKey: input.tierResult.tierKey,
          tierName: input.tierResult.tierName,
          featureKey: input.tierResult.featureKey,
          unitBasePointsCost: input.tierResult.unitBasePointsCost ?? input.tierResult.basePointsCost,
          unitPointsCost: input.tierResult.unitPointsCost ?? pointsCost,
          imageCount: input.tierResult.imageCount || input.params?.imageCount || 1,
          basePointsCost: input.tierResult.basePointsCost,
          pointsCost,
          totalPointsCost: pointsCost,
          memberDiscountPercent: input.tierResult.memberDiscountPercent,
          memberDiscountApplied: input.tierResult.memberDiscountApplied,
          pricingMode: input.tierResult.pricingMode || 'fixed',
          pricing: input.tierResult.pricingSnapshot || null,
          resolutionPreset: input.params?.resolutionPreset || '',
        }),
      ],
    );
    const taskId = (taskResult as any).insertId;

    await conn.execute(
      `INSERT INTO ai_task_inputs
       (task_id, prompt, optimized_prompt, negative_prompt, system_prompt, form_data, params, edit_tool, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        taskId,
        input.prompt,
        input.optimizedPrompt || null,
        input.negativePrompt || '',
        input.systemPrompt,
        JSON.stringify(input.formData || {}),
        JSON.stringify(input.params || {}),
        input.editTool,
      ],
    );

    await conn.execute(
      `INSERT INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
       VALUES (?, 'freeze', ?, ?, ?, ?, ?, 'task_spend', 'ai_task_freeze', ?, ?, NOW(3))`,
      [input.userId, -pointsCost, balanceBefore, balanceAfter, frozenBefore, frozenAfter, String(taskId), `${getTaskLabel(input.taskType)}任务冻结`],
    );
    await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, 'created', '任务已创建']);
    await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [balanceAfter, input.userId]);

    // 在事务内标记为 queued，避免 COMMIT 后崩溃导致积分已冻结但任务永不被处理
    await conn.execute(
      "UPDATE ai_tasks SET status = 'queued', queued_at = NOW(3), updated_at = NOW(3) WHERE id = ? AND status = 'pending'",
      [taskId],
    );
    await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, 'queued', 'Task queued.']);

    await conn.commit();
    return { taskId, taskNo, pointsCost, pointsRemaining: balanceAfter };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function processTask(data: any): Promise<void> {
  const { taskId, input, tierResult, pointsCost, taskType } = data;
  const savedOutputs: SavedTaskOutput[] = [];
  const taskStartedAt = Date.now();
  try {
    const claimed = await startTaskProcessing(taskId);
    if (!claimed) {
      await addTaskLog(taskId, 'processing_skip', '任务已被其他进程处理，跳过重复执行').catch(() => undefined);
      return;
    }
    await addTaskLog(taskId, 'model_selected', `已选择模型：${tierResult.primaryModel.name}`);
    if (input.sizePlan?.warnings?.length) {
      await addTaskLog(taskId, 'size_warning', input.sizePlan.warnings.join('；'));
    }
    await query('UPDATE ai_tasks SET progress = GREATEST(progress, 12), current_step = ?, updated_at = NOW(3) WHERE id = ?', [TASK_STEPS[0], taskId]);
    await addTaskLog(taskId, 'progress_update', TASK_STEPS[0]);

    const submit = await submitWithFallback({
      taskId,
      userId: input.userId,
      models: [tierResult.primaryModel].concat(tierResult.fallbackModels || []),
      taskType: taskType === 'video' ? (input.params?.videoMode || 'text_to_video') : imageProviderTaskType(input.subType),
      prompt: input.prompt,
      images: input.uploadKeys || [],
      params: buildProviderParams(taskType, input, tierResult),
    });

    if (submit.asyncPending) {
      return;
    }

    const urls = submit.result?.urls || [];
    const expectedImageCount = taskType === 'image' ? normalizeImageCount(input.params?.imageCount, tierResult.capabilities.maxImages || 1) : 0;
    if (urls.length === 0) throw new Error(taskType === 'video' ? '模型未返回视频结果' : '模型未返回图片结果');
    if (expectedImageCount > 0 && urls.length < expectedImageCount) {
      throw new Error(`模型返回图片数量不足，期望 ${expectedImageCount} 张，实际 ${urls.length} 张`);
    }
    const outputUrls = expectedImageCount > 0 ? urls.slice(0, expectedImageCount) : urls;
    for (let i = 0; i < outputUrls.length; i++) {
      const savedOutput = await saveTaskOutputWithRetry({
        taskId,
        userId: input.userId,
        url: outputUrls[i],
        index: i,
        outputType: taskType === 'video' ? 'video' : 'image',
        prompt: input.prompt,
        params: input.params || {},
        sizePlan: input.sizePlan,
        metadata: { ...(submit.result?.metadata || {}), ...(submit.result?.revisedPrompt ? { revisedPrompt: submit.result.revisedPrompt } : {}) },
      });
      savedOutputs.push(savedOutput);
    }

    await finalizeTaskSuccess({
      taskId,
      pointsCost,
      actualModelId: submit.model.id,
      costSnapshot: submit.cost || {},
    });
    console.log(`[Task #${taskId}] completed, totalTime=${((Date.now() - taskStartedAt) / 1000).toFixed(1)}s, cost=${pointsCost} points`);
    await addTaskLog(taskId, 'completed', '任务已完成');
  } catch (err: any) {
    const message = (err.message || '任务执行失败').substring(0, 500);
    if (savedOutputs.length > 0) {
      await cleanupSavedTaskOutputs(taskId, savedOutputs).catch(cleanupErr =>
        addTaskLog(taskId, 'output_cleanup_failed', `任务失败后清理部分输出失败：${(cleanupErr.message || cleanupErr).toString().substring(0, 400)}`).catch(() => undefined),
      );
    }
    try {
      await finalizeTaskFailure(taskId, pointsCost, message);
      await addTaskLog(taskId, 'points_refunded', '任务失败，积分已退回');
    } catch (refundErr: any) {
      await addTaskLog(taskId, 'refund_failed', `任务失败但退款处理失败：${(refundErr.message || refundErr).toString().substring(0, 400)}`);
    }
    await query(
      `UPDATE ai_tasks SET status = 'failed', fail_reason = ?, failed_at = NOW(3),
        actual_points_cost = COALESCE(actual_points_cost, ?),
        cost_snapshot = COALESCE(cost_snapshot, ?),
        updated_at = NOW(3)
       WHERE id = ? AND status NOT IN ('completed','failed','cancelled')`,
      [message.substring(0, 255), pointsCost, JSON.stringify({}), taskId],
    );
  }
}

function buildProviderParams(taskType: string, input: any, tierResult: TierModelResult) {
  if (taskType === 'video') {
    const sizePlan: SizePlan | undefined = input.sizePlan || input.params?.sizePlan;
    const durationSeconds = input.params?.durationSeconds || normalizeDuration(input.params?.duration || '5s') || 5;
    const explicitRatio = String(input.params?.ratio || '').trim().toLowerCase() === 'adaptive'
      ? 'adaptive'
      : (input.params?.ratio || '');
    const params: Record<string, any> = {
      videoMode: input.params?.videoMode || input.subType || 'text_to_video',
      ratio: explicitRatio || sizePlan?.targetRatio || tierResult.capabilities.defaultRatio || '9:16',
      width: sizePlan?.targetWidth,
      height: sizePlan?.targetHeight,
      nativeSize: sizePlan?.nativeSize,
      sizePlan,
      duration: input.params?.durationRaw === 'auto' ? 'auto' : durationSeconds,
      durationText: input.params?.duration || `${durationSeconds}s`,
      durationRaw: input.params?.durationRaw || input.params?.duration,
      fps: input.params?.fps,
      seed: input.params?.seed,
      resolution: input.params?.resolution || input.params?.quality || '720p',
      cameraMove: input.params?.cameraMove || 'static',
      motionStrength: input.params?.motionStrength,
      style: input.params?.style,
      videoUrl: input.params?.videoUrl || input.params?.video_url,
      video_url: input.params?.video_url || input.params?.videoUrl,
      audioUrl: input.params?.audioUrl || input.params?.audio_url,
      audio_url: input.params?.audio_url || input.params?.audioUrl,
      audioFileId: input.params?.audioFileId || input.params?.audio_file_id,
      audio_file_id: input.params?.audio_file_id || input.params?.audioFileId,
      editTool: input.params?.editTool,
      negativePrompt: input.params?.negativePrompt,
      referenceMode: input.params?.referenceMode,
    };
    if (input.params?.audioMode) {
      params.audioMode = input.params.audioMode;
      params.audio_mode = input.params.audioMode;
    }
    if (input.params?.preserveAudio !== undefined) {
      params.preserveAudio = input.params.preserveAudio;
      params.preserve_audio = input.params.preserveAudio;
    }
    return params;
  }
  const sizePlan: SizePlan | undefined = input.sizePlan;
  const sizeOption = input.params?.sizeOption || null;
  const resolutionPreset = input.params?.resolutionPreset;
  return {
    ratio: sizeOption?.ratio || sizePlan?.targetRatio || input.params?.ratio || tierResult.capabilities.defaultRatio || '1:1',
    resolutionPreset,
    resolution: resolutionPreset && resolutionPreset !== 'auto' ? String(resolutionPreset).toLowerCase() : undefined,
    quality: input.params?.quality,
    style: input.params?.style,
    negativePrompt: input.params?.negativePrompt,
    maskUrl: input.params?.maskUrl || input.params?.mask_url,
    mask_url: input.params?.mask_url || input.params?.maskUrl,
    backgroundUrl: input.params?.backgroundUrl || input.params?.background_url,
    background_url: input.params?.background_url || input.params?.backgroundUrl,
    imageCount: Math.min(input.params?.imageCount || 1, tierResult.capabilities.maxImages || 1),
    sizePlan,
    sizeKey: input.params?.sizeKey,
    sizeOption,
    nativeSize: sizePlan?.nativeSize,
  };
}

async function submitWithFallback(options: {
  taskId: number;
  userId: number;
  models: RealModelInfo[];
  taskType: string;
  prompt: string;
  images: any[];
  params: Record<string, any>;
}): Promise<any> {
  let lastError: any = null;
  for (let modelIndex = 0; modelIndex < options.models.length; modelIndex++) {
    const model = options.models[modelIndex];
    const modelRole = modelIndex === 0 ? 'primary' : 'fallback';
    const maxAttempts = Math.max(1, (model.retryTimes || 0) + 1);
    await addTaskLog(options.taskId, modelIndex === 0 ? 'primary_model_start' : 'fallback_model_start', `开始调用${modelIndex === 0 ? '主模型' : '备用模型'}：${model.name}`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const adapter = AdapterRegistry.get(model.providerType || 'openai');
        if (!adapter) throw new Error('未找到模型适配器：' + (model.providerType || 'unknown'));
        const result = await adapter.submitTask({
          upstreamCode: model.upstreamModelCode || model.apiModelName || model.name,
          taskType: options.taskType,
          prompt: options.prompt,
          images: options.images,
          params: options.params,
          requestTemplate: model.requestTemplate,
          providerConfig: {
            baseUrl: model.providerApiBaseUrl || '',
            apiKey: model.providerApiKey || '',
            timeout: (model.timeoutSeconds || 120) * 1000,
            protocolType: 'rest',
            authType: 'bearer',
          },
        });
        if (result.type === 'async') {
          {
            const providerTaskId = result.providerTaskId;
            if (!providerTaskId) throw new Error('Async model did not return provider task id');
            const intervalSeconds = positiveInt(process.env.VIDEO_TASK_POLL_INTERVAL_SECONDS, 20);
            const [updateResult] = await query<any>(
              "UPDATE ai_tasks\n                  SET provider_task_id = ?, provider_status = ?, provider_status_message = ?,\n                      provider_started_at = COALESCE(provider_started_at, NOW(3)),\n                      next_poll_at = DATE_ADD(NOW(3), INTERVAL ? SECOND),\n                      poll_count = 0, actual_model_id = ?, video_mode = ?, video_duration = ?, video_ratio = ?,\n                      progress = GREATEST(progress, 20), current_step = '提交模型', updated_at = NOW(3)\n                WHERE id = ? AND status = 'processing'",
              [
                providerTaskId,
                result.status || 'submitted',
                safeProviderMessage(result.error?.message || 'Provider task submitted'),
                intervalSeconds,
                model.id,
                options.params.videoMode || options.taskType,
                options.params.durationSeconds || normalizeDuration(options.params.duration) || null,
                options.params.ratio || null,
                options.taskId,
              ],
            );
            if (!updateResult || Number((updateResult as any).affectedRows || 0) === 0) {
              throw new Error('Task is no longer processing');
            }
            const elapsed = Date.now() - startedAt;
            await query(
              "INSERT INTO ai_model_call_logs\n               (task_id, model_id, provider_id, user_id, call_type, attempt_number, request_body, response_body, is_success, latency_ms, created_at)\n               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3))",
              [
                options.taskId,
                model.id,
                model.providerId,
                options.userId,
                modelRole,
                attempt,
                JSON.stringify({ ...options.params, images: options.images }),
                JSON.stringify({ providerTaskId, status: result.status || 'submitted' }),
                elapsed,
              ],
            );
            console.log(`[Task #${options.taskId}] submitted to relay, providerTaskId=${providerTaskId}, elapsed=${elapsed}ms`);
            await addTaskLog(options.taskId, 'provider_task_submitted', 'Provider task submitted: ' + providerTaskId);
            await addTaskLog(options.taskId, options.taskType.includes('video') ? 'video_async_pending' : 'image_async_pending', 'Task moved to provider polling mode.');
            return { ...result, model, asyncPending: true };
          }
        }
        if (!result.result?.urls?.length) throw new Error(result.error?.message || '模型调用成功但未返回结果');
        await query(
          `INSERT INTO ai_model_call_logs
           (task_id, model_id, provider_id, user_id, call_type, attempt_number, request_body, response_body, is_success, latency_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3))`,
          [options.taskId, model.id, model.providerId, options.userId, modelIndex === 0 ? 'primary' : 'fallback', attempt, JSON.stringify(options.params), JSON.stringify(result.result), Date.now() - startedAt],
        );
        await addTaskLog(options.taskId, 'model_call_success', `${model.name} 调用成功，耗时 ${Date.now() - startedAt}ms`);
        return { ...result, model };
      } catch (err: any) {
        lastError = err;
        await query(
          `INSERT INTO ai_model_call_logs
           (task_id, model_id, provider_id, user_id, call_type, attempt_number, is_success, error_message, latency_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW(3))`,
          [options.taskId, model.id, model.providerId, options.userId, modelIndex === 0 ? 'primary' : 'fallback', attempt, (err.message || '').substring(0, 1024), Date.now() - startedAt],
        );
        await addTaskLog(options.taskId, 'model_call_failed', `${model.name} 第 ${attempt} 次调用失败：${(err.message || '未知错误').substring(0, 300)}`);
        if (attempt < maxAttempts) await sleep(model.retryDelayMs || 1000);
      }
    }
  }
  throw lastError || new Error('所有模型调用失败');
}


export type SaveTaskOutputInput = {
  taskId: number;
  userId: number;
  url: string;
  index: number;
  outputType: 'image' | 'video';
  prompt: string;
  params: any;
  sizePlan?: SizePlan;
  metadata: any;
};

export type SavedTaskOutput = {
  outputId: number;
  fileNo: string;
  storageKey: string;
};

export async function saveTaskOutputWithRetry(input: SaveTaskOutputInput): Promise<SavedTaskOutput> {
  const maxAttempts = Math.max(1, positiveInt(process.env.TASK_OUTPUT_TRANSFER_ATTEMPTS, 3));
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await saveTaskOutput(input);
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryableOutputTransferError(err)) break;
      await addTaskLog(input.taskId, 'output_transfer_retry', `输出转存失败，准备第 ${attempt + 1}/${maxAttempts} 次重试：${(err.message || '未知错误').substring(0, 300)}`);
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

export async function saveTaskOutput(input: SaveTaskOutputInput): Promise<SavedTaskOutput> {
  let storageKey: string;
  const metadata = {
    ...(input.metadata || {}),
    targetWidth: input.sizePlan?.targetWidth,
    targetHeight: input.sizePlan?.targetHeight,
    nativeSize: input.sizePlan?.nativeSize,
    postprocessMode: input.sizePlan?.postprocessMode,
    sizePlan: input.sizePlan || null,
    platformWatermarkEnabled: input.outputType === 'image' ? input.params?.platformWatermarkEnabled !== false : false,
    platformWatermarkRemoved: input.outputType === 'image' ? input.params?.platformWatermarkEnabled === false : false,
    platformWatermarkText: input.outputType === 'image' && input.params?.platformWatermarkEnabled !== false ? 'AI艺术生成工坊' : '',
  };
  let transfer: any;
  try {
    if (input.outputType === 'image' && input.sizePlan?.needPostprocess) {
      const processed = await postprocessImage({
        sourceUrl: input.url,
        targetWidth: input.sizePlan.targetWidth,
        targetHeight: input.sizePlan.targetHeight,
        mode: input.sizePlan.postprocessMode as any,
      });
      metadata.originalWidth = processed.originalWidth;
      metadata.originalHeight = processed.originalHeight;
      const transferService = require('./storage/transfer.service');
      transfer = await transferService.transferFromBuffer({
        taskId: input.taskId,
        userId: input.userId,
        buffer: fs.readFileSync(processed.outputPath),
        contentType: 'image/png',
        outputName: `图片${input.index + 1}.png`,
        outputIndex: input.index,
        outputType: 'image',
        metadata,
      });
    } else if (input.outputType === 'video' && /^https?:\/\//i.test(input.url)) {
      transfer = await transferVideoOutputStream({
        taskId: input.taskId,
        userId: input.userId,
        sourceUrl: input.url,
        outputName: `video${input.index + 1}.mp4`,
        outputIndex: input.index,
      });
    } else if (isInlineBase64Output(input.url)) {
      // base64 data — write directly to buffer, skip HTTP download
      const buf = Buffer.from(input.url.trim(), 'base64');
      const transferService = require('./storage/transfer.service');
      transfer = await transferService.transferFromBuffer({
        taskId: input.taskId, userId: input.userId, buffer: buf,
        contentType: input.outputType === 'video' ? 'video/mp4' : 'image/png',
        outputType: input.outputType, outputIndex: input.index, metadata,
        outputName: input.outputType === 'video' ? `video${input.index + 1}` : `image${input.index + 1}`,
      });
    } else {
      const outputName = input.outputType === 'video'
        ? `video${input.index + 1}.mp4`
        : `image${input.index + 1}`;
      transfer = await transferOutput({
        taskId: input.taskId,
        userId: input.userId,
        sourceUrl: input.url,
        outputName,
        outputIndex: input.index,
        outputType: input.outputType,
        metadata,
      });
    }
    storageKey = transfer.storageKey;
    metadata.deliveryUrl = transfer.cdnUrl;
    metadata.fileNo = transfer.fileNo;
    metadata.fileSize = transfer.fileSize;
    await addTaskLog(input.taskId, 'output_saved', `输出 ${input.index + 1} 已保存`);
  } catch (err: any) {
    await addTaskLog(input.taskId, 'output_transfer_failed', `输出转存失败：${err.message || '未知错误'}；来源：${summarizeOutputSource(input.url)}`);
    throw err;
  }

  try {
    const thumbnailKey = String(
      metadata.thumbnail_key || metadata.thumbnailKey || metadata.thumbnailUrl || metadata.thumbnail || '',
    ).trim() || (input.outputType === 'image' ? storageKey : '');
    const [result] = await query<any>(
      `INSERT INTO ai_task_outputs
       (task_id, output_index, output_name, title, subtitle, output_type, cos_key, thumbnail_key, ratio, style, width, height, prompt_used, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        input.taskId,
        input.index,
        input.outputType === 'video' ? `视频${input.index + 1}` : `图片${input.index + 1}`,
        input.outputType === 'video' ? 'AI 视频' : 'AI 图片',
        input.outputType,
        input.outputType,
        storageKey,
        thumbnailKey,
        input.sizePlan?.targetRatio || input.params?.ratio || '',
        input.params?.style || '',
        transfer?.width || input.sizePlan?.targetWidth || 0,
        transfer?.height || input.sizePlan?.targetHeight || 0,
        input.prompt,
        JSON.stringify(metadata),
      ],
    );
    return {
      outputId: Number((result as any)?.insertId || 0),
      fileNo: String(transfer.fileNo || ''),
      storageKey,
    };
  } catch (err) {
    await cleanupSavedTaskOutputs(input.taskId, [{
      outputId: 0,
      fileNo: String(transfer.fileNo || ''),
      storageKey,
    }]).catch(cleanupErr =>
      addTaskLog(input.taskId, 'output_cleanup_failed', `输出入库失败后清理文件失败：${(cleanupErr.message || cleanupErr).toString().substring(0, 400)}`).catch(() => undefined),
    );
    throw err;
  }
}

export async function cleanupSavedTaskOutputs(taskId: number, outputs: SavedTaskOutput[]): Promise<void> {
  const outputIds = [...new Set(outputs.map(item => Number(item.outputId || 0)).filter(Boolean))];
  const fileNos = [...new Set(outputs.map(item => String(item.fileNo || '').trim()).filter(Boolean))];
  const storageKeys = [...new Set(outputs.map(item => String(item.storageKey || '').trim()).filter(Boolean))];

  if (outputIds.length > 0) {
    await query(
      `DELETE FROM ai_task_outputs WHERE task_id = ? AND id IN (${outputIds.map(() => '?').join(',')})`,
      [taskId, ...outputIds],
    );
  }

  if (fileNos.length > 0) {
    await query(
      `UPDATE files
          SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3)
        WHERE ref_type = 'task_output'
          AND ref_id = ?
          AND file_no IN (${fileNos.map(() => '?').join(',')})
          AND is_deleted = 0`,
      [String(taskId), ...fileNos],
    );
  }

  if (storageKeys.length > 0) {
    const adapter = StorageService.getActiveAdapter();
    for (const storageKey of storageKeys) {
      const ref = await queryOne<any>(
        'SELECT id FROM files WHERE storage_key = ? AND is_deleted = 0 LIMIT 1',
        [storageKey],
      );
      if (ref) continue;
      try {
        await adapter.delete(storageKey);
      } catch (err: any) {
        await addTaskLog(taskId, 'output_object_cleanup_failed', `存储对象清理失败：${storageKey}，${(err.message || err).toString().substring(0, 300)}`).catch(() => undefined);
      }
    }
  }

  if (outputIds.length || fileNos.length || storageKeys.length) {
    await addTaskLog(taskId, 'output_cleanup_done', `已清理失败任务的部分输出：${outputs.length} 个`).catch(() => undefined);
  }
}

function isRetryableOutputTransferError(err: any): boolean {
  const message = String(err?.message || '');
  return !/不是有效图片|不是有效视频|base64 图片格式不正确|不是可下载 URL|图片内容为空|视频内容为空/.test(message);
}

function summarizeOutputSource(source: string): string {
  const text = String(source || '').trim();
  if (!text) return 'empty';
  if (/^https?:\/\//i.test(text)) return text.slice(0, 500);
  if (text.startsWith('data:')) return `[data-url:${text.length}]`;
  if (isInlineBase64Output(text)) return `[base64:${text.length}]`;
  return text.slice(0, 160);
}

function isInlineBase64Output(source: string): boolean {
  const text = String(source || '').trim();
  if (text.length <= 160 || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

export async function finalizeTaskSuccess(input: { taskId: number; pointsCost: number; actualModelId: number; costSnapshot: any }): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [taskRows] = await conn.execute('SELECT user_id, status FROM ai_tasks WHERE id = ? FOR UPDATE', [input.taskId]) as any;
    const task = taskRows?.[0];
    if (!task?.user_id) { await conn.rollback(); return; }
    if (['completed', 'failed', 'cancelled'].includes(task.status)) { await conn.rollback(); return; }

    const [accRows] = await conn.execute('SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [task.user_id]) as any;
    const account = accRows?.[0];
    if (!account) { await conn.rollback(); return; }
    const frozenBefore = account.frozen_balance || 0;
    const settleAmount = Math.min(input.pointsCost, frozenBefore);

    await conn.execute(
      `UPDATE point_accounts SET frozen_balance = GREATEST(frozen_balance - ?, 0), total_spent = total_spent + ?,
       version = version + 1, updated_at = NOW(3) WHERE user_id = ? AND version = ?`,
      [settleAmount, input.pointsCost, task.user_id, account.version],
    );
    await conn.execute(
      `INSERT IGNORE INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
       VALUES (?, 'spend', 0, ?, ?, ?, ?, 'task_spend', 'ai_task_settle', ?, '任务完成扣减冻结积分', NOW(3))`,
      [task.user_id, account.balance, account.balance, frozenBefore, Math.max(frozenBefore - settleAmount, 0), String(input.taskId)],
    );
    await conn.execute(
      `UPDATE ai_tasks
          SET status = 'completed', progress = 100, actual_model_id = ?, actual_points_cost = ?,
              cost_snapshot = ?, provider_status = COALESCE(provider_status, 'completed'),
              provider_status_message = COALESCE(provider_status_message, '任务已完成'),
              next_poll_at = NULL, processing_lock_until = NULL,
              completed_at = NOW(3), updated_at = NOW(3)
        WHERE id = ?`,
      [input.actualModelId, input.pointsCost, JSON.stringify(input.costSnapshot || {}), input.taskId],
    );
    await conn.execute('UPDATE user_assets SET total_creations = total_creations + 1, updated_at = NOW(3) WHERE user_id = ?', [task.user_id]);
    await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [input.taskId, 'completed', '任务已完成']);

    if (input.actualModelId) {
      const [costRows] = await conn.execute('SELECT api_cost_cents, provider_id FROM ai_models WHERE id = ?', [input.actualModelId]) as any;
      const apiCost = Number(costRows?.[0]?.api_cost_cents || 0);
      if (apiCost > 0) {
        await conn.execute(
          'INSERT INTO ai_task_cost_logs (task_id, model_id, provider_id, call_log_id, user_points_cost, api_cost_cents, api_currency, gross_profit_cents, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, NOW(3))',
          [input.taskId, input.actualModelId, costRows[0].provider_id, input.pointsCost, apiCost, 'CNY', input.pointsCost - apiCost],
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function finalizeTaskFailure(taskId: number, cost: number, reason: string): Promise<void> {
  await withPointAccountRetry(`finalizeTaskFailure:${taskId}`, async () => {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const [taskRows] = await conn.execute('SELECT user_id, points_refunded, status FROM ai_tasks WHERE id = ? FOR UPDATE', [taskId]) as any;
      const task = taskRows?.[0];
      if (!task?.user_id) { await conn.rollback(); return; }
      if (task.status === 'failed' && task.points_refunded > 0) { await conn.rollback(); return; }
      if (['completed', 'cancelled'].includes(task.status)) { await conn.rollback(); return; }

      const [accRows] = await conn.execute('SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [task.user_id]) as any;
      const account = accRows?.[0];
      if (!account) { await conn.rollback(); return; }
      const frozenBefore = account.frozen_balance || 0;
      const refundAmount = task.points_refunded > 0 ? 0 : Math.min(cost, frozenBefore);

      const [updateResult] = await conn.execute(
        `UPDATE point_accounts SET balance = balance + ?, frozen_balance = GREATEST(frozen_balance - ?, 0),
         total_refunded = total_refunded + ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ? AND version = ?`,
        [refundAmount, refundAmount, refundAmount, task.user_id, account.version],
      ) as any;
      if (Number(updateResult?.affectedRows || 0) === 0) throw Object.assign(new Error('积分账户版本冲突'), { code: 'POINT_VERSION_CONFLICT' });
      await conn.execute(
        `INSERT IGNORE INTO point_logs
         (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
         VALUES (?, 'refund', ?, ?, ?, ?, ?, 'task_refund', 'ai_task_refund', ?, '任务失败退回积分', NOW(3))`,
        [task.user_id, refundAmount, account.balance, account.balance + refundAmount, frozenBefore, Math.max(frozenBefore - refundAmount, 0), String(taskId)],
      );
      await conn.execute(
        "UPDATE ai_tasks SET status = 'failed', fail_reason = ?, points_refunded = points_refunded + ?, provider_status = COALESCE(provider_status, 'failed'), provider_status_message = ?, next_poll_at = NULL, processing_lock_until = NULL, failed_at = NOW(3), updated_at = NOW(3) WHERE id = ?",
        [reason.substring(0, 255), refundAmount, reason.substring(0, 1000), taskId],
      );
      await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [account.balance + refundAmount, task.user_id]);
      await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, 'points_refunded', '任务失败，积分已退回']);
      await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, 'failed', reason.substring(0, 500)]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });
}

type CancelTaskResult = 'cancelled' | 'processing' | 'unavailable';

async function finalizeTaskCancelled(taskId: number, userId: number): Promise<CancelTaskResult> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [taskRows] = await conn.execute('SELECT user_id, points_cost, points_refunded, status FROM ai_tasks WHERE id = ? AND user_id = ? FOR UPDATE', [taskId, userId]) as any;
    const task = taskRows?.[0];
    if (!task?.user_id || ['completed', 'failed', 'cancelled'].includes(task.status)) { await conn.rollback(); return 'unavailable'; }
    // 已在处理中的任务不允许取消（AI 提供商已接受请求，平台需承担成本）
    if (task.status === 'processing') { await conn.rollback(); return 'processing'; }
    const [accRows] = await conn.execute('SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [task.user_id]) as any;
    const account = accRows?.[0];
    if (!account) { await conn.rollback(); return 'unavailable'; }
    const frozenBefore = account.frozen_balance || 0;
    const refundAmount = task.points_refunded > 0 ? 0 : Math.min(task.points_cost || 0, frozenBefore);
    await conn.execute(
      `UPDATE point_accounts SET balance = balance + ?, frozen_balance = GREATEST(frozen_balance - ?, 0),
       total_refunded = total_refunded + ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ? AND version = ?`,
      [refundAmount, refundAmount, refundAmount, task.user_id, account.version],
    );
    await conn.execute(
      `INSERT IGNORE INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
       VALUES (?, 'refund', ?, ?, ?, ?, ?, 'task_refund', 'ai_task_refund', ?, '任务取消退回积分', NOW(3))`,
      [task.user_id, refundAmount, account.balance, account.balance + refundAmount, frozenBefore, Math.max(frozenBefore - refundAmount, 0), String(taskId)],
    );
    await conn.execute("UPDATE ai_tasks SET status = 'cancelled', points_refunded = points_refunded + ?, canceled_at = NOW(3), updated_at = NOW(3) WHERE id = ?", [refundAmount, taskId]);
    await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [account.balance + refundAmount, task.user_id]);
    await conn.execute('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, 'cancelled', '任务已取消']);
    await conn.commit();
    return 'cancelled';
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function recoverStaleAiTasks(): Promise<{ recovered: number; failed: number }> {
  const queuedMinutes = positiveInt(process.env.TASK_QUEUE_STALE_QUEUED_MINUTES, 30);
  const processingMinutes = positiveInt(process.env.TASK_QUEUE_STALE_PROCESSING_MINUTES, 30);
  const maxBatch = positiveInt(process.env.TASK_QUEUE_STALE_MAX_BATCH, 100);

  const queuedTasks = await query<any>(
    "SELECT id, points_cost, task_type, status, queued_at, created_at FROM ai_tasks WHERE task_type IN ('image', 'video') AND status IN ('pending', 'queued') ORDER BY created_at ASC LIMIT " + maxBatch,
  );
  const processingTasks = await query<any>(
    "SELECT id, points_cost, task_type, status, provider_task_id, started_at, updated_at, created_at FROM ai_tasks WHERE task_type IN ('image', 'video') AND status = 'processing' ORDER BY created_at ASC LIMIT " + maxBatch,
  );

  let recovered = 0;
  let failed = 0;

  const failTask = async (task: any, reason: string) => {
    try {
      await finalizeTaskFailure(task.id, task.points_cost || 0, reason);
      failed++;
    } catch (err: any) {
      failed++;
      await addTaskLog(task.id, 'stale_task_recover_failed', (err.message || 'Recovery failure').substring(0, 500)).catch(() => undefined);
    }
  };

  for (const task of queuedTasks) {
    const queuedAt = new Date(task.queued_at || task.created_at).getTime();
    const ageMinutes = Number.isFinite(queuedAt) ? (Date.now() - queuedAt) / 60000 : queuedMinutes + 1;
    if (ageMinutes > queuedMinutes) {
      await addTaskLog(task.id, 'stale_queue_timeout', 'Queued task exceeded restart recovery window.').catch(() => undefined);
      await failTask(task, 'Queued task exceeded restart recovery window');
      continue;
    }

    try {
      const claimed = await claimQueuedTaskForRecovery(task.id);
      if (!claimed) {
        await addTaskLog(task.id, 'queue_recovery_skip', 'Task was claimed by another worker.').catch(() => undefined);
        continue;
      }
      const payload = await buildRecoveredTaskPayload(task.id);
      const queued = enqueue(task.id, payload, processTask);
      if (!queued) {
        await releaseRecoveryLock(task.id);
        await addTaskLog(task.id, 'queue_recovery_queue_full', QUEUE_FULL_MESSAGE).catch(() => undefined);
        continue;
      }
      await addTaskLog(task.id, 'task_recovered', 'Queued task restored after restart.');
      recovered++;
    } catch (err: any) {
      await releaseRecoveryLock(task.id).catch(() => undefined);
      await addTaskLog(task.id, 'queue_recovery_failed', (err.message || 'Queue recovery failed').substring(0, 500)).catch(() => undefined);
    }
  }

  for (const task of processingTasks) {
    const startedAt = new Date(task.started_at || task.updated_at || task.created_at).getTime();
    const ageMinutes = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 60000 : processingMinutes + 1;

    if (['image', 'video'].includes(task.task_type) && task.provider_task_id) {
      await addTaskLog(task.id, `${task.task_type}_processing_recovered`, 'Provider task will continue polling after restart.').catch(() => undefined);
      recovered++;
      continue;
    }

    if (task.task_type === 'video') {
      if (ageMinutes <= processingMinutes) {
        await addTaskLog(task.id, 'video_processing_active_skip', 'Video task may still be running in another worker.').catch(() => undefined);
        continue;
      }
      await failTask(task, 'Video task was left processing without provider task id after restart');
      continue;
    }

    if (task.task_type === 'image') {
      if (ageMinutes <= processingMinutes) {
        await addTaskLog(task.id, 'image_processing_active_skip', 'Image task may still be running in another worker.').catch(() => undefined);
        continue;
      }
      await addTaskLog(task.id, 'image_processing_stale_failed', 'Image processing task cannot be resumed after restart.').catch(() => undefined);
      await failTask(task, 'Image task cannot be resumed after restart');
      continue;
    }
  }

  return { recovered, failed };
}

function buildRecoverySelectionParams(taskType: string, params: Record<string, any>) {
  const selection: Record<string, any> = {
    ratio: params.ratio,
    quality: params.quality || params.resolution,
    style: params.style,
    imageCount: params.imageCount,
    sizeMode: params.sizeMode,
    targetWidth: params.sizePlan?.targetWidth || params.customWidth,
    targetHeight: params.sizePlan?.targetHeight || params.customHeight,
    fromCustomPixels: ['custom', 'prompt_pixel'].includes(String(params.sizeMode || '')) || (Number(params.customWidth || 0) > 0 && Number(params.customHeight || 0) > 0),
    postprocessMode: params.postprocessMode,
  };
  if (taskType === 'video') {
    selection.duration = params.duration || params.durationSeconds;
    selection.cameraMove = params.cameraMove;
  }
  return selection;
}

async function buildRecoveredTaskPayload(taskId: number): Promise<any> {
  const task = await queryOne<any>(
    'SELECT t.id, t.user_id, t.task_type, t.sub_type, t.tier_id, t.points_cost, t.status, t.provider_task_id, t.queued_at, t.started_at, t.updated_at, t.created_at, mf.feature_key, i.prompt, i.optimized_prompt, i.negative_prompt, i.system_prompt, i.form_data, i.params, i.edit_tool FROM ai_tasks t LEFT JOIN model_tiers mt ON mt.id = t.tier_id LEFT JOIN model_features mf ON mf.id = mt.feature_id LEFT JOIN ai_task_inputs i ON i.task_id = t.id WHERE t.id = ? LIMIT 1',
    [taskId],
  );
  if (!task || !task.user_id) throw new Error('Recovered task not found');
  if (!task.tier_id) throw new Error('Recovered task is missing tier binding');
  if (['completed', 'failed', 'cancelled'].includes(task.status)) throw new Error('Recovered task is already terminal');

  const inputParams = parseJson(task.params, {});
  const formData = parseJson(task.form_data, {});
  const prompt = String(task.optimized_prompt || task.prompt || '').trim();
  if (!prompt) throw new Error('Recovered task is missing prompt');

  const featureKey = task.feature_key || (task.task_type === 'video' ? 'video_create' : 'image_create');
  const tierResult = await selectTierModel(featureKey, task.tier_id, task.user_id, buildRecoverySelectionParams(task.task_type, inputParams));
  const sizePlan = resolveImageSize({
    prompt,
    sizeMode: inputParams.sizeMode,
    ratio: inputParams.ratio,
    customWidth: inputParams.customWidth,
    customHeight: inputParams.customHeight,
    postprocessMode: inputParams.postprocessMode,
    tierDefaultRatio: tierResult.capabilities.defaultRatio,
    nativeSizes: tierResult.capabilities.nativeSizes,
    allowPostprocess: task.task_type === 'image' ? tierResult.capabilities.allowPostprocess : false,
  });
  if (task.task_type === 'image' && sizePlan.needPostprocess && !tierResult.capabilities.allowPostprocess) {
    throw new Error('Recovered image task requires unsupported postprocess mode');
  }

  const recoveredRatio = String(inputParams.ratio || '').trim().toLowerCase() === 'adaptive' ? 'adaptive' : sizePlan.targetRatio;
  const recoveredParams: Record<string, any> = { ...inputParams, ratio: recoveredRatio, sizePlan, sizeWarnings: [...(inputParams.sizeWarnings || []), ...(sizePlan.warnings || [])] };
  let uploadKeys = normalizeUploadKeys(recoveredParams.uploadKeys);

  if (task.task_type === 'video') {
    const videoMode = normalizeVideoMode(recoveredParams.videoMode || task.sub_type || 'text_to_video');
    const durationPlan = resolveVideoDuration(recoveredParams.duration || recoveredParams.durationSeconds, tierResult.capabilities);
    recoveredParams.videoMode = videoMode;
    recoveredParams.duration = durationPlan.durationText;
    recoveredParams.durationRaw = durationPlan.durationRaw;
    recoveredParams.durationSeconds = durationPlan.duration;
    recoveredParams.durationSource = durationPlan.source;
    const referenceImages = await resolveVideoReferenceImages(task.user_id, videoMode, recoveredParams);
    recoveredParams.referenceImages = referenceImages.metadata;
    recoveredParams.sizeWarnings = [...(recoveredParams.sizeWarnings || []), ...(referenceImages.warnings || [])];
    uploadKeys = normalizeUploadKeys(recoveredParams.uploadKeys || referenceImages.urls);
    recoveredParams.uploadKeys = uploadKeys;
  } else {
    const imageReferences = await resolveImageReferenceImages(task.user_id, String(task.sub_type || 'text2img'), uploadKeys);
    uploadKeys = imageReferences.urls;
    recoveredParams.uploadKeys = uploadKeys;
    recoveredParams.referenceImages = imageReferences.metadata;
  }

  return {
    taskId: task.id,
    input: {
      userId: task.user_id,
      subType: task.task_type === 'video' ? String(recoveredParams.videoMode || task.sub_type || 'text_to_video') : String(task.sub_type || 'text2img'),
      prompt,
      optimizedPrompt: task.optimized_prompt || null,
      negativePrompt: task.negative_prompt || '',
      systemPrompt: task.system_prompt || '',
      formData,
      params: recoveredParams,
      sizePlan,
      uploadKeys,
    },
    tierResult,
    pointsCost: task.points_cost || 0,
    taskType: task.task_type,
  };
}

async function claimQueuedTaskForRecovery(taskId: number): Promise<boolean> {
  const [result] = await query<any>(
    `UPDATE ai_tasks
        SET status = 'queued',
            queued_at = COALESCE(queued_at, NOW(3)),
            processing_lock_until = DATE_ADD(NOW(3), INTERVAL ${RECOVERY_LOCK_MINUTES} MINUTE),
            updated_at = NOW(3)
      WHERE id = ?
        AND status IN ('pending', 'queued')
        AND (processing_lock_until IS NULL OR processing_lock_until < NOW(3))`,
    [taskId],
  );
  if (!result || Number((result as any).affectedRows || 0) === 0) return false;
  await addTaskLog(taskId, 'queued', 'Task queued.');
  return true;
}

async function releaseRecoveryLock(taskId: number): Promise<void> {
  await query(
    "UPDATE ai_tasks SET processing_lock_until = NULL, updated_at = NOW(3) WHERE id = ? AND status IN ('pending', 'queued')",
    [taskId],
  );
}

async function startTaskProcessing(taskId: number): Promise<boolean> {
  const [result] = await query<any>("UPDATE ai_tasks SET status = 'processing', started_at = NOW(3), processing_lock_until = NULL, updated_at = NOW(3) WHERE id = ? AND status = 'queued'", [taskId]);
  if (!result || Number((result as any).affectedRows || 0) === 0) return false;
  await addTaskLog(taskId, 'processing_start', 'Task processing started.');
  return true;
}


export async function addTaskLog(taskId: number, event: string, message: string) {
  const safeMessage = String(message ?? '').slice(0, 500);
  await query('INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))', [taskId, event, safeMessage]);
}

async function transferOutput(input: {
  taskId: number;
  userId: number;
  sourceUrl: string;
  outputName: string;
  outputIndex: number;
  outputType: 'image' | 'video';
  metadata?: any;
}): Promise<any> {
  const transferService = require('./storage/transfer.service');
  return transferService.transferFromUrl(input);
}

async function transferVideoOutputStream(input: {
  taskId: number;
  userId: number;
  sourceUrl: string;
  outputName: string;
  outputIndex: number;
}): Promise<any> {
  return transferOutput({ ...input, outputType: 'video' });
}

function validateVideoStreamContent(filePath: string, fileSize: number, contentType: string): void {
  const declared = String(contentType || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  if (fileSize <= 0) throw new Error('模型返回的视频内容为空');
  const header = fs.readFileSync(filePath).subarray(0, 256);
  const preview = mediaContentPreview(header);
  const looksLikeTextError = /^[\s\uFEFF]*(\{|\[|<!doctype|<html|<\?xml)/i.test(preview);
  if (looksLikeTextError || declared.includes('json') || declared.includes('html') || declared.startsWith('text/')) {
    throw new Error(`模型返回内容不是有效视频，可能是错误页或 JSON 响应（content-type: ${declared}，开头: ${preview || '[binary]'}）`);
  }
}

function mediaContentPreview(buffer: Buffer): string {
  return buffer
    .toString('utf8')
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function getTaskById(taskId: number, userId: number) {
  const task = await queryOne<any>('SELECT * FROM ai_tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  if (!task) return null;
  const inputRow = await queryOne<any>('SELECT * FROM ai_task_inputs WHERE task_id = ?', [taskId]);
  const outputs = await query<any>('SELECT * FROM ai_task_outputs WHERE task_id = ? ORDER BY output_index ASC', [taskId]);
  const params = parseJson(inputRow?.params, {});
  const formData = parseJson(inputRow?.form_data, {});
  const priceSnapshot = parseJson(task.price_snapshot, {});

  const publicOutputs = shouldHideTaskOutputs(task.audit_status)
    ? []
    : outputs.map((o: any) => buildPublicTaskOutput(o, params)).filter(Boolean);
  const firstOutput = publicOutputs[0] || null;
  return {
    id: task.id,
    taskId: task.id,
    taskNo: task.task_no,
    title: task.title || '',
    type: task.task_type,
    subType: task.sub_type || '',
    status: task.status,
    progress: task.progress,
    prompt: inputRow?.prompt || '',
    optimizedPrompt: inputRow?.optimized_prompt || '',
    negativePrompt: inputRow?.negative_prompt || '',
    formData,
    params,
    editTool: inputRow?.edit_tool || '',
    generationMode: priceSnapshot.tierName || '',
    tierName: priceSnapshot.tierName || '',
    tierKey: priceSnapshot.tierKey || '',
    message: buildTaskMessage(task),
    pointsCost: task.points_cost,
    pointsRefunded: task.points_refunded,
    duration: params.durationSeconds || params.duration || null,
    ratio: params.ratio || params.sizePlan?.targetRatio || null,
    width: params.sizePlan?.targetWidth || null,
    height: params.sizePlan?.targetHeight || null,
    size: buildPublicSize(params),
    outputs: publicOutputs,
    thumbnail: firstOutput?.thumbnail || firstOutput?.image || '',
    coverUrl: firstOutput?.thumbnail || firstOutput?.image || '',
    auditStatus: task.audit_status || 'pending',
    auditReason: task.audit_reason || '',
    failReason: task.fail_reason || '',
    errorMessage: task.fail_reason || '',
    createdAt: task.created_at,
    completedAt: task.completed_at,
  };
}

export async function getTasksList(userId: number, options: { type?: string; status?: string; keyword?: string; page?: number; pageSize?: number; lastId?: number }) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(Math.max(options.pageSize || 20, 1), 100);
  const lastId = Number(options.lastId || 0);
  const useCursor = Number.isFinite(lastId) && lastId > 0;
  const offset = useCursor ? 0 : (page - 1) * pageSize;
  let where = 't.user_id = ?';
  const params: any[] = [userId];
  if (options.type) { where += ' AND t.task_type = ?'; params.push(options.type); }
  if (options.status) { where += ' AND t.status = ?'; params.push(options.status); }
  if (options.keyword) { where += ' AND (t.title LIKE ? OR i.prompt LIKE ?)'; params.push(`%${options.keyword}%`, `%${options.keyword}%`); }
  if (useCursor) { where += ' AND t.id < ?'; params.push(lastId); }

  const conn = await getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT SQL_CALC_FOUND_ROWS
       t.id, t.task_no, t.task_type, t.sub_type, t.title, t.status, t.progress, t.points_cost, t.points_refunded,
       t.price_snapshot, t.fail_reason, t.audit_status, t.audit_reason, t.created_at, t.completed_at,
       i.prompt, i.optimized_prompt, i.negative_prompt, i.form_data, i.params, i.edit_tool,
       o.output_index, o.output_name, o.output_type, o.title as output_title, o.subtitle as output_subtitle,
       o.ratio as output_ratio, o.style as output_style, o.width as output_width, o.height as output_height,
       o.cos_key, o.thumbnail_key, o.metadata as output_metadata
     FROM ai_tasks t
     LEFT JOIN ai_task_inputs i ON i.task_id = t.id
     LEFT JOIN ai_task_outputs o ON o.task_id = t.id AND o.output_index = 0
     WHERE ${where}
     ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ) as any;
    const [foundRows] = await conn.query('SELECT FOUND_ROWS() AS total') as any;
    const list = Array.isArray(rows) ? rows : [];
    const total = Number(foundRows?.[0]?.total || 0);
    const mappedList = mapTaskListRows(list);
    const nextCursor = mappedList.length ? Number(mappedList[mappedList.length - 1].id || 0) : null;
    return {
      list: mappedList,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        nextCursor,
        hasMore: useCursor ? mappedList.length >= pageSize : page * pageSize < total,
      },
    };
  } finally {
    conn.release();
  }
}

export async function getTasksByIds(userId: number, ids: number[]) {
  const taskIds = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))].slice(0, 50);
  if (!taskIds.length) return { list: [] };
  const rows = await query<any>(
    `SELECT t.id, t.task_no, t.task_type, t.sub_type, t.title, t.status, t.progress, t.points_cost, t.points_refunded,
       t.price_snapshot, t.fail_reason, t.audit_status, t.audit_reason, t.created_at, t.completed_at,
       i.prompt, i.optimized_prompt, i.negative_prompt, i.form_data, i.params, i.edit_tool,
       o.output_index, o.output_name, o.output_type, o.title as output_title, o.subtitle as output_subtitle,
       o.ratio as output_ratio, o.style as output_style, o.width as output_width, o.height as output_height,
       o.cos_key, o.thumbnail_key, o.metadata as output_metadata
     FROM ai_tasks t
     LEFT JOIN ai_task_inputs i ON i.task_id = t.id
     LEFT JOIN ai_task_outputs o ON o.task_id = t.id AND o.output_index = 0
     WHERE t.user_id = ? AND t.id IN (${taskIds.map(() => '?').join(',')})
     ORDER BY t.id ASC`,
    [userId, ...taskIds],
  );
  return { list: mapTaskListRows(rows) };
}

function mapTaskListRows(list: any[]) {
  return {
    list: list.map((t: any) => {
      const taskParams = parseJson(t.params, {});
      const formData = parseJson(t.form_data, {});
      const priceSnapshot = parseJson(t.price_snapshot, {});
      const output = t.output_type ? buildPublicTaskOutput({
        output_index: t.output_index,
        output_name: t.output_name,
        output_type: t.output_type,
        title: t.output_title,
        subtitle: t.output_subtitle,
        ratio: t.output_ratio,
        style: t.output_style,
        width: t.output_width,
        height: t.output_height,
        cos_key: t.cos_key,
        thumbnail_key: t.thumbnail_key,
        metadata: t.output_metadata,
      }, taskParams) : null;
      const publicOutputs = shouldHideTaskOutputs(t.audit_status) ? [] : (output ? [output] : []);
      const firstOutput = publicOutputs[0] || null;
      return {
        id: t.id,
        taskId: t.id,
        taskNo: t.task_no,
        title: t.title || '',
        type: t.task_type,
        subType: t.sub_type || '',
        status: t.status,
        progress: t.progress,
        prompt: t.prompt || '',
        optimizedPrompt: t.optimized_prompt || '',
        negativePrompt: t.negative_prompt || '',
        formData,
        params: taskParams,
        editTool: t.edit_tool || '',
        generationMode: priceSnapshot.tierName || '',
        tierName: priceSnapshot.tierName || '',
        tierKey: priceSnapshot.tierKey || '',
        message: buildTaskMessage(t),
        outputs: publicOutputs,
        thumbnail: firstOutput?.thumbnail || firstOutput?.image || '',
        coverUrl: firstOutput?.thumbnail || firstOutput?.image || '',
        pointsCost: t.points_cost,
        pointsRefunded: t.points_refunded,
        duration: taskParams.durationSeconds || taskParams.duration || null,
        ratio: taskParams.ratio || taskParams.sizePlan?.targetRatio || null,
        width: taskParams.sizePlan?.targetWidth || null,
        height: taskParams.sizePlan?.targetHeight || null,
        size: buildPublicSize(taskParams),
        auditStatus: t.audit_status || 'pending',
        auditReason: t.audit_reason || '',
        failReason: t.fail_reason || '',
        errorMessage: t.fail_reason || '',
        createdAt: t.created_at,
        completedAt: t.completed_at,
      };
    }),
  }.list;
}

export async function cancelTask(taskId: number, userId: number): Promise<boolean> {
  const result = await finalizeTaskCancelled(taskId, userId);
  if (result === 'processing') {
    throw Object.assign(new Error('任务正在处理中，无法取消'), { code: 4000 });
  }
  return result === 'cancelled';
}

export async function createMangaTask(_input: any) {
  throw paramError('AI 漫剧任务暂未开放');
}

export async function createStoryboardTask(_input: any) {
  throw paramError('故事板任务暂未开放');
}


function normalizeDuration(value: any): number {
  if (typeof value === 'number') return value;
  const parsed = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(parsed) ? 5 : parsed;
}

export function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeProviderMessage(message: any): string {
  const text = String(message || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  return text.replace(/(api[_-]?key|token|secret|password)["'=:\s]+[^,\s}]+/ig, '$1=[filtered]').substring(0, 1000);
}

function generateTaskNo(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  return `TASK${date}${time}${Math.floor(Math.random() * 9000) + 1000}`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

async function withPointAccountRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!isPointVersionConflict(err) || attempt >= maxAttempts) break;
      console.warn(`[Points] ${label} version conflict, retry ${attempt}/${maxAttempts}`);
      await sleep(100);
    }
  }
  throw lastError;
}

function isPointVersionConflict(err: any): boolean {
  const message = String(err?.message || '');
  return err?.code === 'POINT_VERSION_CONFLICT' || /积分账户.*(版本|并发)|version conflict/i.test(message);
}

function parseJson(value: any, fallback: any): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function booleanFlag(value: any, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(text)) return false;
  if (['true', '1', 'on', 'yes'].includes(text)) return true;
  return fallback;
}

function filterImageParams(params: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!ALLOWED_PARAM_KEYS.has(key)) continue;
    if (typeof value === 'string') clean[key] = value.slice(0, 500);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
    else if (Array.isArray(value)) clean[key] = value.slice(0, 20);
  }
  return clean;
}

function normalizeImageResolutionParams(params: Record<string, any>, input: CreateImageTaskParams): void {
  const explicitResolution = input.resolutionPreset ?? params.resolutionPreset;
  const legacyQuality = params.quality;
  const source = explicitResolution !== undefined ? explicitResolution : legacyQuality;
  if (isResolutionPreset(source)) {
    params.resolutionPreset = normalizeResolutionPreset(source);
    if (legacyQuality !== undefined && isResolutionPreset(legacyQuality)) delete params.quality;
  }
  if (input.sizeKey !== undefined && input.sizeKey !== null) params.sizeKey = String(input.sizeKey).trim();
  if (params.resolutionPreset && !params.resolutionLabel) {
    params.resolutionLabel = params.resolutionPreset === 'auto' ? '自动' : `${params.resolutionPreset}清晰度`;
  }
}

function normalizeImageCount(value: any, maxImages: number): number {
  const count = positiveInt(value, 1);
  return Math.max(1, Math.min(count, Math.max(1, Number(maxImages || 1))));
}

function applyImageCountPricing(tierResult: TierModelResult, imageCount: number): TierModelResult {
  const count = Math.max(1, Number(imageCount || 1));
  const unitBasePointsCost = tierResult.unitBasePointsCost ?? tierResult.basePointsCost;
  const unitPointsCost = tierResult.unitPointsCost ?? tierResult.pointsCost;
  return {
    ...tierResult,
    unitBasePointsCost,
    unitPointsCost,
    imageCount: count,
    basePointsCost: unitBasePointsCost * count,
    pointsCost: unitPointsCost * count,
  };
}

function filterVideoParams(params: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!ALLOWED_VIDEO_PARAM_KEYS.has(key)) continue;
    if (typeof value === 'string') clean[key] = value.slice(0, 1000);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
    else if (Array.isArray(value)) {
      clean[key] = key === 'inputAssets' ? sanitizeInputAssets(value) : value.slice(0, 20);
    }
  }
  return clean;
}

function sanitizeInputAssets(value: any[]): any[] {
  return value.slice(0, 10).map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const clean: Record<string, any> = {};
    for (const key of ['type', 'typeLabel', 'path', 'uploadKey', 'fileId', 'mediaType']) {
      const fieldValue = source[key];
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
      if (typeof fieldValue === 'string') clean[key] = fieldValue.slice(0, 1000);
      else if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') clean[key] = fieldValue;
      else if (key === 'uploadKey' && typeof fieldValue === 'object') {
        clean[key] = sanitizeUploadKeyMeta(fieldValue);
      }
    }
    return clean;
  }).filter((item) => item.type || item.path || item.fileId);
}

function sanitizeUploadKeyMeta(value: any): any {
  const clean: Record<string, any> = {};
  for (const key of ['fileId', 'id', 'path', 'url', 'mediaType']) {
    const fieldValue = value?.[key];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
    if (typeof fieldValue === 'string') clean[key] = fieldValue.slice(0, 1000);
    else if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') clean[key] = fieldValue;
  }
  return clean;
}

function normalizeUploadKeys(uploadKeys: any): string[] {
  const items = Array.isArray(uploadKeys) ? uploadKeys : uploadKeys ? [uploadKeys] : [];
  const normalized = new Set<string>();
  for (const item of items) {
    let value = '';
    if (typeof item === 'string') {
      value = item;
    } else if (item && typeof item === 'object') {
      value = item.url || item.cdnUrl || item.accessUrl || item.storageKey || item.storage_key || item.key || item.fileId || item.id || '';
    }
    const text = String(value || '').trim();
    if (text) normalized.add(text.slice(0, 1000));
  }
  return Array.from(normalized);
}

function imageProviderTaskType(subType: any): string {
  const text = String(subType || 'text2img').trim();
  if (text === 'img2img') return 'image_to_image';
  if (text === 'edit') return 'image_edit';
  return 'text_to_image';
}

function videoFeatureKeyForMode(videoMode: VideoMode): string {
  if (videoMode === 'image_to_video') return 'image_to_video';
  if (videoMode === 'first_last_frame_video') return 'first_last_frame_video';
  if (videoMode === 'video_edit') return 'video_edit';
  return 'video_create';
}

async function resolveImageReferenceImages(
  userId: number,
  subType: string,
  uploadKeys: any,
  referenceKeys?: string[],
): Promise<{ urls: string[]; metadata: any[]; referenceUrls?: string[] }> {
  const normalizedSubType = String(subType || 'text2img').trim();
  const mainItems = Array.isArray(uploadKeys) ? uploadKeys : uploadKeys ? [uploadKeys] : [];
  const refItems = Array.isArray(referenceKeys) ? referenceKeys : referenceKeys ? [referenceKeys] : [];
  if (['img2img', 'edit'].includes(normalizedSubType) && mainItems.length === 0) {
    throw paramError('请至少上传一张参考图片');
  }

  const urls = new Set<string>();
  const metadata: any[] = [];
  const mainRefs = await Promise.all(mainItems.map((item) => resolveSingleImageReference(userId, item)));
  for (const resolved of mainRefs) {
    if (!resolved?.url) continue;
    urls.add(resolved.url);
    metadata.push(resolved.metadata);
  }

  if (['img2img', 'edit'].includes(normalizedSubType) && urls.size === 0) {
    throw paramError('请上传可用的参考图片');
  }

  // 图生图额外处理风格参考图
  const referenceUrls: string[] = [];
  if (normalizedSubType === 'img2img' && refItems.length > 0) {
    const refResults = await Promise.all(refItems.map((item) => resolveSingleImageReference(userId, item)));
    for (const resolved of refResults) {
      if (!resolved?.url) continue;
      referenceUrls.push(resolved.url);
    }
  }

  return { urls: Array.from(urls), metadata, referenceUrls: referenceUrls.length > 0 ? referenceUrls : undefined };
}

async function resolveSingleImageReference(userId: number, item: any): Promise<{ url: string; metadata: any } | null> {
  const directUrl = extractDirectReferenceUrl(item);
  if (directUrl) {
    assertPublicHttpReferenceUrl(directUrl);
    return { url: directUrl, metadata: { role: 'reference_image', url: directUrl } };
  }

  const fileLookup = extractFileReferenceLookup(item);
  if (!fileLookup) return null;
  const file = await loadImageFileByReference(fileLookup, userId);
  const url = file.cdn_url || file.access_url || storageKeyToUrl(file.storage_key);
  if (!url) throw paramError('参考图片缺少可访问地址');
  assertPublicHttpReferenceUrl(url);
  return {
    url,
    metadata: {
      role: 'reference_image',
      fileId: file.id,
      fileNo: file.file_no,
      storageKey: file.storage_key,
      url,
      width: file.width,
      height: file.height,
    },
  };
}

function assertPublicHttpReferenceUrl(url: string): void {
  const text = String(url || '').trim();
  if (text.startsWith('data:')) {
    throw paramError('图生图参考图必须是公网可访问的 http/https URL，当前模型不支持 base64/data URL。请先上传图片并使用返回的公网地址。');
  }
  if (!/^https?:\/\//i.test(text)) {
    throw paramError('参考图 URL 必须以 http 或 https 开头');
  }
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || host.endsWith('.local')
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      throw paramError('参考图必须是第三方模型可访问的公网 URL，不能使用 localhost、内网地址或本地文件地址。');
    }
  } catch (err: any) {
    if (err?.code) throw err;
    throw paramError('参考图 URL 格式不正确');
  }
}

async function resolveImageEditAuxiliaryReferences(userId: number, params: Record<string, any>): Promise<{ metadata: any[] }> {
  const metadata: any[] = [];
  const [mask, background] = await Promise.all([
    resolveOptionalImageReference(userId, params.maskFileId || params.maskImage || params.maskUrl || params.mask_url, 'mask'),
    resolveOptionalImageReference(
      userId,
      params.backgroundFileId || params.backgroundImage || params.backgroundUrl || params.background_url,
      'background',
    ),
  ]);
  if (mask) {
    params.maskUrl = mask.url;
    params.mask_url = mask.url;
    metadata.push(mask.metadata);
  }
  if (background) {
    params.backgroundUrl = background.url;
    params.background_url = background.url;
    metadata.push(background.metadata);
  }
  return { metadata };
}

async function resolveOptionalImageReference(userId: number, item: any, role: string): Promise<{ url: string; metadata: any } | null> {
  if (item === undefined || item === null || item === '') return null;
  const resolved = await resolveSingleImageReference(userId, item);
  if (!resolved) return null;
  return { url: resolved.url, metadata: { ...resolved.metadata, role } };
}

function extractDirectReferenceUrl(item: any): string {
  if (typeof item === 'string') {
    const text = item.trim();
    return /^https?:\/\//i.test(text) || text.startsWith('data:') ? text : '';
  }
  if (!item || typeof item !== 'object') return '';
  const value = item.url || item.cdnUrl || item.cdn_url || item.accessUrl || item.access_url || '';
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) || text.startsWith('data:') ? text : '';
}

function extractFileReferenceLookup(item: any): { id?: number; fileNo?: string; storageKey?: string; fileUrl?: string } | null {
  if (typeof item === 'number') return item > 0 ? { id: item } : null;
  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return { id: Number(text) };
    if (/^[A-Z0-9_-]{8,20}$/i.test(text) && !text.includes('/')) return { fileNo: text };
    if (text.startsWith('/')) return { fileUrl: text };
    return { storageKey: text };
  }
  if (!item || typeof item !== 'object') return null;
  const id = positiveInt(item.fileId || item.file_id || item.id, 0);
  if (id) return { id };
  const fileNo = String(item.fileNo || item.file_no || '').trim();
  if (fileNo) return { fileNo };
  const storageKey = String(item.storageKey || item.storage_key || item.key || '').trim();
  if (storageKey) return { storageKey };
  const fileUrl = String(item.url || item.cdnUrl || item.cdn_url || item.accessUrl || item.access_url || '').trim();
  if (fileUrl) return { fileUrl };
  return null;
}

async function loadImageFileByReference(ref: { id?: number; fileNo?: string; storageKey?: string; fileUrl?: string }, userId: number): Promise<any> {
  return loadFileByReference(ref, userId, 'image/', '参考图片');
}

async function loadFileByReference(
  ref: { id?: number; fileNo?: string; storageKey?: string; fileUrl?: string },
  userId: number,
  mimePrefix: string,
  label: string,
): Promise<any> {
  const where: string[] = ['is_deleted = 0'];
  const params: any[] = [];
  if (ref.id) { where.push('id = ?'); params.push(ref.id); }
  else if (ref.fileNo) { where.push('file_no = ?'); params.push(ref.fileNo); }
  else if (ref.storageKey) { where.push('storage_key = ?'); params.push(ref.storageKey); }
  else if (ref.fileUrl) {
    where.push('(access_url = ? OR cdn_url = ? OR storage_key = ?)');
    params.push(ref.fileUrl, ref.fileUrl, ref.fileUrl);
  }
  else throw paramError(`${label}参数无效`);

  const file = await queryOne<any>(
    `SELECT id, file_no, user_id, mime_type, cdn_url, access_url, storage_key, width, height, visibility
       FROM files
      WHERE ${where.join(' AND ')}
      LIMIT 1`,
    params,
  );
  if (!file) throw paramError(`${label}不存在或已删除`);
  if (file.user_id !== null && Number(file.user_id) !== Number(userId)) throw paramError(`${label}不属于当前用户`);
  if (!String(file.mime_type || '').startsWith(mimePrefix)) throw paramError(`${label}类型不正确`);
  await ensureProviderReadableFile(file);
  return file;
}

async function ensureProviderReadableFile(file: any): Promise<void> {
  if (!file?.id || file.visibility === 'public') return;
  await query(
    "UPDATE files SET visibility = 'public', updated_at = NOW(3) WHERE id = ? AND visibility <> 'public'",
    [file.id],
  );
  file.visibility = 'public';
}

function storageKeyToUrl(storageKey: string): string {
  if (!storageKey) return '';
  try {
    const adapter = StorageService.getActiveAdapter();
    return adapter.getCdnUrl(storageKey) || adapter.getAccessUrl(storageKey) || storageKey;
  } catch {
    return storageKey;
  }
}

function normalizeVideoMode(value: any): VideoMode {
  const text = String(value || 'text_to_video').trim();
  const aliases: Record<string, VideoMode> = {
    text2video: 'text_to_video',
    txt2video: 'text_to_video',
    text_to_video: 'text_to_video',
    image2video: 'image_to_video',
    img2video: 'image_to_video',
    image_to_video: 'image_to_video',
    first_last_frame: 'first_last_frame_video',
    first_last_frame_video: 'first_last_frame_video',
    video_edit: 'video_edit',
    edit_video: 'video_edit',
  };
  const mode = aliases[text];
  if (!mode || !VIDEO_MODES.includes(mode)) throw paramError('不支持的视频生成模式');
  return mode;
}

function resolveVideoDuration(value: any, capabilities: TierCapabilities): { duration: number; durationText: string; durationRaw: string; source: 'input' | 'default' } {
  const supportedValues = capabilities.durations || [];
  const supportsAuto = supportedValues.map(item => String(item || '').trim().toLowerCase()).includes('auto');
  const supported = supportedValues.map(item => normalizeDuration(item)).filter(n => n > 0);
  const max = capabilities.maxDurationSeconds || Math.max(...supported, 30);
  const defaultDuration = supported[0] || Math.min(5, max);
  const hasInput = value !== undefined && value !== null && value !== '';
  const rawInput = String(value || '').trim();
  if (hasInput && rawInput.toLowerCase() === 'auto') {
    if (!supportsAuto) throw paramError('当前档位不支持自动时长');
    return { duration: max || defaultDuration, durationText: 'auto', durationRaw: 'auto', source: 'input' };
  }
  const duration = hasInput ? normalizeDuration(value) : defaultDuration;
  if (!Number.isFinite(duration) || duration <= 0) throw paramError('视频时长必须大于 0，常用值为 5 或 10 秒');
  if (duration > max) throw paramError(`视频时长不能超过 ${max} 秒`);
  if (supported.length > 0 && !supported.includes(duration)) {
    throw paramError(`当前档位不支持 ${duration} 秒，支持：${supported.join('、')} 秒`);
  }
  return { duration, durationText: `${duration}s`, durationRaw: String(duration), source: hasInput ? 'input' : 'default' };
}

async function resolveVideoReferenceImages(
  userId: number,
  videoMode: VideoMode,
  params: Record<string, any>,
): Promise<{ urls: string[]; metadata: any[]; warnings: string[] }> {
  const firstFrameFileId = positiveInt(params.firstFrameFileId || params.imageId, 0);
  const lastFrameFileId = positiveInt(params.lastFrameFileId, 0);
  const referenceImage = typeof params.referenceImage === 'string' ? params.referenceImage.trim() : '';
  const videoFileId = positiveInt(params.videoFileId || params.videoId, 0);
  const referenceVideo = String(params.videoUrl || params.video_url || params.referenceVideo || params.referenceVideoUrl || '').trim();
  const uploadItems = Array.isArray(params.uploadKeys) ? params.uploadKeys : params.uploadKeys ? [params.uploadKeys] : [];
  const urls: string[] = [];
  const metadata: any[] = [];
  const warnings: string[] = [];
  let firstFrameFile: any = null;
  let lastFrameFile: any = null;

  if (videoMode === 'image_to_video' && !firstFrameFileId && !referenceImage && uploadItems.length === 0) {
    throw paramError('图生视频需要上传首帧图或提供参考图 URL');
  }
  if (videoMode === 'first_last_frame_video' && (!firstFrameFileId || !lastFrameFileId)) {
    throw paramError('首尾帧视频需要同时提供首帧图和尾帧图');
  }
  if (videoMode === 'video_edit' && !videoFileId && !referenceVideo && uploadItems.length === 0) {
    throw paramError('视频编辑需要上传视频文件或提供视频 URL');
  }
  if (videoMode === 'video_edit' && uploadItems.length > 1) {
    throw paramError('视频编辑只能上传一个源视频');
  }

  if (videoMode === 'video_edit') {
    const videoRef = videoFileId || referenceVideo || uploadItems[0];
    const resolved = await resolveSingleVideoReference(userId, videoRef);
    if (!resolved?.url) throw paramError('视频文件缺少可访问地址');
    params.videoUrl = resolved.url;
    params.video_url = resolved.url;
    metadata.push(resolved.metadata);
  }

  const firstFramePromise = firstFrameFileId
    ? loadUsableImageFile(firstFrameFileId, userId)
    : Promise.resolve(null);
  const uploadImagePromise = !firstFrameFileId && !referenceImage && videoMode === 'image_to_video' && uploadItems[0]
    ? Promise.all(uploadItems.map((item) => resolveSingleImageReference(userId, item)))
    : Promise.resolve([]);
  const lastFramePromise = lastFrameFileId
    ? loadUsableImageFile(lastFrameFileId, userId)
    : Promise.resolve(null);
  const [loadedFirstFrame, uploadImageResults, loadedLastFrame] = await Promise.all([
    firstFramePromise,
    uploadImagePromise,
    lastFramePromise,
  ]);

  if (firstFrameFileId) {
    const file = loadedFirstFrame;
    firstFrameFile = file;
    urls.push(file.url);
    metadata.push({ role: 'first_frame', fileId: file.id, fileNo: file.file_no, url: file.url, width: file.width, height: file.height });
  } else if (referenceImage) {
    if (!/^https?:\/\//i.test(referenceImage)) throw paramError('参考图 URL 必须以 http 或 https 开头');
    urls.push(referenceImage);
    metadata.push({ role: 'reference_image', url: referenceImage });
  } else if (videoMode === 'image_to_video' && uploadItems[0]) {
    for (const resolved of uploadImageResults) {
      if (resolved?.url) {
        urls.push(resolved.url);
        metadata.push({ ...resolved.metadata, role: 'reference_image' });
      }
    }
  }

  if (lastFrameFileId) {
    const file = loadedLastFrame;
    lastFrameFile = file;
    urls.push(file.url);
    metadata.push({ role: 'last_frame', fileId: file.id, fileNo: file.file_no, url: file.url, width: file.width, height: file.height });
  }

  if (firstFrameFile && lastFrameFile) {
    const firstRatio = (firstFrameFile.width || 1) / (firstFrameFile.height || 1);
    const lastRatio = (lastFrameFile.width || 1) / (lastFrameFile.height || 1);
    if (Math.abs(firstRatio - lastRatio) > 0.1) {
      warnings.push(`首帧尺寸 ${firstFrameFile.width || 0}x${firstFrameFile.height || 0} 与尾帧尺寸 ${lastFrameFile.width || 0}x${lastFrameFile.height || 0} 比例差异较大，可能影响生成效果`);
    }
  }

  return { urls, metadata, warnings };
}

async function resolveSingleVideoReference(userId: number, item: any): Promise<{ url: string; metadata: any } | null> {
  if (typeof item === 'string' && /^https?:\/\//i.test(item.trim())) {
    const url = item.trim();
    return { url, metadata: { role: 'source_video', url } };
  }
  const fileLookup = extractFileReferenceLookup(item);
  if (!fileLookup) return null;
  const file = await loadFileByReference(fileLookup, userId, 'video/', '视频文件');
  const url = file.cdn_url || file.access_url || storageKeyToUrl(file.storage_key);
  return {
    url,
    metadata: {
      role: 'source_video',
      fileId: file.id,
      fileNo: file.file_no,
      storageKey: file.storage_key,
      url,
      width: file.width,
      height: file.height,
    },
  };
}

async function loadUsableImageFile(fileId: number, userId: number): Promise<any> {
  const file = await queryOne<any>(
    `SELECT id, file_no, user_id, mime_type, cdn_url, access_url, storage_key, width, height, visibility
       FROM files
      WHERE id = ? AND is_deleted = 0
      LIMIT 1`,
    [fileId],
  );
  if (!file) throw paramError('图片文件不存在或已删除');
  if (file.user_id !== null && Number(file.user_id) !== Number(userId)) throw paramError('图片文件不属于当前用户');
  if (!String(file.mime_type || '').startsWith('image/')) throw paramError('请选择图片文件');
  await ensureProviderReadableFile(file);
  const url = file.cdn_url || file.access_url || file.storage_key;
  if (!url) throw paramError('图片文件缺少可访问地址');
  return { ...file, url };
}

function modelSupportsVideoMode(model: RealModelInfo, videoMode: VideoMode): boolean {
  const configCapabilities = normalizeModelCapabilities(model.config);
  if (configCapabilities.has(videoMode)) return true;
  const subType = String(model.subType || '').trim();
  if (!subType || subType === 'video' || subType === 'video_generation') return true;
  const normalized = normalizeVideoModelSubType(subType);
  return normalized === videoMode;
}

function normalizeVideoModelSubType(value: string): VideoMode | 'unknown' {
  try { return normalizeVideoMode(value); } catch { return 'unknown'; }
}

function normalizeModelCapabilities(config: any): Set<string> {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const values = Array.isArray(source.capabilities) ? source.capabilities : [];
  const result = new Set<string>();
  for (const item of values) {
    const text = String(item || '').trim();
    if (VIDEO_MODES.includes(text as VideoMode)) result.add(text);
  }
  return result;
}

function normalizeOutputUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return isMiniProgramSafeDeliveryUrl(value) ? value : null;
  let normalized = value.startsWith('local://') ? `/mock/${value.replace('local://', '')}` : value;
  if (!normalized.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    try {
      const adapter = StorageService.getActiveAdapter();
      normalized = adapter.getCdnUrl(normalized) || adapter.getAccessUrl(normalized) || normalized;
    } catch {
      // Keep the original storage key when storage config is not available.
    }
  }
  if (/^https?:\/\//i.test(normalized)) return isMiniProgramSafeDeliveryUrl(normalized) ? normalized : null;
  if (!normalized.startsWith('/')) return null;
  const publicBase = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '');
  if (publicBase) {
    const absolute = `${publicBase}${normalized}`;
    return isMiniProgramSafeDeliveryUrl(absolute) ? absolute : null;
  }
  const localBase = String(process.env.LOCAL_BASE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(localBase)) {
    try {
      const absolute = `${new URL(localBase).origin}${normalized}`;
      return isMiniProgramSafeDeliveryUrl(absolute) ? absolute : null;
    } catch {
      return null;
    }
  }
  return process.env.NODE_ENV === 'production' ? null : normalized;
}

function isMiniProgramSafeDeliveryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (process.env.NODE_ENV !== 'production') return true;
    return url.protocol === 'https:' && !isLocalHost;
  } catch {
    return false;
  }
}

function buildPublicSize(params: any) {
  const sizePlan = params?.sizePlan || {};
  const width = sizePlan.targetWidth || params?.width || null;
  const height = sizePlan.targetHeight || params?.height || null;
  const ratio = sizePlan.targetRatio || params?.ratio || null;
  if (!width && !height && !ratio) return null;
  return {
    mode: sizePlan.sizeMode || params?.sizeMode || null,
    ratio,
    width,
    height,
    nativeSize: sizePlan.nativeSize || null,
    source: sizePlan.source || null,
    warnings: Array.isArray(sizePlan.warnings) ? sizePlan.warnings : [],
  };
}

function buildPublicTaskOutput(output: any, params: any) {
  const metadata = parseJson(output?.metadata, {});
  const outputType = output?.output_type || 'image';
  const url = normalizeOutputUrl(metadata.deliveryUrl || metadata.url || output?.cos_key || null);
  const thumbnail = normalizeOutputUrl(output?.thumbnail_key || null)
    || normalizeOutputUrl(metadata.thumbnailUrl || metadata.thumbnail || null)
    || url;
  if (!url && !thumbnail) return null;
  return {
    id: output?.id ? String(output.id) : `output_${output?.output_index || 0}`,
    name: output?.output_name || `${outputType}${Number(output?.output_index || 0) + 1}`,
    title: output?.title || '',
    subtitle: output?.subtitle || '',
    type: outputType,
    outputType,
    url,
    image: outputType === 'image' ? url : thumbnail,
    video: outputType === 'video' ? url : null,
    thumbnail,
    ratio: output?.ratio || params?.ratio || params?.sizePlan?.targetRatio || '',
    style: output?.style || params?.style || '',
    width: output?.width || params?.sizePlan?.targetWidth || 0,
    height: output?.height || params?.sizePlan?.targetHeight || 0,
    fileNo: metadata.fileNo || '',
    fileSize: metadata.fileSize || output?.file_size || 0,
    prompt: output?.prompt_used || '',
    providerStatus: safePublicProviderStatus(metadata.providerStatus),
  };
}

function shouldHideTaskOutputs(auditStatus: any): boolean {
  return ['rejected', 'blocked'].includes(String(auditStatus || '').trim().toLowerCase());
}

function buildTaskMessage(task: any): string {
  if (task.status === 'completed') return task.task_type === 'video' ? '视频已完成' : '图片已完成';
  if (task.status === 'failed') return task.task_type === 'video' ? '视频生成失败，积分已退回' : '图片生成失败，积分已退回';
  if (task.status === 'cancelled') return '任务已取消';
  if (task.task_type === 'video') {
    if (task.progress >= 90) return '视频结果保存中';
    if (task.provider_task_id) return task.poll_count > 0 ? '正在查询视频结果' : '视频任务已提交，等待模型处理';
    if (task.status === 'queued') return '视频任务排队中';
    return '视频生成中';
  }
  if (task.status === 'queued') return '任务排队中';
  return '任务处理中';
}

function safePublicProviderStatus(status: any): string | undefined {
  const lower = String(status || '').toLowerCase();
  if (!lower) return undefined;
  if (['success', 'succeeded', 'completed', 'done'].includes(lower)) return 'completed';
  if (['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(lower)) return 'failed';
  return 'processing';
}

function videoExtensionFromContentType(contentType: string): string {
  const lower = (contentType || '').toLowerCase();
  if (lower.includes('quicktime')) return 'mov';
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('avi')) return 'avi';
  return 'mp4';
}

function ensureNamedExtension(name: string, extension: string): string {
  return /\.[a-z0-9]{2,8}$/i.test(name) ? name : `${name}.${extension}`;
}

function getTaskLabel(taskType: string) {
  if (taskType === 'image') return 'AI 生图';
  if (taskType === 'video') return 'AI 视频';
  return 'AI 任务';
}

/**
 * 对 resolveImageSize 的输出做本地二次校验，使用已加载的 tier capabilities。
 * 避免因尺寸解析后参数变化而再次调用 selectTierModel（TOC/TOU 问题）。
 */
function validateResolvedImageSize(
  tierName: string,
  caps: TierCapabilities,
  plan: SizePlan,
): void {
  if (plan.needPostprocess && !caps.allowPostprocess) {
    throw paramError('当前模型档位不支持后处理尺寸，请调整尺寸或模型档位');
  }
  if (!caps.supportedSizeModes.includes(plan.sizeMode)) {
    throw paramError(`当前档位不支持 ${plan.sizeMode} 尺寸模式`);
  }
  if (plan.targetWidth && plan.targetHeight) {
    if (plan.targetWidth < caps.minWidth || plan.targetHeight < caps.minHeight) {
      throw paramError(`当前档位最小支持 ${caps.minWidth}x${caps.minHeight}`);
    }
    if (plan.targetWidth > caps.maxWidth || plan.targetHeight > caps.maxHeight) {
      throw paramError(`当前档位最大支持 ${caps.maxWidth}x${caps.maxHeight}`);
    }
    if (plan.targetWidth * plan.targetHeight > caps.maxTotalPixels) {
      throw paramError(`当前档位最大支持 ${caps.maxTotalPixels} 总像素`);
    }
    const aspect = Math.max(plan.targetWidth / plan.targetHeight, plan.targetHeight / plan.targetWidth);
    if (aspect > caps.maxAspectRatio) throw paramError(`当前档位不支持过大的宽高比`);
  }
  if (plan.targetRatio && caps.ratios.length > 0 && !caps.ratios.includes(plan.targetRatio)) {
    throw paramError(`当前档位不支持 ${plan.targetRatio} 比例`);
  }
}

function paramError(message: string) {
  return Object.assign(new Error(message), { code: 4000 });
}

function countImageReferences(uploadKeys: any, referenceKeys?: any): number {
  const uploadItems = Array.isArray(uploadKeys) ? uploadKeys : uploadKeys ? [uploadKeys] : [];
  const referenceItems = Array.isArray(referenceKeys) ? referenceKeys : referenceKeys ? [referenceKeys] : [];
  return uploadItems.length + referenceItems.length;
}
