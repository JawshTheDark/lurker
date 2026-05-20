// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from the `user_settings` table. */
export interface UserSetting {
  user_id: number;
  key: string;
  value: string;
  updated_at: string;
}

export function getUserSettings(userId: number): Record<string, unknown> {
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
    .all(userId) as Array<{ key: string; value: string }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch (_) {
      // Skip malformed rows; treat as if unset.
    }
  }
  return out;
}

const upsertStmt = db.prepare(`
  INSERT INTO user_settings (user_id, key, value, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT (user_id, key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

export function setUserSetting(userId: number, key: string, value: unknown): void {
  upsertStmt.run(userId, key, JSON.stringify(value));
}

export function deleteUserSetting(userId: number, key: string): void {
  db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, key);
}
