// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** Mask row returned for a single network. */
export interface MaskRow {
  mask: string;
  createdAt: string;
}

/** Mask row returned for all networks (includes networkId). */
export interface MaskRowWithNetwork {
  networkId: number;
  mask: string;
  createdAt: string;
}

const addStmt = db.prepare(`
  INSERT OR IGNORE INTO ignored_masks (user_id, network_id, mask)
  VALUES (@userId, @networkId, @mask)
`);

const removeStmt = db.prepare(`
  DELETE FROM ignored_masks
  WHERE user_id = @userId AND network_id = @networkId AND mask = @mask COLLATE NOCASE
`);

const listForNetworkStmt = db.prepare(`
  SELECT mask, created_at AS createdAt
  FROM ignored_masks
  WHERE user_id = ? AND network_id = ?
  ORDER BY id ASC
`);

const listAllStmt = db.prepare(`
  SELECT network_id AS networkId, mask, created_at AS createdAt
  FROM ignored_masks
  WHERE user_id = ?
  ORDER BY network_id ASC, id ASC
`);

export function addMask({
  userId,
  networkId,
  mask,
}: {
  userId: number;
  networkId: number;
  mask: string;
}): boolean {
  const result = addStmt.run({ userId, networkId, mask });
  return result.changes > 0;
}

export function removeMask({
  userId,
  networkId,
  mask,
}: {
  userId: number;
  networkId: number;
  mask: string;
}): boolean {
  const result = removeStmt.run({ userId, networkId, mask });
  return result.changes > 0;
}

export function listMasks({ userId, networkId }: { userId: number; networkId: number }): MaskRow[] {
  return listForNetworkStmt.all(userId, networkId) as MaskRow[];
}

export function listAllForUser(userId: number): MaskRowWithNetwork[] {
  return listAllStmt.all(userId) as MaskRowWithNetwork[];
}
