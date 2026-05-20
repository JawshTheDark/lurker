// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import highlightRulesService from '../services/highlightRulesService.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req: Request, res: Response) => {
  const rules = highlightRulesService.list(req.user!.id);
  res.json({ rules });
});

router.post('/', (req: Request, res: Response) => {
  const result = highlightRulesService.create(req.user!.id, req.body || {});
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ rule: result.rule });
});

router.patch('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const result = highlightRulesService.update(id, req.user!.id, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ rule: result.rule });
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const result = highlightRulesService.remove(id, req.user!.id);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

export default router;
