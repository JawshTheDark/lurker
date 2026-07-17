// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// DCC download-manager API (#270 phase 2). Lists the user's transfers and acts on
// them (accept a pending offer, reject it, cancel an in-flight one). The list is
// the Transfers view's initial load; live updates arrive over the WS as
// `dcc-transfer` frames. All routes are user-scoped via requireAuth.

import fs from 'fs';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import ircManager from '../services/ircManager.js';
import { dccEnabledForUser, dccMaxFileBytes } from '../services/dccConfig.js';
import { getDccTransfer, listDccTransfers } from '../db/dccTransfers.js';
import { getNetwork } from '../db/networks.js';
import { findUserById } from '../db/users.js';
import { resolveDccDestination, dccRoot, hasFreeSpaceFor } from '../services/dccPaths.js';
import path from 'path';

// Stage the web-UI "send a file" upload on DISK, not in the heap. This route
// used to buffer the whole file in memory (multer.memoryStorage), which is why
// it carried a 256MB ceiling — with disk staging the only bound is the
// operator's LURKER_DCC_MAX_FILE_MB, unset = unlimited. The tmp dir lives
// INSIDE the DCC root so final placement is a same-device link, never a copy.
function sendUploadCeiling(): number | null {
  const cap = dccMaxFileBytes();
  return cap > 0 ? cap : null;
}
const sendStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const root = dccRoot();
    if (!root) {
      cb(new Error('DCC directory is not configured on this server'), '');
      return;
    }
    const tmp = path.join(root, '.tmp-sends');
    try {
      fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
    } catch (e) {
      cb(e as Error, '');
      return;
    }
    cb(null, tmp);
  },
  filename: (_req, _file, cb) =>
    cb(null, `stage-${Date.now()}-${Math.random().toString(36).slice(2)}`),
});
const sendUpload = multer({
  storage: sendStorage,
  limits: (() => {
    const ceiling = sendUploadCeiling();
    return ceiling != null ? { fileSize: ceiling, files: 1 } : { files: 1 };
  })(),
});

const router = Router();
router.use(requireAuth);

// The two-tier DCC gate (cell master switch AND per-user capability) guards
// every DCC entry point — the inbound-CTCP path checks it, so the API must too,
// or a stale pending_approval row could be accepted after a grant is revoked.
// Gating reads as well as writes keeps the whole surface dark when DCC is off
// (and gives the /dcc command + Transfers modal a clear "not enabled" error).
router.use((req: Request, res: Response, next) => {
  if (!dccEnabledForUser(req.user!.id)) {
    res.status(403).json({ error: 'DCC is not enabled for this account' });
    return;
  }
  next();
});

// A transfer id is a positive integer row id; reject anything else up front so a
// non-numeric :id can't reach better-sqlite3 as NaN (which throws → 500).
function transferId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/dcc — the user's transfers, newest first. */
router.get('/', (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json({ transfers: listDccTransfers(req.user!.id, { limit }) });
});

// Acting on a transfer is a write — blocked for paused accounts (the list isn't)
// by the central requireAuth gate (#573); the GET list above stays available.

/** POST /api/dcc/:id/accept — accept a pending offer and start the download. */
router.post('/:id/accept', (req: Request, res: Response) => {
  const id = transferId(req);
  if (id == null) {
    res.status(404).json({ error: 'transfer not found' });
    return;
  }
  const result = ircManager.acceptDccTransfer(req.user!.id, id);
  if (result === 'not-found') {
    res.status(404).json({ error: 'transfer not found' });
    return;
  }
  if (result === 'not-pending') {
    res.status(409).json({ error: 'transfer is not awaiting approval' });
    return;
  }
  if (result === 'not-connected') {
    res.status(409).json({ error: 'network not connected' });
    return;
  }
  res.json({ transfer: getDccTransfer(req.user!.id, id) });
});

/** POST /api/dcc/:id/reject — reject a pending offer (no download). */
router.post('/:id/reject', (req: Request, res: Response) => {
  const id = transferId(req);
  if (id == null || !ircManager.rejectDccTransfer(req.user!.id, id)) {
    res.status(404).json({ error: 'transfer not found' });
    return;
  }
  res.json({ transfer: getDccTransfer(req.user!.id, id) });
});

/** POST /api/dcc/:id/cancel — cancel an in-flight or still-pending transfer. */
router.post('/:id/cancel', (req: Request, res: Response) => {
  const id = transferId(req);
  if (id == null || !ircManager.cancelDccTransfer(req.user!.id, id)) {
    res.status(404).json({ error: 'transfer not found' });
    return;
  }
  res.json({ transfer: getDccTransfer(req.user!.id, id) });
});

