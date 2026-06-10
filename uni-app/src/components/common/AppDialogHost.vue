<template>
  <view v-if="active" class="app-dialog-host">
    <AppActionModal />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppActionModal from './AppActionModal.vue';
import { appDialogState } from '@/utils/app-dialog';

const active = computed(() => Boolean(appDialogState.current));
</script>

<style scoped lang="scss">
.app-dialog-host {
  position: fixed;
  inset: 0;
  z-index: 9000;
}
</style>
