// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from the `networks` table. */
export interface Network {
  id: number;
  user_id: number;
  name: string;
  host: string;
  port: number;
  tls: number;
  nick: string;
  username: string | null;
  realname: string | null;
  server_password: string | null;
  autoconnect: number;
  sasl_account: string | null;
  sasl_password: string | null;
  connect_commands: string | null;
  position: number;
  created_at: string;
}

/** A row from the `channels` table. */
export interface Channel {
  id: number;
  network_id: number;
  name: string;
  joined: number;
  created_at: string;
}

/** Fields accepted when creating or updating a network. */
export interface NetworkFields {
  name?: string;
  host?: string;
  port?: number;
  tls?: boolean | number;
  nick?: string;
  username?: string | null;
  realname?: string | null;
  server_password?: string | null;
  autoconnect?: boolean | number;
  sasl_account?: string | null;
  sasl_password?: string | null;
  connect_commands?: string | null;
}

export function listNetworksForUser(userId: number): Network[] {
  return db
    .prepare('SELECT * FROM networks WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId) as Network[];
}

export function getNetwork(id: number | bigint, userId: number): Network | undefined {
  return db.prepare('SELECT * FROM networks WHERE id = ? AND user_id = ?').get(id, userId) as
    | Network
    | undefined;
}

const ownsNetworkStmt = db.prepare('SELECT 1 FROM networks WHERE id = ? AND user_id = ? LIMIT 1');
export function ownsNetwork(userId: number, networkId: number): boolean {
  if (!userId || !networkId) return false;
  return !!ownsNetworkStmt.get(networkId, userId);
}

export function createNetwork(userId: number, fields: NetworkFields): Network | undefined {
  const {
    name,
    host,
    port,
    tls,
    nick,
    username,
    realname,
    server_password,
    autoconnect,
    sasl_account,
    sasl_password,
    connect_commands,
  } = fields;
  const { next } = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM networks WHERE user_id = ?')
    .get(userId) as { next: number };
  const result = db
    .prepare(
      `
    INSERT INTO networks (user_id, name, host, port, tls, nick, username, realname, server_password, autoconnect, sasl_account, sasl_password, connect_commands, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
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

export function updateNetwork(
  id: number,
  userId: number,
  fields: NetworkFields,
): Network | undefined {
  const allowed: (keyof NetworkFields)[] = [
    'name',
    'host',
    'port',
    'tls',
    'nick',
    'username',
    'realname',
    'server_password',
    'autoconnect',
    'sasl_account',
    'sasl_password',
    'connect_commands',
  ];
  const setClauses: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = ?`);
      let value: unknown = fields[key];
      if (key === 'tls' || key === 'autoconnect') value = value ? 1 : 0;
      params.push(value);
    }
  }
  if (!setClauses.length) return getNetwork(id, userId);
  params.push(id, userId);
  db.prepare(`UPDATE networks SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(
    ...params,
  );
  return getNetwork(id, userId);
}

export function deleteNetwork(id: number, userId: number): void {
  db.prepare('DELETE FROM networks WHERE id = ? AND user_id = ?').run(id, userId);
}

// Rewrite the sidebar order for one user. The caller must supply exactly the
// user's current set of network ids (no adds, no drops); the function returns
// null on mismatch so the caller can echo authoritative state back. On success
// returns the new ordered id list. Mirrors reorderPins().
export function reorderNetworks(userId: number, ids: unknown[]): number[] | null {
  if (!userId || !Array.isArray(ids)) return null;
  const current = (
    db.prepare('SELECT id FROM networks WHERE user_id = ?').all(userId) as Array<{ id: number }>
  ).map((r) => r.id);
  const currentSet = new Set(current);
  if (ids.length !== currentSet.size) return null;
  const numericIds: number[] = [];
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

export function listChannels(networkId: number): Channel[] {
  return db
    .prepare('SELECT * FROM channels WHERE network_id = ? ORDER BY name')
    .all(networkId) as Channel[];
}

export function upsertChannel(
  networkId: number,
  name: string,
  joined: boolean | number,
): Channel | undefined {
  db.prepare(
    `
    INSERT INTO channels (network_id, name, joined) VALUES (?, ?, ?)
    ON CONFLICT (network_id, name) DO UPDATE SET joined = excluded.joined
  `,
  ).run(networkId, name, joined ? 1 : 0);
  return db
    .prepare('SELECT * FROM channels WHERE network_id = ? AND name = ?')
    .get(networkId, name) as Channel | undefined;
}

export function deleteChannel(networkId: number, name: string): void {
  db.prepare('DELETE FROM channels WHERE network_id = ? AND name = ?').run(networkId, name);
}
