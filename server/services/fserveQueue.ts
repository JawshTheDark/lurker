// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// The fserve send queue — the classic "Sends:[x/N]  Queues:[y/M]" model from
// real IRC file servers. A `get` doesn't fire a DCC SEND immediately; it asks
// the queue for a slot. Up to `maxSends` transfers run at once; the rest wait in
// an ordered queue (up to `maxQueue`), and each completed send promotes the next
// waiter. One queue is shared across all of a user's fserve chat sessions, so a
// peer can't dodge the limit by opening several sessions.
//
// Pure + DB-free + process-bound, like the DCC engines and the command
// interpreter: it holds only in-memory items and reads its limits live through a
// callback so a settings change takes effect without a restart. The caller
// (ircConnection) owns the actual DCC send and calls settle() when a send ends.

export interface FserveSendItem {
  /** Monotonic per-queue id, assigned on request(). Ties an active send back to
   *  its queue slot so settle() can free the right one. */
  id: number;
  /** Requester nick (as seen); matched case-insensitively for clr_queue. */
  nick: string;
  /** In-sandbox absolute path to send. */
  absPath: string;
  /** Display filename (basename). */
  filename: string;
  /** File size in bytes, for banners/queue listings. */
  size: number;
}

export interface FserveQueueLimits {
  /** Concurrent DCC sends. */
  maxSends: number;
  /** Waiting slots beyond the active sends. */
  maxQueue: number;
}

export type FserveRequestOutcome =
  | { status: 'send'; item: FserveSendItem } // a slot was free — dispatch now
  | { status: 'queued'; item: FserveSendItem; position: number } // waiting at 1-based position
  | { status: 'full'; maxQueue: number }; // no room — rejected

export class FserveQueue {
  private readonly active = new Map<number, FserveSendItem>();
  private waiting: FserveSendItem[] = [];
  private seq = 0;

  /** `limits` is read live on every decision so settings changes apply at once. */
  constructor(private readonly limits: () => FserveQueueLimits) {}

  /** Ask for a send slot. Returns whether to send now, queue, or reject. */
  request(nick: string, absPath: string, filename: string, size: number): FserveRequestOutcome {
    const item: FserveSendItem = { id: ++this.seq, nick, absPath, filename, size };
    const { maxSends, maxQueue } = this.limits();
    if (this.active.size < Math.max(1, maxSends)) {
      this.active.set(item.id, item);
      return { status: 'send', item };
    }
    if (this.waiting.length < Math.max(0, maxQueue)) {
      this.waiting.push(item);
      return { status: 'queued', item, position: this.waiting.length };
    }
    return { status: 'full', maxQueue: Math.max(0, maxQueue) };
  }

  /**
   * A dispatched send reached a terminal state (done/failed/cancelled). Free its
   * slot and, if room opened, promote + return the next waiter for the caller to
   * dispatch. Idempotent: settling an unknown id is a no-op. Returns null when
   * nothing is promoted.
   */
  settle(itemId: number): FserveSendItem | null {
    this.active.delete(itemId);
    const { maxSends } = this.limits();
    if (this.active.size < Math.max(1, maxSends) && this.waiting.length > 0) {
      const next = this.waiting.shift() as FserveSendItem;
      this.active.set(next.id, next);
      return next;
    }
    return null;
  }

  /** Active (in-flight) sends, in no particular order. */
  activeSends(): FserveSendItem[] {
    return [...this.active.values()];
  }

  /** Waiting items in queue order (position 1 first). */
  queued(): FserveSendItem[] {
    return [...this.waiting];
  }

  activeCount(): number {
    return this.active.size;
  }
  queuedCount(): number {
    return this.waiting.length;
  }

  /** Remove a caller's own waiting items (not their active send). Returns how
   *  many were dropped. */
  clearFor(nick: string): number {
    const key = nick.toLowerCase();
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((i) => i.nick.toLowerCase() !== key);
    return before - this.waiting.length;
  }

  /** Drop every waiting item (active sends keep running). Returns the count. */
  clearAll(): number {
    const n = this.waiting.length;
    this.waiting = [];
    return n;
  }

  /** Drop all state for a nick (their waiting items) — used when their session
   *  closes so a stale queue slot doesn't hold a promotion for a gone peer.
   *  Active sends are left alone (the transfer may still complete). */
  dropWaitingFor(nick: string): number {
    return this.clearFor(nick);
  }
}
