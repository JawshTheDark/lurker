<!-- Copyright (c) 2026 Brad Root
     SPDX-License-Identifier: MPL-2.0 -->

<!--
  The Discord-style channel sidebar: the SELECTED network's channels only, in
  Favorites / Channels / Direct Messages groups. Pairs with NetworkRail (which
  chooses the network). This is a focused sibling of BufferList, not a
  replacement — the classic layout still uses BufferList untouched. All state
  comes from the same stores, so nothing here owns truth the classic list lacks.
-->
<template>
  <aside class="csb">
    <header class="csb-head">
      <div class="csb-net">
        <span class="indicator" :class="stateClass"></span>
        <span class="csb-name" :title="net?.name">{{ net?.name || 'No network' }}</span>
      </div>
      <div class="csb-head-actions">
        <button class="link" title="Add a channel" aria-label="Add a channel" @click="$emit('add-channel', displayNetId)">
          <i class="fa-solid fa-plus"></i>
        </button>
        <button class="link" title="Settings" aria-label="Settings" @click="$emit('open-settings')">
          <i class="fa-solid fa-gear"></i>
        </button>
      </div>
    </header>

    <div class="csb-list">
      <template v-if="favChannels.length">
        <div class="cat">★ Favorites</div>
        <button
          v-for="b in favChannels"
          :key="'fav' + b.id + b.target"
          class="row"
          :class="rowClass(b)"
          @click="open(b)"
        >
          <span class="hash">{{ hash(b.target) }}</span>
          <span class="rname">{{ label(b.target) }}</span>
          <span v-if="b.highlighted > 0" class="dot-badge">{{ unreadLabel(b.highlighted) }}</span>
          <span v-else-if="b.unread > 0" class="count">{{ unreadLabel(b.unread) }}</span>
        </button>
      </template>

      <div class="cat">Channels</div>
      <button
        v-for="b in channels"
        :key="'ch' + b.id + b.target"
        class="row"
        :class="rowClass(b)"
        @click="open(b)"
      >
        <span class="hash">{{ hash(b.target) }}</span>
        <span class="rname">{{ label(b.target) }}</span>
        <span v-if="b.highlighted > 0" class="dot-badge">{{ unreadLabel(b.highlighted) }}</span>
        <span v-else-if="b.unread > 0" class="count">{{ unreadLabel(b.unread) }}</span>
      </button>
      <p v-if="!channels.length && !favChannels.length" class="empty">
        No channels yet — use + to join one.
      </p>

      <template v-if="dms.length">
        <div class="cat">Direct Messages</div>
        <button
          v-for="b in dms"
          :key="'dm' + b.id + b.target"
          class="row"
          :class="rowClass(b)"
          @click="open(b)"
        >
          <span class="av" :style="{ background: avColor(b.target) }">{{ ini(b.target) }}</span>
          <span class="rname">{{ label(b.target) }}</span>
          <span v-if="b.highlighted > 0" class="dot-badge">{{ unreadLabel(b.highlighted) }}</span>
          <span v-else-if="b.unread > 0" class="count">{{ unreadLabel(b.unread) }}</span>
        </button>
      </template>
    </div>

    <footer class="csb-me">
      <span class="av me-av">{{ ini(myNick) }}</span>
      <div class="me-who">
        <b :title="myNick">{{ myNick }}</b>
        <span>{{ stateLabel }}</span>
      </div>
      <button class="link" title="Search messages" aria-label="Search messages" @click="$emit('search')">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <button class="link" title="Highlights" aria-label="Highlights" @click="$emit('highlights')">
        <i class="fa-regular fa-bell"></i>
      </button>
      <button class="link" title="Saved messages" aria-label="Saved messages" @click="$emit('bookmarks')">
        <i class="fa-regular fa-bookmark"></i>
      </button>
      <button class="link" title="Recent uploads" aria-label="Recent uploads" @click="$emit('uploads')">
        <i class="fa-solid fa-arrow-up-from-bracket"></i>
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore, type Buffer } from '../stores/buffers.js';
import { useFavoritesStore } from '../stores/favorites.js';
import { usePinsStore } from '../stores/pins.js';
import { isChannelTarget } from '../../../shared/channels.js';
import { bufferSortKey } from '../utils/bufferOrder.js';
import { unreadLabel } from '../utils/unreadLabel.js';

defineEmits<{
  (e: 'add-channel', networkId: number): void;
  (e: 'add-network'): void;
  (e: 'open-settings'): void;
  (e: 'search'): void;
  (e: 'highlights'): void;
  (e: 'bookmarks'): void;
  (e: 'uploads'): void;
}>();

const networks = useNetworksStore();
const buffers = useBuffersStore();
const favorites = useFavoritesStore();
const pins = usePinsStore();

