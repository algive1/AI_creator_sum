<template>
  <view class="prompt-composer-section">
    <view class="prompt-title-row">
      <view class="prompt-composer-title">{{ title }}</view>
      <view class="prompt-title-actions">
        <view v-if="showHelpButton" class="prompt-help-btn" @tap="$emit('help')">
          <image class="prompt-help-icon" :src="helpIcon" mode="aspectFit" />
          <text>{{ helpButtonText }}</text>
        </view>
        <view class="prompt-expand-btn" @tap="$emit('toggleExpanded')">
          <view class="prompt-expand-glyph" :class="{ collapse: expanded }"></view>
          <text>{{ expanded ? '收起' : '放大编辑' }}</text>
        </view>
      </view>
    </view>
    <view class="prompt-composer prompt-expandable">
      <textarea
        class="prompt-composer-input prompt-main-input"
        :class="{ expanded }"
        :value="modelValue"
        :maxlength="maxLength"
        :placeholder="placeholder"
        placeholder-class="prompt-placeholder"
        @input="onInput"
      />
      <view class="prompt-bottom-bar">
        <view class="prompt-quick-actions">
          <view class="prompt-quick-action" @tap="$emit('paste')">粘贴</view>
          <view class="prompt-quick-action" @tap="$emit('selectAll')">全选</view>
          <view class="prompt-quick-action danger" @tap="$emit('clear')">清空</view>
        </view>
        <view
          v-if="showSmartFill"
          class="prompt-inline-action"
          :class="{ disabled: smartLoading }"
          @tap="smartLoading ? undefined : $emit('smartFill')"
        >
          <text class="prompt-inline-count">{{ modelValue.length }}/{{ maxLength }}</text><text>丨{{ smartLoading ? '补全中...' : smartLabel }}</text>
        </view>
        <view v-else class="prompt-inline-count">{{ modelValue.length }}/{{ maxLength }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string;
  title?: string;
  placeholder?: string;
  maxLength?: number;
  expanded?: boolean;
  smartLabel?: string;
  smartLoading?: boolean;
  showSmartFill?: boolean;
  showHelpButton?: boolean;
  helpButtonText?: string;
  helpIcon?: string;
}>(), {
  title: '主提示词',
  placeholder: '写点什么... 输入完成1秒后自动保存，最多2000字',
  maxLength: 2000,
  expanded: false,
  smartLabel: 'AI智能补全',
  smartLoading: false,
  showSmartFill: true,
  showHelpButton: false,
  helpButtonText: '不会写提示词？',
  helpIcon: '/static/icons/icon_prompt_help_line.svg'
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  toggleExpanded: [];
  paste: [];
  selectAll: [];
  clear: [];
  smartFill: [];
  help: [];
}>();

function onInput(event: Event) {
  const value = (event as unknown as { detail?: { value?: string } }).detail?.value ?? (event.target as HTMLTextAreaElement | null)?.value ?? '';
  emit('update:modelValue', value);
}
</script>

<style scoped lang="scss">
.prompt-composer-section {
  width: 100%;
  margin-bottom: 24rpx;
}

.prompt-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 14rpx;
}

.prompt-composer-title {
  flex: 1;
  min-width: 0;
  color: #172033;
  font-size: 31rpx;
  font-weight: 900;
}

.prompt-title-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.prompt-help-btn,
.prompt-expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 54rpx;
  padding: 0 16rpx;
  border-radius: 27rpx;
  background: rgba(255, 255, 255, 0.88);
  color: #7a5cff;
  font-size: 23rpx;
  font-weight: 800;
  box-shadow: inset 0 0 0 1rpx rgba(122, 92, 255, 0.14), 0 8rpx 18rpx rgba(28, 43, 82, 0.06);
}

.prompt-help-btn {
  max-width: 232rpx;
  color: #475569;
}

.prompt-help-icon {
  flex-shrink: 0;
  width: 28rpx;
  height: 28rpx;
}

.prompt-help-btn text,
.prompt-expand-btn text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-expand-glyph {
  position: relative;
  width: 22rpx;
  height: 22rpx;
}

.prompt-expand-glyph::before,
.prompt-expand-glyph::after {
  position: absolute;
  background: #7a5cff;
  border-radius: 2rpx;
  content: "";
}

.prompt-expand-glyph::before {
  top: 9rpx;
  left: 2rpx;
  width: 18rpx;
  height: 4rpx;
}

.prompt-expand-glyph::after {
  top: 2rpx;
  left: 9rpx;
  width: 4rpx;
  height: 18rpx;
}

.prompt-expand-glyph.collapse::after {
  display: none;
}

.prompt-composer {
  overflow: hidden;
  border: 1rpx solid rgba(134, 216, 255, 0.16);
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10rpx 28rpx rgba(28, 43, 82, 0.07);
}

.prompt-composer-input {
  width: 100%;
  height: 240rpx;
  padding: 24rpx 24rpx 12rpx;
  color: #172033;
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.55;
}

.prompt-composer-input.expanded {
  height: 520rpx;
}

.prompt-placeholder {
  color: rgba(100, 116, 139, 0.72);
}

.prompt-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 72rpx;
  padding: 0 18rpx 14rpx;
}

.prompt-quick-actions {
  display: flex;
  gap: 10rpx;
}

.prompt-quick-action {
  min-width: 76rpx;
  height: 48rpx;
  padding: 0 12rpx;
  border-radius: 24rpx;
  background: #f1f5f9;
  color: #475569;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 48rpx;
  text-align: center;
}

.prompt-quick-action.danger {
  color: #ff7a8b;
}

.prompt-inline-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 48rpx;
  color: #7a5cff;
  font-size: 22rpx;
  font-weight: 900;
  white-space: nowrap;
}

.prompt-inline-action.disabled {
  opacity: 0.58;
  pointer-events: none;
}

.prompt-inline-count {
  color: #64748b;
  font-weight: 800;
}
</style>
