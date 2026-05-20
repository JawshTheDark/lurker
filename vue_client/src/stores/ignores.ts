// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { defineStore } from 'pinia';
import { socketSend } from '../composables/useSocket.js';
import { matchesAny } from '../utils/maskMatch.js';

// Per-network ignore list. Server is the source of truth — adds/removes ship
// over WS and the server fans an `ignore-list-updated` event to every session
// belonging to the user (cross-device sync). Filtering happens client-side in
// MessageList's renderRows computed, so /unignore reveals previously-hidden
// rows without needing a backlog reload.
//
// Each entry is { mask, createdAt } — the raw mask string is what the user
// typed (plain nick or nick!user@host glob); maskMatch.js handles the two
// flavors. Same nick on different networks is two different people, so the
// list is scoped per-network.

export interface IgnoreEntry {
  mask: string;
  createdAt: string;
}

export interface IgnoreEntryWithNetwork extends IgnoreEntry {
  networkId: number;
}

export const useIgnoresStore = defineStore('ignores', {
  state: () => ({
    // { [networkId]: [{ mask, createdAt }, ...] }
    byNetwork: {} as Record<number | string, IgnoreEntry[]>,
  }),
  getters: {
    masksFor: (state) => (networkId: number | string) => state.byNetwork[networkId] || [],
    // The hot path called from MessageList. networkId may be a number or
    // string depending on call site (Vue templates often stringify keys).
    isIgnored: (state) => (networkId: number | string, nick: string, userhost: string) => {
      const list = state.byNetwork[networkId] || state.byNetwork[Number(networkId)] || [];
      if (list.length === 0) return false;
      return matchesAny(list, nick, userhost);
    },
    // Flat list for the Settings panel: [{ networkId, mask, createdAt }, ...].
    allEntries: (state): IgnoreEntryWithNetwork[] => {
      const out: IgnoreEntryWithNetwork[] = [];
      for (const [networkId, list] of Object.entries(state.byNetwork)) {
        for (const entry of list || []) {
          out.push({ networkId: Number(networkId), mask: entry.mask, createdAt: entry.createdAt });
        }
      }
      return out;
    },
  },
  actions: {
    applySnapshot(networks: any[]) {
      const next: Record<number | string, IgnoreEntry[]> = {};
      for (const n of networks || []) {
        if (n?.networkId != null) next[n.networkId] = [...(n.ignoredMasks || [])];
      }
      this.byNetwork = next;
    },
    applyUpdate(networkId: number | string, masks: IgnoreEntry[]) {
      if (!networkId) return;
      this.byNetwork[networkId] = [...(masks || [])];
    },
    addMask(networkId: number | string, mask: string) {
      const trimmed = (mask || '').trim();
      if (!networkId || !trimmed) return;
      socketSend({ type: 'add-ignore', networkId, mask: trimmed });
    },
    removeMask(networkId: number | string, mask: string) {
      const trimmed = (mask || '').trim();
      if (!networkId || !trimmed) return;
      socketSend({ type: 'remove-ignore', networkId, mask: trimmed });
    },
  },
});