// The network to show: the active one, or the first configured network when a
// virtual/system buffer is focused (so the list is never empty for no reason).
const displayNetId = computed(() => {
  const k = networks.activeKey;
  if (k && k.includes('::')) return Number(k.split('::')[0]);
  return networks.networks[0]?.id ?? NaN;
});
const net = computed(() => networks.networkById(displayNetId.value) ?? null);
const myNick = computed(
  () => networks.states[displayNetId.value]?.nick || net.value?.nick || 'you',
);

const stateClass = computed<'good' | 'warn' | 'bad'>(() => {
  const s = networks.states[displayNetId.value]?.state;
  if (s === 'connected') return 'good';
  if (s === 'connecting' || s === 'reconnecting') return 'warn';
  return 'bad';
});
const stateLabel = computed(
  () => ({ good: 'connected', warn: 'connecting…', bad: 'offline' })[stateClass.value],
);

function isFav(b: Buffer): boolean {
  return b.networkId != null && favorites.favoriteKeys.has(`${b.networkId}::${b.target.toLowerCase()}`);
}

const netBufs = computed(() =>
  buffers.forNetwork(displayNetId.value).filter((b) => b.kind !== 'server'),
);

const favChannels = computed(() =>
  netBufs.value.filter((b) => isChannelTarget(b.target) && isFav(b)).sort(byName),
);

// Channels: pinned first (in pin order), then the rest alphabetically. Favorites
// are pulled out into their own group above.
const channels = computed(() => {
  const pinOrder = pins.forNetwork(displayNetId.value);
  const chans = netBufs.value.filter((b) => isChannelTarget(b.target) && !isFav(b));
  const pinIndex = (t: string) => {
    const i = pinOrder.indexOf(t);
    return i === -1 ? Infinity : i;
  };
  return chans.sort((a, b) => {
    const pa = pinIndex(a.target);
    const pb = pinIndex(b.target);
    if (pa !== pb) return pa - pb;
    return byName(a, b);
  });
});

const dms = computed(() =>
  netBufs.value.filter((b) => !isChannelTarget(b.target) && !isFav(b)).sort(byName),
);

function byName(a: Buffer, b: Buffer): number {
  return bufferSortKey(a.target).localeCompare(bufferSortKey(b.target));
}

function open(b: Buffer): void {
  if (b.networkId != null) buffers.activate(b.networkId, b.target);
}
function rowClass(b: Buffer): Record<string, boolean> {
  return {
    active: networks.activeKey === `${b.networkId}::${b.target}`,
    unread: b.unread > 0 || b.highlighted > 0,
    'not-joined': b.kind === 'channel' && !b.joined,
  };
}

function hash(target: string): string {
  return target.startsWith('#') && target.startsWith('##') ? '##' : '#';
}
function label(target: string): string {
  return target.replace(/^#+/, '');
}
function ini(s: string): string {
  return (s.replace(/[^a-z0-9]/gi, '')[0] || '?').toUpperCase();
}
const AVP = ['#7c5cff', '#e0555b', '#4aa3df', '#46c46a', '#f0b23a', '#e06fd0', '#3fb9b0', '#ec7a4a'];
function avColor(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return AVP[Math.abs(h) % AVP.length];
}
</script>

<style scoped>
.csb {
  grid-area: sidebar;
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border);
}

.csb-head {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}
.csb-net {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.csb-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.indicator {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--bad);
}
.indicator.good {
  background: var(--good);
}
.indicator.warn {
  background: var(--warn);
}
.csb-head-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.link {
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: var(--fg-muted);
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.link:hover {
  background: var(--border);
  color: var(--fg);
}

.csb-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.csb-list::-webkit-scrollbar {
  width: 8px;
}
.csb-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.cat {
  padding: 14px 6px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
  opacity: 0.75;
}

.row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: 7px;
  cursor: pointer;
  color: var(--fg-muted);
  font: inherit;
  font-size: 14.5px;
  text-align: left;
  margin-top: 1px;
}
.row:hover {
  background: var(--border);
  color: var(--fg);
}
.row.active {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--fg);
  font-weight: 600;
}
.row.unread {
  color: var(--fg);
  font-weight: 600;
}
.row.not-joined {
  opacity: 0.5;
}
.hash {
  color: var(--fg-muted);
  font-weight: 600;
  flex-shrink: 0;
}
.row.active .hash {
  color: var(--accent);
}
.rname {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 11.5px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.dot-badge {
  background: var(--bad);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.empty {
  padding: 10px 8px;
  color: var(--fg-muted);
  font-size: 13px;
  opacity: 0.8;
}

.av {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.csb-me {
  height: 54px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.me-av {
  width: 32px;
  height: 32px;
  font-size: 13px;
  background: var(--accent);
}
.me-who {
  flex: 1;
  min-width: 0;
}
.me-who b {
  display: block;
  font-size: 13.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.me-who span {
  display: block;
  font-size: 11.5px;
  color: var(--fg-muted);
}
</style>
