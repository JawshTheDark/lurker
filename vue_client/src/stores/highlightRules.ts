// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { defineStore } from 'pinia';
import { api } from '../api.js';

export interface HighlightRule {
  id: number;
  pattern: string;
  auto_managed: boolean;
  enabled: boolean;
}

export const useHighlightRulesStore = defineStore('highlightRules', {
  state: () => ({
    rules: [] as HighlightRule[],
    loaded: false,
    loading: false,
    error: '',
  }),
  getters: {
    userRules: (state) => state.rules.filter((r) => !r.auto_managed),
    autoRules: (state) => state.rules.filter((r) => r.auto_managed),
  },
  actions: {
    async fetchAll() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      try {
        const { rules } = await api('/api/highlight-rules');
        this.rules = rules || [];
        this.loaded = true;
      } catch (e: any) {
        this.error = e.message || 'failed to load rules';
        throw e;
      } finally {
        this.loading = false;
      }
    },
    async create(fields: Partial<HighlightRule>) {
      const { rule } = await api('/api/highlight-rules', { method: 'POST', body: fields });
      this.rules.push(rule);
      return rule as HighlightRule;
    },
    async update(id: number, fields: Partial<HighlightRule>) {
      const { rule } = await api(`/api/highlight-rules/${id}`, { method: 'PATCH', body: fields });
      const idx = this.rules.findIndex((r) => r.id === id);
      if (idx >= 0) this.rules[idx] = rule;
      return rule as HighlightRule;
    },
    async remove(id: number) {
      await api(`/api/highlight-rules/${id}`, { method: 'DELETE' });
      this.rules = this.rules.filter((r) => r.id !== id);
    },
    applyServerChanged() {
      // Re-fetch when the server signals rules changed (rare; another tab edited).
      this.fetchAll().catch(() => {
        /* ignore */
      });
    },
  },
});
