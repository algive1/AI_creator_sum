<template>
  <view class="screen manga-page">
    <AppTopbar class="app-nav-root" title="AI漫剧" back transparent>
      <template #right>
        <button class="record-entry" @tap="goHistory">
          <view class="record-entry-icon"></view>
          <text>作品库</text>
        </button>
      </template>
    </AppTopbar>

    <view class="manga-hero">
      <view class="hero-copy">
        <view class="hero-title">AI漫剧 · 创意无限</view>
        <view class="hero-subtitle">输入你的故事，AI帮你生成漫画</view>
        <button class="hero-action" @tap="startCreate">立即创作 <text>→</text></button>
      </view>
      <view class="hero-mascot" aria-hidden="true">
        <view class="mascot-orbit"></view>
        <view class="mascot-body">
          <view class="mascot-ear left"></view>
          <view class="mascot-ear right"></view>
          <view class="mascot-face">
            <view class="mascot-eye left"></view>
            <view class="mascot-eye wink"></view>
            <view class="mascot-mouth"></view>
          </view>
        </view>
        <view class="mascot-suit"></view>
        <view class="hero-spark one"></view>
        <view class="hero-spark two"></view>
        <view class="hero-spark three"></view>
      </view>
      <image v-if="comicBannerSource" class="manga-hero-image" :src="comicBannerSource" mode="aspectFill" @error="onComicBannerError" />
    </view>

    <view class="mode-grid">
      <button
        v-for="item in creationModes"
        :key="item.key"
        class="mode-card"
        :class="{ active: activeMode === item.key }"
        @tap="selectCreationMode(item)"
      >
        <view class="mode-icon" :class="`mode-${item.key}`">
          <view class="mode-icon-mark"></view>
        </view>
        <view class="mode-copy">
          <view class="mode-title">{{ item.title }}</view>
          <view class="mode-desc">{{ item.desc }}</view>
        </view>
      </button>
    </view>

    <view class="showcase-section">
      <view class="section-head">
        <view class="section-title">热门作品</view>
        <button class="section-more" @tap="goInspiration">查看更多 <text>›</text></button>
      </view>
      <scroll-view scroll-x class="work-scroll" show-scrollbar="false">
        <view class="work-scroll-inner">
          <button
            v-for="item in hotWorks"
            :key="item.title"
            class="work-card"
            @tap="useHotWork(item)"
          >
            <view class="work-cover" :class="item.theme">
              <view class="work-scene"></view>
              <view class="work-overlay">{{ item.overlay }}</view>
            </view>
            <view class="work-title">{{ item.title }}</view>
            <view class="work-meta">{{ item.category }}</view>
            <view class="work-heat"><text class="fire-mark"></text>{{ item.heat }}</view>
          </button>
        </view>
      </scroll-view>
    </view>

    <view class="script-section">
      <view class="section-head">
        <view class="section-title">精选剧本</view>
        <button class="section-more" @tap="goInspiration">查看更多 <text>›</text></button>
      </view>
      <view class="script-card">
        <button
          v-for="item in scriptPresets"
          :key="item.title"
          class="script-row"
          @tap="useScriptPreset(item)"
        >
          <view class="script-avatar" :class="item.avatarTheme">
            <view class="script-avatar-mark"></view>
          </view>
          <view class="script-main">
            <view class="script-title-row">
              <text class="script-title">{{ item.title }}</text>
              <text v-for="tag in item.tags" :key="tag" class="script-tag">{{ tag }}</text>
            </view>
            <view class="script-desc">{{ item.desc }}</view>
          </view>
          <view class="script-action">去生成</view>
        </button>
      </view>
    </view>

    <view id="creatorPanel" class="creator-panel">
      <view class="pipeline-card"><view class="pipeline-title">漫剧工作流</view><view class="pipeline-steps"><view v-for="(label, key) in pipelineLabels" :key="key" class="pipeline-step" :class="{ active: pipelineStep === key, done: pipelineStepDone(key) }"><view class="pipeline-dot"></view><text>{{ label }}</text></view></view><view class="pipeline-hint">故事与角色 → 可编辑剧本 → 分镜预览 → 视频生成。角色、画风和比例贯穿整个项目。</view></view>
      <view class="creator-head">
        <view>
          <view class="creator-title">开始创作</view>
          <view class="creator-subtitle">选择题材、画风和档位，生成你的漫剧短片</view>
        </view>
        <view class="creator-cost">
          <text v-if="selectedModel?.memberDiscountApplied && selectedModel.basePointsCost > selectedModel.pointsCost" class="tier-base-cost">{{ selectedModel.basePointsCost }}</text>
          {{ selectedModelCost }} 点
        </view>
      </view>

      <view class="form-section">
        <view class="form-title">题材</view>
        <view class="option-grid">
          <view
            v-for="item in genres"
            :key="item"
            class="option-card"
            :class="{ active: selectedGenre === item }"
            @tap="selectedGenre = item"
          >
            {{ item }}
          </view>
        </view>
      </view>

      <view class="form-section">
        <view class="form-title">画面风格</view>
        <view class="chip-row">
          <view
            v-for="item in styles"
            :key="item"
            class="style-chip"
            :class="{ active: selectedStyle === item }"
            @tap="selectedStyle = item"
          >
            {{ item }}
          </view>
        </view>
      </view>

      <view class="form-section">
        <view class="form-title">生成档位</view>
        <view class="model-row">
          <view
            v-for="(item, index) in modelOptions"
            :key="item.tierKey"
            class="model-card"
            :class="{ active: selectedModelIndex === index }"
            @tap="selectModel(index)"
          >
            <view class="model-name">{{ item.tierName }}</view>
            <view class="model-desc">{{ item.description || '适合漫剧短片生成' }}</view>
            <view class="model-price">
              <text v-if="item.memberDiscountApplied && item.basePointsCost > item.pointsCost" class="tier-base-cost">{{ item.basePointsCost }}</text>
              {{ item.pointsCost }} 点
              <text v-if="item.memberDiscountApplied" class="tier-discount">{{ discountLabel(item.memberDiscountPercent) }}</text>
            </view>
          </view>
        </view>
        <view v-if="!modelOptions.length" class="tier-empty">请先在后台配置视频模型档位</view>
      </view>

      <LegacyPromptComposer
        v-model="story"
        class="manga-prompt-section"
        title="剧情梗概"
        :placeholder="promptPlaceholder"
        :max-length="2000"
        :expanded="promptExpanded"
        smart-label="AI写剧本"
        :show-help-button="showPromptGuide"
        @toggle-expanded="promptExpanded = !promptExpanded"
        @help="openPromptGuide"
        @paste="pasteStoryPrompt"
        @select-all="selectAllStoryPrompt"
        @clear="story = ''"
        @smart-fill="smartFillStoryPrompt"
      />

      <view class="pipeline-actions"><button class="pipeline-secondary" :disabled="pipelineBusy" @tap="buildScript">{{ generatedScript ? '重新生成剧本' : '生成剧本' }}</button><button class="pipeline-secondary" :disabled="pipelineBusy || !generatedScript" @tap="buildStoryboard">{{ storyboardShots.length ? '重新拆分分镜' : '生成分镜' }}</button></view>
      <view v-if="generatedScript" class="production-card"><view class="production-head"><text>剧本</text><text>{{ generatedScript.length }} 字</text></view><textarea v-model="generatedScript" class="script-editor" maxlength="8000" auto-height /></view>
      <view v-if="storyboardShots.length" class="production-card"><view class="production-head"><text>分镜预览</text><text>{{ storyboardShots.length }} 镜</text></view><view v-for="(shot, index) in storyboardShots" :key="shot.id" class="shot-row">
          <view class="shot-index">{{ index + 1 }}</view>
          <view class="shot-copy">
            <view class="shot-head"><input v-model="shot.title" class="shot-title-input" /><text class="shot-status">{{ shotStatusLabel(shot.status) }}</text></view>
            <textarea v-model="shot.description" class="shot-description-input" auto-height maxlength="1200" />
            <input v-model="shot.dialogue" class="shot-field" placeholder="对白 / 旁白（可选）" />
            <view class="shot-meta-grid">
              <input v-model="shot.character" class="shot-field" placeholder="出镜角色" />
              <input v-model="shot.scene" class="shot-field" placeholder="场景" />
              <input v-model="shot.shotSize" class="shot-field" placeholder="景别，如近景" />
              <input v-model="shot.camera" class="shot-field" placeholder="运镜，如缓慢推进" />
            </view>
            <view v-if="shot.outputUrl" class="shot-output"><video v-if="isVideoOutput(shot.outputUrl)" :src="shot.outputUrl" :poster="shot.thumbnail" controls object-fit="cover" /><image v-else :src="shot.outputUrl" mode="aspectFill" /></view>
            <view class="shot-actions"><button class="generate" :disabled="shot.status === 'generating'" @tap="generateShot(index)">{{ shot.status === 'generating' ? '生成中' : (shot.taskId ? '重新生成' : '生成镜头') }}</button><button @tap="openShotResult(shot)">查看</button><button @tap="moveShot(index, -1)">上移</button><button @tap="moveShot(index, 1)">下移</button><button @tap="duplicateShot(index)">复制</button><button class="danger" @tap="removeShot(index)">删除</button></view>
          </view>
        </view>
        <view class="batch-generation-bar"><view><text>待生成 {{ pendingShotCount }} 镜</text><text>预计 {{ batchEstimatedPoints }} 点</text></view><button :disabled="!pendingShotCount" @tap="generatePendingShots">批量生成待完成镜头</button></view>
        <button class="add-shot-button" @tap="addShot">＋ 添加镜头</button></view>
      <view class="form-section">
        <view class="form-title">角色设定</view>
        <input v-model="character" class="character-input" placeholder="主角身份、性格、服装或关键关系" placeholder-class="field-placeholder" />
        <view class="scene-library">
          <view class="character-library-head"><text>场景资产库</text><button @tap="addSceneAsset">＋ 新场景</button></view>
          <view v-for="(sceneAsset, sceneIndex) in sceneLibrary" :key="sceneAsset.id" class="character-asset">
            <view class="character-asset-media" @tap="chooseSceneReference(sceneIndex)"><image v-if="sceneAsset.referenceUrl" :src="sceneAsset.referenceUrl" mode="aspectFill" /><text v-else>场景图</text></view>
            <view class="character-asset-fields"><input v-model="sceneAsset.name" placeholder="场景名" /><textarea v-model="sceneAsset.description" auto-height placeholder="固定空间、光线、陈设、时间氛围" /></view>
            <button class="character-asset-delete" @tap="removeSceneAsset(sceneIndex)">删除</button>
          </view>
        </view>
        <view class="character-library">
          <view class="character-library-head"><text>角色资产库</text><button @tap="addCharacterAsset">＋ 新角色</button></view>
          <view v-for="(role, roleIndex) in characterLibrary" :key="role.id" class="character-asset">
            <view class="character-asset-media" @tap="chooseRoleReference(roleIndex)"><image v-if="role.referenceUrl" :src="role.referenceUrl" mode="aspectFill" /><text v-else>参考图</text></view>
            <view class="character-asset-fields"><input v-model="role.name" placeholder="角色名" /><textarea v-model="role.description" auto-height placeholder="固定外貌、发型、服装、年龄等" /></view>
            <button class="character-asset-delete" @tap="removeCharacterAsset(roleIndex)">删除</button>
          </view>
        </view>
        <view class="character-reference-card">
          <view class="character-reference-copy"><text class="character-reference-title">角色参考图</text><text class="character-reference-desc">{{ characterReferenceHint }}</text></view>
          <view class="character-reference-media" @tap="chooseCharacterReference"><image v-if="characterReferenceUrl" :src="characterReferenceUrl" mode="aspectFill" /><text v-else>＋ 上传</text></view>
          <button v-if="characterReferenceUrl" class="character-reference-remove" @tap.stop="clearCharacterReference">移除</button>
        </view>
      </view>

      <view class="form-section form-inline">
        <view class="inline-group">
          <view class="form-title">比例</view>
          <view class="segmented">
            <view
              v-for="item in comicRatios"
              :key="item"
              class="segment"
              :class="{ active: selectedRatio === item }"
              @tap="selectedRatio = item"
            >
              {{ item }}
            </view>
          </view>
        </view>
        <view class="inline-group">
          <view class="form-title">时长</view>
          <view class="segmented">
            <view
              v-for="item in comicDurations"
              :key="item"
              class="segment"
              :class="{ active: selectedDuration === item }"
              @tap="selectedDuration = item"
            >
              {{ item }}
            </view>
          </view>
        </view>
      </view>

      <view class="generate-button" :class="{ disabled: comicMaintenanceMode }" @tap="submitManga">
        {{ comicMaintenanceMode ? '正在开发' : '生成漫剧' }}
      </view>
    </view>

    <AppDialogHost />
    <AppTabBar class="app-nav-root" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppTopbar from '@/components/common/AppTopbar.vue';
