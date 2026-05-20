// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from `chanlist_channels`. */
export interface ChanlistChannel {
  network_id: number;
  name: string;
  topic: string | null;
  num_users: number;
}

/** A row from `chanlist_meta`. */
export interface ChanlistMeta {
  network_id: number;
  fetched_at: string | null;
  in_progress: number;
  total_count: number;
}

/** The JSON-serialisable channel object returned to callers. */
export interface ChannelJson {
  channel: string;
  topic: string;
  num_users: number;
}

/** The shaped meta object returned to callers. */
export interface MetaShape {
  fetchedAt: string | null;
  inProgress: boolean;
  totalCount: number;
}

/** Input row shape accepted by upsertChannels. */
export interface ChannelInput {
  channel?: string;
  topic?: string | null;
  num_users?: number;
}

const clearStmt = db.prepare('DELETE FROM chanlist_channels WHERE network_id = ?');
const upsertStmt = db.prepare(`
  INSERT INTO chanlist_channels (network_id, name, topic, num_users)
  VALUES (@networkId, @name, @topic, @numUsers)
  ON CONFLICT(network_id, name) DO UPDATE SET
    topic = excluded.topic,
    num_users = excluded.num_users
`);
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM chanlist_channels WHERE network_id = ?');

export function clearChannels(networkId: number): void {
  clearStmt.run(networkId);
}

// Bulk upsert is wrapped in a transaction so a 6k-row batch (worst case the
// IRC server hands us everything in one numerics burst) is one fsync, not
// thousands. Channel name is the conflict key — re-running /LIST over an
// existing cache updates topic/user counts in place.
export const upsertChannels = db.transaction((networkId: number, rows: ChannelInput[]) => {
  for (const r of rows) {
    if (!r || !r.channel) continue;
    upsertStmt.run({
      networkId,
      name: r.channel,
      topic: r.topic || null,
      numUsers: Number.isFinite(r.num_users) ? r.num_users : 0,
    });
  }
});

export function countChannels(networkId: number): number {
  return (countStmt.get(networkId) as { n: number }).n;
}

// Sort whitelist — channel name and user count are the meaningful options.
// Falling back to num_users DESC matches what IRC clients usually default to
// (the popular channels first).
const SORT_COLUMNS: Record<string, string> = { name: 'name', users: 'num_users' };

export function searchChannels(
  networkId: number,
  {
    query = '',
    sortBy = 'users',
    sortDir = 'desc',
    offset = 0,
    limit = 200,
  }: {
    query?: string;
    sortBy?: string;
    sortDir?: string;
    offset?: number;
    limit?: number;
  } = {},
): { rows: ChannelJson[]; total: number } {
  const col = SORT_COLUMNS[sortBy] ?? SORT_COLUMNS['users'];
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const lim = Math.min(Math.max(Number(limit) || 0, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const q = String(query || '').trim();

  // Tiebreaker on name keeps pagination stable when many rows share the same
  // user count (especially zeroes). Without it the same row could appear on
  // page 1 and page 2 across requests.
  const orderBy = `${col} ${dir}, name ASC`;

  if (!q) {
    const rows = db
      .prepare(
        `
      SELECT name, topic, num_users
      FROM chanlist_channels
      WHERE network_id = ?
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `,
      )
      .all(networkId, lim, off) as ChanlistChannel[];
    return { rows: rows.map(rowToJson), total: countChannels(networkId) };
  }

  const like = `%${q}%`;
  const total = (
    db
      .prepare(
        `
    SELECT COUNT(*) AS n FROM chanlist_channels
    WHERE network_id = ?
      AND (name LIKE ? COLLATE NOCASE OR topic LIKE ? COLLATE NOCASE)
  `,
      )
      .get(networkId, like, like) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `
    SELECT name, topic, num_users
    FROM chanlist_channels
    WHERE network_id = ?
      AND (name LIKE ? COLLATE NOCASE OR topic LIKE ? COLLATE NOCASE)
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `,
    )
    .all(networkId, like, like, lim, off) as ChanlistChannel[];
  return { rows: rows.map(rowToJson), total };
}

function rowToJson(r: ChanlistChannel): ChannelJson {
  return { channel: r.name, topic: r.topic || '', num_users: r.num_users };
}

const getMetaStmt = db.prepare('SELECT * FROM chanlist_meta WHERE network_id = ?');
const upsertMetaStmt = db.prepare(`
  INSERT INTO chanlist_meta (network_id, fetched_at, in_progress, total_count)
  VALUES (@networkId, @fetchedAt, @inProgress, @totalCount)
  ON CONFLICT(network_id) DO UPDATE SET
    fetched_at = excluded.fetched_at,
    in_progress = excluded.in_progress,
    total_count = excluded.total_count
`);

export function getMeta(networkId: number): MetaShape {
  const row = getMetaStmt.get(networkId) as ChanlistMeta | undefined;
  if (!row) return { fetchedAt: null, inProgress: false, totalCount: 0 };
  return {
    fetchedAt: row.fetched_at || null,
    inProgress: !!row.in_progress,
    totalCount: row.total_count || 0,
  };
}

// Partial patch — anything not provided is preserved from the existing row.
// Lets callers express "just bump total_count" without re-stating fetched_at.
export function setMeta(networkId: number, patch: Partial<MetaShape>): MetaShape {
  const current = getMeta(networkId);
  const next = { ...current, ...patch };
  upsertMetaStmt.run({
    networkId,
    fetchedAt: next.fetchedAt || null,
    inProgress: next.inProgress ? 1 : 0,
    totalCount: Number.isFinite(next.totalCount) ? next.totalCount : 0,
  });
  return next;
}
