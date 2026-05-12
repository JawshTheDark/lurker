import db from './index.js';

const insertStmt = db.prepare(`
  INSERT INTO upload_history
    (user_id, provider, url, filename, mime, byte_size, width, height, thumbnail)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function insertUpload(userId, row) {
  const info = insertStmt.run(
    userId,
    row.provider,
    row.url,
    row.filename ?? null,
    row.mime,
    row.byte_size,
    row.width ?? null,
    row.height ?? null,
    row.thumbnail,
  );
  return info.lastInsertRowid;
}

export function listUploads(userId, { before = null, limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  if (before) {
    return db.prepare(`
      SELECT id, provider, url, filename, mime, byte_size, width, height, created_at
      FROM upload_history
      WHERE user_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `).all(userId, Number(before), lim);
  }
  return db.prepare(`
    SELECT id, provider, url, filename, mime, byte_size, width, height, created_at
    FROM upload_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, lim);
}

export function getThumbnail(userId, id) {
  return db.prepare(`
    SELECT thumbnail FROM upload_history
    WHERE user_id = ? AND id = ?
  `).get(userId, Number(id));
}

export function deleteUpload(userId, id) {
  const info = db.prepare(`
    DELETE FROM upload_history WHERE user_id = ? AND id = ?
  `).run(userId, Number(id));
  return info.changes > 0;
}
