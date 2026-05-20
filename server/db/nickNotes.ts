// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

// Per-(user, network, nick) free-form notes. Operator-visible memory aid —
// "lives in Berlin", "spouse: Pat", that kind of thing. nick collates NOCASE
// so case-flips don't fragment, and same nick on different networks gets its
// own row because they may not be the same person.

/** A row from the `user_nick_notes` table. */
export interface UserNickNote {
  user_id: number;
  network_id: number;
  nick: string;
  note: string;
  updated_at: string;
}

/** Projected note shape returned to callers (camelCase aliases). */
export interface NoteResult {
  note: string;
  updatedAt: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO user_nick_notes (user_id, network_id, nick, note, updated_at)
  VALUES (@userId, @networkId, @nick, @note, datetime('now'))
  ON CONFLICT(user_id, network_id, nick) DO UPDATE SET
    note = excluded.note,
    updated_at = excluded.updated_at
`);

const deleteStmt = db.prepare(`
  DELETE FROM user_nick_notes
  WHERE user_id = @userId AND network_id = @networkId AND nick = @nick COLLATE NOCASE
`);

const getStmt = db.prepare(`
  SELECT note, updated_at AS updatedAt FROM user_nick_notes
  WHERE user_id = ? AND network_id = ? AND nick = ? COLLATE NOCASE
`);

const listForUserStmt = db.prepare(`
  SELECT network_id AS networkId, nick, note, updated_at AS updatedAt
  FROM user_nick_notes
  WHERE user_id = ?
`);

export function setNote({
  userId,
  networkId,
  nick,
  note,
}: {
  userId: number;
  networkId: number;
  nick: string;
  note: string;
}): NoteResult | null {
  const trimmed = (note || '').trim();
  if (!trimmed) {
    deleteStmt.run({ userId, networkId, nick });
    return null;
  }
  upsertStmt.run({ userId, networkId, nick, note: trimmed });
  return (getStmt.get(userId, networkId, nick) as NoteResult | undefined) ?? null;
}

export function getNote({
  userId,
  networkId,
  nick,
}: {
  userId: number;
  networkId: number;
  nick: string;
}): NoteResult | null {
  return (getStmt.get(userId, networkId, nick) as NoteResult | undefined) ?? null;
}

// Map<networkId, [{ nick, note, updatedAt }, ...]> for snapshot seeding.
export function listForUserGrouped(
  userId: number,
): Map<number, Array<{ nick: string; note: string; updatedAt: string }>> {
  const out = new Map<number, Array<{ nick: string; note: string; updatedAt: string }>>();
  for (const row of listForUserStmt.all(userId) as Array<{
    networkId: number;
    nick: string;
    note: string;
    updatedAt: string;
  }>) {
    const entry = { nick: row.nick, note: row.note, updatedAt: row.updatedAt };
    const list = out.get(row.networkId);
    if (list) list.push(entry);
    else out.set(row.networkId, [entry]);
  }
  return out;
}
