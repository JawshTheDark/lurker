<template>
  <div class="members">
    <ul>
      <li v-for="m in sorted" :key="nickOf(m)" :class="prefixClass(m)">
        <span class="prefix">{{ prefixOf(m) }}</span>
        <span class="nick" :style="nickStyle(m)">{{ nickOf(m) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { useNickColors } from '../composables/useNickColors.js';

const networks = useNetworksStore();
const buffers = useBuffersStore();
const nicks = useNickColors();

const buffer = computed(() => (networks.activeKey ? buffers.byKey(networks.activeKey) : null));
const members = computed(() => buffer.value?.members || []);
const selfNick = computed(() => {
  const b = buffer.value;
  if (!b) return null;
  return networks.states[b.networkId]?.nick || null;
});

function isSelf(m) {
  const sn = selfNick.value;
  return !!sn && nickOf(m).toLowerCase() === sn.toLowerCase();
}
function nickStyle(m) {
  if (isSelf(m)) return { color: nicks.selfColor.value };
  const c = nicks.color(nickOf(m));
  return c ? { color: c } : null;
}

const PREFIX_ORDER = ['~', '&', '@', '%', '+', ''];

function nickOf(m) { return typeof m === 'string' ? m : m.nick; }
function modesOf(m) { return Array.isArray(m?.modes) ? m.modes : []; }
function prefixOf(m) {
  const modes = modesOf(m);
  if (modes.includes('q')) return '~';
  if (modes.includes('a')) return '&';
  if (modes.includes('o')) return '@';
  if (modes.includes('h')) return '%';
  if (modes.includes('v')) return '+';
  return '';
}
function prefixClass(m) {
  const p = prefixOf(m);
  return p ? `mode-${p}` : '';
}

const sorted = computed(() => [...members.value].sort((a, b) => {
  const pa = PREFIX_ORDER.indexOf(prefixOf(a));
  const pb = PREFIX_ORDER.indexOf(prefixOf(b));
  if (pa !== pb) return pa - pb;
  return nickOf(a).localeCompare(nickOf(b), undefined, { sensitivity: 'base' });
}));
</script>

<style scoped>
.members { display: flex; flex-direction: column; height: 100%; min-height: 0; }
ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
li {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 1px 10px;
}
li:hover { background: var(--bg-soft); }
.prefix { width: 10px; text-align: center; color: var(--fg-muted); }
li.mode-\~ .prefix { color: var(--member-owner); }
li.mode-\& .prefix { color: var(--member-admin); }
li.mode-\@ .prefix { color: var(--member-op); }
li.mode-\% .prefix { color: var(--member-halfop); }
li.mode-\+ .prefix { color: var(--member-voice); }
.nick { color: var(--accent); }
</style>
