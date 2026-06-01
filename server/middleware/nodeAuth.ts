// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// Authenticates the orchestrator (control plane) to a cell's node-control API
// over a pre-shared secret injected at deploy time as LURKER_NODE_SECRET. This
// is a SEPARATE trust channel from user sessions and api_tokens — it is never
// reachable by a tenant, and the routes it guards are mounted only in node
// edition. (A4 may later support an orchestrator-rotated secret persisted in
// app_meta under NODE_META.secret; the env value is the source of truth today.)

export function getNodeSecret(): string | null {
  const raw = (process.env.LURKER_NODE_SECRET || '').trim();
  return raw || null;
}

function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch; comparing lengths first keeps
  // a wrong-length guess from crashing the handler and leaks nothing via timing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireNodeAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = getNodeSecret();
  if (!expected) {
    // Fail closed: node edition without a configured secret means the control
    // surface is unconfigured, not open to the world.
    res.status(503).json({ error: 'node control API not configured' });
    return;
  }
  const match = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  const presented = match ? match[1] : '';
  if (!presented || !secretsMatch(presented, expected)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
