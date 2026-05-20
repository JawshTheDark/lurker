// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPublicKey } from '../services/pushService.js';
import {
  upsertSubscription,
  deleteByEndpoint,
  listAllForUser,
  heartbeatByEndpoint,
} from '../db/pushSubscriptions.js';

const router = Router();
router.use(requireAuth);

router.get('/config', (_req: Request, res: Response) => {
  res.json({ publicKey: getPublicKey() });
});

router.get('/subscriptions', (req: Request, res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = listAllForUser(req.user!.id).map((s: any) => ({
    id: s.id,
    endpoint: s.endpoint,
    user_agent: s.user_agent,
    enabled: s.enabled,
    created_at: s.created_at,
    last_seen_at: s.last_seen_at,
  }));
  res.json({ subscriptions: subs });
});

router.post('/subscriptions', (req: Request, res: Response) => {
  const { endpoint, keys, userAgent } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'endpoint and keys.p256dh + keys.auth are required' });
    return;
  }
  const result = upsertSubscription(req.user!.id, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent || req.headers['user-agent'] || null,
  });
  if (!result.ok) {
    res.status(409).json({
      error:
        'this browser is already registered for push under another account; disable push there first',
    });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (result as any).sub;
  res.status(201).json({ subscription: { id: sub.id, endpoint: sub.endpoint } });
});

router.delete('/subscriptions', (req: Request, res: Response) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint required' });
    return;
  }
  deleteByEndpoint(req.user!.id, endpoint);
  res.json({ ok: true });
});

router.post('/heartbeat', (req: Request, res: Response) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint required' });
    return;
  }
  const updated = heartbeatByEndpoint(req.user!.id, endpoint);
  res.json({ ok: true, present: updated });
});

export default router;
