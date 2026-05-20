// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Derive UX state from a peer presence row. The row carries only the most
// recent transition ({ state, stateAt }); these helpers translate that to
// the boolean states BufferList / StatusBar care about.

interface PeerPresenceRow {
  state?: string;
  stateAt?: string;
}

export function isPeerOffline(peer: PeerPresenceRow | null | undefined): boolean {
  return peer?.state === 'offline';
}

export function isPeerAway(peer: PeerPresenceRow | null | undefined): boolean {
  return peer?.state === 'away';
}

// "Online" in the UX sense covers 'online' and 'back' — the peer is
// reachable and not flagged AFK. Unknown peers (null) aren't called online.
export function isPeerOnline(peer: PeerPresenceRow | null | undefined): boolean {
  return peer?.state === 'online' || peer?.state === 'back';
}
