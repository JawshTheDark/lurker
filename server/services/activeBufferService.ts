// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Server-side awareness of which buffer each client currently has focused, so
// routing (e.g. notice.msgbuffer='active') can steer an event to "the window
// you're looking at" — the mIRC "show in active window" behavior.
//
// Lurker is multi-device: one user can have several sockets open, each on a
// different buffer, some hidden. So there is no single "active buffer" — we
// track it PER CONNECTION and resolve the effective one on demand: among a
// user's connections ON A GIVEN NETWORK, prefer a VISIBLE tab, then the most
// recently focused. Entries are keyed by a connection id and dropped when the
// socket closes (wsHub owns that lifecycle), so state self-cleans and a stale
// disconnected tab never wins.
//
// A leaf module with no other service deps: wsHub writes (setActive/setVisible/
// drop), ircConnection reads (activeTarget) — no import cycle. The selection
// logic is pure and unit-tested.

export interface ActiveBufferEntry {
  userId: number;
  /** The network the focused buffer belongs to; null for virtual buffers
   *  (:system:, :friends:) which are never a routing target for a network event. */
  networkId: number | null;
  /** The buffer target (#chan, a nick, :server:<id>, …). */
  target: string;
  /** Whether that connection's tab is currently visible (from presence). */
  visible: boolean;
  /** Monotonic focus order — higher = more recently focused. */
  seq: number;
}

class ActiveBufferService {
  private readonly byConn = new Map<number, ActiveBufferEntry>();
  private seq = 0;

  /** Record the buffer a connection just focused. */
  setActive(
    connId: number,
    userId: number,
    networkId: number | null,
    target: string,
    visible: boolean,
  ): void {
    this.byConn.set(connId, { userId, networkId, target, visible, seq: ++this.seq });
  }

  /** Update a connection's tab visibility (from a presence frame). Recency is
   *  left untouched — visibility is a stronger signal than order in selection. */
  setVisible(connId: number, visible: boolean): void {
    const e = this.byConn.get(connId);
    if (e) e.visible = visible;
  }

  /** Forget a connection (socket closed). Idempotent. */
  drop(connId: number): void {
    this.byConn.delete(connId);
  }

  /**
   * The buffer `userId` is effectively "looking at" on `networkId`, or null when
   * they have no connection focused on that network. Prefers a visible tab, then
   * the most recently focused.
   */
  activeTarget(userId: number, networkId: number): string | null {
    let best: ActiveBufferEntry | null = null;
    for (const e of this.byConn.values()) {
      if (e.userId !== userId || e.networkId !== networkId) continue;
      if (!best) {
        best = e;
      } else if (e.visible !== best.visible ? e.visible : e.seq > best.seq) {
        best = e;
      }
    }
    return best ? best.target : null;
  }

  /** Test/reset hook. */
  clear(): void {
    this.byConn.clear();
    this.seq = 0;
  }
}

const activeBufferService = new ActiveBufferService();
export default activeBufferService;