import AppDialogHost from '@/components/common/AppDialogHost.vue';
import LegacyPromptComposer from '@/components/legacy/LegacyPromptComposer.vue';
import { createComicTask, generateComicScript, generateComicStoryboard } from '@/api/comic';
import { getTasksByIds } from '@/api/task';
import { isTaskCompleted, isTaskFailed, isTaskProcessing, taskOutputList, taskThumbnailOf } from '@/utils/task-display';
import { getVideoModels } from '@/api/ai-video';
import { uploadAsset } from '@/api/upload';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { PAGE_ROUTES } from '@/utils/constants';
import { readPersistentCache, writePersistentCache } from '@/utils/persistent-cache';
import { assertPrompt } from '@/utils/validator';
import { isDevFallbackEnabled, warnDevFallback } from '@/utils/dev-fallback';
import { discountLabel } from '@/utils/member';
import { homeEntryDisabledMessage, isHomeEntryMaintenanceMode } from '@/utils/home-entry';
import { createShareMessage, createShareTimeline, enableShareMenu } from '@/utils/share';
import { ensureLoggedIn } from '@/utils/login-guard';
import { showAppDialog } from '@/utils/app-dialog';
import { getPromptGuide, hasPromptGuideDialog } from '@/utils/prompt-guide';

const genres = ['都市逆袭', '古风权谋', '奇幻冒险', '甜宠治愈'];
const styles = ['国漫精致', '赛博霓虹', '水彩电影', '厚涂幻想'];
const FALLBACK_COMIC_RATIOS = ['9:16', '16:9', '1:1'];
const FALLBACK_COMIC_DURATIONS = ['15秒', '30秒', '60秒'];
type CreationMode = {
  key: 'text' | 'image' | 'script';
  title: string;
  desc: string;
};
type HotWork = {
  title: string;
  category: string;
  heat: string;
  overlay: string;
  theme: string;
  genre: string;
  style: string;
  character: string;
  story: string;
};
type ScriptPreset = {
  title: string;
  desc: string;
  tags: string[];
  avatarTheme: string;
  genre: string;
  style: string;
  character: string;
  story: string;
};
const creationModes: CreationMode[] = [
  { key: 'text', title: '文生漫剧', desc: '输入故事生成漫画' },
  { key: 'image', title: '图生漫剧', desc: '导入图片生成漫画' },
  { key: 'script', title: '剧本创作', desc: 'AI帮你写剧本' }
];
const hotWorks: HotWork[] = [
  {
    title: '星河与你',
    category: '恋爱 · 校园',
    heat: '8.7w',
    overlay: '星河与你',
    theme: 'theme-romance',
    genre: '甜宠治愈',
    style: '国漫精致',
    character: '温柔学霸与转校少女，在校园天文社共同追逐流星雨。',
    story: '校园天文社即将被取消，转校少女和温柔学霸约定拍下百年一遇的流星雨。两人在准备观测的过程中逐渐靠近，却发现流星雨当天隐藏着一封来自过去的告白信。'
  },
  {
    title: '守护者联盟',
    category: '奇幻 · 冒险',
    heat: '6.3w',
    overlay: '守护者联盟',
    theme: 'theme-guardian',
    genre: '奇幻冒险',
    style: '厚涂幻想',
    character: '沉默守护者、机械猎手和会说话的影子伙伴。',
    story: '城市边缘的封印突然破裂，沉默守护者被迫召集旧日伙伴。机械猎手不愿再战，会说话的影子却带来新的预言：真正的敌人藏在守护者联盟内部。'
  },
  {
    title: '末日生存手册',
    category: '科幻 · 末世',
    heat: '5.1w',
    overlay: '末日生存',
    theme: 'theme-apocalypse',
    genre: '奇幻冒险',
    style: '赛博霓虹',
    character: '冷静的废土向导和拥有修复能力的少年。',
    story: '废土向导接到一份失落手册，手册会自动写出未来一天的危险。她带着拥有修复能力的少年穿过城市废墟，却发现手册正在把他们引向一场无法回避的选择。'
  },
  {
    title: '时光之旅',
    category: '穿越 · 奇幻',
    heat: '4.2w',
    overlay: '时光之旅',
    theme: 'theme-time',
    genre: '古风权谋',
    style: '水彩电影',
    character: '误入古代画卷的现代插画师和神秘少将军。',
    story: '现代插画师修复一幅古画时被卷入画中世界。她必须用画笔改变即将发生的战局，少将军却发现她每画下一笔，现实中的记忆就会消失一段。'
  }
];
const scriptPresets: ScriptPreset[] = [
  {
    title: '我在异世界当团宠',
    desc: '意外穿越异世界，成为团宠的欢乐日常...',
    tags: ['穿越', '奇幻', '搞笑'],
    avatarTheme: 'avatar-cat',
    genre: '奇幻冒险',
    style: '国漫精致',
    character: '嘴硬心软的普通女孩，身边有会撒娇的魔法伙伴。',
    story: '普通女孩醒来后发现自己成了异世界唯一能听懂魔兽说话的人。她只想低调回家，却被不同阵营误认为预言中的团宠救世主，每一次逃跑都会意外解决一个大危机。'
  },
  {
    title: '总裁的契约甜妻',
    desc: '一场契约婚姻，开启甜蜜恋爱的故事...',
    tags: ['恋爱', '都市'],
    avatarTheme: 'avatar-romance',
    genre: '都市逆袭',
    style: '国漫精致',
    character: '独立设计师和外冷内热的年轻总裁。',
    story: '独立设计师为了拯救工作室签下一份契约婚姻。她以为这只是商业合作，却在一次次危机里发现总裁隐藏的温柔，也发现合约背后另有一场家族博弈。'
  },
  {
    title: '神秘学院的秘密',
    desc: '学院里隐藏的秘密，等待你来揭开...',
    tags: ['校园', '悬疑', '奇幻'],
    avatarTheme: 'avatar-mystery',
    genre: '奇幻冒险',
    style: '厚涂幻想',
    character: '新入学的观察型少女和总在午夜出现的图书管理员。',
    story: '少女进入一所只在雾中出现的学院，发现每间教室都对应一个学生的秘密。午夜图书管理员交给她一把钥匙，要求她在天亮前找到消失的第十三间教室。'
  }
];
const pipelineLabels = { idea: '故事', script: '剧本', storyboard: '分镜', generate: '生成' } as const;
const selectedGenre = ref(genres[0]);
const selectedStyle = ref(styles[0]);
const selectedRatio = ref(FALLBACK_COMIC_RATIOS[0]);
const selectedDuration = ref(FALLBACK_COMIC_DURATIONS[1]);
const story = ref('');
const character = ref('');
const promptExpanded = ref(false);
const pipelineStep = ref<'idea' | 'script' | 'storyboard' | 'generate'>('idea');
const generatedScript = ref('');
type ComicShot = {
  id: string;
  title: string;
  description: string;
  dialogue?: string;
  character?: string;
  scene?: string;
  shotSize?: string;
  camera?: string;
  status: 'draft' | 'ready' | 'generating' | 'done' | 'failed';
  taskId?: number;
  outputUrl?: string;
  thumbnail?: string;
  generationFingerprint?: string;
};
const storyboardShots = ref<ComicShot[]>([]);
const pipelineBusy = ref(false);
const COMIC_DRAFT_CACHE_KEY = 'ai_creator_comic_studio_draft_v2';
const COMIC_MODEL_CACHE_KEY = 'ai_creator_comic_models_v2';
const activeMode = ref<CreationMode['key']>('text');
const configStore = useConfigStore();
const authStore = useAuthStore();
const comicBannerFailed = ref(false);
const storyboardGenerateEnabled = computed(() => configStore.features.storyboardGenerate !== false);
const comicMaintenanceMode = computed(() => isHomeEntryMaintenanceMode(configStore.publicConfig, 'comic'));
const comicMaintenanceMessage = computed(() => homeEntryDisabledMessage(configStore.publicConfig, 'comic'));
const defaultPromptPlaceholder = '例如：普通少女误入异能学院，发现自己能听见画面里的旁白。';
const currentPromptGuide = computed(() => getPromptGuide(configStore.publicConfig, 'comic.story', defaultPromptPlaceholder));
const promptPlaceholder = computed(() => currentPromptGuide.value.placeholder);
const showPromptGuide = computed(() => hasPromptGuideDialog(currentPromptGuide.value));
type ModelTier = {
  tierKey: string;
  tierName: string;
  description: string;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  capabilities?: {
    ratios?: string[];
    durations?: string[];
    maxReferenceImages?: number;
    referenceUploadMode?: string;
  };
};
const models = ref<Record<string, unknown>[]>([]);
const selectedModelIndex = ref(1);
const fallbackModels: ModelTier[] = [
  { tierKey: 'video_standard', tierName: '标准生视频', description: '适合短漫剧和剧情草稿', basePointsCost: 5, pointsCost: 5, memberDiscountPercent: 100, memberDiscountApplied: false },
  { tierKey: 'video_pro', tierName: '专业生视频', description: '更稳定的角色和镜头表现', basePointsCost: 15, pointsCost: 15, memberDiscountPercent: 100, memberDiscountApplied: false },
  { tierKey: 'video_top', tierName: '顶级生视频', description: '高质量复杂分镜生成', basePointsCost: 25, pointsCost: 25, memberDiscountPercent: 100, memberDiscountApplied: false }
];
const modelOptions = computed<ModelTier[]>(() => {
  const source = models.value.map((item) => ({
    tierKey: String(item.tierKey || 'video_standard'),
    tierName: String(item.tierName || '标准生视频'),
    description: String(item.description || ''),
    basePointsCost: Number(item.basePointsCost || item.pointsCost || 5),
    pointsCost: Number(item.pointsCost || 5),
    memberDiscountPercent: Number(item.memberDiscountPercent || 100),
    memberDiscountApplied: Boolean(item.memberDiscountApplied),
    capabilities: normalizeComicCapabilities(item.capabilities)
  }));
  if (source.length) return source.slice(0, 3);
  return isDevFallbackEnabled ? fallbackModels : [];
});