/**
 * POST /api/dcc/send — offer an uploaded file to a peer over DCC SEND. Multipart
 * body: `file` (the file), `networkId`, `nick`. The file is written into the
 * user's DCC directory, then offered; the peer receives it directly.
 */
router.post(
  '/send',
  (req: Request, res: Response, next) => {
    sendUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        const tooBig = e.code === 'LIMIT_FILE_SIZE';
        const noDir = (e.message || '').includes('DCC directory');
        res.status(tooBig ? 413 : noDir ? 503 : 400).json({
          error: tooBig
            ? `file exceeds the ${(sendUploadCeiling() ?? 0) / (1024 * 1024)}MB send limit`
            : noDir
              ? e.message
              : 'upload failed',
        });
        return;
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    try {
      if (!dccRoot()) {
        res.status(503).json({ error: 'DCC directory is not configured on this server' });
        return;
      }
      if (!file) {
        res.status(400).json({ error: 'no file uploaded' });
        return;
      }
      const networkId = Number(req.body?.networkId);
      const nick = typeof req.body?.nick === 'string' ? req.body.nick.trim() : '';
      if (!Number.isInteger(networkId) || networkId <= 0 || !nick) {
        res.status(400).json({ error: 'networkId and nick are required' });
        return;
      }
      // Ownership: a user can only send from their own network's connection.
      if (!getNetwork(networkId, req.user!.id)) {
        res.status(404).json({ error: 'network not found' });
        return;
      }
      const username = findUserById(req.user!.id)?.username || 'user';
      let destPath: string;
      try {
        destPath = resolveDccDestination(username, file.originalname || 'file');
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'bad filename' });
        return;
      }
      if (!hasFreeSpaceFor(path.dirname(destPath), file.size)) {
        res.status(507).json({ error: 'not enough free disk space' });
        return;
      }
      // Place the staged temp at its final name. link() is instant (tmp lives
      // in the DCC root, same device) and EEXIST-fails like the old wx flag;
      // EXDEV falls back to an exclusive copy for exotic mount layouts.
      try {
        try {
          fs.linkSync(file.path, destPath);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EXDEV') {
            fs.copyFileSync(file.path, destPath, fs.constants.COPYFILE_EXCL);
          } else {
            throw e;
          }
        }
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'could not stage the file' });
        return;
      }
      const filename = path.basename(destPath);
      const id = ircManager.sendDccFile(req.user!.id, networkId, nick, destPath, filename, file.size);
      if (id == null) {
        // Network offline — drop the staged file so it doesn't orphan.
        try {
          fs.unlinkSync(destPath);
        } catch {
          /* best effort */
        }
        res.status(409).json({ error: 'network not connected' });
        return;
      }
      res.json({ transfer: getDccTransfer(req.user!.id, id) });
    } finally {
      // Every exit drops the multer temp: after a successful link it's just the
      // extra name; on any early return it's the leak this finally prevents.
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* already gone */
        }
      }
    }
  },
);

// Shared parse for the JSON chat routes: {networkId, nick}, ownership-checked.
function chatTarget(req: Request, res: Response): { networkId: number; nick: string } | null {
  const networkId = Number(req.body?.networkId);
  const nick = typeof req.body?.nick === 'string' ? req.body.nick.trim() : '';
  if (!Number.isInteger(networkId) || networkId <= 0 || !nick) {
    res.status(400).json({ error: 'networkId and nick are required' });
    return null;
  }
  if (!getNetwork(networkId, req.user!.id)) {
    res.status(404).json({ error: 'network not found' });
    return null;
  }
  return { networkId, nick };
}

/** POST /api/dcc/chat — offer a DCC chat to a peer. Body: {networkId, nick}. */
router.post('/chat', (req: Request, res: Response) => {
  const t = chatTarget(req, res);
  if (!t) return;
  if (!ircManager.dccChatOpen(req.user!.id, t.networkId, t.nick)) {
    res.status(409).json({ error: 'network not connected' });
    return;
  }
  res.json({ ok: true, target: `=${t.nick}` });
});

/** POST /api/dcc/chat/close — close a live DCC chat. Body: {networkId, nick}. */
router.post('/chat/close', (req: Request, res: Response) => {
  const t = chatTarget(req, res);
  if (!t) return;
  ircManager.dccChatClose(req.user!.id, t.networkId, t.nick);
  res.json({ ok: true });
});

export default router;
