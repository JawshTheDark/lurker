<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<!--
  Settings-key suggester for `/set` and `/get`. Same VerticalPopover wrapper as
  ChannelPicker: type `/set chat.` and the popover lists every registry key under
  that prefix so you can pick one instead of memorizing it. It owns only the
  candidate list (registry keys matching the typed prefix); the shared popover
  owns positioning, dismissal, and keyboard nav.
-->

<template>
  <VerticalPopover
    ref="popover"
    :open="open"
    :rows="rows"
    :anchor="anchor"
    :ignore="[anchor]"
    reverse
    :row-key="rowKey"
    @select="onSelect"
    @close="emit('close')"
  >
    <template #row="{ row }">
      <span class="key">{{ row.key }}</span>
      <span class="type">{{ row.type }}</span>
    </template>
  </VerticalPopover>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { buildSettingKeyCandidates, type SettingKeyMatch } from '../utils/commandCompletion.js';
import VerticalPopover from './VerticalPopover.vue';
import type { PopoverNav } from './popoverNav.js';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    // The partial key the user has typed after /set or /get (may be empty).
    query?: string;
    anchor?: HTMLElement | null;
  }>(),
  { open: false, query: '', anchor: null },
);

const emit = defineEmits<{
  select: [key: string];
  close: [];
}>();

const rows = computed<SettingKeyMatch[]>(() =>
  props.open ? buildSettingKeyCandidates(props.query) : [],
);

function rowKey(row: SettingKeyMatch): string {
  return row.key;
}
function onSelect(row: SettingKeyMatch): void {
  emit('select', row.key);
}

const popover = ref<PopoverNav | null>(null);
defineExpose({
  moveActive: (delta: number) => popover.value?.moveActive(delta),
  confirmActive: () => popover.value?.confirmActive(),
  hasCandidates: () => popover.value?.hasCandidates() ?? false,
});
</script>

<style scoped>
.key {
  font-weight: 500;
}
.type {
  margin-left: 0.5rem;
  opacity: 0.6;
  font-size: 0.85em;
}
</style>