type ComicCharacter = { id: string; name: string; description: string; referenceUrl?: string; referenceFileId?: number };
type ComicScene = { id: string; name: string; description: string; referenceUrl?: string; referenceFileId?: number };
const sceneLibrary = ref<ComicScene[]>([]);
const characterLibrary = ref<ComicCharacter[]>([]);
const characterReferenceUrl = ref('');
const characterReferenceFileId = ref<number | undefined>(undefined);
const supportsCharacterReference = computed(() => {
  const caps = selectedModel.value?.capabilities;
  return Number(caps?.maxReferenceImages || 0) > 0 && ['reference_images', 'first_frame', 'first_last'].includes(String(caps?.referenceUploadMode || ''));
});
const characterReferenceHint = computed(() => supportsCharacterReference.value
  ? '当前模型支持参考图，生成镜头时会携带它提高人物一致性。'
  : '当前模型未声明参考图能力；仅使用角色文字设定，不伪装支持参考图。');


function addSceneAsset() { sceneLibrary.value.push({ id: 'scene-' + Date.now(), name: '新场景', description: '' }); saveComicDraft(); }
function removeSceneAsset(index: number) { sceneLibrary.value.splice(index, 1); saveComicDraft(); }
function chooseSceneReference(index: number) {
  const sceneAsset = sceneLibrary.value[index]; if (!sceneAsset) return;
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (res) => {
    const path = res.tempFilePaths?.[0]; if (!path) return;
    try {
      const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
      sceneAsset.referenceUrl = String(uploaded.url || uploaded.fileUrl || uploaded.cdnUrl || path);
      sceneAsset.referenceFileId = Number(uploaded.fileId || uploaded.id || 0) || undefined; saveComicDraft();
    } catch { uni.showToast({ title: '场景参考图上传失败', icon: 'none' }); }
  }});
}
function matchedScene(shot: ComicShot) {
  const name = String(shot.scene || '').trim(); if (!name) return undefined;
  return sceneLibrary.value.find((sceneAsset) => sceneAsset.name === name || sceneAsset.name.includes(name) || name.includes(sceneAsset.name));
}
function shotReferenceAssets(shot: ComicShot) {
  if (!supportsCharacterReference.value) return [] as number[];
  const ids = [...shotCharacters(shot).map((role) => role.referenceFileId), matchedScene(shot)?.referenceFileId]
    .filter((id): id is number => Boolean(id));
  if (!ids.length && characterReferenceFileId.value) ids.push(characterReferenceFileId.value);
  return ids.slice(0, Number(selectedModel.value?.capabilities?.maxReferenceImages || 1));
}
const pendingShotCount = computed(() => storyboardShots.value.filter((shot) => shot.status !== 'done' && shot.status !== 'generating' && shot.description.trim()).length);
const batchEstimatedPoints = computed(() => pendingShotCount.value * selectedModelCost.value);
async function generatePendingShots() {
  const indexes = storyboardShots.value.map((shot, index) => ({ shot, index }))
    .filter(({ shot }) => shot.status !== 'done' && shot.status !== 'generating' && shot.description.trim()).map(({ index }) => index);
  if (!indexes.length) { uni.showToast({ title: '没有待生成镜头', icon: 'none' }); return; }
  const confirmed = await new Promise<boolean>((resolve) => uni.showModal({
    title: '批量生成 ' + indexes.length + ' 个镜头',
    content: '按当前模型预计最多消耗 ' + batchEstimatedPoints.value + ' 点。已完成和生成中的镜头不会重复提交。',
    confirmText: '开始生成', success: (res) => resolve(Boolean(res.confirm)), fail: () => resolve(false)
  }));
  if (!confirmed) return;
  let submitted = 0; let failed = 0;
  for (const index of indexes) {
    try { await generateShot(index, { silent: true }); submitted += 1; }
    catch { failed += 1; }
  }
  saveComicDraft();
  uni.showModal({
    title: '批量提交完成',
    content: failed ? ('成功提交 ' + submitted + ' 镜，失败 ' + failed + ' 镜。失败镜头已保留，可单独重试。') : ('已成功提交 ' + submitted + ' 个镜头，离开页面后任务仍会继续。'),
    showCancel: false
  });
}

