<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<template>
  <div v-if="open" class="mirc-picker" @pointerdown.stop @mousedown.prevent.stop>
    <!-- iOS keyboard preservation: same trick as NickSuggestionStrip — div
         role=button + @mousedown.prevent keeps focus on the textarea so the
         soft keyboard stays up while the user picks a colour. Action fires on
         `click` (end of touch), not pointerdown, so closing the popover
         mid-touch can't redirect the second event to whatever's underneath. -->
    <div class="swatch-grid">
      <div
        v-for="entry in swatches"
        :key="entry.code"
        role="button"
        class="swatch"
        :style="{ backgroundColor: entry.hex }"
        :title="`mIRC ${entry.code}`"
        @mousedown.prevent
        @click="emit('color', entry.code)"
      ></div>
    </div>
    <div class="row">
      <div
        role="button"
        class="action"
        title="Clear formatting (inserts reset)"
        @mousedown.prevent
        @click="emit('reset')"
      >
        clear
      </div>
      <div role="button" class="action" title="Close" @mousedown.prevent @click="emit('close')">
        close
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The 16-color palette here mirrors MIRC_PALETTE in utils/nickColor.js — those
// are the only codes our renderer styles, so anything outside 0-15 wouldn't
// round-trip visibly anyway.
const PALETTE = [
  { code: '00', hex: '#ffffff' },
  { code: '01', hex: '#000000' },
  { code: '02', hex: '#00007f' },
  { code: '03', hex: '#009300' },
  { code: '04', hex: '#ff0000' },
  { code: '05', hex: '#7f0000' },
  { code: '06', hex: '#9c009c' },
  { code: '07', hex: '#fc7f00' },
  { code: '08', hex: '#ffff00' },
  { code: '09', hex: '#00fc00' },
  { code: '10', hex: '#009393' },
  { code: '11', hex: '#00ffff' },
  { code: '12', hex: '#0000fc' },
  { code: '13', hex: '#ff00ff' },
  { code: '14', hex: '#7f7f7f' },
  { code: '15', hex: '#d2d2d2' },
];

withDefaults(
  defineProps<{
    open?: boolean;
  }>(),
  { open: false },
);

const emit = defineEmits<{
  color: [code: string];
  reset: [];
  close: [];
}>();

const swatches = PALETTE;
</script>

<style scoped>
.mirc-picker {
  position: absolute;
  right: 12px;
  bottom: 100%;
  margin-bottom: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 6;
}
.swatch-grid {
  display: grid;
  grid-template-columns: repeat(8, 1.4em);
  grid-auto-rows: 1.4em;
  gap: 4px;
}
.swatch {
  border: 1px solid var(--border);
  cursor: pointer;
  touch-action: manipulation;
}
.swatch:hover {
  outline: 1px solid var(--accent);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.action {
  color: var(--fg-muted);
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
}
.action:hover {
  color: var(--accent);
}
</style>
