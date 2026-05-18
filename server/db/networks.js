// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: Elastic-2.0

import db from './index.js';

export function listNetworksForUser(userId) {
  return db
    .prepare('SELECT * FROM networks WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
}

export function getNetwork(id, userId) {
  return db.prepare('SELECT * FROM networks WHERE id = ? AND user_id = ?').get(id, userId);
}

const ownsNetworkStmt = db.prepare('SELECT 1 FROM networks WHERE id = ? AND user_id = ? LIMIT 1');
export function ownsNetwork(userId, networkId) {
  if (!userId || !networkId) return false;
  return !!ownsNetworkStmt.get(networkId, userId);
}

export function createNetwork(userId, fields) {
  const { name, host, port, tls, nick, username, realname, server_password, autoconnect, sasl_account, sasl_password, connect_commands } = fields;
  const { next } = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM networks WHERE user_id = ?')
    .get(userId);
  const result = db.prepare(`
    INSERT INTO networks (user_id, name, host, port, tls, nick, username, realname, server_password, autoconnect, sasl_account, sasl_password, connect_commands, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    name,
    host,
    port ?? 6697,
    tls ? 1 : 0,
    nick,
    username || null,
    realname || null,
    server_password || null,
    autoconnect === false ? 0 : 1,
    sasl_account || null,
    sasl_password || null,
    connect_commands || null,
    next,
  );
  return getNetwork(result.lastInsertRowid, userId);
}

export function updateNetwork(id, userId, fields) {
  const allowed = ['name', 'host', 'port', 'tls', 'nick', 'username', 'realname', 'server_password', 'autoconnect', 'sasl_account', 'sasl_password', 'connect_commands'];
  const setClauses = [];
  const params = [];
  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = ?`);
      let value = fields[key];
      if (key === 'tls' || key === 'autoconnect') value = value ? 1 : 0;
      params.push(value);
    }
  }
  if (!setClauses.length) return getNetwork(id, userId);
  params.push(id, userId);
  db.prepare(`UPDATE networks SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  return getNetwork(id, userId);
}

export function deleteNetwork(id, userId) {
  db.prepare('DELETE FROM networks WHERE id = ? AND user_id = ?').run(id, userId);
}

// Rewrite the sidebar order for one user. The caller must supply exactly the
// user's current set of network ids (no adds, no drops); the function returns
// null on mismatch so the caller can echo authoritative state back. On success
// returns the new ordered id list. Mirrors reorderPins().
export function reorderNetworks(userId, ids) {
  if (!userId || !Array.isArray(ids)) return null;
  const current = db
    .prepare('SELECT id FROM networks WHERE user_id = ?')
    .all(userId)
    .map((r) => r.id);
  const currentSet = new Set(current);
  if (ids.length !== currentSet.size) return null;
  const numericIds = [];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isInteger(id) || !currentSet.has(id)) return null;
    numericIds.push(id);
  }
  const setPos = db.prepare('UPDATE networks SET position = ? WHERE id = ? AND user_id = ?');
  const tx = db.transaction(() => {
    let i = 0;
    for (const id of numericIds) {
      setPos.run(i, id, userId);
      i += 1;
    }
  });
  tx();
  return [...numericIds];
}

export function listChannels(networkId) {
  return db.prepare('SELECT * FROM channels WHERE network_id = ? ORDER BY name').all(networkId);
}

export function upsertChannel(networkId, name, joined) {
  db.prepare(`
    INSERT INTO channels (network_id, name, joined) VALUES (?, ?, ?)
    ON CONFLICT (network_id, name) DO UPDATE SET joined = excluded.joined
  `).run(networkId, name, joined ? 1 : 0);
  return db.prepare('SELECT * FROM channels WHERE network_id = ? AND name = ?').get(networkId, name);
}

export function deleteChannel(networkId, name) {
  db.prepare('DELETE FROM channels WHERE network_id = ? AND name = ?').run(networkId, name);
}
