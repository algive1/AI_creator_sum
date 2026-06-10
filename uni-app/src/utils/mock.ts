export const inspirationTabs = ['推荐', '电商主题', '海报', '详情页', '视频'];

export type CreativeTemplateMode = 'text2img' | 'img2img' | 'edit' | 'text2video' | 'img2video';

export interface CreativeTemplate {
  id: string;
  title: string;
  tags: string[];
  prompt: string;
  mediaType: 'image' | 'video';
  coverUrl: string;
  mediaUrl?: string;
  mode: CreativeTemplateMode;
  category: string;
  duration?: string;
  targetFeature?: string;
  usageType?: string;
  displayConfig?: Record<string, unknown> | null;
  canUse?: boolean;
  canSave?: boolean;
  lockReason?: string;
}

export const mockTemplates = [
  { id: 'skin', title: '护肤品清透海报', author: '@创意工坊', likes: '1.2k', categoryName: '电商主题', templateType: 'image', coverUrl: '', prompt: '清透护肤品商业海报，自然光，高级玻璃质感。' },
  { id: 'drink', title: '夏日气泡饮品主图', author: '@柚子不甜', likes: '966', categoryName: '海报', templateType: 'image', coverUrl: '', prompt: '夏日饮品促销海报，冰爽水汽，高饱和水果色。' },
  { id: 'home', title: '家居场景生活方式图', author: '@生活研究所', likes: '842', categoryName: '详情页', templateType: 'image', coverUrl: '', prompt: '自然光家居生活方式场景，材质温暖，空间干净。' },
  { id: 'video', title: '新品口播短视频分镜', author: '@镜头计划', likes: '689', categoryName: '视频', templateType: 'video', coverUrl: '', prompt: '15秒新品口播短视频，前三秒抓痛点，中段展示卖点。' },
  { id: 'tech', title: '未来科技感产品海报', author: '@银河研究所', likes: '1.1k', categoryName: '海报', templateType: 'image', coverUrl: '', prompt: '未来科技感产品海报，冷色光影，主体清晰。' },
  { id: 'festival', title: '节日祝福视频封面', author: '@节令企划', likes: '756', categoryName: '视频', templateType: 'video', coverUrl: '', prompt: '温暖节日祝福视频封面，仪式感，品牌露出自然。' }
];

export const mockTasks = [
  { id: 1001, type: 'image', title: '夏季饮品促销海报', status: 'success', progress: 100, createdAt: '2026-05-13 14:20', ratio: '4:5', thumbnail: '', prompt: '冰爽饮品促销海报，背景有夏日阳光。' },
  { id: 1002, type: 'video', title: '新品口播视频方案', status: 'success', progress: 100, createdAt: '2026-05-12 18:05', ratio: '9:16', thumbnail: '', prompt: '新品上市口播视频，前三秒突出痛点。' },
  { id: 1003, type: 'image', title: '门店开业宣传图', status: 'processing', progress: 62, createdAt: '2026-05-13 15:05', ratio: '1:1', thumbnail: '', prompt: '门店开业活动宣传图，突出限时福利。' }
];

export const sceneOptions = ['商品推广', '门店宣传', '活动促销', '品牌介绍', '新品发布', '节日祝福'];

export const textImageTemplates: CreativeTemplate[] = [
  {
    id: 'textimg-detail-doll',
    title: '根据产品生成商品详情图',
    tags: ['图生图', '电商', '详情页'],
    prompt: '根据图中产品生成商品详情页，主体清晰，包含卖点拆解、材质展示、尺寸说明和场景氛围。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'text2img',
    category: '详情页'
  },
  {
    id: 'textimg-poster-drink',
    title: '夏日饮品促销海报',
    tags: ['文生图', '海报', '电商'],
    prompt: '夏日饮品促销海报，冰块、水汽、明亮阳光，产品居中，标题醒目，适合小程序投放。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'text2img',
    category: '海报'
  },
  {
    id: 'textimg-tech-product',
    title: '科技产品主视觉',
    tags: ['文生图', '科技', '主图'],
    prompt: '未来科技感产品主视觉，冷色灯光，背景简洁，主体边缘光清晰，突出高级质感。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'text2img',
    category: '主图'
  }
];

export const imageToImageTemplates: CreativeTemplate[] = [
  {
    id: 'img2img-product-detail',
    title: '根据产品生成商品详情图',
    tags: ['图生图', '电商', '详情页'],
    prompt: '保留上传产品主体，生成商品详情图，补充卖点卡片、细节放大、参数说明和生活场景。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'img2img',
    category: '详情页'
  },
  {
    id: 'img2img-scene-lifestyle',
    title: '产品生活方式场景图',
    tags: ['图生图', '场景', '种草'],
    prompt: '保留产品外观，将产品放入自然生活方式场景，光线柔和，构图干净，有高级感。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'img2img',
    category: '场景'
  },
  {
    id: 'img2img-hero-light',
    title: '产品细节光影大片',
    tags: ['图生图', '光影', '主图'],
    prompt: '保留上传产品主体，生成商业摄影光影大片，突出材质、边缘光和精致细节。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'img2img',
    category: '主图'
  }
];

