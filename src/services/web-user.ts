import { getDb } from '../db/connection.js';
import { v4 as uuid } from 'uuid';

export interface WebUser {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  phone_number: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  created_at: string;
  updated_at: string;
}

interface WebUserRow {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  phone_number: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  created_at: string;
  updated_at: string;
}

function deserialize(row: WebUserRow): WebUser {
  return row;
}

export function getOrCreateWebUser(
  googleId: string,
  email: string,
  name: string | null,
  picture: string | null
): WebUser {
  const db = getDb();

  // Try to get existing user
  let row = db.prepare('SELECT * FROM web_user WHERE google_id = ?').get(googleId) as WebUserRow | undefined;

  if (!row) {
    // Create new user
    const id = uuid();
    db.prepare(`
      INSERT INTO web_user (id, google_id, email, name, picture)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, googleId, email, name, picture);

    row = db.prepare('SELECT * FROM web_user WHERE id = ?').get(id) as WebUserRow;
  } else {
    // Update existing user info
    db.prepare(`
      UPDATE web_user
      SET email = ?, name = ?, picture = ?, updated_at = datetime('now')
      WHERE google_id = ?
    `).run(email, name, picture, googleId);

    row = db.prepare('SELECT * FROM web_user WHERE google_id = ?').get(googleId) as WebUserRow;
  }

  return deserialize(row);
}

export function getWebUser(id: string): WebUser | null {
  const row = getDb().prepare('SELECT * FROM web_user WHERE id = ?').get(id) as WebUserRow | undefined;
  return row ? deserialize(row) : null;
}

export function getWebUserByGoogleId(googleId: string): WebUser | null {
  const row = getDb().prepare('SELECT * FROM web_user WHERE google_id = ?').get(googleId) as WebUserRow | undefined;
  return row ? deserialize(row) : null;
}

export function linkPhoneNumber(webUserId: string, phoneNumber: string): void {
  getDb().prepare(`
    UPDATE web_user
    SET phone_number = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(phoneNumber, webUserId);
}