function addCharacterAsset() {
  characterLibrary.value.push({ id: 'character-' + Date.now(), name: '新角色', description: '' }); saveComicDraft();
}
function removeCharacterAsset(index: number) { characterLibrary.value.splice(index, 1); saveComicDraft(); }
function chooseRoleReference(index: number) {
  const role = characterLibrary.value[index]; if (!role) return;
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (res) => {
    const path = res.tempFilePaths?.[0]; if (!path) return;
    try {
      const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
      role.referenceUrl = String(uploaded.url || uploaded.fileUrl || uploaded.cdnUrl || path);
      role.referenceFileId = Number(uploaded.fileId || uploaded.id || 0) || undefined; saveComicDraft();
    } catch { uni.showToast({ title: '角色参考图上传失败', icon: 'none' }); }
  }});
}
function shotCharacters(shot: ComicShot) {
  const names = String(shot.character || '').split(/[、,，/]/).map((v) => v.trim()).filter(Boolean);
  return characterLibrary.value.filter((role) => names.some((name) => role.name === name || role.name.includes(name) || name.includes(role.name)));
}
function shotCharacterBible(shot: ComicShot) {
  const matched = shotCharacters(shot);
  return matched.length ? matched.map((role) => role.name + '：' + role.description).join('；') : character.value;
}
function shotReferenceFileIds(shot: ComicShot) {
  if (!supportsCharacterReference.value) return [] as number[];
  return shotReferenceAssets(shot);
}

async function chooseCharacterReference() {
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (res) => {
    const path = res.tempFilePaths?.[0]; if (!path) return;
    try {
      const uploaded = await uploadAsset<Record<string, unknown>>(path, 'ref_image', 'public');
      characterReferenceUrl.value = String(uploaded.url || uploaded.fileUrl || uploaded.cdnUrl || path);
      characterReferenceFileId.value = Number(uploaded.fileId || uploaded.id || 0) || undefined; saveComicDraft();
    } catch { uni.showToast({ title: '角色参考图上传失败', icon: 'none' }); }
  }});
}
function clearCharacterReference() { characterReferenceUrl.value = ''; characterReferenceFileId.value = undefined; saveComicDraft(); }

const selectedModel = computed(() => modelOptions.value[selectedModelIndex.value] || modelOptions.value[0]);
const selectedModelCost = computed(() => Number(selectedModel.value?.pointsCost || 0));
const comicRatios = computed(() => selectedModel.value?.capabilities?.ratios?.length
  ? selectedModel.value.capabilities.ratios
  : FALLBACK_COMIC_RATIOS);
const comicDurations = computed(() => selectedModel.value?.capabilities?.durations?.length
  ? selectedModel.value.capabilities.durations
  : FALLBACK_COMIC_DURATIONS);
