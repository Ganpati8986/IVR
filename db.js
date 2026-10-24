import { DatabaseSync } from 'node:sqlite'; // built into Node 22.13+ — nothing to compile or install
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('data', { recursive: true });
export const db = new DatabaseSync(path.join('data', 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT NOT NULL, title TEXT, mode TEXT, msg TEXT, audio_url TEXT,
  total INTEGER, rejected INTEGER DEFAULT 0, batches TEXT, people TEXT, created_at TEXT NOT NULL);
`);

export function hashPassword(p) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 64).toString('hex');
}
export function verifyPassword(p, stored) {
  const [s, h] = stored.split(':');
  return crypto.timingSafeEqual(crypto.scryptSync(p, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
}
export const DUMMY = hashPassword('dummy-password'); // keeps response time the same when the user does not exist
