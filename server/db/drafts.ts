// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A draft row returned to callers (camelCase aliased columns). */
export interface DraftRow {
  networkId: number;
  target: string;
  body: string;
  updatedAt: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO user_drafts (user_id, network_id, target, body, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT (user_id, network_id, target) DO UPDATE SET
    body = excluded.body,
    updated_at = excluded.updated_at
`);

const clearStmt = db.prepare(`
  DELETE FROM user_drafts
   WHERE user_id = ? AND network_id = ? AND target = ?
`);

const listStmt = db.prepare(`
  SELECT network_id AS networkId, target, body, updated_at AS updatedAt
    FROM user_drafts
   WHERE user_id = ?
`);

export function upsertDraft(userId: number, networkId: number, target: string, body: string): void {
  upsertStmt.run(userId, networkId, target, body);
}

export function clearDraft(userId: number, networkId: number, target: string): void {
  clearStmt.run(userId, networkId, target);
}

// Returns every draft for this user as plain objects — the snapshot ships
// across the wire on connect (and on a tab-visibility resync).
export function listForUser(userId: number): DraftRow[] {
  return listStmt.all(userId) as DraftRow[];
}
