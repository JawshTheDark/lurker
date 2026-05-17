// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: Elastic-2.0

import { defineStore } from 'pinia';
import { socketSend } from '../composables/useSocket.js';

// Per-(network, nick) free-form notes about a contact. Server is the source
// of truth — saves ship over WS and a `nick-note-updated` echo fans out to
// every session belonging to the user so notes stay in sync across devices.
// Same nick on different networks is two different people, so the keying is
// network-scoped (mirrors ignores).
//
// Editor state lives in the store too — the modal is mounted once at the
// top of the chat view and watches `editor.open`, so any call site
// (nicklist menu, DM context menu, sidebar) can open it without owning the
// component.
function key(networkId, nick) {
  return `${networkId}::${(nick || '').toLowerCase()}`;
}

export const useNickNotesStore = defineStore('nickNotes', {
  state: () => ({
    // { [networkId::nicklower]: { note: string, updatedAt: string } }
    byKey: {},
    editor: { open: false, networkId: null, nick: '' },
  }),
  getters: {
    noteFor: (state) => (networkId, nick) => state.byKey[key(networkId, nick)]?.note || '',
    hasNote: (state) => (networkId, nick) => {
      const entry = state.byKey[key(networkId, nick)];
      return !!(entry && entry.note);
    },
    entryFor: (state) => (networkId, nick) => state.byKey[key(networkId, nick)] || null,
  },
  actions: {
    applySnapshot(networks) {
      const next = {};
      for (const n of networks || []) {
        if (n?.networkId == null) continue;
        for (const entry of n.nickNotes || []) {
          if (!entry?.nick) continue;
          next[key(n.networkId, entry.nick)] = {
            note: entry.note || '',
            updatedAt: entry.updatedAt || null,
          };
        }
      }
      this.byKey = next;
    },
    applyUpdate(networkId, nick, note, updatedAt) {
      if (!networkId || !nick) return;
      const k = key(networkId, nick);
      if (note) {
        this.byKey[k] = { note, updatedAt: updatedAt || null };
      } else {
        delete this.byKey[k];
      }
    },
    setNote(networkId, nick, note) {
      if (!networkId || !nick) return;
      socketSend({ type: 'set-nick-note', networkId, nick, note: note || '' });
    },
    openEditor(networkId, nick) {
      if (!networkId || !nick) return;
      this.editor = { open: true, networkId, nick };
    },
    closeEditor() {
      this.editor = { open: false, networkId: null, nick: '' };
    },
  },
});
