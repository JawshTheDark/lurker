// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { defineStore } from 'pinia';

let nextId = 1;

export type ToastKind = 'highlight' | 'dm' | 'always_notify' | 'notify' | 'info' | 'warn' | 'error';

// An explicit call-to-action button rendered inside the toast (e.g. the "Join"
// on a channel-invite toast). Distinct from the whole-toast click, which only
// activates an existing buffer — an action can run any handler, so it's the
// primitive for toasts that offer to *do* something rather than navigate.
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  title: string;
  body: string;
  networkId?: number;
  target?: string;
  messageId?: number;
  kind: ToastKind;
  action?: ToastAction;
}

export interface ToastOptions {
  title: string;
  body: string;
  networkId?: number;
  target?: string;
  messageId?: number;
  kind?: ToastKind;
  ttlMs?: number;
  action?: ToastAction;
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
      action,
    }: ToastOptions) {
      const id = nextId++;
      this.items.push({ id, title, body, networkId, target, messageId, kind, action });
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
