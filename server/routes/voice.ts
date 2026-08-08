// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import express, { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getNetwork } from '../db/networks.js';
import type { Network } from '../db/networks.js';
import ircManager from '../services/ircManager.js';
import type { IrcConnection } from '../services/ircConnection.js';
import { fanOutToUser } from '../services/wsHub.js';
import { isChannelTarget } from '../../shared/channels.js';
import { foldTargetFor } from '../db/buffers.js';
import {
  mintVoiceToken,
  roomFor,
  voiceEnabled,
  foldKey,
  meetsJoinMode,
  canModerateCall,
  canAdminCall,
  removeFromCall,
  muteParticipant,
  receiveWebhook,
  webhookCallRoom,
  liveCallCount,
  listActiveCalls,
  guestIdentity,
  type CallPresenceChange,
} from '../services/voice.js';
import { getPolicy, setPolicy, isMinJoinMode } from '../db/voicePolicy.js';
import {
  createGuestLink,
  listActiveGuestLinks,
  revokeGuestLink,
  getUsableGuestLink,
  bumpGuestLinkUse,
} from '../db/voiceLinks.js';
import { publicOrigin } from '../utils/publicOrigin.js';

// Voice control surface. Lurker is the token authority + call moderator (see
// services/voice.ts); it never carries media. Two routers:
//   - the authed router (requireAuth): mint token, presence snapshot, moderate,
//     join policy
//   - the public router (no cookie): the LiveKit webhook, verified by its
//     signature — mounted BEFORE the authed router in app.ts

/** The caller's joined channel matching `target` under the network's declared
 *  CASEMAPPING, or undefined. This is the fold-aware sibling of isChannelJoined
 *  — used wherever we need the channel STATE (member modes) or its wire
 *  spelling, so an rfc1459 variant like '#foo{bar}' resolves to the channel
 *  joined as '#foo[bar]' instead of missing the map key. */
function joinedChannel(conn: IrcConnection, target: string) {
  const want = foldTargetFor(conn.network.id, target);
  for (const ch of conn.channels.values()) {
    if (foldTargetFor(conn.network.id, ch.name) === want) return ch;
  }
  return undefined;
}

/** The caller's IRC prefix modes in a joined channel (e.g. ['o','v']), or []. */
function memberModes(conn: IrcConnection, target: string, nick: string): string[] {
  return joinedChannel(conn, target)?.members.get(nick.toLowerCase())?.modes ?? [];
}

interface CallCtx {
  network: Network;
  conn: IrcConnection;
  nick: string;
}

/** Resolve + gate the common preconditions (voice on, network owned, live
 *  connection). Sends the error response and returns null on any failure. */
function resolveCall(req: Request, res: Response, networkId: number): CallCtx | null {
  if (!voiceEnabled()) {
    res.status(503).json({ error: 'voice not enabled on this server' });
    return null;
  }
  if (!Number.isInteger(networkId) || networkId <= 0) {
    res.status(400).json({ error: 'networkId required' });
    return null;
  }
  const network = getNetwork(networkId, req.user!.id);
  if (!network) {
    res.status(404).json({ error: 'network not found' });
    return null;
  }
  const conn = ircManager.getConnection(req.user!.id, networkId);
  if (!conn || !conn.currentNick) {
    res.status(409).json({ error: 'network not connected' });
    return null;
  }
  return { network, conn, nick: conn.currentNick };
}

const router = Router();
router.use(requireAuth);

