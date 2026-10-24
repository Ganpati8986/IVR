import { db, hashPassword } from '../db.js';
const [, , u, p] = process.argv;
if (!u || !p || p.length < 8) { console.log('Usage: npm run create-user -- <username> <password (at least 8 characters)>'); process.exit(1); }
db.prepare('INSERT INTO users(username,pass,created_at) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass')
  .run(u.toLowerCase(), hashPassword(p), new Date().toISOString());
console.log(`User "${u.toLowerCase()}" is ready (created, or password updated).`);
