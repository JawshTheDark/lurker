import db from './index.js';

const clearStmt = db.prepare('DELETE FROM chanlist_channels WHERE network_id = ?');
const upsertStmt = db.prepare(`
  INSERT INTO chanlist_channels (network_id, name, topic, num_users)
  VALUES (@networkId, @name, @topic, @numUsers)
  ON CONFLICT(network_id, name) DO UPDATE SET
    topic = excluded.topic,
    num_users = excluded.num_users
`);
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM chanlist_channels WHERE network_id = ?');

export function clearChannels(networkId) {
  clearStmt.run(networkId);
}

// Bulk upsert is wrapped in a transaction so a 6k-row batch (worst case the
// IRC server hands us everything in one numerics burst) is one fsync, not
// thousands. Channel name is the conflict key — re-running /LIST over an
// existing cache updates topic/user counts in place.
export const upsertChannels = db.transaction((networkId, rows) => {
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

export function countChannels(networkId) {
  return countStmt.get(networkId).n;
}

// Sort whitelist — channel name and user count are the meaningful options.
// Falling back to num_users DESC matches what IRC clients usually default to
// (the popular channels first).
const SORT_COLUMNS = { name: 'name', users: 'num_users' };

export function searchChannels(networkId, {
  query = '',
  sortBy = 'users',
  sortDir = 'desc',
  offset = 0,
  limit = 200,
} = {}) {
  const col = SORT_COLUMNS[sortBy] || SORT_COLUMNS.users;
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const lim = Math.min(Math.max(Number(limit) || 0, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const q = String(query || '').trim();

  // Tiebreaker on name keeps pagination stable when many rows share the same
  // user count (especially zeroes). Without it the same row could appear on
  // page 1 and page 2 across requests.
  const orderBy = `${col} ${dir}, name ASC`;

  if (!q) {
    const rows = db.prepare(`
      SELECT name, topic, num_users
      FROM chanlist_channels
      WHERE network_id = ?
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(networkId, lim, off);
    return { rows: rows.map(rowToJson), total: countChannels(networkId) };
  }

  const like = `%${q}%`;
  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM chanlist_channels
    WHERE network_id = ?
      AND (name LIKE ? COLLATE NOCASE OR topic LIKE ? COLLATE NOCASE)
  `).get(networkId, like, like).n;
  const rows = db.prepare(`
    SELECT name, topic, num_users
    FROM chanlist_channels
    WHERE network_id = ?
      AND (name LIKE ? COLLATE NOCASE OR topic LIKE ? COLLATE NOCASE)
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(networkId, like, like, lim, off);
  return { rows: rows.map(rowToJson), total };
}

function rowToJson(r) {
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

export function getMeta(networkId) {
  const row = getMetaStmt.get(networkId);
  if (!row) return { fetchedAt: null, inProgress: false, totalCount: 0 };
  return {
    fetchedAt: row.fetched_at || null,
    inProgress: !!row.in_progress,
    totalCount: row.total_count || 0,
  };
}

// Partial patch — anything not provided is preserved from the existing row.
// Lets callers express "just bump total_count" without re-stating fetched_at.
export function setMeta(networkId, patch) {
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
