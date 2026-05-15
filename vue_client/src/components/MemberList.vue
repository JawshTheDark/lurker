<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: Elastic-2.0
-->

<template>
  <div class="members">
    <ul>
      <li
        v-for="m in sorted"
        :key="nickOf(m)"
        :class="liClass(m)"
        @contextmenu.prevent="onMemberContextMenu($event, m)"
      >
        <span class="prefix">{{ prefixOf(m) }}</span>
        <span class="nick" :style="nickStyle(m)">{{ nickOf(m) }}</span>
      </li>
    </ul>
    <IgnoreModal
      v-if="modalMember"
      :nick="nickOf(modalMember)"
      :user="userOf(modalMember)"
      :host="hostOf(modalMember)"
      :network-id="buffer?.networkId"
      @close="modalMember = null"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { useNickColors } from '../composables/useNickColors.js';
import { useContextMenu } from '../composables/useContextMenu.js';
import { useIgnoresStore } from '../stores/ignores.js';
import IgnoreModal from './IgnoreModal.vue';

const networks = useNetworksStore();
const buffers = useBuffersStore();
const nicks = useNickColors();
const menu = useContextMenu();
const ignores = useIgnoresStore();
const modalMember = ref(null);

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
  // Away members render in a flat muted color — the .away CSS rule wins
  // regardless of inline style, but skipping the inline color keeps the DOM
  // honest.
  if (isAway(m)) return null;
  if (isSelf(m)) return { color: nicks.selfColor.value };
  const c = nicks.color(nickOf(m));
  return c ? { color: c } : null;
}

const PREFIX_ORDER = ['~', '&', '@', '%', '+', ''];

function nickOf(m) { return typeof m === 'string' ? m : m.nick; }
function userOf(m) { return typeof m === 'object' && m?.user ? m.user : null; }
function hostOf(m) { return typeof m === 'object' && m?.host ? m.host : null; }
function modesOf(m) { return Array.isArray(m?.modes) ? m.modes : []; }

function onMemberContextMenu(e, m) {
  if (!buffer.value || isSelf(m)) return;
  const items = [
    {
      label: 'Ignore…',
      icon: 'fa-solid fa-ban',
      onClick: () => { modalMember.value = m; },
    },
  ];
  menu.open(items, e.clientX, e.clientY);
}
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
function isAway(m) { return typeof m === 'object' && !!m?.away; }
function liClass(m) {
  const classes = [];
  const p = prefixClass(m);
  if (p) classes.push(p);
  if (isAway(m)) classes.push('away');
  return classes;
}

const sorted = computed(() => {
  const networkId = buffer.value?.networkId;
  const list = members.value;
  // Self is always visible — guards against the corner case of a mask
  // matching the user's own nick (or a hostmask the server-side nick
  // happens to fall into) which would otherwise vanish them from their
  // own nicklist.
  const filtered = networkId
    ? list.filter((m) => {
        if (isSelf(m)) return true;
        const nick = nickOf(m);
        const userhost = m && typeof m === 'object' && m.user && m.host
          ? `${nick}!${m.user}@${m.host}`
          : null;
        return !ignores.isIgnored(networkId, nick, userhost);
      })
    : list;
  return [...filtered].sort((a, b) => {
    const pa = PREFIX_ORDER.indexOf(prefixOf(a));
    const pb = PREFIX_ORDER.indexOf(prefixOf(b));
    if (pa !== pb) return pa - pb;
    return nickOf(a).localeCompare(nickOf(b), undefined, { sensitivity: 'base' });
  });
});
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
/* Away nicks lose all per-user color and render in a flat muted gray. The
   rule overrides the inline nickStyle (which is suppressed for away anyway)
   and the prefix mode colors so the whole row reads as inert. */
li.away .nick,
li.away .prefix { color: var(--fg-muted) !important; }
</style>
