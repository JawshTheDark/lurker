import db from './index.js';
import bcrypt from 'bcrypt';

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function findUserById(id) {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);
}

export async function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compare(password, user.password_hash);
}
