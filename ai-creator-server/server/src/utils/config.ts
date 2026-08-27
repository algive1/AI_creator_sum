// src/utils/config.ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_creator',
  },

  jwt: {
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-do-not-use-in-prod' : ''),
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '7200', 10),
    refreshExpiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '31536000', 10),
  },

  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
  },

  cos: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || 'ap-guangzhou',
  },

  oss: {
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.OSS_BUCKET || '',
    endpoint: process.env.OSS_ENDPOINT || 'https://oss-cn-hangzhou.aliyuncs.com',
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    cdnDomain: process.env.OSS_CDN_DOMAIN || '',
    ramRoleArn: process.env.OSS_RAM_ROLE_ARN || '',
    stsEndpoint: process.env.OSS_STS_ENDPOINT || 'sts.cn-hangzhou.aliyuncs.com',
    stsDurationSeconds: parseInt(process.env.OSS_STS_DURATION_SECONDS || '900', 10),
  },

  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || '',
    zone: process.env.QINIU_ZONE || 'z0',
    cdnDomain: process.env.QINIU_CDN_DOMAIN || '',
    callbackUrl: process.env.QINIU_CALLBACK_URL || '',
    callbackBody: process.env.QINIU_CALLBACK_BODY || 'key=$(key)&etag=$(etag)&fsize=$(fsize)&mimeType=$(mimeType)',
    tokenExpireSeconds: parseInt(process.env.QINIU_TOKEN_EXPIRE_SECONDS || '3600', 10),
  },

  upyun: {
    bucket: process.env.UPYUN_BUCKET || '',
    operator: process.env.UPYUN_OPERATOR || '',
    password: process.env.UPYUN_PASSWORD || '',
    cdnDomain: process.env.UPYUN_CDN_DOMAIN || '',
    returnUrl: process.env.UPYUN_RETURN_URL || '',
  },

  eos: {
    accessKey: process.env.EOS_ACCESS_KEY || '',
    secretKey: process.env.EOS_SECRET_KEY || '',
    bucket: process.env.EOS_BUCKET || '',
    endpoint: process.env.EOS_ENDPOINT || 'https://eos-wuxi-1.cmecloud.cn',
    region: process.env.EOS_REGION || 'wuxi-1',
    cdnDomain: process.env.EOS_CDN_DOMAIN || '',
    presignExpireSeconds: parseInt(process.env.EOS_PRESIGN_EXPIRE_SECONDS || '900', 10),
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || (process.env.NODE_ENV === 'development' ? 'dev-default-key-32-chars!!' : ''),
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    localUploadDir: process.env.LOCAL_UPLOAD_DIR || path.join(process.env.APP_ROOT_DIR || process.cwd(), 'uploads'),
    localBaseUrl: process.env.LOCAL_BASE_URL || '/static',
    uploadMaxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '10485760', 10),
    uploadMaxVideoSize: parseInt(process.env.UPLOAD_MAX_VIDEO_SIZE || '209715200', 10),
  },

  release: {
    appRootDir: process.env.APP_ROOT_DIR || process.cwd(),
    updatePackagesDir: process.env.UPDATE_PACKAGES_DIR || path.join(process.env.APP_ROOT_DIR || process.cwd(), 'update-packages'),
    pm2AppName: process.env.PM2_APP_NAME || 'ai-creator',
    healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://127.0.0.1:3000/health',
    systemCheckUrl: process.env.SYSTEM_CHECK_URL || 'http://127.0.0.1:3000/api/v1/admin/system/check',
    systemCheckToken: process.env.SYSTEM_CHECK_TOKEN || process.env.ADMIN_HEALTH_TOKEN || '',
  },
};
