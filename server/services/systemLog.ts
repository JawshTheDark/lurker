// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { EventEmitter } from 'events';

// Per-user system-console log. A live tail of server lifecycle events
// (network connect, channel join, presence batches, etc.) that the client
// surfaces in a virtual buffer reached via the "lurker" sidebar header.
//
// Ephemeral by design — the messages table would bloat with debug rows that
// nobody reads outside an active troubleshooting session. The ring survives
// in memory until process restart. Global lines (userId == null) are visible
// to every connected user so they can see "server starting up" on the
// session they opened right after a deploy.

const MAX_GLOBAL = 200;
const MAX_PER_USER = 500;

let nextId = 1;

export interface LogLine {
  id: number;
  ts: string;
  level: string;
  scope: string;
  text: string;
  userId: number | null;
  fields: Record<string, unknown> | null;
}

export interface LogParams {
  level?: string;
  scope?: string;
  text?: unknown;
  userId?: number | null;
  fields?: Record<string, unknown> | null;
}

const globalRing: LogLine[] = [];
const perUser = new Map<number, LogLine[]>();

const emitter = new EventEmitter();

function append(ring: LogLine[], max: number, line: LogLine): void {
  ring.push(line);
  if (ring.length > max) ring.splice(0, ring.length - max);
}

function buildLine({ level, scope, text, userId, fields }: LogParams): LogLine {
  return {
    id: nextId++,
    ts: new Date().toISOString(),
    level: level || 'info',
    scope: scope || 'lurker',
    text: String(text == null ? '' : text),
    userId: userId == null ? null : Number(userId),
    fields: fields && typeof fields === 'object' ? fields : null,
  };
}

export function log({ level, scope, text, userId = null, fields }: LogParams = {}): LogLine {
  const line = buildLine({ level, scope, text, userId, fields });
  if (line.userId == null) {
    append(globalRing, MAX_GLOBAL, line);
  } else {
    let ring = perUser.get(line.userId);
    if (!ring) {
      ring = [];
      perUser.set(line.userId, ring);
    }
    append(ring, MAX_PER_USER, line);
  }
  emitter.emit('line', line);
  return line;
}

// Returns the global lines + this user's own lines, merged by id (id is
// monotonic per-process, so id order == time order — and no two appends
// can collide on a tie).
export function getRecent(userId: number): LogLine[] {
  const ring = perUser.get(Number(userId)) || [];
  if (ring.length === 0) return globalRing.slice();
  if (globalRing.length === 0) return ring.slice();
  const out = Array.from<LogLine>({ length: ring.length + globalRing.length });
  let i = 0,
    j = 0,
    k = 0;
  while (i < globalRing.length && j < ring.length) {
    out[k++] = globalRing[i].id < ring[j].id ? globalRing[i++] : ring[j++];
  }
  while (i < globalRing.length) out[k++] = globalRing[i++];
  while (j < ring.length) out[k++] = ring[j++];
  return out;
}

// Forget everything we've cached for this user. Called when a user is
// deleted so their personal ring doesn't keep a stale account's history
// alive across re-signups.
export function dropUser(userId: number): void {
  perUser.delete(Number(userId));
}

export function on(event: string, handler: (...args: unknown[]) => void): void {
  emitter.on(event, handler);
}
export function off(event: string, handler: (...args: unknown[]) => void): void {
  emitter.off(event, handler);
}

export default { log, getRecent, dropUser, on, off };