const visualAssets = computed(() => {
  const value = configStore.publicConfig?.visualAssets;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const comicBannerSource = computed(() => {
  const url = String(visualAssets.value.comicBannerUrl || '').trim();
  return url && !comicBannerFailed.value ? url : '';
});

onShow(async () => {
  enableShareMenu();
  await authStore.hydrate();
  configStore.hydrate();
  await configStore.loadPublicConfig().catch(() => undefined);
  restoreComicDraft();
  syncShotTasks().catch(() => undefined);
  if (comicMaintenanceMode.value) {
    showComicMaintenanceMessage();
  }
  if (!storyboardGenerateEnabled.value) {
    handleStoryboardDisabled();
    return;
  }
  const cachedComicModels = readPersistentCache<Record<string, unknown>[]>(COMIC_MODEL_CACHE_KEY, 24 * 60 * 60_000);
  if (cachedComicModels?.length) { models.value = cachedComicModels; selectedModelIndex.value = middleModelIndex(); normalizeComicParams(); }
  getVideoModels().then((res) => {
    const list = Array.isArray(res.list) ? res.list as Record<string, unknown>[] : [];
    if (!list.length && isDevFallbackEnabled) warnDevFallback('comic-tiers', 'GET /public/model-tiers returned empty list');
    models.value = list;
    if (list.length) writePersistentCache(COMIC_MODEL_CACHE_KEY, list);
    selectedModelIndex.value = middleModelIndex();
    normalizeComicParams();
  }).catch(() => {
    if (isDevFallbackEnabled) warnDevFallback('comic-tiers', 'GET /public/model-tiers failed');
    models.value = [];
    selectedModelIndex.value = middleModelIndex();
    normalizeComicParams();
  });
});

watch(() => selectedModel.value?.tierKey, () => { normalizeComicParams(); invalidateStaleShotAssets(); });
watch([selectedStyle, selectedRatio, characterLibrary, sceneLibrary, storyboardShots], invalidateStaleShotAssets, { deep: true });
watch([story, character, selectedGenre, selectedStyle, selectedRatio, selectedDuration, generatedScript, storyboardShots], saveComicDraft, { deep: true });

onShareAppMessage(() => createShareMessage({
  title: '用 AI 创作漫画短剧',
  path: PAGE_ROUTES.comic
}));

onShareTimeline(() => createShareTimeline({
  title: '用 AI 创作漫画短剧',
  path: PAGE_ROUTES.comic
}));

function handleStoryboardDisabled() {
  models.value = [];
  uni.showToast({ title: 'AI漫剧功能已关闭', icon: 'none' });
  setTimeout(() => {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      uni.navigateBack();
      return;
    }
    uni.reLaunch({ url: PAGE_ROUTES.home });
  }, 300);
}

async function goHistory() {
  if (!authStore.isLoggedIn) {
    const loggedIn = await ensureLoggedIn({
      title: '登录后查看作品库',
      subtitle: '登录并授权手机号后，可查看你的漫画和视频作品。'
    });
    if (!loggedIn) return;
  }
  uni.reLaunch({ url: PAGE_ROUTES.history });
}

function onComicBannerError() {
  comicBannerFailed.value = true;
}

function goInspiration() {
  uni.reLaunch({ url: PAGE_ROUTES.inspiration });
}

function startCreate() {
  if (comicMaintenanceMode.value) {
    showComicMaintenanceMessage();
  }
  promptExpanded.value = true;
  setTimeout(() => {
    uni.pageScrollTo({ scrollTop: 1080, duration: 260 });
  }, 30);
}

function selectCreationMode(item: CreationMode) {
  if (item.key === 'image') {
    uni.showToast({ title: '图生漫剧能力待接入', icon: 'none' });
    return;
  }
  activeMode.value = item.key;
  if (item.key === 'script' && !story.value.trim()) smartFillStoryPrompt();
  startCreate();
}

function useHotWork(item: HotWork) {
  selectedGenre.value = item.genre;
  selectedStyle.value = item.style;
  character.value = item.character;
  story.value = item.story;
  activeMode.value = 'text';
  startCreate();
}

function useScriptPreset(item: ScriptPreset) {
  selectedGenre.value = item.genre;
  selectedStyle.value = item.style;
  character.value = item.character;
  story.value = item.story;
  activeMode.value = 'script';
  startCreate();
  uni.showToast({ title: '已填入精选剧本', icon: 'none' });
}

function openPromptGuide() {
  const guide = currentPromptGuide.value;
  if (!hasPromptGuideDialog(guide)) return;
  showAppDialog({
    variant: 'generic',
    title: guide.title,
    subtitle: guide.subtitle,
    hideVisual: true,
    richContent: guide.contentHtml || undefined,
    content: guide.contentHtml ? undefined : guide.copyText,
    primaryLabel: '我知道了',
    secondaryLabel: '查看完整帮助',
    minorLabel: guide.copyText ? guide.copyLabel : undefined,
    closeOnMinor: false,
    onMinor: () => {
      if (!guide.copyText) return false;
      uni.setClipboardData({ data: guide.copyText, success: () => uni.showToast({ title: '已复制示例', icon: 'success' }) });
      return false;
    },
    onSecondary: () => {
      const helpId = guide.helpId ? `&helpId=${encodeURIComponent(guide.helpId)}` : '';
      uni.navigateTo({ url: `/pages/agreement/index?type=help${helpId}` });
    }
  });
}

function pasteStoryPrompt() {
  uni.getClipboardData({
    success: (res) => {
      const content = res.data || '';
      if (!content) {
        uni.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      const nextStory = story.value ? `${story.value}\n${content}` : content;
      story.value = nextStory.slice(0, 2000);
      uni.showToast({ title: nextStory.length > 2000 ? '已粘贴，超出部分已截断' : '已粘贴', icon: 'none' });
    },
    fail: () => uni.showToast({ title: '读取剪贴板失败', icon: 'none' })
  });
}

function selectAllStoryPrompt() {
  uni.showToast({ title: '已选中提示词，可继续编辑', icon: 'none' });
}

function smartFillStoryPrompt() {
  const role = character.value.trim() || '主角拥有鲜明目标和反差性格';
  story.value = `${selectedGenre.value}题材，${selectedStyle.value}画风，主角设定：${role}。请生成一段适合${selectedRatio.value}比例、${selectedDuration.value}动态漫剧的剧情提示词，开头有强钩子，中段冲突升级，结尾留下继续观看的悬念。`;
}

async function submitManga() {
  if (comicMaintenanceMode.value) {
    showComicMaintenanceMessage();
    return;
  }
  if (!storyboardGenerateEnabled.value) {
    uni.showToast({ title: 'AI漫剧功能已关闭', icon: 'none' });
    return;
  }
  if (!story.value.trim()) {
    uni.showToast({ title: '请先填写剧情梗概', icon: 'none' });
    return;
  }
  if (!assertPrompt(story.value)) return;
  if (!character.value.trim()) {
    uni.showToast({ title: '请先填写角色设定', icon: 'none' });
    return;
  }
  if (!selectedModel.value) {
    uni.showToast({ title: '请先在后台配置模型档位', icon: 'none' });
    return;
  }
  const loggedIn = await ensureLoggedIn({
    title: '登录后生成漫剧',
    subtitle: '登录并授权手机号后，才能提交漫剧生成任务。'
  });
  if (!loggedIn) return;
  try {
    pipelineStep.value = 'generate';
    const productionPrompt = storyboardShots.value.length ? storyboardShots.value.map((shot, index) => [
      '镜头' + (index + 1) + '：' + shot.description,
      shot.character ? '角色：' + shot.character : '',
      shot.scene ? '场景：' + shot.scene : '',
    matchedScene(shot)?.description ? '场景身份锁定：' + matchedScene(shot)?.description : '',
      shot.shotSize ? '景别：' + shot.shotSize : '',
      shot.camera ? '运镜：' + shot.camera : '',
      shot.dialogue ? '对白/旁白：' + shot.dialogue : ''
    ].filter(Boolean).join('；')).join('\n') : generatedScript.value.trim() || story.value;
    const result = await createComicTask<Record<string, unknown>>({
      prompt: productionPrompt,
      tierKey: selectedModel.value.tierKey,
      videoMode: 'text_to_video',
      ratio: selectedRatio.value,
      duration: selectedDuration.value,
      style: selectedStyle.value,
      autoScript: true,
      params: {
        genre: selectedGenre.value,
        character: character.value,
        sourceStory: story.value,
        script: generatedScript.value,
        storyboard: storyboardShots.value
      }
    });
    const id = Number(result.id || result.taskId);
    if (!Number.isInteger(id) || id <= 0) {
      uni.showToast({ title: '任务提交失败，请稍后重试', icon: 'none' });
      return;
    }
    uni.navigateTo({ url: `${PAGE_ROUTES.result}?id=${id}&type=video` });
  } catch { /* 请求层会展示错误 */ }
}


function pipelineStepDone(key: string) {
  const order = ['idea', 'script', 'storyboard', 'generate'];
  return order.indexOf(key) < order.indexOf(pipelineStep.value);
}
async function buildScript() {
  if (!story.value.trim()) { uni.showToast({ title: '请先填写剧情梗概', icon: 'none' }); return; }
  const loggedIn = await ensureLoggedIn({ title: '登录后生成剧本', subtitle: '剧本与分镜会保存到当前漫剧创作流程。' });
  if (!loggedIn) return;
  pipelineBusy.value = true;
  try {
    const result = await generateComicScript<Record<string, unknown>>({ topic: story.value.trim(), style: selectedStyle.value, duration: selectedDuration.value, characters: character.value.trim() });
    generatedScript.value = extractGeneratedText(result, ['script', 'content', 'text']);
    if (!generatedScript.value) throw new Error('empty script');
    storyboardShots.value = []; pipelineStep.value = 'script';
  } catch { uni.showToast({ title: '剧本生成失败，请稍后重试', icon: 'none' }); }
  finally { pipelineBusy.value = false; }
}
async function buildStoryboard() {
  if (!generatedScript.value.trim()) return;
  pipelineBusy.value = true;
  try {
    const result = await generateComicStoryboard<Record<string, unknown>>({ script: generatedScript.value.trim(), style: selectedStyle.value, ratio: selectedRatio.value });
    storyboardShots.value = normalizeStoryboard(result);
    if (!storyboardShots.value.length) throw new Error('empty storyboard');
    pipelineStep.value = 'storyboard';
  } catch { uni.showToast({ title: '分镜生成失败，请稍后重试', icon: 'none' }); }
  finally { pipelineBusy.value = false; }
}
function extractGeneratedText(result: Record<string, unknown>, keys: string[]) {
  for (const key of keys) { const value = result?.[key]; if (typeof value === 'string' && value.trim()) return value.trim(); }
  return '';
}
function normalizeStoryboard(result: Record<string, unknown>) {
  const source = (result.storyboard || result.shots || result.scenes || result.list) as unknown;
  if (Array.isArray(source)) return source.map((item, index) => {
    const shot = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: String(shot.id || ('shot-' + Date.now() + '-' + index)),
      title: String(shot.title || shot.shot || shot.scene || ('镜头 ' + (index + 1))),
      description: String(shot.description || shot.visual || shot.prompt || shot.content || ''),
      dialogue: String(shot.dialogue || shot.narration || ''),
      character: String(shot.character || shot.characters || ''),
      scene: String(shot.location || shot.sceneName || ''),
      shotSize: String(shot.shotSize || shot.shot_size || shot.framing || ''),
      camera: String(shot.camera || shot.cameraMove || shot.camera_move || ''),
      status: 'ready' as const
    };
  }).filter((item) => item.description || item.dialogue);
  const text = extractGeneratedText(result, ['storyboard', 'content', 'text']);
  return text ? text.split(/\n+/).filter(Boolean).slice(0, 24).map((line, index) => ({
    id: 'shot-' + Date.now() + '-' + index, title: '镜头 ' + (index + 1), description: line, status: 'ready' as const
  })) : [];
}




function shotFingerprint(shot: ComicShot) {
  return JSON.stringify({
    description: shot.description, dialogue: shot.dialogue, character: shot.character, scene: shot.scene,
    shotSize: shot.shotSize, camera: shot.camera, characterBible: shotCharacterBible(shot),
    sceneBible: matchedScene(shot)?.description || '', style: selectedStyle.value, ratio: selectedRatio.value,
    model: selectedModel.value?.tierKey || '', references: shotReferenceFileIds(shot)
  });
}
function invalidateStaleShotAssets() {
  let changed = false;
  for (const shot of storyboardShots.value) {
    if (!shot.taskId || shot.status === 'generating') continue;
    if (shot.generationFingerprint && shot.generationFingerprint !== shotFingerprint(shot)) {
      shot.status = 'draft'; shot.taskId = undefined; shot.outputUrl = ''; shot.thumbnail = ''; shot.generationFingerprint = ''; changed = true;
    }
  }
  if (changed) saveComicDraft();
}

async function syncShotTasks() {
  const taskIds = storyboardShots.value.map((shot) => Number(shot.taskId || 0)).filter((id) => id > 0);
  if (!taskIds.length) return;
  const result = await getTasksByIds<{ list?: Record<string, unknown>[]; records?: Record<string, unknown>[] }>(taskIds);
  const tasks = (result.list || result.records || []) as Record<string, unknown>[];
  const byId = new Map(tasks.map((task) => [Number(task.taskId || task.id || 0), task]));
  let changed = false;
  for (const shot of storyboardShots.value) {
    if (!shot.taskId) continue;
    const task = byId.get(shot.taskId); if (!task) continue;
    const nextStatus: ComicShot['status'] = isTaskCompleted(task) ? 'done' : isTaskFailed(task) ? 'failed' : isTaskProcessing(task) ? 'generating' : shot.status;
    const output = taskOutputList(task)[0] || {};
    const nextUrl = String(output.video || output.url || output.image || shot.outputUrl || '');
    const nextThumbnail = taskThumbnailOf(task) || shot.thumbnail || '';
    if (nextStatus !== shot.status || nextUrl !== shot.outputUrl || nextThumbnail !== shot.thumbnail) {
      shot.status = nextStatus; shot.outputUrl = nextUrl; shot.thumbnail = nextThumbnail; changed = true;
    }
  }
  if (changed) saveComicDraft();
}

function buildShotPrompt(shot: ComicShot, index: number) {
  return [
    '这是同一部漫剧的第' + (index + 1) + '个镜头，请保持人物身份、服装、发型和整体画风连续。',
    shot.description,
    shot.character ? '出镜角色：' + shot.character : '',
    shotCharacterBible(shot) ? '角色身份锁定：' + shotCharacterBible(shot) : '',
    shot.scene ? '场景：' + shot.scene : '',
    shot.shotSize ? '景别：' + shot.shotSize : '',
    shot.camera ? '运镜：' + shot.camera : '',
    shot.dialogue ? '对白/旁白：' + shot.dialogue : '',
    '题材：' + selectedGenre.value,
    '统一画风：' + selectedStyle.value
  ].filter(Boolean).join('；');
}
async function generateShot(index: number, options: { silent?: boolean } = {}) {
  const shot = storyboardShots.value[index];
  if (!shot || !shot.description.trim() || !selectedModel.value) {
    uni.showToast({ title: '请先完善镜头内容', icon: 'none' }); return;
  }
  const loggedIn = await ensureLoggedIn({ title: '登录后生成镜头', subtitle: '每个镜头可以独立生成和重新生成。' });
  if (!loggedIn) return;
  shot.status = 'generating'; shot.outputUrl = ''; shot.thumbnail = ''; saveComicDraft();
  try {
    const result = await createComicTask<Record<string, unknown>>({
      prompt: buildShotPrompt(shot, index), tierKey: selectedModel.value.tierKey, videoMode: 'text_to_video',
      ratio: selectedRatio.value, duration: shotDuration(), style: selectedStyle.value, autoScript: false,
      params: { genre: selectedGenre.value, character: shotCharacterBible(shot), sceneType: 'comic_shot', shotId: shot.id, shotIndex: index,
        ...(shotReferenceFileIds(shot).length ? { referenceFileIds: shotReferenceFileIds(shot), firstFrameFileId: shotReferenceFileIds(shot)[0] } : {}) }
    });
    const id = Number(result.id || result.taskId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('invalid task');
    shot.taskId = id; shot.status = 'generating'; shot.generationFingerprint = shotFingerprint(shot); saveComicDraft();
    uni.showToast({ title: '镜头已提交，可继续编辑其他镜头', icon: 'none' });
  } catch {
    shot.status = 'failed'; saveComicDraft();
  }
}
function shotDuration() {
  const total = Number(String(selectedDuration.value).match(/\d+/)?.[0] || 15);
  const count = Math.max(1, storyboardShots.value.length);
  const seconds = Math.max(3, Math.min(10, Math.round(total / count)));
  return seconds + '秒';
}
function openShotResult(shot: ComicShot) {
  if (!shot.taskId) { uni.showToast({ title: '该镜头还没有生成任务', icon: 'none' }); return; }
  uni.navigateTo({ url: PAGE_ROUTES.result + '?id=' + shot.taskId + '&type=video' });
}
function isVideoOutput(url?: string) { return /\.(mp4|mov|webm)(\?|$)/i.test(String(url || '')); }

function shotStatusLabel(status: ComicShot['status']) {
  return ({ draft: '草稿', ready: '待生成', generating: '生成中', done: '已完成', failed: '失败' })[status];
}
function addShot() {
  storyboardShots.value.push({ id: 'shot-' + Date.now(), title: '镜头 ' + (storyboardShots.value.length + 1), description: '', status: 'draft' });
  pipelineStep.value = 'storyboard';
}
function removeShot(index: number) { storyboardShots.value.splice(index, 1); }
function duplicateShot(index: number) {
  const source = storyboardShots.value[index]; if (!source) return;
  storyboardShots.value.splice(index + 1, 0, { ...source, id: 'shot-' + Date.now(), title: source.title + ' 副本', status: 'draft', taskId: undefined, outputUrl: '', thumbnail: '', generationFingerprint: '' });
}
function moveShot(index: number, delta: number) {
  const target = index + delta; if (target < 0 || target >= storyboardShots.value.length) return;
  const [shot] = storyboardShots.value.splice(index, 1); storyboardShots.value.splice(target, 0, shot);
}

function saveComicDraft() {
  writePersistentCache(COMIC_DRAFT_CACHE_KEY, { story: story.value, character: character.value, genre: selectedGenre.value, style: selectedStyle.value, ratio: selectedRatio.value, duration: selectedDuration.value, script: generatedScript.value, storyboard: storyboardShots.value, step: pipelineStep.value, characterReferenceUrl: characterReferenceUrl.value, characterReferenceFileId: characterReferenceFileId.value, characterLibrary: characterLibrary.value, sceneLibrary: sceneLibrary.value });
}
function restoreComicDraft() {
  const draft = readPersistentCache<Record<string, unknown>>(COMIC_DRAFT_CACHE_KEY, 7 * 24 * 60 * 60_000);
  if (!draft) return;
  if (!story.value) story.value = String(draft.story || '');
  if (!character.value) character.value = String(draft.character || '');
  selectedGenre.value = String(draft.genre || selectedGenre.value); selectedStyle.value = String(draft.style || selectedStyle.value);
  selectedRatio.value = String(draft.ratio || selectedRatio.value); selectedDuration.value = String(draft.duration || selectedDuration.value);
  generatedScript.value = String(draft.script || ''); storyboardShots.value = Array.isArray(draft.storyboard) ? (draft.storyboard as Record<string, unknown>[]).map((shot, index) => ({
    id: String(shot.id || ('shot-restored-' + index)), title: String(shot.title || ('镜头 ' + (index + 1))),
    description: String(shot.description || ''), dialogue: String(shot.dialogue || ''), character: String(shot.character || ''),
    scene: String(shot.scene || ''), shotSize: String(shot.shotSize || ''), camera: String(shot.camera || ''),
    status: ['draft','ready','generating','done','failed'].includes(String(shot.status)) ? String(shot.status) as ComicShot['status'] : 'ready',
    taskId: Number(shot.taskId) || undefined,
    outputUrl: String(shot.outputUrl || ''), thumbnail: String(shot.thumbnail || ''), generationFingerprint: String(shot.generationFingerprint || '')
  })) : [];
  const step = String(draft.step || 'idea'); if (['idea','script','storyboard','generate'].includes(step)) pipelineStep.value = step as 'idea'|'script'|'storyboard'|'generate';
}

function selectModel(index: number) {
  selectedModelIndex.value = index;
  normalizeComicParams();
}

function normalizeComicParams() {
  if (!comicRatios.value.includes(selectedRatio.value)) {
    selectedRatio.value = comicRatios.value[0] || FALLBACK_COMIC_RATIOS[0];
  }
  if (!comicDurations.value.includes(selectedDuration.value)) {
    selectedDuration.value = comicDurations.value[0] || FALLBACK_COMIC_DURATIONS[0];
  }
}

function normalizeComicCapabilities(value: unknown): ModelTier['capabilities'] {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ratios: normalizeComicRatios(source.ratios || source.supportedRatios || source.supported_ratios),
    durations: normalizeComicDurations(source.durations || source.supportedDurations || source.supported_durations),
    maxReferenceImages: Number(source.maxReferenceImages || source.max_reference_images || 0),
    referenceUploadMode: String(source.referenceUploadMode || source.reference_upload_mode || ''),
  };
}

function normalizeComicRatios(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const text = String(item || '').trim();
    const match = text.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!match) return text;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
  }).filter((item, index, list) => item && item !== 'auto' && list.indexOf(item) === index);
}

