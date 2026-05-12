import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { getUserSettings } from '../db/settings.js';
import { defaultsAsObject } from '../services/settingsRegistry.js';
import * as imagePipeline from '../services/imagePipeline.js';
import {
  getProvider,
  providerIds,
  secretsForProvider,
} from '../services/uploadProviders/index.js';
import {
  insertUpload,
  listUploads,
  getThumbnail,
  deleteUpload,
} from '../db/uploadHistory.js';

const router = Router();
router.use(requireAuth);

// Resolve effective settings with registry defaults filled in. Reused across
// the size-cap middleware and the route handler so they always agree.
function effectiveSettings(userId) {
  return { ...defaultsAsObject(), ...getUserSettings(userId) };
}

// multer doesn't know about per-user settings until we look up the user, but
// it needs to be configured up-front. We use a generous hard ceiling (200 MB,
// the registry max) so multer never rejects below the per-user cap; the route
// handler enforces the actual per-user `uploads.image.max_upload_mb`.
const HARD_BYTE_CEILING = 200 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_BYTE_CEILING, files: 1 },
});

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no image uploaded' });

    const settings = effectiveSettings(req.user.id);
    const maxMb = Number(settings['uploads.image.max_upload_mb']) || 25;
    if (req.file.size > maxMb * 1024 * 1024) {
      return res.status(413).json({ error: `image exceeds ${maxMb} MB` });
    }

    const providerId = settings['uploads.provider'];
    const provider = getProvider(providerId);
    if (!provider) return res.status(400).json({ error: `unknown provider: ${providerId}` });

    let optimized;
    try {
      optimized = await imagePipeline.optimize(req.file.buffer, {
        maxDim: Number(settings['uploads.image.max_dimension']) || 2048,
        quality: Number(settings['uploads.image.quality']) || 85,
      });
    } catch (err) {
      if (err.code === 'UNSUPPORTED_FORMAT') {
        return res.status(415).json({ error: err.message });
      }
      throw err;
    }

    const thumb = await imagePipeline.thumbnail(req.file.buffer);

    const originalName = req.file.originalname || '';
    const baseName = originalName.replace(/\.[^.]+$/, '') || `upload-${Date.now()}`;
    const filename = `${baseName}.${optimized.ext}`;

    const secrets = secretsForProvider(providerId, settings);
    let result;
    try {
      result = await provider.upload(optimized.buffer, {
        filename,
        mime: optimized.mime,
      }, secrets);
    } catch (err) {
      const status = err.code === 'PROVIDER_AUTH' ? 401
        : err.code === 'PROVIDER_CONFIG' ? 400
        : 502;
      return res.status(status).json({ error: err.message, provider: providerId });
    }

    const id = insertUpload(req.user.id, {
      provider: providerId,
      url: result.url,
      filename: originalName || null,
      mime: optimized.mime,
      byte_size: optimized.byteSize,
      width: optimized.width,
      height: optimized.height,
      thumbnail: thumb,
    });

    res.json({ id, url: result.url });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  const before = req.query.before ? Number(req.query.before) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const rows = listUploads(req.user.id, { before, limit });
  res.json({
    items: rows.map((r) => ({
      ...r,
      thumbnail_url: `/api/uploads/${r.id}/thumb`,
    })),
    providers: providerIds,
  });
});

router.get('/:id/thumb', (req, res) => {
  const row = getThumbnail(req.user.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(row.thumbnail);
});

router.delete('/:id', (req, res) => {
  const ok = deleteUpload(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

export default router;
