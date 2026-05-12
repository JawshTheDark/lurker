import db from './index.js';

export function findUserByUsername(username) {
  return db.prepare('SELECT id, username, role, created_at, last_seen_at FROM users WHERE username = ?').get(username);
}

export function findUserById(id) {
  return db.prepare('SELECT id, username, role, created_at, last_seen_at FROM users WHERE id = ?').get(id);
}

export function listUsers() {
  return db.prepare('SELECT id, username, role, created_at, last_seen_at FROM users ORDER BY id').all();
}

// Throttled to once per minute via the WHERE clause so a busy client (many
// API calls per second) doesn't write to the row on every request — the row
// is only written when the existing value is missing or older than 60s.
export function touchUserLastSeen(userId) {
  db.prepare(`
    UPDATE users
       SET last_seen_at = datetime('now')
     WHERE id = ?
       AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-60 seconds'))
  `).run(userId);
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

export function countAdmins() {
  return db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
}

export function createUser(username, { role = 'user' } = {}) {
  const info = db.prepare('INSERT INTO users (username, role) VALUES (?, ?)').run(username, role);
  return findUserById(info.lastInsertRowid);
}

export function getPasswordHash(userId) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return row ? row.password_hash : null;
}

export function userHasPassword(userId) {
  return getPasswordHash(userId) !== null;
}

export function setPasswordHash(userId, hash) {
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return info.changes > 0;
}

// Hard delete. FKs are ON DELETE CASCADE for sessions / networks / messages /
// settings / etc., so dependent rows vacate on their own.
export function deleteUser(id) {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return info.changes > 0;
}
