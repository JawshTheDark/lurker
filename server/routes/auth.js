import { Router } from 'express';
import { findUserByUsername, verifyPassword } from '../db/users.js';
import { createSession, deleteSession } from '../db/sessions.js';
import { SESSION_COOKIE, getCookieOptions, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = findUserByUsername(username);
  const ok = await verifyPassword(user, password);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, getCookieOptions());
  res.json({ user: { id: user.id, username: user.username } });
});

router.post('/logout', (req, res) => {
  const token = req.signedCookies?.[SESSION_COOKIE];
  if (token) deleteSession(token);
  res.clearCookie(SESSION_COOKIE, { ...getCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

export default router;
