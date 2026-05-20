// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { defineStore } from 'pinia';

let nextId = 1;

export type ToastKind = 'highlight' | 'dm' | 'always_notify' | 'notify' | 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  title: string;
  body: string;
  networkId?: number;
  target?: string;
  messageId?: number;
  kind: ToastKind;
}

export interface ToastOptions {
  title: string;
  body: string;
  networkId?: number;
  target?: string;
  messageId?: number;
  kind?: ToastKind;
  ttlMs?: number;
}

export const useToastsStore = defineStore('toasts', {
  state: () => ({
    items: [] as Toast[],
  }),
  actions: {
    push({
      title,
      body,
      networkId,
      target,
      messageId,
      kind = 'highlight',
      ttlMs = 5000,
    }: ToastOptions) {
      const id = nextId++;
      this.items.push({ id, title, body, networkId, target, messageId, kind });
      if (ttlMs > 0) {
        setTimeout(() => this.dismiss(id), ttlMs);
      }
      return id;
    },
    dismiss(id: number) {
      const idx = this.items.findIndex((t) => t.id === id);
      if (idx >= 0) this.items.splice(idx, 1);
    },
    clear() {
      this.items = [];
    },
  },
});