// ─── Join: mint a room-scoped token, gated by membership + channel policy ───
router.post('/token', async (req: Request, res: Response) => {
  const networkId = Number(req.body?.networkId);
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
  // Gate order matches CLIENT_PROTOCOL: a voice-disabled instance answers 503
  // to everything (inside resolveCall), before any body validation.
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return;
  if (!target) {
    res.status(400).json({ error: 'target required' });
    return;
  }
  const { network, conn, nick } = ctx;

  if (isChannelTarget(target)) {
    // Channels require live membership (the one casemapping-correct probe —
    // see isChannelJoined). DMs deliberately don't gate on the peer: opening a
    // DM call IS the invite, exactly like opening a DM buffer.
    if (!conn.isChannelJoined(target)) {
      res.status(403).json({ error: 'not a member of that channel' });
      return;
    }
    // Per-channel join gating: the caller must meet the channel's min join
    // mode (set by an op via PUT /policy).
    //
    // Invariant: the policy key and the room key below derive from the SAME
    // foldTargetFor call on the SAME network row. A row whose declared
    // casemapping diverges from its neighbours' (e.g. not yet refolded after
    // #707) therefore derives a different policy key AND a different room —
    // the caller can only ever "miss" the policy of a room they also can't
    // derive, never mint an unrestricted token into the restricted call. The
    // residual cost of divergence is cosmetic (a presence badge may not match,
    // see broadcastCallPresence) and heals when the row refolds.
    const min = getPolicy(foldKey(network.host), foldTargetFor(network.id, target));
    if (!meetsJoinMode(memberModes(conn, target, nick), min)) {
      res.status(403).json({
        error: `this call is restricted to ${min}+ — you don't have that mode`,
      });
      return;
    }
  }

  // Fold with the network's declared CASEMAPPING before deriving the room, so
  // rfc1459 spelling variants of one channel ('#foo[bar]' vs '#foo{bar}') — or
  // of a nick — agree on one room. isChannelJoined folds the same way, so the
  // membership gate and the room key can never diverge. Deterministic across
  // instances too: the mapping is whatever the shared IRC server declared.
  const room = roomFor(
    network.host,
    foldTargetFor(network.id, target),
    foldTargetFor(network.id, nick),
  );
  try {
    const minted = await mintVoiceToken({ identity: nick, room });
    res.json(minted); // { token, room, url }
  } catch (err) {
    // Operator-actionable (bad LIVEKIT_API_SECRET, SDK failure) — log it; a
    // silent 500 here would leave both ends of the failure invisible.
    console.error('[voice] token mint failed:', err);
    res.status(500).json({ error: 'failed to mint token' });
  }
});

// ─── Presence snapshot: current calls in the caller's channels ─────────────
// The webhook stream only pushes live join/leave deltas, so a client that
// connects (or reconnects) mid-call would never learn about a call already in
// progress. This hydrates that gap from the SFU (source of truth → correct
// across a Lurker restart too). Filtered to channels the caller has joined,
// and each channel is reported in THIS connection's wire spelling so the
// client can match it to a buffer.
router.get('/presence', async (req: Request, res: Response) => {
  const networkId = Number(req.query?.networkId);
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return;
  const host = foldKey(ctx.network.host);
  const nameByFold = new Map<string, string>();
  for (const ch of ctx.conn.channels.values()) {
    nameByFold.set(foldTargetFor(ctx.network.id, ch.name), ch.name);
  }
  try {
    const calls = await listActiveCalls();
    const out: Array<{ target: string; count: number }> = [];
    for (const c of calls) {
      if (c.host !== host || c.count <= 0) continue;
      const name = nameByFold.get(c.channel);
      if (name) out.push({ target: name, count: c.count });
    }
    res.json({ calls: out });
  } catch (err) {
    console.error('[voice] presence snapshot failed:', err);
    res.status(502).json({ error: 'could not list active calls' });
  }
});

// ─── Moderate: op-only mute / remove another participant ───────────────────
router.post('/moderate', async (req: Request, res: Response) => {
  const networkId = Number(req.body?.networkId);
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
  const action = req.body?.action;
  const identity = typeof req.body?.identity === 'string' ? req.body.identity : '';
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return;
  if (!target || !identity || (action !== 'mute' && action !== 'remove')) {
    res.status(400).json({ error: 'target, identity, action (mute|remove) required' });
    return;
  }
  const { network, conn, nick } = ctx;
  // Channel-only, and the guard must stay glued to the roomFor below: for a
  // channel room `self` is unused, but a DM room derived from the MODERATOR's
  // nick would target the wrong room entirely.
  if (!isChannelTarget(target) || !canModerateCall(memberModes(conn, target, nick))) {
    res.status(403).json({ error: 'you must be a channel operator to moderate this call' });
    return;
  }
  const room = roomFor(
    network.host,
    foldTargetFor(network.id, target),
    foldTargetFor(network.id, nick),
  );
  try {
    if (action === 'remove') await removeFromCall(room, identity);
    else await muteParticipant(room, identity);
    res.json({ ok: true });
  } catch (err) {
    console.error('[voice] moderation action failed:', err);
    res.status(500).json({ error: 'moderation action failed' });
  }
});

// ─── Join policy: read (any member of the network) / set (ops only) ────────
router.get('/policy', (req: Request, res: Response) => {
  const networkId = Number(req.query?.networkId);
  const target = typeof req.query?.target === 'string' ? req.query.target.trim() : '';
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return;
  if (!target) {
    res.status(400).json({ error: 'target required' });
    return;
  }
  res.json({
    minJoinMode: getPolicy(foldKey(ctx.network.host), foldTargetFor(ctx.network.id, target)),
  });
});

