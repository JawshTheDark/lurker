// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from `channel_notify_settings`. */
export interface ChannelNotifySetting {
  user_id: number;
  network_id: number;
  target: string;
  notify_always: number;
  updated_at: string;
}

/** Per-target notify settings shape returned to callers. */
export interface ChannelNotifyShape {
  notifyAlways: boolean;
}

// Per-(user, network, channel) notification overrides. Only the
// `notify_always` flag is exposed today: when set, every message in the
// channel is treated like a notification trigger for push/toast purposes,
// without lighting the channel up as a visual highlight. Absent rows mean
// all flags are 0 (default off).

const getStmt = db.prepare(`
  SELECT notify_always FROM channel_notify_settings
  WHERE user_id = ? AND network_id = ? AND target = ?
`);

const listForUserStmt = db.prepare(`
  SELECT network_id AS networkId, target, notify_always AS notifyAlways
  FROM channel_notify_settings
  WHERE user_id = ?
`);

const upsertStmt = db.prepare(`
  INSERT INTO channel_notify_settings (user_id, network_id, target, notify_always, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, network_id, target)
  DO UPDATE SET notify_always = excluded.notify_always, updated_at = excluded.updated_at
`);

const deleteStmt = db.prepare(`
  DELETE FROM channel_notify_settings
  WHERE user_id = ? AND network_id = ? AND target = ?
`);

export function getChannelNotifyAlways(userId: number, networkId: number, target: string): boolean {
  const row = getStmt.get(userId, networkId, target) as { notify_always: number } | undefined;
  return !!(row && row.notify_always);
}

// Map<networkId, { [target]: { notifyAlways: boolean } }> snapshot for the
// whole user, shaped to drop straight into the client's channelNotify store.
export function listChannelNotifyForUser(
  userId: number,
): Map<number, Record<string, ChannelNotifyShape>> {
  const byNetwork = new Map<number, Record<string, ChannelNotifyShape>>();
  for (const row of listForUserStmt.all(userId) as Array<{
    networkId: number;
    target: string;
    notifyAlways: number;
  }>) {
    if (!byNetwork.has(row.networkId)) byNetwork.set(row.networkId, {});
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    byNetwork.get(row.networkId)![row.target] = {
      notifyAlways: !!row.notifyAlways,
    };
  }
  return byNetwork;
}

export function setChannelNotifyAlways(
  userId: number,
  networkId: number,
  target: string,
  notifyAlways: boolean,
): void {
  if (notifyAlways) {
    upsertStmt.run(userId, networkId, target, 1);
  } else {
    // Row deleted rather than set to 0 — absence is the default, so we
    // don't leave dead rows sitting in the table. If a future column gets
    // added (e.g. muted), this branch needs to revisit: a "muted but not
    // always-notify" row would still need to exist.
    deleteStmt.run(userId, networkId, target);
  }
}
