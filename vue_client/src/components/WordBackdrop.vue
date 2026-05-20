<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<!--
  Decorative tiled-word backdrop borrowed from Postalgic's modal look.
  Renders the given `word` (uppercased, repeated, rotated) at a very low
  contrast as a watermark/texture. Absolutely positioned to fill its
  nearest positioned ancestor — caller is responsible for stacking
  (the content is intentionally pointer-events: none).
-->

<template>
  <div class="word-backdrop" aria-hidden="true">
    <div class="word-backdrop-inner">
      <div
        v-for="row in rows"
        :key="row"
        class="word-backdrop-row"
        :class="{ offset: row % 2 === 1 }"
      >
        {{ tiledLine }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    word: string;
    rows?: number;
    repeats?: number;
  }>(),
  { rows: 12, repeats: 10 },
);

const tiledLine = computed(() => {
  const w = (props.word || '').trim();
  if (!w) return '';
  return Array.from({ length: props.repeats }, () => w.toUpperCase()).join(' ');
});
</script>

<style scoped>
.word-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: none;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.word-backdrop-inner {
  display: flex;
  flex-direction: column;
  transform: rotate(-12deg) scale(1.5);
  transform-origin: center;
  gap: 0.25em;
}
.word-backdrop-row {
  display: block;
  white-space: nowrap;
  font-weight: 700;
  font-size: clamp(4rem, 10vw, 8rem);
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--bg-soft);
}
.word-backdrop-row.offset {
  margin-left: 8rem;
}
</style>
