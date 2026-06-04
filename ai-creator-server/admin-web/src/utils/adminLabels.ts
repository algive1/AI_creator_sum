export const STATUS_LABELS: Record<string, string> = {
  active: '启用',
  inactive: '停用',
  normal: '正常',
  banned: '封禁',
  created: '已创建',
  queued: '排队中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  expired: '已过期',
  closed: '已关闭',
  paying: '支付中',
  paid: '已支付',
  unpaid: '未支付',
  pending: '待处理',
  granted: '已到账',
  pass: '通过',
  reject: '拒绝',
};

export const MODEL_TYPE_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  points: '积分套餐',
  membership: '会员套餐',
};

export const TEMPLATE_USAGE_LABELS: Record<string, string> = {
  generate: '文生图（从文字描述生成新图）',
  reference: '图生图参考（上传参考图，参考其风格生成）',
  edit: '图片编辑（上传原图，在图上局部修改）',
  first_last_frame: '首尾帧视频（上传首帧和尾帧生成视频）',
  video_edit: '视频编辑（基于已有视频进行编辑）',
};

export const TEMPLATE_USAGE_SHORT: Record<string, string> = {
  generate: '文生图',
  reference: '图生图',
  edit: '图片编辑',
  first_last_frame: '首尾帧',
  video_edit: '视频编辑',
};

export const MEMBER_LEVEL_LABELS: Record<string, string> = {
  free: '普通用户',
  pro: '专业会员',
  business: '商业会员',
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

export function labelOf(map: Record<string, string>, value: any, fallback = '未知') {
  const key = String(value ?? '');
  return map[key] || key || fallback;
}
