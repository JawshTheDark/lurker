// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import type { ContextMenuItem } from './useContextMenu.js';
import { useBookmarksStore } from '../stores/bookmarks.js';
import { useContextMenu } from './useContextMenu.js';

export interface MessageLike {
  id?: number | null;
  nick?: string;
  text?: string;
  self?: boolean;
  userhost?: string;
  networkId?: number;
  network_id?: number;
}

export interface MessageContext {
  networkId: number;
  onIgnore(message: MessageLike): void;
}

export interface MessageActionsAPI {
  buildItems(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
  ): ContextMenuItem[];
  openMenuFor(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
    x: number,
    y: number,
  ): void;
  openMenuFromButton(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
    buttonEl: Element | null,
  ): void;
}

// Shared per-message context menu actions. Right-click, mobile long-press, and
// the hover three-dots affordance all surface the same items. The caller owns
// component-local UI for the ignore confirmation (mirrors useMemberActions)
// and passes it in via `context.onIgnore(message)`.
//
// `message` shape: { id, nick, text, self, userhost, network_id|networkId, ... }
// `context` shape: { networkId, onIgnore(message) }
export function useMessageActions(): MessageActionsAPI {
  const bookmarks = useBookmarksStore();
  const menu = useContextMenu();

  function buildItems(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
  ): ContextMenuItem[] {
    if (!message || !ctx) return [];
    const items: ContextMenuItem[] = [];

    if (message.text) {
      items.push({
        label: 'Copy text',
        icon: 'fa-regular fa-copy',
        onClick: () => {
          if (!navigator.clipboard) return;
          navigator.clipboard.writeText(String(message.text || '')).catch(() => {});
        },
      });
    }

    // Ignoring your own messages doesn't make sense; the server uses the
    // user's hostmask for delivery, not ignore filtering.
    if (!message.self && message.nick) {
      items.push({
        label: `Ignore ${message.nick}…`,
        icon: 'fa-solid fa-ban',
        onClick: () => ctx.onIgnore(message),
      });
    }

    // Bookmarks are only meaningful for messages with a stable server id.
    // Locally-echoed rows that haven't been persisted yet (rare) get a
    // disabled placeholder so the menu shape stays predictable.
    if (message.id != null) {
      const saved = bookmarks.isSaved(message.id);
      items.push({ divider: true });
      items.push({
        label: saved ? 'Remove bookmark' : 'Save message',
        icon: saved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark',
        onClick: () => bookmarks.toggle(message),
      });
    }

    return items;
  }

  function openMenuFor(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
    x: number,
    y: number,
  ): void {
    const items = buildItems(message, ctx);
    if (items.length === 0) return;
    menu.open(items, x, y);
  }

  function openMenuFromButton(
    message: MessageLike | null | undefined,
    ctx: MessageContext | null | undefined,
    buttonEl: Element | null,
  ): void {
    if (!buttonEl) return;
    const items = buildItems(message, ctx);
    if (items.length === 0) return;
    const rect = buttonEl.getBoundingClientRect();
    menu.open(items, rect.left, rect.bottom + 2, buttonEl);
  }

  return { buildItems, openMenuFor, openMenuFromButton };
}
