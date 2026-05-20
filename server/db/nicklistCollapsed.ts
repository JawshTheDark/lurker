// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

// Per-(user, network, channel) override for the desktop nicklist collapsed
// state. Only explicitly-toggled channels have a row; everything else falls
// back to the global look.layout.show_member_list default on the client.

/** A row from the `nicklist_collapsed` table. */
export interface NicklistCollapsed {
  user_id: number;
  network_id: number;
  target: string;
  collapsed: number;
}

const listForUserStmt = db.prepare(`
  SELECT network_id AS networkId, target, collapsed FROM nicklist_collapsed
  WHERE user_id = ?
`);

const listForUserNetworkStmt = db.prepare(`
  SELECT target, collapsed FROM nicklist_collapsed
  WHERE user_id = ? AND network_id = ?
`);

const upsertStmt = db.prepare(`
  INSERT INTO nicklist_collapsed (user_id, network_id, target, collapsed)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, network_id, target)
  DO UPDATE SET collapsed = excluded.collapsed
`);

// Map<networkId, { [target]: boolean }> for the whole user, used to seed the
// snapshot the client gets on connect.
export function listCollapsedForUser(userId: number): Map<number, Record<string, boolean>> {
  const byNetwork = new Map<number, Record<string, boolean>>();
  for (const row of listForUserStmt.all(userId) as Array<{
    networkId: number;
    target: string;
    collapsed: number;
  }>) {
    if (!byNetwork.has(row.networkId)) byNetwork.set(row.networkId, {});
    byNetwork.get(row.networkId)![row.target] = !!row.collapsed;
  }
  return byNetwork;
}

// Plain { [target]: boolean } object for a single (user, network).
export function listCollapsedForUserNetwork(
  userId: number,
  networkId: number,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of listForUserNetworkStmt.all(userId, networkId) as Array<{
    target: string;
    collapsed: number;
  }>) {
    out[row.target] = !!row.collapsed;
  }
  return out;
}

export function setNicklistCollapsed(
  userId: number,
  networkId: number,
  target: string,
  collapsed: boolean | number,
): void {
  upsertStmt.run(userId, networkId, target, collapsed ? 1 : 0);
}
