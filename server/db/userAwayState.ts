// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A row from the `user_away_state` table. */
export interface UserAwayState {
  user_id: number;
  away_datetime: string | null;
  back_datetime: string | null;
  away_message: string | null;
  auto_set: number;
}

const getStmt = db.prepare(`
  SELECT away_datetime, back_datetime, away_message, auto_set
  FROM user_away_state
  WHERE user_id = ?
`);

// New /away: replace the prior row entirely. back_datetime is forced null so a
// completed pair from a previous away/back cycle gets cleared in the same write.
const writeAwayStmt = db.prepare(`
  INSERT INTO user_away_state (user_id, away_datetime, back_datetime, away_message, auto_set)
  VALUES (@userId, @awayDatetime, NULL, @awayMessage, @autoSet)
  ON CONFLICT(user_id) DO UPDATE SET
    away_datetime = excluded.away_datetime,
    back_datetime = NULL,
    away_message = excluded.away_message,
    auto_set = excluded.auto_set
`);

// /back only fills in the matching back_datetime; away_datetime, away_message,
// and auto_set stay so the client can render the completed pair. No-op if
// no row exists (writeAwayMarker hasn't run yet).
const writeBackStmt = db.prepare(`
  UPDATE user_away_state
  SET back_datetime = @backDatetime
  WHERE user_id = @userId
`);

export function getUserAwayState(userId: number): UserAwayState | null {
  return (getStmt.get(userId) as UserAwayState | undefined) ?? null;
}

export function writeAwayMarker(
  userId: number,
  {
    awayDatetime,
    awayMessage,
    autoSet,
  }: { awayDatetime: string; awayMessage?: string | null; autoSet?: boolean },
): void {
  writeAwayStmt.run({
    userId,
    awayDatetime,
    awayMessage: awayMessage ?? null,
    autoSet: autoSet ? 1 : 0,
  });
}

export function writeBackMarker(userId: number, backDatetime: string): void {
  writeBackStmt.run({ userId, backDatetime });
}
