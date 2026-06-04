export const STORAGE_KEYS = {
  token: 'ai_creator_token',
  refreshToken: 'ai_creator_refresh_token',
  user: 'ai_creator_user',
  profile: 'ai_creator_profile',
  config: 'ai_creator_config',
  navigation: 'ai_creator_navigation'
} as const;

export const PAGE_ROUTES = {
  home: '/pages/home/index',
  inspiration: '/pages/inspiration/index',
  comic: '/pages/comic/index',
  history: '/pages/history/index',
  profile: '/pages/profile/index',
  login: '/pages/login/index',
  aiImage: '/pages/ai-image/index',
  aiVideo: '/pages/ai-video/index',
  member: '/pages/member/index',
  memberInfo: '/pages/member-info/index',
  points: '/pages/points/index',
  pointsDetail: '/pages/points-detail/index',
  pointsAd: '/pages/points-ad/index',
  invite: '/pages/invite/index',
  checkin: '/pages/checkin/index',
  tasks: '/pages/tasks/index',
  generating: '/pages/generating/index',
  result: '/pages/result/index',
  taskDetail: '/pages/task-detail/index',
  announcements: '/pages/announcements/index',
  agreement: '/pages/agreement/index'
} as const;

export const FEATURE_KEYS = {
  image: 'image_create',
  imageToImage: 'image_to_image',
  imageEdit: 'image_edit',
  video: 'video_create',
  imageToVideo: 'image_to_video',
  firstLastFrameVideo: 'first_last_frame_video',
  videoEdit: 'video_edit'
} as const;

export const DEFAULT_RATIOS = ['1:1', '16:9', '9:16', '4:5'] as const;
export const DEFAULT_STYLES = ['写实', '高级感', '电商', '科技', '国潮', '卡通'] as const;
export const DEFAULT_QUALITIES = ['标准', '高清', '超清'] as const;
export const DEFAULT_DURATIONS = ['3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s'] as const;
