<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<template>
  <AppModal
    word="flood"
    :title="`message will flood ${chunks} lines`"
    size="md"
    @close="$emit('cancel')"
  >
    <p class="desc">
      IRC will split this into {{ chunks }} separate lines. Upload it as a <code>.txt</code> file
      instead?
    </p>
    <pre class="preview">{{ content }}</pre>
    <footer class="foot">
      <button type="button" class="btn secondary" @click="$emit('cancel')">Cancel</button>
      <button
        ref="primaryBtn"
        type="button"
        class="btn primary"
        :disabled="uploading"
        @click="$emit('confirm')"
      >
        {{ uploading ? 'Uploading…' : 'Upload as .txt' }}
      </button>
    </footer>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppModal from './AppModal.vue';

withDefaults(
  defineProps<{
    content: string;
    chunks: number;
    uploading?: boolean;
  }>(),
  {
    uploading: false,
  },
);

defineEmits<{ confirm: []; cancel: [] }>();

const primaryBtn = ref<HTMLButtonElement | null>(null);

onMounted(() => {
  // Focus the primary action so Enter confirms, matching the user's intent
  // (they already hit Send once to get here).
  primaryBtn.value?.focus();
});
</script>

<style scoped>
.desc {
  margin: 0 0 12px;
  color: var(--fg-muted);
}
.desc code {
  background: var(--bg-soft);
  padding: 1px 4px;
  border-radius: 2px;
}
.preview {
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  overflow: auto;
  flex: 1;
  min-height: 0;
  max-height: 40vh;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 0.95em;
  color: var(--fg);
}
.foot {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  color: var(--fg);
  cursor: pointer;
  font: inherit;
  padding: 6px 14px;
}
.btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
</style>
