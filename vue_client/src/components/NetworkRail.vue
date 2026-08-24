<!-- Copyright (c) 2026 Brad Root
     SPDX-License-Identifier: MPL-2.0 -->

<!--
  The network rail — the far-left icon column of the Discord-style desktop
  layout (look.layout.style = 'discord'). One rounded avatar per configured
  network, a connection dot, and a per-network unread rollup. Selecting a
  network opens its most sensible buffer; the channel list beside it
  (ChannelSidebar) then shows that network's channels.

  Deliberately thin: every piece of state comes from the same stores BufferList
  uses (networks, buffers), so the two layouts stay in sync and neither owns
  truth the other lacks.
-->
<template>
  <nav class="rail" aria-label="Networks">
    <button
      type="button"
      class="rail-btn rail-home"
      :class="{ active: isSystemActive }"
      title="Lurker system buffer"
      aria-label="Open Lurker system buffer"
      @click="selectSystem"
    >
      <i class="fa-solid fa-ghost"></i>
      <span v-if="systemUnread > 0" class="badge">{{ unreadLabel(systemUnread) }}</span>
    </button>

    <div class="rail-sep"></div>

    <button
      v-for="net in networks.networks"
      :key="net.id"
      type="button"
      class="rail-btn"
      :class="{ active: net.id === activeNetworkId }"
      :style="netStyle(net)"
      :title="net.name + ' — ' + stateLabel(net.id)"
      :aria-label="'Open ' + net.name"
      @click="openNetwork(net)"
    >
      <span class="rail-ini">{{ initials(net.name) }}</span>
      <span class="conn" :class="stateClass(net.id)"></span>
      <span v-if="netHighlights(net.id) > 0" class="badge">{{
        unreadLabel(netHighlights(net.id))
      }}</span>
      <span v-else-if="netUnread(net.id) > 0" class="badge soft">{{
        unreadLabel(netUnread(net.id))
      }}</span>
    </button>

    <button
      type="button"
      class="rail-btn rail-add"
      title="Add a network"
      aria-label="Add a network"
      @click="$emit('add-network')"
    >
      <i class="fa-solid fa-plus"></i>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNetworksStore, type Network } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { SYSTEM_KEY } from '../lib/virtualBuffers.js';
import { isChannelTarget } from '../../../shared/channels.js';
import { unreadLabel } from '../utils/unreadLabel.js';

defineEmits<{ (e: 'add-network'): void }>();

const networks = useNetworksStore();
const buffers = useBuffersStore();

const isSystemActive = computed(() => networks.activeKey === SYSTEM_KEY);
const systemUnread = computed(() => buffers.byKey(SYSTEM_KEY)?.unread || 0);

// The active network is derived from the active buffer key ("<netId>::<target>").
// The system key has no "::", so it yields NaN and matches no network — correct.
const activeNetworkId = computed(() => {
  const k = networks.activeKey;
  if (!k || !k.includes('::')) return NaN;
  return Number(k.split('::')[0]);
});

function selectSystem(): void {
  buffers.activate(null, SYSTEM_KEY);
}

// Rollups Discord shows on the server icon: a plain unread total and a louder
// mention (highlight) total. Summed across the network's buffers — the store
// keeps no per-network rollup of its own.
function netUnread(networkId: number): number {
  return buffers
    .forNetwork(networkId)
    .reduce((sum, b) => sum + (b.unread || 0), 0);
}
function netHighlights(networkId: number): number {
  return buffers
    .forNetwork(networkId)
    .reduce((sum, b) => sum + (b.highlighted || 0), 0);
}

function stateClass(networkId: number): 'good' | 'warn' | 'bad' {
  const s = networks.states[networkId]?.state;
  if (s === 'connected') return 'good';
  if (s === 'connecting' || s === 'reconnecting') return 'warn';
  return 'bad';
}
function stateLabel(networkId: number): string {
  return { good: 'connected', warn: 'connecting', bad: 'offline' }[stateClass(networkId)];
}

// Open a network from the rail. If its buffer is already focused, this is a
// no-op; otherwise pick the friendliest landing spot: a joined channel first,
// then any buffer, then the network's server buffer.
function openNetwork(net: Network): void {
  if (net.id === activeNetworkId.value) return;
  const bufs = buffers.forNetwork(net.id);
  const channel =
    bufs.find((b) => b.kind === 'channel' && b.joined) ||
    bufs.find((b) => b.kind === 'channel') ||
    bufs.find((b) => isChannelTarget(b.target));
  const target = channel?.target ?? `:server:${net.id}`;
  buffers.activate(net.id, target);
}

// Rail avatar colour, derived from the network name so it's stable without a
// stored field. A small hand-picked palette that reads on the dark rail.
const PALETTE = [
  '#7c5cff', '#e0555b', '#4aa3df', '#46c46a', '#f0b23a',
  '#e06fd0', '#3fb9b0', '#ec7a4a', '#6d8bff',
];
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h);
}
function netStyle(net: Network): Record<string, string> {
  const active = net.id === activeNetworkId.value;
  const c = PALETTE[hash(net.name) % PALETTE.length];
  return active
    ? { background: c, color: '#fff' }
    : { '--net-color': c };
}
function initials(name: string): string {
  const clean = name.replace(/^(irc\.|www\.)/i, '');
  const parts = clean.split(/[.\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}
</script>

<style scoped>
.rail {
  grid-area: rail;
  background: var(--rail-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar {
  display: none;
}

.rail-btn {
  position: relative;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  border: none;
  cursor: pointer;
  font: inherit;
  color: var(--fg);
  background: var(--rail-btn-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-radius 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.rail-btn:hover {
  border-radius: 13px;
  background: var(--net-color, var(--accent));
  color: #fff;
}
.rail-btn.active {
  border-radius: 13px;
}
/* The Discord "pill" — a tab marker on the rail's left edge. */
.rail-btn.active::before,
.rail-btn:hover::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--fg);
  height: 20px;
}
.rail-btn.active::before {
  height: 32px;
}

.rail-home {
  background: var(--accent);
  color: #fff;
}
.rail-home .fa-ghost {
  font-size: 18px;
}
.rail-add {
  color: var(--good, #46c46a);
  font-size: 18px;
}
.rail-add:hover {
  background: var(--good, #46c46a);
  color: #fff;
}

.rail-ini {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.rail-sep {
  width: 30px;
  height: 2px;
  border-radius: 1px;
  background: var(--border);
  flex-shrink: 0;
}

.conn {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 3px solid var(--rail-bg);
  background: var(--bad, #ec4a54);
}
.conn.good {
  background: var(--good, #46c46a);
}
.conn.warn {
  background: var(--warn, #f0b23a);
}

.badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--bad, #ec4a54);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  border: 3px solid var(--rail-bg);
  font-variant-numeric: tabular-nums;
}
.badge.soft {
  background: var(--fg-muted);
}
</style>
