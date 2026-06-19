<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0
-->

<template>
  <section id="ignores" class="settings-pane">
    <h2>ignores</h2>
    <p class="section-desc">
      Ignore rules match by nick/hostmask (<code>nick!user@host</code> with
      <code>*</code> wildcards), and can be scoped to channels, message text, and event types
      (joins, public, notices, …). The full options live in the <code>/ignore</code> command; this
      list shows what's active and lets you remove entries to reveal the history again.
    </p>
    <p v-if="!ignoreGroups.length" class="muted small">
      No ignores yet. Right-click a nick in the member list, or type
      <code>/ignore &lt;nick&gt;</code> in any buffer.
    </p>
    <template v-for="group in ignoreGroups" :key="group.networkId">
      <h3 class="subhead">{{ group.networkName }}</h3>
      <ul class="device-list">
        <li v-for="entry in group.masks" :key="entry.id" class="device">
          <span class="ua">{{ entry.mask ?? '*' }}</span>
          <span class="muted small ignore-detail">{{ describe(entry) }}</span>
          <button class="link danger" @click="onIgnoreRemove(group.networkId, entry.id)">
            remove
          </button>
        </li>
      </ul>
    </template>
    <h3 v-if="ignoreNetworkOptions.length" class="subhead">add</h3>
    <div class="rule-add" v-if="ignoreNetworkOptions.length">
      <select v-model="newIgnoreNetworkId">
        <option :value="null" disabled>network…</option>
        <option v-for="opt in ignoreNetworkOptions" :key="opt.id" :value="opt.id">
          {{ opt.name }}
        </option>
      </select>
      <input
        v-model="newIgnoreMask"
        type="text"
        placeholder="nick or nick!user@host"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @keydown.enter="onIgnoreAdd"
      />
      <button
        class="link"
        :disabled="!newIgnoreNetworkId || !newIgnoreMask.trim()"
        @click="onIgnoreAdd"
      >
        add
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useNetworksStore } from '../../stores/networks.js';
import { useIgnoresStore, type IgnoreEntryWithNetwork } from '../../stores/ignores.js';

interface IgnoreGroup {
  networkId: number;
  networkName: string;
  masks: IgnoreEntryWithNetwork[];
}

// One-line summary of a rule's non-mask dimensions for the settings list.
function describe(entry: IgnoreEntryWithNetwork): string {
  const parts: string[] = [];
  if (entry.levels?.length) parts.push(entry.levels.join(','));
  if (entry.channels?.length) parts.push(entry.channels.join(','));
  if (entry.pattern) {
    parts.push(entry.patternKind === 'regex' ? `/${entry.pattern}/` : `"${entry.pattern}"`);
  }
  if (entry.isExcept) parts.push('except');
  if (entry.expiresAt) parts.push(`expires ${entry.expiresAt}`);
  return parts.join('  ');
}

interface NetworkOption {
  id: number;
  name: string;
}

const networksStore = useNetworksStore();
const ignoresStore = useIgnoresStore();

// Per-network ignore lists, sorted by network name. Each entry is
// { networkId, networkName, masks: [{mask, createdAt}, ...] }. We render
// only networks that actually have entries (no empty groups); the add form
// lets users pick any network they own.
const ignoreGroups = computed<IgnoreGroup[]>(() => {
  const byNet = new Map<number, IgnoreEntryWithNetwork[]>();
  for (const entry of ignoresStore.allEntries) {
    const list = byNet.get(entry.networkId);
    if (list) list.push(entry);
    else byNet.set(entry.networkId, [entry]);
  }
  const groups: IgnoreGroup[] = [];
  for (const [networkId, masks] of byNet) {
    groups.push({
      networkId,
      networkName: networksStore.networkById(networkId)?.name || `net:${networkId}`,
      masks,
    });
  }
  return groups.toSorted((a, b) => a.networkName.localeCompare(b.networkName));
});

const ignoreNetworkOptions = computed<NetworkOption[]>(() => {
  return (networksStore.networks || [])
    .map((n) => ({ id: n.id, name: n.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
});

const newIgnoreNetworkId = ref<number | null>(null);
const newIgnoreMask = ref('');

watch(
  ignoreNetworkOptions,
  (opts) => {
    if (opts.length === 1) {
      newIgnoreNetworkId.value = opts[0].id;
    } else if (newIgnoreNetworkId.value && !opts.some((o) => o.id === newIgnoreNetworkId.value)) {
      newIgnoreNetworkId.value = null;
    }
  },
  { immediate: true },
);

function onIgnoreAdd() {
  const networkId = Number(newIgnoreNetworkId.value);
  const mask = newIgnoreMask.value.trim();
  if (!networkId || !mask) return;
  ignoresStore.addMask(networkId, mask);
  newIgnoreMask.value = '';
}

function onIgnoreRemove(networkId: number, id: number) {
  ignoresStore.removeRule(networkId, { id });
}
</script>

<style src="./panes.css"></style>
<style scoped>
.rule-add {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-top: var(--space-5);
}
.rule-add input[type='text'] {
  flex: 1;
  min-width: 200px;
}
.ignore-detail {
  margin-left: var(--space-3);
}
</style>
