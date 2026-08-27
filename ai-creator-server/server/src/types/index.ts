// src/types/index.ts
export interface User {
  id: number;
  openid?: string;
  unionid?: string;
  phone?: string;
  email?: string;
  nickname: string;
  avatarUrl: string;
  accountType: 'wechat_miniprogram' | 'wechat_web' | 'phone' | 'email' | 'apple';
  status: 'normal' | 'banned' | 'deleted';
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: number;
  userId: number;
  realName?: string;
  gender: number;
  birthday?: string;
  province: string;
  city: string;
  inviteCode: string;
  invitedByUserId?: number;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  defaultRatio: string;
  defaultQuality: string;
  aiOptimize: boolean;
  systemPrompt: string;
  themeSource?: 'system' | 'light' | 'dark';
}

export interface PointAccount {
  id: number;
  userId: number;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalRefunded: number;
  frozenBalance: number;
  version: number;
}

export interface JwtPayload {
  userId: number;
  role: string;
  clientType: 'miniprogram' | 'web' | 'app';
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  requestId: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Error codes
export const ErrorCodes = {
  SUCCESS: 0,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PARAM_ERROR: 1001,
  POINTS_INSUFFICIENT: 1002,
  MEMBERSHIP_EXPIRED: 1003,
  LIMIT_EXCEEDED: 1004,
  ACCOUNT_BANNED: 1005,
  CONTENT_REVIEW_FAILED: 1006,
  AI_SERVICE_ERROR: 2001,
  AI_SERVICE_TIMEOUT: 2002,
  MODEL_UNAVAILABLE: 2003,
  ORDER_CREATE_FAILED: 3001,
  PAYMENT_FAILED: 3002,
  REFUND_FAILED: 3003,
  PAY_CONFIG_MISSING: 3004,
  ORDER_NOT_FOUND: 3005,
  ORDER_NOT_OWNED: 3006,
  ORDER_ALREADY_PAID: 3007,
  ORDER_EXPIRED: 3008,
  ORDER_STATUS_INVALID: 3009,
  WECHAT_PREPAY_FAILED: 3010,
  WECHAT_NOTIFY_VERIFY_FAILED: 3011,
  WECHAT_NOTIFY_DECRYPT_FAILED: 3012,
  WECHAT_AMOUNT_MISMATCH: 3013,
  WECHAT_APPID_MISMATCH: 3014,
  WECHAT_MCHID_MISMATCH: 3015,
  PAY_GRANT_FAILED: 3016,

  FILE_SIZE_EXCEEDED: 4001,
  FILE_TYPE_NOT_ALLOWED: 4002,
  FILE_NOT_FOUND: 4003,
  FILE_UPLOAD_FAILED: 4004,
  FILE_DELETE_FAILED: 4005,
  FILE_STORAGE_ERROR: 4006,
  FILE_CREDENTIAL_ERROR: 4007,
  FILE_CONTENT_REJECTED: 4008,
  FILE_PERMISSION_DENIED: 4009,
  UNSUPPORTED_STORAGE_PROVIDER: 4010,
  STORAGE_PROVIDER_CONFIG_MISSING: 4011,
  LOCAL_UPLOAD_DIR_UNAVAILABLE: 4012,
  COMPLIANCE_CONFIRM_REQUIRED: 4601,
  LEGAL_ACCEPT_REQUIRED: 4602,
  MEMBERSHIP_REQUIRED: 4603,
  VIDEO_EXPORT_SANITIZE_NOT_SUPPORTED: 4604,
  TEMPLATE_NOT_APPROVED: 4605,
  FREE_QUOTA_INSUFFICIENT: 4606,
  INVITE_DISABLED: 4701,
  INVITE_CODE_INVALID: 4702,
  INVITE_SELF_NOT_ALLOWED: 4703,
  INVITE_ALREADY_BOUND: 4704,
  INVITE_REWARD_ALREADY_GRANTED: 4705,
  INVITE_DAILY_LIMIT_REACHED: 4706,
  INVITE_REWARD_FAILED: 4707,
  SERVER_ERROR: 5000,
} as const;
