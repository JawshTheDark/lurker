// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

// Guest links for voice calls: a capability URL an op mints so someone WITHOUT
// an account on this instance can join one specific channel's call. Scoped the
// same way as the room and the join policy (ASCII-folded host + casemapping-
// folded channel), so a link can never be replayed against another channel.
//
// The token IS the credential — 32 bytes of CSPRNG, stored verbatim because it
// is a bearer capability with a short TTL, not a password. It grants exactly
// one thing: a room-scoped LiveKit token for the room named on the row.
//
// ⚠ ALL TIMESTAMPS ARE ISO-8601 UTC, and that is load-bearing rather than
// stylistic. This originally stored expires_at via `new Date().toISOString()`
// ("…T01:37:01.234Z") while the usable-link query compared it against SQLite's
// `datetime('now')` ("… 01:37:01"). Those are string-compared: 'T' (0x54) sorts
// above ' ' (0x20), so EVERY row read as not-yet-expired and the SQL guard was
// dead — expiry only worked because a second check happened in JS. Both sides
// now use strftime('%Y-%m-%dT%H:%M:%fZ'), matching voicePolicy.

import crypto from 'crypto';

/** How long a freshly minted link stays usable. */
export const GUEST_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface GuestLink {
  token: string;
  networkHost: string;
  channelFolded: string;
  room: string;
  /** false → a listen-only guest (they can hear, but not speak). */
  canPublish: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  useCount: number;
}

const COLS = `
  token, network_host AS networkHost, channel_folded AS channelFolded, room,
  can_publish AS canPublish, created_by AS createdBy, created_at AS createdAt,
  expires_at AS expiresAt, revoked_at AS revokedAt, use_count AS useCount
`;

const insertStmt = db.prepare(`
  INSERT INTO voice_guest_link
    (token, network_host, channel_folded, room, can_publish, created_by, expires_at)
  VALUES (@token, @host, @channel, @room, @canPublish, @by,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now', @ttl))
`);

// Both sides of the comparison are ISO-8601 UTC — see the timestamp note above.
const usableStmt = db.prepare(`
  SELECT ${COLS} FROM voice_guest_link
  WHERE token = ?
    AND revoked_at IS NULL
    AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const listStmt = db.prepare(`
  SELECT ${COLS} FROM voice_guest_link
  WHERE network_host = ? AND channel_folded = ?
    AND revoked_at IS NULL
    AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ORDER BY created_at DESC
`);

const revokeStmt = db.prepare(`
  UPDATE voice_guest_link
  SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE token = ? AND network_host = ? AND channel_folded = ? AND revoked_at IS NULL
`);

const bumpStmt = db.prepare(`
  UPDATE voice_guest_link SET use_count = use_count + 1 WHERE token = ?
`);

// Housekeeping: a link is worthless once expired or revoked, and nothing reads
// it again. Swept opportunistically at mint time rather than on a timer — the
// table only grows when someone actively creates links.
const sweepStmt = db.prepare(`
  DELETE FROM voice_guest_link
  WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
     OR (revoked_at IS NOT NULL
         AND revoked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days'))
`);

function rowToLink(r: Record<string, unknown>): GuestLink {
  return { ...r, canPublish: r.canPublish === 1 } as GuestLink;
}

/**
 * Mint a guest link. `host` and `channelFolded` must already be folded the same
 * way the room key was derived, so a link can only ever open its own room.
 */
export function createGuestLink(args: {
  host: string;
  channelFolded: string;
  room: string;
  canPublish: boolean;
  byNick: string;
  ttlMs?: number;
}): GuestLink {
  sweepStmt.run();
  // base64url: safe in a path segment with no escaping, unlike base64's +/=.
  const token = crypto.randomBytes(32).toString('base64url');
  const seconds = (args.ttlMs ?? GUEST_LINK_TTL_MS) / 1000;
  insertStmt.run({
    token,
    host: args.host,
    channel: args.channelFolded,
    room: args.room,
    canPublish: args.canPublish ? 1 : 0,
    by: args.byNick,
    // SQLite modifier form: '+86400.000 seconds'. The sign has to come from the
    // number, not a hardcoded '+': a negative TTL would otherwise build
    // '+-60.000 seconds', which SQLite treats as a malformed modifier and
    // answers with NULL rather than an error — a silently un-expiring row if
    // the column ever stopped being NOT NULL.
    ttl: `${seconds >= 0 ? '+' : ''}${seconds.toFixed(3)} seconds`,
  });
  return getGuestLink(token)!;
}

const getStmt = db.prepare(`SELECT ${COLS} FROM voice_guest_link WHERE token = ?`);

/** Any link by token, expired/revoked included (admin views). */
export function getGuestLink(token: string): GuestLink | null {
  const r = getStmt.get(token) as Record<string, unknown> | undefined;
  return r ? rowToLink(r) : null;
}

/** A link that may be redeemed right now: exists, not revoked, not expired. */
export function getUsableGuestLink(token: string): GuestLink | null {
  if (!token) return null;
  const r = usableStmt.get(token) as Record<string, unknown> | undefined;
  return r ? rowToLink(r) : null;
}

/** Live links for one channel, newest first. */
export function listActiveGuestLinks(host: string, channelFolded: string): GuestLink[] {
  return (listStmt.all(host, channelFolded) as Record<string, unknown>[]).map(rowToLink);
}

/** Revoke a link. Scoped to its channel so an op can't revoke another
 *  channel's link by guessing a token. Returns true if a live link was revoked. */
export function revokeGuestLink(token: string, host: string, channelFolded: string): boolean {
  return revokeStmt.run(token, host, channelFolded).changes > 0;
}

/** Count a redemption — the only signal an op has that a link is circulating. */
export function bumpGuestLinkUse(token: string): void {
  bumpStmt.run(token);
}