router.put('/policy', (req: Request, res: Response) => {
  const networkId = Number(req.body?.networkId);
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
  const minJoinMode = req.body?.minJoinMode;
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return;
  if (!target || !isChannelTarget(target)) {
    res.status(400).json({ error: 'channel target required' });
    return;
  }
  // STRICT here, unlike reads: this is a write to a security control, and the
  // normalize fallback is 'none' — coercing a typo'd or version-skewed value
  // would silently UNRESTRICT the call while answering 200.
  if (!isMinJoinMode(minJoinMode)) {
    res.status(400).json({ error: 'minJoinMode must be one of none|voice|halfop|op' });
    return;
  }
  const { network, conn, nick } = ctx;
  if (!canAdminCall(memberModes(conn, target, nick))) {
    res.status(403).json({ error: 'you must be a channel operator to set the call policy' });
    return;
  }
  setPolicy(foldKey(network.host), foldTargetFor(network.id, target), minJoinMode, nick);
  res.json({ minJoinMode });
});

// ─── Guest links: op-minted capability URLs for people without an account ───
//
// Channels only. A DM room is named for its two nicks, so a guest link into one
// would be a way to join a private conversation you were never part of; a
// channel already has a membership concept an op is entitled to extend.

/** Resolve the caller + channel and require op (q/a/o) on it. */
function resolveOpChannel(
  req: Request,
  res: Response,
): { ctx: CallCtx; folded: string; host: string } | null {
  const networkId = Number(req.body?.networkId ?? req.query?.networkId);
  const raw = req.body?.target ?? req.query?.target;
  const target = typeof raw === 'string' ? raw.trim() : '';
  const ctx = resolveCall(req, res, networkId);
  if (!ctx) return null;
  if (!target || !isChannelTarget(target)) {
    res.status(400).json({ error: 'a channel target is required' });
    return null;
  }
  if (!ctx.conn.isChannelJoined(target)) {
    res.status(403).json({ error: 'not a member of that channel' });
    return null;
  }
  if (!canAdminCall(memberModes(ctx.conn, target, ctx.nick))) {
    res.status(403).json({ error: 'only channel operators can manage guest links' });
    return null;
  }
  return {
    ctx,
    folded: foldTargetFor(ctx.network.id, target),
    host: foldKey(ctx.network.host),
  };
}

/** The full URL for a link — PUBLIC_BASE_URL first; see utils/publicOrigin. */
function guestUrl(req: Request, token: string): string {
  const origin = publicOrigin(req);
  const path = `/call/${encodeURIComponent(token)}`;
  return origin ? origin + path : path;
}

router.post('/guest-link', (req: Request, res: Response) => {
  const r = resolveOpChannel(req, res);
  if (!r) return;
  // Same fold for the room as /token, so a link can only open its own room.
  const room = roomFor(r.ctx.network.host, r.folded, foldTargetFor(r.ctx.network.id, r.ctx.nick));
  const link = createGuestLink({
    host: r.host,
    channelFolded: r.folded,
    room,
    // Default listen-only=false (they can talk); an op opts into a muted guest.
    canPublish: req.body?.canPublish !== false,
    byNick: r.ctx.nick,
  });
  res.json({ ...link, url: guestUrl(req, link.token) });
});

router.get('/guest-link', (req: Request, res: Response) => {
  const r = resolveOpChannel(req, res);
  if (!r) return;
  const links = listActiveGuestLinks(r.host, r.folded).map((l) => ({
    ...l,
    url: guestUrl(req, l.token),
  }));
  res.json({ links });
});

router.delete('/guest-link', (req: Request, res: Response) => {
  const r = resolveOpChannel(req, res);
  if (!r) return;
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!token) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  // Scoped to the channel the caller ops, so a guessed token from elsewhere
  // can't be revoked here.
  res.json({ revoked: revokeGuestLink(token, r.host, r.folded) });
});

// ─── Public router (no cookie auth) — the LiveKit webhook ───────────────────
export const voicePublicRouter = Router();

// LiveKit posts room/participant events here (content-type
// application/webhook+json, so the global express.json parser skips it and the
// route-level text parser captures the raw body the signature covers).
// Verified by signature, then fed to the presence registry; the change fans
// out to every local account in the channel.
voicePublicRouter.post(
  '/webhook',
  express.text({ type: '*/*', limit: '512kb' }),
  async (req: Request, res: Response) => {
    const body = typeof req.body === 'string' ? req.body : '';
    const ev = await receiveWebhook(body, req.get('Authorization'));
    if (!ev) {
      res.status(401).end();
      return;
    }
    // Ack the SFU immediately — the count query below must not stall LiveKit's
    // webhook queue (it retries + drops slow deliveries).
    res.status(200).end();
    const trigger = webhookCallRoom(ev);
    if (!trigger) return;
    // The event told us occupancy changed; the SFU's participant list says to
    // what (the event's own numParticipants field is not reliable — see
    // liveCallCount). room_finished needs no query: it IS the zero.
    const count = ev.event === 'room_finished' ? 0 : await liveCallCount(trigger.room);
    if (count == null) return; // SFU unreachable — better stale than wrongly cleared
    broadcastCallPresence({ ...trigger, count, active: count > 0 });
  },
);