function normalizeComicDurations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const text = String(item || '').trim();
    if (text.toLowerCase() === 'auto') return '自动';
    const match = text.match(/\d+/);
    return match ? `${match[0]}秒` : text;
  }).filter((item, index, list) => item && list.indexOf(item) === index);
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function showComicMaintenanceMessage() {
  uni.showModal({
    title: '温馨提示',
    content: comicMaintenanceMessage.value,
    showCancel: false,
    confirmText: '知道了'
  });
}

function middleModelIndex() {
  return Math.min(1, Math.max(0, modelOptions.value.length - 1));
}

</script>

<style scoped lang="scss">
.manga-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 0 24rpx calc(160rpx + env(safe-area-inset-bottom));
  background: #f8f6ff;
  color: #1f2437;
}

.manga-page::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 12% 4%, rgba(123, 92, 255, 0.12), transparent 28%),
    radial-gradient(circle at 92% 12%, rgba(255, 92, 184, 0.12), transparent 25%),
    linear-gradient(180deg, #fffaff 0%, #f8f6ff 48%, #f7f8ff 100%);
  content: "";
  pointer-events: none;
}

.manga-page > view:not(.app-nav-root),
.manga-page > scroll-view {
  position: relative;
  z-index: 1;
}

.manga-page button::after {
  border: 0;
}

.record-entry {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  width: 138rpx;
  height: 58rpx;
  padding: 0;
  border-radius: 999rpx;
  background: transparent;
  color: #1f2437;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 58rpx;
  white-space: nowrap;
}

.manga-page :deep(.topbar-title) {
  width: 220rpx;
}

.record-entry-icon {
  position: relative;
  width: 28rpx;
  height: 28rpx;
  border: 4rpx solid #1f2437;
  border-radius: 7rpx;
}

.record-entry-icon::before,
.record-entry-icon::after {
  position: absolute;
  left: 6rpx;
  width: 12rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #1f2437;
  content: "";
}

.record-entry-icon::before { top: 6rpx; }
.record-entry-icon::after { bottom: 6rpx; }

.manga-hero {
  position: relative;
  overflow: hidden;
  height: 288rpx;
  margin-bottom: 24rpx;
  padding: 42rpx 34rpx;
  border: 0;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 84% 80%, rgba(255, 209, 92, 0.44), transparent 18%),
    radial-gradient(circle at 70% 22%, rgba(255, 255, 255, 0.22), transparent 26%),
    linear-gradient(135deg, #6c4bff 0%, #8f5cff 52%, #ff79c2 100%);
  box-shadow: 0 12rpx 12rpx rgba(122, 92, 255, 0.16);
}

.manga-hero::after {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 54% 28%, rgba(255, 255, 255, 0.8) 0 4rpx, transparent 5rpx),
    radial-gradient(circle at 64% 70%, rgba(255, 255, 255, 0.62) 0 5rpx, transparent 6rpx),
    linear-gradient(90deg, rgba(255, 255, 255, 0.18), transparent 58%);
  content: "";
  pointer-events: none;
}

.manga-hero-image {
  position: absolute;
  inset: 0;
  z-index: 8;
  width: 100%;
  height: 100%;
}

.hero-copy {
  position: relative;
  z-index: 3;
  width: 398rpx;
}

.hero-title {
  margin: 0;
  color: #ffffff;
  font-size: 41rpx;
  font-weight: 900;
  line-height: 1.15;
  text-shadow: 0 6rpx 18rpx rgba(64, 34, 186, 0.22);
}

.hero-subtitle {
  margin-top: 20rpx;
  color: rgba(255, 255, 255, 0.9);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.35;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 60rpx;
  margin-top: 28rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #6c4bff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 60rpx;
}

.hero-action text {
  margin-left: 8rpx;
  font-size: 26rpx;
}

