// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

// Per-user custom slash-command aliases (global — not per-network). A row is
// `/name` → `expansion` (a command-line template with mIRC-style $-params,
// interpreted client-side). `name` collates NOCASE and is unique per user, so
// re-adding an existing alias updates its expansion in place.

/** A row from the `user_aliases` table, camelCased for callers. */
export interface AliasRow {
  id: number;
  name: string;
  expansion: string;
  createdAt: string;
}

interface RawRow {
  id: number;
  name: string;
  expansion: string;
  created_at: string;
}

function toAlias(r: RawRow): AliasRow {
  return { id: r.id, name: r.name, expansion: r.expansion, createdAt: r.created_at };
}

/** All of a user's aliases, name-sorted (case-insensitive). */
export function listAliases(userId: number): AliasRow[] {
  const rows = db
    .prepare(
      `SELECT id, name, expansion, created_at FROM user_aliases
       WHERE user_id = ? ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as RawRow[];
  return rows.map(toAlias);
}

/** Insert a new alias or update an existing one's expansion (keyed by name,
 *  case-insensitively). Returns the row id + whether it was newly created. */
export function upsertAlias(
  userId: number,
  name: string,
  expansion: string,
): { id: number; created: boolean } {
  const existing = db
    .prepare(`SELECT id FROM user_aliases WHERE user_id = ? AND name = ? COLLATE NOCASE`)
    .get(userId, name) as { id: number } | undefined;
  if (existing) {
    db.prepare(`UPDATE user_aliases SET expansion = ? WHERE id = ?`).run(expansion, existing.id);
    return { id: existing.id, created: false };
  }
  const info = db
    .prepare(`INSERT INTO user_aliases (user_id, name, expansion) VALUES (?, ?, ?)`)
    .run(userId, name, expansion);
  return { id: Number(info.lastInsertRowid), created: true };
}

/** Delete a user's alias by id. Returns whether a row was removed. */
export function removeAliasById(userId: number, id: number): boolean {
  return (
    db.prepare(`DELETE FROM user_aliases WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0
  );
}

/** Delete a user's alias by name (case-insensitive). Returns the count removed. */
export function removeAliasByName(userId: number, name: string): number {
  return db
    .prepare(`DELETE FROM user_aliases WHERE user_id = ? AND name = ? COLLATE NOCASE`)
    .run(userId, name).changes;
}
