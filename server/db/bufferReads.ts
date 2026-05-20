// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from `buffer_reads`. */
export interface BufferRead {
  user_id: number;
  network_id: number;
  target: string;
  last_read_message_id: number;
  updated_at: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO buffer_reads (user_id, network_id, target, last_read_message_id, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, network_id, target) DO UPDATE SET
    last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
    updated_at = excluded.updated_at
`);

const getOneStmt = db.prepare(`
  SELECT last_read_message_id AS lastReadId
  FROM buffer_reads
  WHERE user_id = ? AND network_id = ? AND target = ?
`);

const listForUserStmt = db.prepare(`
  SELECT network_id AS networkId, target, last_read_message_id AS lastReadId
  FROM buffer_reads
  WHERE user_id = ?
`);

// Returns map keyed by `${networkId}::${target}` → lastReadId.
export function listReadStateForUser(userId: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of listForUserStmt.all(userId) as Array<{
    networkId: number;
    target: string;
    lastReadId: number;
  }>) {
    out[`${row.networkId}::${row.target}`] = row.lastReadId;
  }
  return out;
}

export function getReadState(userId: number, networkId: number, target: string): number {
  const row = getOneStmt.get(userId, networkId, target) as { lastReadId: number } | undefined;
  return row ? row.lastReadId : 0;
}

// Clamps to MAX(existing, requested) via the ON CONFLICT clause. Returns the
// resulting lastReadId so the caller can broadcast a value the server agrees
// with rather than echoing what the client sent.
export function setReadState(
  userId: number,
  networkId: number,
  target: string,
  messageId: number,
): number {
  const id = Number(messageId);
  if (!Number.isFinite(id) || id <= 0) return getReadState(userId, networkId, target);
  upsertStmt.run(userId, networkId, target, id);
  return getReadState(userId, networkId, target);
}