export const imageEditTemplates: CreativeTemplate[] = [
  {
    id: 'edit-background-studio',
    title: '替换高级摄影棚背景',
    tags: ['图片编辑', '换背景', '商业'],
    prompt: '将图片背景替换为高级商业摄影棚，保留主体不变，光影自然，边缘干净。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'edit',
    category: '换背景'
  },
  {
    id: 'edit-clean-watermark',
    title: '去除瑕疵并提升清晰度',
    tags: ['图片编辑', '修图', '清晰度'],
    prompt: '去除画面瑕疵和干扰元素，提升主体清晰度，保持真实自然不过度锐化。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'edit',
    category: '修图'
  },
  {
    id: 'edit-expand-poster',
    title: '扩展为商品海报构图',
    tags: ['图片编辑', '扩图', '海报'],
    prompt: '保留主体，扩展画面为商品海报构图，补充留白、背景层次和投放文案区域。',
    mediaType: 'image',
    coverUrl: '',
    mode: 'edit',
    category: '扩图'
  }
];

export const videoInspirationTemplates = [
  {
    id: 'video-shoes-run',
    name: '运动鞋跑步短片',
    title: '运动鞋跑步短片',
    tags: ['图生视频', '电商', '5s'],
    duration: '5s',
    cover: '',
    coverUrl: '',
    mediaType: 'video',
    mode: 'img2video',
    category: '电商',
    prompt: '一双白色运动鞋在阳光沙滩上起跑，镜头从鞋面细节推到奔跑动作，节奏轻快，突出轻盈透气。'
  },
  {
    id: 'video-summer-beach',
    name: '夏日海边场景',
    title: '夏日海边场景',
    tags: ['文生视频', '场景', '10s'],
    duration: '10s',
    cover: '',
    coverUrl: '',
    mediaType: 'video',
    mode: 'text2video',
    category: '场景',
    prompt: '海边蓝天与沙滩场景，产品自然置入，镜头缓慢推进，画面清爽明亮，适合夏季营销视频。'
  },
  {
    id: 'video-host-show',
    name: '人物展示口播',
    title: '人物展示口播',
    tags: ['文生视频', '口播', '10s'],
    duration: '10s',
    cover: '',
    coverUrl: '',
    mediaType: 'video',
    mode: 'text2video',
    category: '口播',
    prompt: '人物面对镜头自然展示产品，前三秒快速吸引注意，中段展示卖点，结尾给出行动引导。'
  },
  {
    id: 'video-valley-camera',
    name: '山谷风景运镜',
    title: '山谷风景运镜',
    tags: ['文生视频', '运镜', '15s'],
    duration: '15s',
    cover: '',
    coverUrl: '',
    mediaType: 'video',
    mode: 'text2video',
    category: '运镜',
    prompt: '开阔自然风景中进行流畅运镜，产品或品牌以轻量方式出现，整体高级、舒展、有呼吸感。'
  },
  {
    id: 'video-unbox',
    name: '新品开箱展示',
    title: '新品开箱展示',
    tags: ['图生视频', '开箱', '10s'],
    duration: '10s',
    cover: '',
    coverUrl: '',
    mediaType: 'video',
    mode: 'img2video',
    category: '开箱',
    prompt: '新品从包装中自然露出，镜头突出材质、细节和使用瞬间，节奏干净利落，适合电商短视频。'
  }
];

export const uploadTypes = [
  { type: 'product', label: '主图', desc: '支持 JPG/PNG/WEBP', hint: '建议≤10MB' },
  { type: 'reference', label: '参考图', desc: '支持 JPG/PNG', hint: '建议≤10MB' }
];

export const profileCreationActions = [
  { id: 'image', title: 'AI生图', sub: '智能生成高质量图片', icon: 'image' },
  { id: 'video', title: 'AI视频', sub: '一键生成创意视频', icon: 'video' },
  { id: 'manga', title: 'AI漫剧', sub: 'AI生成漫画与故事', icon: 'manga' },
  { id: 'pointsDetail', title: '积分详情', sub: '查看积分收支明细', icon: 'points' }
];

export const profileMenuItems = [
  { id: 'tasks', title: '积分任务', desc: '每日奖励' },
  { id: 'service', title: '联系客服', desc: '' },
  { id: 'help', title: '使用帮助', desc: '' },
  { id: 'agreement', title: '用户协议', desc: '' }
];

export const memberPackages = [
  { id: 'month', name: '月度会员', price: '29', unit: '/月', origin: '原价 ¥49', tag: '' },
  { id: 'year', name: '年度会员', price: '199', unit: '/年', origin: '原价 ¥399', tag: '推荐' },
  { id: 'forever', name: '永久会员', price: '399', unit: '', origin: '一次开通', tag: '限时' }
];

export const memberRights = [
  { id: 'quality', name: '高清画质', month: '2K', year: '2K', forever: '2K' },
  { id: 'video', name: 'AI视频', month: '30次', year: '500次', forever: '不限' },
  { id: 'manga', name: 'AI漫剧', month: '10次', year: '160次', forever: '不限' },
  { id: 'watermark', name: '去水印', month: '支持', year: '支持', forever: '支持' }
];

export const dailyTasks = [
  { id: 'ad', title: '看广告得积分', sub: '今日还可赚 30 积分', action: '去完成', type: 'ad' },
  { id: 'checkin', title: '每日签到', sub: '连续签到奖励更多', action: '去签到', type: 'checkin' },
  { id: 'invite', title: '邀请好友', sub: '好友注册得积分', action: '去邀请', type: 'invite' }
];
