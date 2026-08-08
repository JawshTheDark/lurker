// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lurker-test-voicelinks-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

let vl: typeof import('./voiceLinks.js');

const HOST = 'irc.libera.chat';
const CHAN = '#dev';
const ROOM = 'net-irc.libera.chat-c-#dev';

function mint(over: Partial<Parameters<typeof vl.createGuestLink>[0]> = {}) {
  return vl.createGuestLink({
    host: HOST,
    channelFolded: CHAN,
    room: ROOM,
    canPublish: true,
    byNick: 'jawsh',
    ...over,
  });
}

beforeAll(async () => {
  vl = await import('./voiceLinks.js');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('voiceLinks', () => {
  it('mints a usable link carrying its room and publish right', () => {
    const l = mint({ canPublish: false });
    expect(l.room).toBe(ROOM);
    expect(l.canPublish).toBe(false); // survives the INTEGER round-trip
    expect(l.useCount).toBe(0);
    expect(vl.getUsableGuestLink(l.token)?.token).toBe(l.token);
  });

  it('mints unguessable, URL-safe tokens', () => {
    const a = mint();
    const b = mint();
    expect(a.token).not.toBe(b.token);
    // base64url only — safe in a path segment with no escaping.
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes
  });

  it('REFUSES an expired link', () => {
    // The regression this pins: expires_at was written as ISO-8601 but compared
    // against SQLite's datetime('now'). String-compared, 'T' (0x54) sorts above
    // ' ' (0x20), so every row read as unexpired and the SQL guard was dead.
    const past = mint({ ttlMs: -60_000 });
    expect(Date.parse(past.expiresAt)).toBeLessThan(Date.now());
    expect(vl.getUsableGuestLink(past.token)).toBeNull();
  });

  it('keeps a link with time left', () => {
    const live = mint({ ttlMs: 60_000 });
    expect(vl.getUsableGuestLink(live.token)).not.toBeNull();
  });

  it('stores timestamps as ISO-8601 UTC, so string and date order agree', () => {
    const l = mint();
    expect(l.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(l.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(l.expiresAt > l.createdAt).toBe(true);
  });

  it('revokes only within the link’s own channel', () => {
    const l = mint();
    // A token guessed/leaked from elsewhere must not be revocable by an op of
    // some other channel.
    expect(vl.revokeGuestLink(l.token, HOST, '#other')).toBe(false);
    expect(vl.revokeGuestLink(l.token, 'irc.example.net', CHAN)).toBe(false);
    expect(vl.getUsableGuestLink(l.token)).not.toBeNull();

    expect(vl.revokeGuestLink(l.token, HOST, CHAN)).toBe(true);
    expect(vl.getUsableGuestLink(l.token)).toBeNull();
    // Idempotent: a second revoke changes nothing.
    expect(vl.revokeGuestLink(l.token, HOST, CHAN)).toBe(false);
  });

  it('lists only live links for the channel asked about', () => {
    const chan = '#listing';
    const keep = vl.createGuestLink({
      host: HOST,
      channelFolded: chan,
      room: ROOM,
      canPublish: true,
      byNick: 'jawsh',
    });
    const revoked = vl.createGuestLink({
      host: HOST,
      channelFolded: chan,
      room: ROOM,
      canPublish: true,
      byNick: 'jawsh',
    });
    const expired = vl.createGuestLink({
      host: HOST,
      channelFolded: chan,
      room: ROOM,
      canPublish: true,
      byNick: 'jawsh',
      ttlMs: -1000,
    });
    vl.revokeGuestLink(revoked.token, HOST, chan);

    const tokens = vl.listActiveGuestLinks(HOST, chan).map((l) => l.token);
    expect(tokens).toContain(keep.token);
    expect(tokens).not.toContain(revoked.token);
    expect(tokens).not.toContain(expired.token);
    expect(vl.listActiveGuestLinks(HOST, '#nothing-here')).toEqual([]);
  });

  it('counts redemptions — the only signal an op has that a link circulates', () => {
    const l = mint();
    vl.bumpGuestLinkUse(l.token);
    vl.bumpGuestLinkUse(l.token);
    expect(vl.getGuestLink(l.token)?.useCount).toBe(2);
  });

  it('getUsableGuestLink is safe for junk input', () => {
    expect(vl.getUsableGuestLink('')).toBeNull();
    expect(vl.getUsableGuestLink('not-a-real-token')).toBeNull();
  });
});
