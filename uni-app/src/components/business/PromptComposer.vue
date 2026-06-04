<template>
  <view class="prompt">
    <view class="prompt-head">
      <view>
        <view class="prompt-title">{{ title }}</view>
        <view class="prompt-sub">{{ subtitle }}</view>
      </view>
      <button class="prompt-tool" @tap="$emit('optimize')">AI优化</button>
    </view>
    <textarea
      class="prompt-input"
      :class="{ expanded }"
      :value="modelValue"
      :maxlength="maxLength"
      :placeholder="placeholder"
      placeholder-class="prompt-placeholder"
      @input="onInput"
    />
    <view class="prompt-foot">
      <view class="prompt-actions">
        <button @tap="$emit('paste')">粘贴</button>
        <button @tap="$emit('clear')">清空</button>
      </view>
      <view class="prompt-count">{{ modelValue.length }}/{{ maxLength }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  maxLength?: number;
  expanded?: boolean;
}>(), {
  title: '主提示词',
  subtitle: '描述主体、风格、场景和投放目的',
  placeholder: '写点什么... 例如：一张高级感护肤品海报，清透自然光，突出补水卖点',
  maxLength: 2000,
  expanded: false
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  optimize: [];
  paste: [];
  clear: [];
}>();

function onInput(event: Event) {
  const value = (event as unknown as { detail?: { value?: string } }).detail?.value ?? (event.target as HTMLTextAreaElement | null)?.value ?? '';
  emit('update:modelValue', value);
}
</script>

<style scoped lang="scss">
.prompt {
  margin-bottom: 24rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(49, 67, 94, 0.1);
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16rpx 40rpx rgba(35, 45, 72, 0.08);
}

.prompt-head,
.prompt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.prompt-title {
  color: #172033;
  font-size: 31rpx;
  font-weight: 900;
}

.prompt-sub {
  margin-top: 8rpx;
  color: #6d7688;
  font-size: 23rpx;
}

.prompt-tool {
  flex-shrink: 0;
  min-height: 58rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  background: #172033;
  color: #fff;
  font-size: 23rpx;
  font-weight: 900;
}

.prompt-input {
  width: 100%;
  height: 260rpx;
  margin-top: 22rpx;
  padding: 22rpx;
  border: 1rpx solid rgba(114, 88, 255, 0.14);
  border-radius: 14rpx;
  background: #f8fbff;
  color: #172033;
  font-size: 27rpx;
  line-height: 1.55;
}

.prompt-input.expanded {
  height: 420rpx;
}

.prompt-placeholder {
  color: rgba(109, 118, 136, 0.62);
}

.prompt-foot {
  margin-top: 18rpx;
}

.prompt-actions {
  display: flex;
  gap: 10rpx;
}

.prompt-actions button {
  min-width: 88rpx;
  height: 52rpx;
  border-radius: 10rpx;
  background: #eef3fb;
  color: #172033;
  font-size: 23rpx;
  font-weight: 800;
}

.prompt-count {
  color: #6d7688;
  font-size: 23rpx;
  font-weight: 800;
}
</style>
