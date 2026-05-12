import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  listUsers,
  findUserById,
  deleteUser,
  countAdmins,
} from '../db/users.js';
import {
  createInvite,
  listInvites,
  deleteInvite,
  getInvite,
} from '../db/invites.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function deriveInviteStatus(row) {
  if (row.usedByUserId != null) return 'consumed';
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return 'expired';
  return 'pending';
}

function publicInvite(row, { origin }) {
  return {
    token: row.token,
    url: `${origin}/invite/${row.token}`,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    usedByUsername: row.usedByUsername || null,
    createdByUsername: row.createdByUsername || null,
    status: deriveInviteStatus(row),
  };
}

// Prefer the browser-supplied Origin header so the link reflects the URL the
// admin is actually using — through Vite's dev proxy that's
// https://irc.local.bradroot.me:5173, and in prod it's whatever the public
// origin is, regardless of how the reverse proxy forwards to Express.
// req.protocol/req.get('host') would otherwise leak the upstream Express
// scheme + host (http://localhost:8010). Falls back to scheme://host for the
// rare request without an Origin header.
function originFromRequest(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/users', (req, res) => {
  res.json({
    users: listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.created_at,
      lastSeenAt: u.last_seen_at,
    })),
  });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  const target = findUserById(id);
  if (!target) return res.status(404).json({ error: 'not found' });
  if (target.id === req.user.id) {
    return res.status(409).json({ error: 'cannot delete yourself' });
  }
  // Last-admin guard. Refusing to delete the only admin mirrors the
  // last-passkey behaviour — irreversible loss of control.
  if (target.role === 'admin' && countAdmins() <= 1) {
    return res.status(409).json({ error: 'cannot delete the only admin' });
  }
  deleteUser(id);
  res.json({ ok: true });
});

router.get('/invites', (req, res) => {
  const origin = originFromRequest(req);
  res.json({ invites: listInvites().map((r) => publicInvite(r, { origin })) });
});

router.post('/invites', (req, res) => {
  const requested = Number(req.body?.expiresInDays);
  const expiresInDays = Number.isFinite(requested) && requested > 0 ? requested : 7;
  const row = createInvite(req.user.id, { expiresInDays });
  const full = listInvites().find((r) => r.token === row.token);
  const origin = originFromRequest(req);
  res.json({ invite: publicInvite(full || row, { origin }) });
});

router.delete('/invites/:token', (req, res) => {
  const token = req.params.token;
  if (!token) return res.status(400).json({ error: 'missing token' });
  // Refuse to delete consumed invites — they're audit history (which user
  // joined via which admin's invitation). Pending/expired are fair game.
  const existing = getInvite(token);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.usedByUserId != null) {
    return res.status(409).json({ error: 'cannot delete a consumed invite' });
  }
  deleteInvite(token);
  res.json({ ok: true });
});

export default router;
