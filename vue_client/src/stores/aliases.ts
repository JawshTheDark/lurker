// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Client store for the user's custom slash-command aliases. Mirrors the ignores
// store: the list arrives in the initial snapshot and via `alias-list-updated`
// WS frames; edits go out over the socket and the authoritative list echoes
// back. Aliases are global (no network scope) and drive alias resolution +
// command completion in the composer.

import { defineStore } from 'pinia';
import { socketSend } from '../composables/useSocket.js';

export interface AliasEntry {
  id: number;
  name: string;
  expansion: string;
  createdAt: string;
}

export const useAliasesStore = defineStore('aliases', {
  state: () => ({
    aliases: [] as AliasEntry[],
  }),
  getters: {
    // Lowercased name → expansion, the shape the alias resolver expects.
    map: (s): Record<string, string> => {
      const m: Record<string, string> = {};
      for (const a of s.aliases) m[a.name.toLowerCase()] = a.expansion;
      return m;
    },
    // Alias names (for command tab-completion).
    names: (s): string[] => s.aliases.map((a) => a.name),
  },
  actions: {
    // From the connect snapshot.
    applySnapshot(aliases: AliasEntry[] | undefined): void {
      this.aliases = Array.isArray(aliases) ? aliases : [];
    },
    // From an `alias-list-updated` frame (the whole list, authoritative).
    applyUpdate(aliases: AliasEntry[] | undefined): void {
      this.aliases = Array.isArray(aliases) ? aliases : [];
    },
    // Add or update (server upserts by name). Optimistic UI relies on the echo.
    add(name: string, expansion: string): void {
      socketSend({ type: 'add-alias', name, expansion });
    },
    removeById(id: number): void {
      socketSend({ type: 'remove-alias', id });
    },
    removeByName(name: string): void {
      socketSend({ type: 'remove-alias', name });
    },
  },
});