.hero-mascot {
  position: absolute;
  right: 28rpx;
  bottom: 14rpx;
  z-index: 2;
  width: 224rpx;
  height: 230rpx;
}

.mascot-orbit {
  position: absolute;
  right: -14rpx;
  bottom: 70rpx;
  width: 210rpx;
  height: 66rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.38);
  border-radius: 50%;
  transform: rotate(-18deg);
}

.mascot-body {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  width: 150rpx;
  height: 132rpx;
  border-radius: 68rpx 68rpx 58rpx 58rpx;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.96) 0 14rpx, transparent 15rpx),
    linear-gradient(180deg, #ffffff 0%, #f7e8ff 100%);
  box-shadow: 0 12rpx 12rpx rgba(90, 52, 210, 0.14);
}

.mascot-ear {
  position: absolute;
  top: -28rpx;
  width: 48rpx;
  height: 54rpx;
  border-radius: 20rpx 20rpx 6rpx 6rpx;
  background: linear-gradient(180deg, #ffffff, #f4e2ff);
}

.mascot-ear::after {
  position: absolute;
  inset: 12rpx 12rpx 10rpx;
  border-radius: 14rpx 14rpx 4rpx 4rpx;
  background: #ffc6e8;
  content: "";
}

.mascot-ear.left {
  left: 16rpx;
  transform: rotate(-18deg);
}

.mascot-ear.right {
  right: 16rpx;
  transform: rotate(18deg);
}

.mascot-face {
  position: absolute;
  inset: 0;
}

.mascot-eye {
  position: absolute;
  top: 55rpx;
  width: 17rpx;
  height: 24rpx;
  border-radius: 999rpx;
  background: #2c167c;
}

.mascot-eye.left { left: 43rpx; }

.mascot-eye.wink {
  right: 38rpx;
  width: 30rpx;
  height: 16rpx;
  border-radius: 0;
  border-bottom: 6rpx solid #2c167c;
  background: transparent;
  transform: rotate(-12deg);
}

.mascot-mouth {
  position: absolute;
  left: 67rpx;
  top: 82rpx;
  width: 22rpx;
  height: 14rpx;
  border-bottom: 5rpx solid #2c167c;
  border-radius: 0 0 22rpx 22rpx;
}

.mascot-suit {
  position: absolute;
  right: 26rpx;
  bottom: 4rpx;
  width: 150rpx;
  height: 88rpx;
  border-radius: 56rpx 56rpx 28rpx 28rpx;
  background: linear-gradient(135deg, #7b5cff 0%, #5f47d8 58%, #ff5cb8 100%);
}

.hero-spark {
  position: absolute;
  width: 18rpx;
  height: 18rpx;
  background: #ffd15c;
  transform: rotate(45deg);
}

.hero-spark.one { top: 22rpx; right: 8rpx; }
.hero-spark.two { left: 0; top: 116rpx; background: #ffffff; }
.hero-spark.three { right: 18rpx; bottom: 44rpx; background: #ff9e3d; }

.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 34rpx;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  height: 104rpx;
  padding: 0 18rpx;
  border-radius: 18rpx;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.mode-card.active {
  background: linear-gradient(180deg, #fff8ff 0%, #ffffff 100%);
  box-shadow: inset 0 0 0 2rpx rgba(123, 92, 255, 0.2);
}

.mode-icon {
  position: relative;
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  border-radius: 14rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
}

.mode-image {
  background: linear-gradient(135deg, #7b5cff, #a76bff);
}

.mode-script {
  background: linear-gradient(135deg, #ff5cb8, #ff8abd);
}

.mode-icon-mark {
  position: absolute;
  inset: 12rpx;
  border: 4rpx solid #ffffff;
  border-radius: 6rpx;
}

.mode-icon-mark::after {
  position: absolute;
  right: -2rpx;
  bottom: 3rpx;
  width: 0;
  height: 0;
  border-right: 9rpx solid transparent;
  border-bottom: 11rpx solid #ffffff;
  border-left: 9rpx solid transparent;
  content: "";
}

.mode-image .mode-icon-mark::after {
  left: 7rpx;
  top: 5rpx;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 12rpx solid #ffffff;
  border-right: 0;
}

.mode-script .mode-icon-mark {
  border-radius: 5rpx;
}

.mode-script .mode-icon-mark::before {
  position: absolute;
  left: 3rpx;
  top: 5rpx;
  width: 14rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 0 #ffffff;
  content: "";
}

.mode-title {
  overflow: hidden;
  color: #1f2437;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-desc {
  overflow: hidden;
  margin-top: 6rpx;
  color: #8b8fa3;
  font-size: 19rpx;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.showcase-section,
.script-section {
  margin-bottom: 34rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.section-title {
  margin: 0;
  color: #1f2437;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.2;
}

.section-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 46rpx;
  padding: 0;
  background: transparent;
  color: #9a9eb5;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 46rpx;
}

.section-more text {
  font-size: 28rpx;
}

.work-scroll {
  width: 100%;
  white-space: nowrap;
}

.work-scroll-inner {
  display: inline-flex;
  gap: 18rpx;
  padding-right: 24rpx;
}

.work-card {
  flex: 0 0 auto;
  width: 190rpx;
  padding: 0 0 16rpx;
  border-radius: 20rpx;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.work-cover {
  position: relative;
  overflow: hidden;
  height: 230rpx;
  border-radius: 18rpx 18rpx 8rpx 8rpx;
}

.work-cover::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 42%, rgba(31, 36, 55, 0.22));
  content: "";
}

.theme-romance {
  background:
    radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.72), transparent 21%),
    linear-gradient(145deg, #1d2448 0%, #7b5cff 45%, #ff9bcf 100%);
}

.theme-guardian {
  background:
    radial-gradient(circle at 65% 20%, rgba(255, 255, 255, 0.5), transparent 20%),
    linear-gradient(145deg, #101933 0%, #3454d1 50%, #ff5cb8 100%);
}

.theme-apocalypse {
  background:
    radial-gradient(circle at 32% 20%, rgba(255, 209, 92, 0.38), transparent 18%),
    linear-gradient(145deg, #1b2432 0%, #35435d 48%, #ff8a5c 100%);
}

.theme-time {
  background:
    radial-gradient(circle at 64% 20%, rgba(255, 255, 255, 0.7), transparent 20%),
    linear-gradient(145deg, #fff0cf 0%, #ff9bcf 45%, #7b5cff 100%);
}

.work-scene {
  position: absolute;
  left: 32rpx;
  top: 54rpx;
  width: 116rpx;
  height: 116rpx;
  border-radius: 34rpx;
  background: rgba(255, 255, 255, 0.28);
  transform: rotate(9deg);
}

.work-scene::before,
.work-scene::after {
  position: absolute;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.4);
  content: "";
}

.work-scene::before {
  right: -22rpx;
  top: 28rpx;
  width: 60rpx;
  height: 60rpx;
}

.work-scene::after {
  left: -14rpx;
  bottom: -18rpx;
  width: 74rpx;
  height: 42rpx;
}

.work-overlay {
  position: absolute;
  right: 16rpx;
  bottom: 20rpx;
  z-index: 2;
  color: rgba(255, 255, 255, 0.82);
  font-size: 22rpx;
  font-weight: 900;
  transform: rotate(-12deg);
}

.work-title {
  overflow: hidden;
  margin: 16rpx 14rpx 0;
  color: #1f2437;
  font-size: 25rpx;
  font-weight: 900;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-meta {
  overflow: hidden;
  margin: 10rpx 14rpx 0;
  color: #8b8fa3;
  font-size: 21rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-heat {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 10rpx 14rpx 0;
  color: #8e87b2;
  font-size: 21rpx;
  font-weight: 800;
}

.fire-mark {
  position: relative;
  width: 16rpx;
  height: 20rpx;
  border-radius: 12rpx 12rpx 12rpx 3rpx;
  background: linear-gradient(180deg, #ff5cb8, #ff9e3d);
  transform: rotate(36deg);
}

.script-card {
  overflow: hidden;
  border-radius: 22rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.script-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-height: 116rpx;
  padding: 18rpx;
  background: transparent;
  text-align: left;
}

.script-row + .script-row {
  border-top: 1rpx solid #eef0f8;
}

.script-avatar {
  position: relative;
  flex: 0 0 auto;
  width: 70rpx;
  height: 70rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
}

.avatar-romance {
  background: linear-gradient(135deg, #ffd7ea, #ff6ab8);
}

.avatar-mystery {
  background: linear-gradient(135deg, #d9d0ff, #7b5cff);
}

.script-avatar-mark {
  position: absolute;
  left: 18rpx;
  top: 16rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, 0.88);
}

.script-avatar-mark::before,
.script-avatar-mark::after {
  position: absolute;
  top: 12rpx;
  width: 6rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: #7b5cff;
  content: "";
}

.script-avatar-mark::before { left: 8rpx; }
.script-avatar-mark::after { right: 8rpx; }

.script-main {
  flex: 1;
  min-width: 0;
}

.script-title-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.script-title {
  overflow: hidden;
  min-width: 0;
  max-width: 232rpx;
  color: #1f2437;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-tag {
  flex-shrink: 0;
  height: 28rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: #f1eaff;
  color: #8b5cff;
  font-size: 18rpx;
  font-weight: 900;
  line-height: 28rpx;
}

.script-desc {
  overflow: hidden;
  margin-top: 9rpx;
  color: #8b8fa3;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-action {
  flex: 0 0 auto;
  width: 104rpx;
  height: 54rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #ff5cb8, #e743d7);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 900;
  line-height: 54rpx;
  text-align: center;
}

.creator-panel {
  margin-bottom: 22rpx;
  padding: 24rpx;
  border-radius: 26rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 12rpx rgba(122, 92, 255, 0.08);
}

.creator-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.creator-title {
  color: #1f2437;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 1.2;
}

.creator-subtitle {
  margin-top: 8rpx;
  color: #8b8fa3;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
}

.creator-cost {
  flex: 0 0 auto;
  min-width: 98rpx;
  height: 46rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background: #fff1cc;
  color: #d97706;
  font-size: 22rpx;
  font-weight: 900;
  line-height: 46rpx;
  text-align: center;
}

.form-section {
  margin-bottom: 24rpx;
}

.form-title {
  margin-bottom: 14rpx;
  color: #1f2437;
  font-size: 26rpx;
  font-weight: 900;
  line-height: 1.2;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.option-card,
.style-chip,
.segment {
  border: 1rpx solid #eceefd;
  background: #f8f7ff;
  color: #5f6378;
  font-weight: 900;
  text-align: center;
}

.option-card {
  height: 76rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  line-height: 76rpx;
}

.option-card.active,
.style-chip.active,
.segment.active {
  border-color: transparent;
  background: linear-gradient(135deg, #7b5cff, #ff5cb8);
  color: #ffffff;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.style-chip {
  height: 58rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  font-size: 23rpx;
  line-height: 58rpx;
}

.model-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.model-card {
  min-height: 128rpx;
  padding: 18rpx 12rpx;
  border: 1rpx solid #eceefd;
  border-radius: 18rpx;
  background: #fbfaff;
}

.model-card.active {
  border-color: #ffb84d;
  background: linear-gradient(180deg, #fff9ed 0%, #ffffff 100%);
}

.model-name {
  overflow: hidden;
  color: #1f2437;
  font-size: 23rpx;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-desc,
.tier-empty {
  margin-top: 10rpx;
  color: #8b8fa3;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.35;
}

.model-price {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  margin-top: 12rpx;
  color: #7b5cff;
  font-size: 20rpx;
  font-weight: 900;
}

.tier-base-cost {
  margin-right: 6rpx;
  color: #a3a8bc;
  text-decoration: line-through;
}

.tier-discount {
  padding: 3rpx 8rpx;
  border-radius: 999rpx;
  background: #fff1cc;
  color: #d97706;
  font-size: 17rpx;
  font-weight: 900;
}

.manga-prompt-section {
  margin-bottom: 24rpx;
}

.character-input {
  width: 100%;
  height: 78rpx;
  padding: 0 22rpx;
  border: 1rpx solid #eceefd;
  border-radius: 18rpx;
  background: #fbfaff;
  color: #1f2437;
  font-size: 25rpx;
  font-weight: 700;
  line-height: 78rpx;
}

.field-placeholder {
  color: #a3a8bc;
}

.form-inline {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.inline-group {
  min-width: 0;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8rpx;
}

.segment {
  height: 56rpx;
  border-radius: 16rpx;
  font-size: 20rpx;
  line-height: 56rpx;
}

.generate-button {
  height: 88rpx;
  margin-top: 4rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7b5cff 0%, #ff5cb8 100%);
  color: #ffffff;
  font-size: 29rpx;
  font-weight: 900;
  line-height: 88rpx;
  text-align: center;
  box-shadow: 0 12rpx 12rpx rgba(255, 92, 184, 0.16);
}

.generate-button.disabled {
  background: #c7cbd8;
  color: #ffffff;
  box-shadow: none;
}
 .pipeline-card,.production-card{margin-bottom:24rpx;padding:24rpx;border-radius:22rpx;background:#fff;box-shadow:0 8rpx 24rpx rgba(83,65,160,.08)} .pipeline-title,.production-head{display:flex;justify-content:space-between;font-weight:900;font-size:28rpx}.pipeline-steps{display:flex;justify-content:space-between;margin-top:22rpx}.pipeline-step{display:flex;align-items:center;gap:7rpx;color:#9a96aa;font-size:22rpx}.pipeline-step.active,.pipeline-step.done{color:#6c4bff;font-weight:800}.pipeline-dot{width:14rpx;height:14rpx;border-radius:50%;background:#ddd8eb}.pipeline-step.active .pipeline-dot,.pipeline-step.done .pipeline-dot{background:#6c4bff}.pipeline-hint{margin-top:18rpx;color:#777184;font-size:22rpx;line-height:1.6}.pipeline-actions{display:grid;grid-template-columns:1fr 1fr;gap:16rpx;margin:20rpx 0}.pipeline-secondary{height:72rpx;border-radius:18rpx;background:#f1edff;color:#6847e8;font-size:24rpx;font-weight:800}.script-editor{width:100%;min-height:220rpx;margin-top:18rpx;padding:18rpx;box-sizing:border-box;border-radius:16rpx;background:#f8f7fb;font-size:24rpx;line-height:1.65}.shot-row{display:flex;gap:16rpx;padding:18rpx 0;border-bottom:1rpx solid #f0edf6}.shot-index{display:flex;align-items:center;justify-content:center;flex:0 0 46rpx;height:46rpx;border-radius:14rpx;background:#eee9ff;color:#6545dc;font-weight:900}.shot-head{display:flex;align-items:center;gap:12rpx}.shot-title-input{flex:1;font-size:24rpx;font-weight:900}.shot-status{padding:5rpx 12rpx;border-radius:999rpx;background:#f0ecff;color:#6c4bff;font-size:18rpx}.shot-description-input{width:100%;min-height:86rpx;margin-top:10rpx;font-size:22rpx;line-height:1.55}.shot-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10rpx;margin-top:10rpx}.shot-field{height:58rpx;padding:0 14rpx;border-radius:12rpx;background:#f8f7fb;font-size:20rpx}.scene-library{margin-top:16rpx}.batch-generation-bar{display:flex;align-items:center;justify-content:space-between;gap:16rpx;margin-top:18rpx;padding:16rpx;border-radius:16rpx;background:#f4f0ff}.batch-generation-bar view{display:flex;flex-direction:column;gap:4rpx;font-size:19rpx;color:#766d88}.batch-generation-bar button{height:58rpx;padding:0 18rpx;border-radius:14rpx;background:#6c4bff;color:#fff;font-size:19rpx;line-height:58rpx}.character-library{margin-top:16rpx}.character-library-head{display:flex;align-items:center;justify-content:space-between;font-size:22rpx;font-weight:800}.character-library-head button{height:50rpx;padding:0 14rpx;border-radius:12rpx;background:#eee9ff;color:#6847e8;font-size:18rpx;line-height:50rpx}.character-asset{display:flex;align-items:flex-start;gap:12rpx;margin-top:12rpx;padding:14rpx;border-radius:16rpx;background:#f8f7fb}.character-asset-media{display:flex;align-items:center;justify-content:center;width:82rpx;height:82rpx;overflow:hidden;border-radius:14rpx;background:#eee9ff;color:#6847e8;font-size:18rpx}.character-asset-media image{width:100%;height:100%}.character-asset-fields{display:flex;flex:1;flex-direction:column;gap:8rpx}.character-asset-fields input,.character-asset-fields textarea{width:100%;font-size:20rpx}.character-asset-delete{height:44rpx;padding:0 10rpx;background:transparent;color:#d84f67;font-size:17rpx;line-height:44rpx}.character-reference-card{display:flex;align-items:center;gap:16rpx;margin-top:14rpx;padding:16rpx;border-radius:18rpx;background:#f8f7fb}.character-reference-copy{display:flex;flex:1;flex-direction:column;gap:6rpx}.character-reference-title{font-size:22rpx;font-weight:800}.character-reference-desc{font-size:18rpx;line-height:1.45;color:#8c8798}.character-reference-media{display:flex;align-items:center;justify-content:center;width:92rpx;height:92rpx;overflow:hidden;border-radius:16rpx;background:#eee9ff;color:#6847e8;font-size:20rpx}.character-reference-media image{width:100%;height:100%}.character-reference-remove{height:48rpx;padding:0 12rpx;background:transparent;color:#d84f67;font-size:18rpx;line-height:48rpx}.shot-output{overflow:hidden;width:100%;height:260rpx;margin-top:12rpx;border-radius:16rpx;background:#111}.shot-output video,.shot-output image{width:100%;height:100%}.shot-actions{display:flex;flex-wrap:wrap;gap:10rpx;margin-top:12rpx}.shot-actions button{height:52rpx;padding:0 16rpx;border-radius:12rpx;background:#f4f2f8;font-size:19rpx;line-height:52rpx}.shot-actions .generate{background:#6c4bff;color:#fff}.shot-actions .danger{color:#d84f67}.add-shot-button{height:66rpx;margin-top:18rpx;border-radius:16rpx;background:#f0ecff;color:#6847e8;font-size:22rpx;font-weight:800}.shot-desc,.shot-dialogue{margin-top:8rpx;color:#686372;font-size:22rpx;line-height:1.55}.shot-dialogue{color:#8a64c9}
</style>
