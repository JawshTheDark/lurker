// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: Elastic-2.0

import db from './index.js';

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

export function addMask({ userId, networkId, mask }) {
  const result = addStmt.run({ userId, networkId, mask });
  return result.changes > 0;
}

export function removeMask({ userId, networkId, mask }) {
  const result = removeStmt.run({ userId, networkId, mask });
  return result.changes > 0;
}

export function listMasks({ userId, networkId }) {
  return listForNetworkStmt.all(userId, networkId);
}

export function listAllForUser(userId) {
  return listAllStmt.all(userId);
}