// ─── Public: redeem a guest link for a room-scoped LiveKit token ────────────
//
// No cookie: the opaque link token IS the capability. It grants exactly one
// room, with the publish right the minting op chose — the SFU enforces
// listen-only, so a guest editing their client can't talk their way in.

// ip → recent redemption timestamps.
//
// ⚠ Entries are EVICTED, not just filtered. Keeping a key per IP that ever
// touched the endpoint makes an unauthenticated request grow server memory
// forever — a slow leak any stranger can drive, on the one route that has no
// account behind it.
const guestHits = new Map<string, number[]>();
const GUEST_WINDOW_MS = 60_000;
const GUEST_MAX_PER_WINDOW = 10;
let guestSweepAt = 0;

function guestRateLimited(ip: string, now: number): boolean {
  // Opportunistic sweep of IPs that have gone quiet — O(n) but at most once a
  // minute, and n is bounded by distinct IPs seen in that minute.
  if (now - guestSweepAt > GUEST_WINDOW_MS) {
    guestSweepAt = now;
    for (const [k, times] of guestHits) {
      if (times.length === 0 || now - times[times.length - 1]! >= GUEST_WINDOW_MS) {
        guestHits.delete(k);
      }
    }
  }
  const recent = (guestHits.get(ip) ?? []).filter((t) => now - t < GUEST_WINDOW_MS);
  recent.push(now);
  guestHits.set(ip, recent);
  return recent.length > GUEST_MAX_PER_WINDOW;
}

voicePublicRouter.post('/guest-token', express.json(), async (req: Request, res: Response) => {
  if (!voiceEnabled()) {
    res.status(503).json({ error: 'voice not enabled on this server' });
    return;
  }
  if (guestRateLimited(req.ip ?? 'unknown', Date.now())) {
    res.status(429).json({ error: 'too many requests — try again in a minute' });
    return;
  }
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  const link = getUsableGuestLink(token);
  if (!link) {
    // One message for missing / expired / revoked: distinguishing them tells a
    // stranger which tokens ever existed.
    res.status(404).json({ error: 'this guest link is invalid, expired, or revoked' });
    return;
  }
  try {
    const minted = await mintVoiceToken({
      identity: guestIdentity(name || 'guest'),
      room: link.room,
      canPublish: link.canPublish,
      // Longer than a member's 2h: a guest has no session to re-mint from, so
      // an expiry mid-call would drop them with no way back in.
      ttlSeconds: 4 * 60 * 60,
    });
    bumpGuestLinkUse(token);
    res.json({ token: minted.token, url: minted.url, canPublish: link.canPublish });
  } catch (err) {
    console.error('[voice] guest token mint failed:', err);
    res.status(500).json({ error: 'failed to mint token' });
  }
});

/** Notify every local account currently in this channel (any of their tabs)
 *  that a call's participant count changed, so they can show/hide the badge.
 *  The folded channel from the room name is translated to each connection's
 *  own wire spelling before sending — clients match frames to buffers by
 *  target. A connection whose network row folds differently from the minter's
 *  (transitional casemapping divergence) just misses the badge until its row
 *  refolds; the /presence snapshot on its next reconnect self-heals it. */
function broadcastCallPresence(change: CallPresenceChange): void {
  for (const conn of ircManager.listAllConnections()) {
    if (foldKey(conn.network.host) !== change.host) continue;
    let name: string | null = null;
    for (const ch of conn.channels.values()) {
      if (foldTargetFor(conn.network.id, ch.name) === change.channel) {
        name = ch.name;
        break;
      }
    }
    if (!name) continue; // this account isn't in the channel
    fanOutToUser(conn.network.user_id, {
      // Top-level frame kind — the client dispatches on `kind` in
      // handleMessage. A bare `type:` would never reach the handler: only
      // kind:'irc' frames are unwrapped to the inner type-switch.
      kind: 'call-presence',
      networkId: conn.network.id,
      target: name,
      active: change.active,
      count: change.count,
    });
  }
}

export default router;
