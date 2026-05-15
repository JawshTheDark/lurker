<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: Elastic-2.0
-->

<template>
  <div class="modal" @click.self="$emit('close')">
    <div class="card" tabindex="-1">
      <header class="head">
        <input
          ref="inputEl"
          v-model="queryInput"
          class="filter"
          type="text"
          placeholder="search messages — from:nick in:#channel on:network"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <button class="link" @click="$emit('close')" title="close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <p v-if="store.error" class="error inline">{{ store.error }}</p>
      <ul
        v-if="visibleResults.length"
        ref="listEl"
        class="match-list"
        @scroll="onScroll"
      >
        <li
          v-for="(m, i) in visibleResults"
          :key="`${m.networkId}::${m.target}::${m.id}`"
          :class="{ match: true, active: i === selected }"
          @click="onJump(m)"
          @mouseenter="selected = i"
        >
          <span class="time">{{ time(m.time) }}</span>
          <span class="loc">
            <span class="net">{{ m.networkName || networkName(m.networkId) }}</span>
            <span class="target">{{ targetLabel(m) }}</span>
          </span>
          <span class="nick" :style="nickStyle(m)">{{ m.nick }}</span>
          <span class="text">{{ m.text }}</span>
        </li>
        <li v-if="store.loading" class="more">Loading…</li>
      </ul>
      <p v-else-if="store.loading" class="empty">Searching…</p>
      <p v-else-if="store.results.length" class="empty">All matches are from ignored users.</p>
      <p v-else-if="store.searched" class="empty">No matches.</p>
      <p v-else class="empty">Type to search your message history.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSearchStore } from '../stores/search.js';
import { useIgnoresStore } from '../stores/ignores.js';
import { useNickColors } from '../composables/useNickColors.js';
import { formatTimestamp } from '../utils/timestamp.js';

const emit = defineEmits(['close', 'jump']);

const networks = useNetworksStore();
const settings = useSettingsStore();
const store = useSearchStore();
const ignores = useIgnoresStore();
const nicks = useNickColors();

// Search runs against the full message history; ignored senders are
// filtered after results arrive so /unignore restores the rows without
// re-issuing the query.
const visibleResults = computed(() =>
  store.results.filter((m) => !ignores.isIgnored(m.networkId, m.nick, m.userhost))
);

const tsFormat = computed(() => settings.effective('look.buffer.time_format'));

const inputEl = ref(null);
const listEl = ref(null);
const selected = ref(0);

// Local mirror of the store's raw query so we can debounce dispatch without
// debouncing the text field itself.
const queryInput = ref(store.query);
let debounceTimer = null;
watch(queryInput, (val) => {
  store.setQuery(val);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { store.runSearch(); }, 200);
});

// Reset the keyboard cursor whenever the visible result set is replaced
// (a fresh search), but leave it alone on pagination appends.
watch(() => visibleResults.value.length, (len, prev) => {
  if (len < prev || prev === 0) selected.value = 0;
});

function time(iso) {
  return formatTimestamp(iso, tsFormat.value);
}

function networkName(id) {
  return networks.networks.find((n) => n.id === id)?.name || `net:${id}`;
}

function targetLabel(m) {
  if (m.target && m.target.startsWith(':server:')) return '[server]';
  return m.target;
}

function nickStyle(m) {
  const c = nicks.color(m.nick);
  return c ? { color: c } : null;
}

function onJump(m) {
  emit('jump', { networkId: m.networkId, target: m.target, messageId: m.id });
  emit('close');
}

function scrollSelectedIntoView() {
  nextTick(() => {
    const el = listEl.value;
    if (!el) return;
    el.children[selected.value]?.scrollIntoView({ block: 'nearest' });
  });
}

function onKeydown(e) {
  const rows = visibleResults.value;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!rows.length) return;
    selected.value = (selected.value + 1) % rows.length;
    scrollSelectedIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!rows.length) return;
    selected.value = (selected.value - 1 + rows.length) % rows.length;
    scrollSelectedIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const row = rows[selected.value];
    if (row) onJump(row);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

function onScroll() {
  const el = listEl.value;
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    store.loadMore();
  }
}

onMounted(() => {
  setTimeout(() => {
    inputEl.value?.focus();
    inputEl.value?.select();
  }, 0);
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  z-index: 100;
}
.card {
  background: var(--bg);
  border: 1px solid var(--accent);
  width: min(720px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  outline: none;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.filter {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 4px 8px;
  font: inherit;
}
.filter:focus { outline: none; border-color: var(--accent); }
.link {
  background: none;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  font: inherit;
  padding: 0 4px;
}
.link:hover { color: var(--fg); }

.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.match {
  display: grid;
  grid-template-columns: max-content max-content max-content 1fr;
  gap: 8px;
  align-items: baseline;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.match:hover,
.match.active { background: var(--bg-soft); }

.time { color: var(--fg-muted); }
.loc { color: var(--fg-muted); display: flex; gap: 4px; }
.loc .net { color: var(--accent); }
.nick { font-weight: 600; }
.text {
  white-space: pre-wrap;
  word-break: break-word;
}
.more {
  text-align: center;
  color: var(--fg-muted);
  font-style: italic;
  padding: 8px;
}
.empty {
  text-align: center;
  color: var(--fg-muted);
  font-style: italic;
  padding: 32px;
}
.error.inline {
  color: var(--error, #d66);
  padding: 8px 16px;
  margin: 0;
}
</style>
