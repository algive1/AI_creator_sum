// src/services/openai-adapter.service.ts
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';

const ENC_ALGO = 'aes-256-cbc';
const LOCAL_UPLOADS_DIR = path.resolve(__dirname, '../../uploads/results');

interface ImageResult {
  images: { url?: string; b64_json?: string; localKey?: string }[];
  revisedPrompt?: string;
}

interface DalleParams {
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
}

function getEncKey(): Buffer {
  const raw = config.encryption.key || 'dev-default-key-32-chars!!';
  return Buffer.from(raw.padEnd(32).substring(0, 32), 'utf-8');
}

export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENC_ALGO, getEncKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptApiKey(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 2) return encrypted;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const data = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ENC_ALGO, getEncKey(), iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    return encrypted;
  }
}

export async function callDalle(modelApiName: string, params: DalleParams, providerApiKey: string): Promise<ImageResult> {
  // 开发环境没有真实 OpenAI Key 时返回本地 mock，便于安装后验证流程。
  if (config.nodeEnv === 'development' && (!providerApiKey || providerApiKey.startsWith('sk-your-'))) {
    console.log(`[OpenAI Mock] Generating ${params.n || 1} image(s) with prompt: ${params.prompt.substring(0, 80)}...`);
    await sleep(1500);

    const images = [];
    for (let i = 0; i < (params.n || 1); i++) {
      const localKey = `results/image/${new Date().toISOString().split('T')[0]}/mocks/mock_${uuidv4().substring(0, 8)}.png`;
      images.push({ localKey, url: `/mock/${localKey}` });
    }
    return {
      images,
      revisedPrompt: `[Mock] ${params.prompt.substring(0, 100)}`,
    };
  }

  const decryptedKey = decryptApiKey(providerApiKey);
  const response = await axios.post('https://api.openai.com/v1/images/generations', {
    model: modelApiName,
    prompt: params.prompt,
    n: params.n || 1,
    size: params.size || '1024x1024',
    quality: params.quality || 'standard',
    response_format: 'url',
  }, {
    headers: {
      Authorization: `Bearer ${decryptedKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 120000,
  });

  const data = response.data;
  return {
    images: (data.data || []).map((d: any) => ({
      url: d.url,
      b64_json: d.b64_json,
    })),
    revisedPrompt: data.data?.[0]?.revised_prompt,
  };
}

// 旧接口保留给历史调用，新的任务链路优先使用 storage/transfer.service。
export async function saveResultImage(imageUrl: string, taskId: number): Promise<string> {
  if (config.nodeEnv === 'development' && imageUrl.startsWith('/mock/')) {
    await fs.promises.mkdir(path.dirname(path.join(LOCAL_UPLOADS_DIR, imageUrl.replace('/mock/', ''))), { recursive: true });
    return imageUrl.replace('/mock/', 'local://');
  }

  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const key = `results/image/${config.nodeEnv}/${taskId}/${uuidv4()}.png`;
  const localPath = path.join(LOCAL_UPLOADS_DIR, key);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, Buffer.from(response.data));
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
