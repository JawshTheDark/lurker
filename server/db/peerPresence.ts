// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

// One row per peer per network. `state` is the most recent transition we
// know about (one of 'online' | 'offline' | 'away' | 'back'); `state_at` is
// the wall time it happened. `away_message` carries the /away reason and
// is only meaningful when state='away'. Each row is fully replaced on
// every transition — there is no per-pair history. Mirrors the "most
// recent event wins" semantics the client uses to render a singular
// marker in the DM buffer.

/** Valid peer presence states. */
export type PeerState = 'online' | 'offline' | 'away' | 'back';

/** A row from the `peer_presence_state` table. */
export interface PeerPresenceRow {
  network_id: number;
  nick: string;
  state: string;
  state_at: string;
  away_message: string | null;
}

/** Projected presence shape returned to callers (camelCase aliases). */
export interface PeerPresence {
  nick: string;
  state: PeerState;
  stateAt: string;
  awayMessage: string | null;
}

const upsertStmt = db.prepare(`
  INSERT INTO peer_presence_state (network_id, nick, state, state_at, away_message)
  VALUES (@networkId, @nick, @state, @stateAt, @awayMessage)
  ON CONFLICT(network_id, nick) DO UPDATE SET
    state = excluded.state,
    state_at = excluded.state_at,
    away_message = excluded.away_message
`);

const getRowStmt = db.prepare(`
  SELECT nick, state, state_at, away_message
  FROM peer_presence_state
  WHERE network_id = ? AND nick = ? COLLATE NOCASE
`);

const listForNetworkStmt = db.prepare(`
  SELECT nick, state, state_at, away_message
  FROM peer_presence_state
  WHERE network_id = ?
`);

const deleteRowStmt = db.prepare(`
  DELETE FROM peer_presence_state WHERE network_id = ? AND nick = ? COLLATE NOCASE
`);

function rowToState(row: PeerPresenceRow | undefined): PeerPresence | null {
  if (!row) return null;
  return {
    nick: row.nick,
    state: row.state as PeerState,
    stateAt: row.state_at,
    awayMessage: row.away_message || null,
  };
}

export function getPeerPresence(networkId: number, nick: string): PeerPresence | null {
  return rowToState(getRowStmt.get(networkId, nick) as PeerPresenceRow | undefined);
}

export function listPeerPresenceForNetwork(networkId: number): Array<PeerPresence | null> {
  return (listForNetworkStmt.all(networkId) as PeerPresenceRow[]).map(rowToState);
}

// Write a transition. Caller must have already gated for idempotency (same
// state → skip) and for invariants ('back' only valid when prev was 'away').
// awayMessage is only meaningful when state='away'; callers pass null for
// other states so the column reflects the current cycle.
export function writePeerState(
  networkId: number,
  nick: string,
  state: PeerState,
  stateAt: string,
  awayMessage: string | null = null,
): PeerPresence | null {
  upsertStmt.run({ networkId, nick, state, stateAt, awayMessage });
  return getPeerPresence(networkId, nick);
}

export function deletePeerPresence(networkId: number, nick: string): void {
  deleteRowStmt.run(networkId, nick);
}
