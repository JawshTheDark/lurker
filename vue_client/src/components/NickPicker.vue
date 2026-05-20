<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<template>
  <div
    v-if="open && rows.length"
    ref="panelEl"
    class="nick-picker"
    :style="panelStyle"
    @pointerdown.stop
  >
    <div
      v-for="row in rows"
      :key="row.lc"
      class="row"
      :class="{ recent: row.recent }"
      @pointerdown.prevent="pick(row.nick)"
    >
      <span class="nick">{{ row.nick }}</span>
      <span v-if="row.recent" class="badge">recent</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { buildNickCandidates } from '../utils/nickCompletion.js';
import { useIgnoresStore } from '../stores/ignores.js';
import type { Buffer } from '../stores/buffers.js';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    query?: string;
    buffer?: Buffer | null;
    selfNick?: string;
    anchor?: HTMLElement | null;
  }>(),
  {
    open: false,
    query: '',
    buffer: null,
    selfNick: '',
    anchor: null,
  },
);

const emit = defineEmits<{
  select: [nick: string];
  close: [];
}>();

const ignores = useIgnoresStore();
const panelEl = ref<HTMLElement | null>(null);
const panelBottom = ref(8);

const rows = computed(() => {
  const networkId = props.buffer?.networkId;
  const isIgnored = networkId
    ? (nick: string, userhost: string | null) => ignores.isIgnored(networkId, nick, userhost ?? '')
    : null;
  return buildNickCandidates(props.buffer, props.selfNick, props.query, isIgnored)
    .slice(0, 50)
    .map((c) => ({ nick: c.nick, lc: c.nick.toLowerCase(), recent: c.recent }));
});

function pick(nick: string) {
  emit('select', nick);
}

function recomputePosition() {
  // Anchor the picker just above the input bar, riding above the iOS soft
  // keyboard via visualViewport.height. Without this, the picker gets
  // occluded as soon as the keyboard slides up.
  const anchor = props.anchor;
  if (!anchor) {
    panelBottom.value = 8;
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  // Distance from bottom of viewport to top of anchor.
  const distance = viewportHeight - rect.top;
  panelBottom.value = Math.max(distance + 4, 8);
}

const panelStyle = computed(() => ({ bottom: `${panelBottom.value}px` }));

function onDocPointerDown(e: PointerEvent) {
  if (!props.open) return;
  const panel = panelEl.value;
  const anchor = props.anchor;
  if (panel && panel.contains(e.target as Node)) return;
  if (anchor && anchor.contains(e.target as Node)) return;
  emit('close');
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  recomputePosition();
  window.addEventListener('resize', recomputePosition);
  window.visualViewport?.addEventListener('resize', recomputePosition);
  window.visualViewport?.addEventListener('scroll', recomputePosition);
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', recomputePosition);
  window.visualViewport?.removeEventListener('resize', recomputePosition);
  window.visualViewport?.removeEventListener('scroll', recomputePosition);
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onKey);
});

watch(
  () => props.open,
  (v) => {
    if (v) recomputePosition();
  },
);
</script>

<style scoped>
.nick-picker {
  position: fixed;
  left: 8px;
  right: 8px;
  max-width: 480px;
  margin: 0 auto;
  max-height: 50vh;
  overflow-y: auto;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  min-height: 44px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  user-select: none;
}
.row:last-child {
  border-bottom: none;
}
.row:hover {
  background: var(--bg);
}
.row.recent .nick {
  color: var(--accent);
}
.nick {
  font-weight: 500;
}
.badge {
  font-size: 0.85em;
  color: var(--fg-muted);
  font-style: italic;
}
</style>
