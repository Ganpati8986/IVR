process.env.TZ ||= 'Asia/Kolkata';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, verifyPassword, hashPassword, DUMMY } from './db.js';

const { OMIXO_API_KEY, SESSION_SECRET } = process.env;
if (!OMIXO_API_KEY || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('OMIXO_API_KEY and SESSION_SECRET (32+ characters) are required in .env.'); process.exit(1);
}
const PUBLIC = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const BASE = (process.env.OMIXO_BASE || 'https://api.omixo.ai/api/v1').replace(/\/$/, '');
const VOICE = process.env.VOICE || 'priya';
const MAX_NOTICE = +process.env.MAX_PER_NOTICE || 2000;
const DAILY = +process.env.DAILY_LIMIT || 5000;
const PORT = +process.env.PORT || 3001;
// Preset login: created / updated from .env on every start, so there is no separate "create user" step.
const APP_USER = (process.env.APP_USERNAME || 'admin').trim().toLowerCase();
const APP_PASS = process.env.APP_PASSWORD || 'Admin@12345';
db.prepare('INSERT INTO users(username,pass,created_at) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass')
  .run(APP_USER, hashPassword(APP_PASS), new Date().toISOString());
const uploads = path.resolve('uploads');
fs.mkdirSync(uploads, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"],
  } },
}));

/* ---------- helpers ---------- */
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });
const norm = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const validNum = (d) => /^[6-9]\d{9}$/.test(d);

async function omixo(method, p, body) {
  const r = await fetch(BASE + p, {
    method, signal: AbortSignal.timeout(25000),
    headers: { 'X-API-Key': OMIXO_API_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.message || d.error || `Calling service error (${r.status})`), { status: 502 });
  return d;
}

/* ---------- session (signed httpOnly cookie) ---------- */
const sign = (s) => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('base64url');
const mkToken = (uid) => { const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 12 * 3600e3 })).toString('base64url'); return p + '.' + sign(p); };
function readUser(req) {
  const m = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [p, s] = m[1].split('.'); if (!p || !s) return null;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let d; try { d = JSON.parse(Buffer.from(p, 'base64url')); } catch { return null; }
  if (!(d.exp > Date.now())) return null;
  return db.prepare('SELECT id,username FROM users WHERE id=?').get(d.uid) || null;
}
const cookie = (req, res, v, age) => res.append('Set-Cookie', `sid=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${req.secure ? '; Secure' : ''}`);
const needAuth = (req, res, next) => { req.user = readUser(req); return req.user ? next() : fail(res, 'Please log in first.', 401); };

// CSRF: only requests carrying our frontend's custom header are accepted (plus SameSite=Strict cookie)
app.use('/api', (req, res, next) => (['GET', 'HEAD'].includes(req.method) || req.get('x-requested-with') === 'school-app') ? next() : fail(res, 'Request not allowed.', 403));
app.use('/api', rateLimit({ windowMs: 15 * 60e3, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.post('/api/login', rateLimit({ windowMs: 15 * 60e3, limit: 10, message: { error: 'Too many attempts. Try again in 15 minutes.' } }),
  express.json({ limit: '2kb' }), (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).toLowerCase());
    const ok = verifyPassword(String(password), u ? u.pass : DUMMY);
    if (!u || !ok) return fail(res, 'Incorrect username or password.', 401);
    cookie(req, res, mkToken(u.id), 12 * 3600);
    res.json({ user: { username: u.username } });
  });
app.post('/api/logout', (req, res) => { cookie(req, res, '', 0); res.json({ ok: true }); });
app.get('/api/me', (req, res) => { const u = readUser(req); u ? res.json({ user: { username: u.username } }) : fail(res, 'Not logged in.', 401); });

/* ---------- audio upload ---------- */
const EXT = new Set(['wav', 'mp3', 'm4a', 'ogg', 'webm', 'aac']);
function sniff(b, ext) {
  const t = b.subarray(0, 12).toString('latin1');
  return ({ wav: t.startsWith('RIFF') && t.slice(8, 12) === 'WAVE', mp3: t.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
    ogg: t.startsWith('OggS'), m4a: t.slice(4, 8) === 'ftyp', webm: b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
    aac: b[0] === 0xff && (b[1] & 0xf0) === 0xf0 })[ext] === true;
}
app.post('/api/upload', needAuth, rateLimit({ windowMs: 3600e3, limit: 40, keyGenerator: (r) => String(r.user.id), message: { error: 'Too many uploads this hour.' } }),
  express.raw({ type: '*/*', limit: '25mb' }), h(async (req, res) => {
    if (!/^https:\/\//.test(PUBLIC)) return fail(res, 'PUBLIC_BASE_URL (https) is not set on the server. See the README.', 500);
    const ext = String(req.get('x-file-ext') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!EXT.has(ext)) return fail(res, 'This audio type is not allowed.');
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return fail(res, 'Empty or corrupt file.');
    if (!sniff(req.body, ext)) return fail(res, 'File does not look like valid audio.');
    if (ext === 'wav' && req.body.readUInt16LE(20) !== 1) return fail(res, 'WAV must be uncompressed PCM.');
    const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(uploads, name), req.body);
    if (ext === 'wav') { const B = req.body; console.log(`Upload ${name}: WAV ${B.readUInt16LE(22)}ch ${B.readUInt32LE(24)}Hz ${B.readUInt16LE(34)}-bit, ${(B.readUInt32LE(40) / B.readUInt32LE(28)).toFixed(1)}s, ${B.length} bytes`); }
    const url = `${PUBLIC}/audio/${name}`;
    const why = await probe(url, req.body.length);
    if (why) { fs.unlinkSync(path.join(uploads, name)); return fail(res, `Audio was saved but is not reachable from the internet (${why}). Make sure the tunnel/server is running and PUBLIC_BASE_URL matches its CURRENT link: ${PUBLIC}`, 502); }
    res.json({ url });
  }));
// Public on purpose: Omixo must be able to download the audio (file names are random 24-hex)
app.use('/audio', (q, r, n) => { r.set('Cross-Origin-Resource-Policy', 'cross-origin'); n(); }, express.static(uploads, { index: false, dotfiles: 'deny', maxAge: '7d' }));
app.get('/ping', (q, r) => r.type('text').send('ok'));
setInterval(() => { for (const f of fs.readdirSync(uploads)) { const p = path.join(uploads, f); if (Date.now() - fs.statSync(p).mtimeMs > 30 * 864e5) fs.unlinkSync(p); } }, 864e5);

// Fetches our own public audio URL the way Omixo will, so a dead tunnel / wrong link is caught before calls are placed
async function probe(url, size) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'notice-selfcheck' } });
    if (!r.ok) return `HTTP ${r.status}`;
    const type = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!/^audio\//.test(type)) return `unexpected content type "${type}"`;
    if (size && buf.length !== size) return `size mismatch (${buf.length} vs ${size})`;
    return null;
  } catch (e) { return e.message; }
}
app.get('/api/public-check', needAuth, h(async (req, res) => {
  if (!/^https:\/\//.test(PUBLIC)) return res.json({ ok: false, url: PUBLIC, error: 'PUBLIC_BASE_URL is not set to an https address in .env.' });
  try {
    const r = await fetch(PUBLIC + '/ping', { signal: AbortSignal.timeout(8000) });
    if (r.ok && (await r.text()) === 'ok') return res.json({ ok: true, url: PUBLIC });
    res.json({ ok: false, url: PUBLIC, error: `The link answered with HTTP ${r.status}. The tunnel may point to an old or wrong address.` });
  } catch (e) { res.json({ ok: false, url: PUBLIC, error: 'Cannot reach the link from the internet: ' + e.message + '. Is the tunnel running, and does .env hold its current link?' }); }
}));

/* ---------- notices ---------- */
const GROUP = (s) => (['completed', 'answered'].includes(s) ? 'done' : s === 'no_answer' ? 'missed' : s === 'failed' ? 'failed' : 'pending');
function cleanPeople(arr) {
  if (!Array.isArray(arr) || arr.length > 10000) return [];
  const seen = new Set(), out = [];
  for (const p of arr) {
    const to = norm(p?.to); if (!validNum(to) || seen.has(to)) continue;
    seen.add(to); out.push({ to, name: String(p?.name || '').replace(/[{}\u0000-\u001f]/g, '').trim().slice(0, 40) });
  }
  return out;
}
const audioOk = (u) => { try { const f = path.basename(new URL(u).pathname); return PUBLIC && u === `${PUBLIC}/audio/${f}` && /^[a-f0-9]{24}\.[a-z0-9]+$/.test(f) && fs.existsSync(path.join(uploads, f)); } catch { return false; } };

async function createNotice(user, { mode, msg, audio_url, people, title }) {
  if (mode === 'audio') {
    const why = await probe(audio_url);
    if (why) throw Object.assign(new Error(`Audio link is not reachable (${why}). Check that the tunnel/server is running and PUBLIC_BASE_URL is its current link.`), { status: 502 });
  }
  const shared = mode === 'audio' ? { audio_url } : { say: msg, voice: VOICE };
  const batches = []; let rejected = 0, sent = 0, error = null;
  for (let i = 0; i < people.length; i += 1000) {
    const chunk = people.slice(i, i + 1000);
    try {
      const d = await omixo('POST', '/calls/obd/bulk', { ...shared, calls: chunk.map((p) => ({ to: p.to, vars: { name: p.name || 'Abhibhavak' } })) });
      batches.push(d.batch_id); rejected += d.rejected || 0; sent += chunk.length;
    } catch (e) { error = e; break; }
  }
  if (!batches.length) throw error;
  const done = people.slice(0, sent);
  const info = db.prepare('INSERT INTO notices(user_id,username,title,mode,msg,audio_url,total,rejected,batches,people,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(user.id, user.username, title, mode, msg || null, audio_url || null, sent, rejected, JSON.stringify(batches), JSON.stringify(done), new Date().toISOString());
  return { id: Number(info.lastInsertRowid), partial: error ? `Only ${sent}/${people.length} numbers were queued: ${error.message}` : null };
}

app.post('/api/notices', needAuth, express.json({ limit: '1mb' }), h(async (req, res) => {
  const { mode, msg, audio_url, title } = req.body || {};
  const people = cleanPeople(req.body?.people);
  if (!people.length) return fail(res, 'No valid mobile numbers found.');
  if (people.length > MAX_NOTICE) return fail(res, `Max ${MAX_NOTICE} numbers per notice.`);
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const used = db.prepare('SELECT COALESCE(SUM(total),0) s FROM notices WHERE created_at>=?').get(day.toISOString()).s;
  if (used + people.length > DAILY) return fail(res, `Daily limit is ${DAILY} calls; ${used} already sent today.`, 429);
  let a;
  if (mode === 'say') { const m = String(msg || '').trim(); if (!m || m.length > 800) return fail(res, 'Message must be 1 to 800 characters.'); a = { mode, msg: m, title: m.slice(0, 50) }; }
  else if (mode === 'audio') { if (!audioOk(audio_url)) return fail(res, 'Audio is invalid. Please upload it again.'); a = { mode, audio_url, title: 'Voice notice' }; }
  else return fail(res, 'Invalid mode.');
  res.json(await createNotice(req.user, { ...a, people }));
}));

app.get('/api/notices', needAuth, (req, res) => res.json({ notices: db.prepare('SELECT id,username,title,mode,total,rejected,created_at FROM notices ORDER BY id DESC LIMIT 50').all() }));

async function statusOf(n) {
  const names = Object.fromEntries(JSON.parse(n.people).map((p) => [p.to, p.name]));
  const parts = await Promise.allSettled(JSON.parse(n.batches).map((b) => omixo('GET', '/calls/obd/batch/' + encodeURIComponent(b))));
  const ok = parts.filter((p) => p.status === 'fulfilled').map((p) => p.value);
  if (!ok.length) throw Object.assign(new Error('Status is not available right now.'), { status: 502 });
  const counts = { done: 0, missed: 0, failed: 0, pending: 0 }, calls = [];
  ok.forEach((d) => {
    Object.entries(d.by_status || {}).forEach(([s, c]) => { counts[GROUP(s)] += c; });
    (d.calls || []).forEach((c) => { const to = norm(c.to); calls.push({ to, name: names[to] || '', group: GROUP(c.status), duration: c.duration_sec ?? 0 }); });
  });
  const known = Object.values(counts).reduce((a, b) => a + b, 0);
  counts.pending += Math.max(0, n.total - n.rejected - known);
  return { counts, calls };
}
const getNotice = (id) => db.prepare('SELECT * FROM notices WHERE id=?').get(+id);

app.get('/api/notices/:id/status', needAuth, h(async (req, res) => {
  const n = getNotice(req.params.id); if (!n) return fail(res, 'Notice not found.', 404);
  const s = await statusOf(n);
  res.json({ ...s, retryCount: s.calls.filter((c) => ['missed', 'failed'].includes(c.group)).length });
}));
app.post('/api/notices/:id/retry', needAuth, h(async (req, res) => {
  const n = getNotice(req.params.id); if (!n) return fail(res, 'Notice not found.', 404);
  const { counts, calls } = await statusOf(n);
  if (counts.pending) return fail(res, 'Wait until all calls have finished.');
  const people = calls.filter((c) => ['missed', 'failed'].includes(c.group)).map((c) => ({ to: c.to, name: c.name }));
  if (!people.length) return fail(res, 'No numbers to retry.');
  if (n.mode === 'audio' && !audioOk(n.audio_url)) return fail(res, 'The old audio has been deleted. Please send a new notice.');
  res.json(await createNotice(req.user, { mode: n.mode, msg: n.msg, audio_url: n.audio_url, people, title: 'Retry: ' + n.title }));
}));

app.get('/api/records', needAuth, h(async (req, res) => {
  const limit = Math.min(500, Math.max(1, +req.query.limit || 100));
  res.json({ records: (await omixo('GET', `/calls/records?limit=${limit}`)).records || [] });
}));

app.use('/api', (req, res) => fail(res, 'Not found', 404));
app.use(express.static('dist'));
app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html'), (e) => e && res.status(404).end()));
app.use((e, req, res, next) => { console.error(e.message); res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on the server.' }); });

app.listen(PORT, () => {
  console.log(`Server ready: http://localhost:${PORT}  (login username: ${APP_USER})`);
  if (!process.env.APP_PASSWORD) console.log('WARNING: APP_PASSWORD is not set in .env — using the default password. Change it before sharing the app.');
  if (PUBLIC) setTimeout(() => fetch(PUBLIC + '/ping').then((r) => console.log(r.ok ? `Public link OK: ${PUBLIC}` : `WARNING: public link answered HTTP ${r.status}: ${PUBLIC}`)).catch((e) => console.log(`WARNING: public link not reachable (${e.message}): ${PUBLIC}`)), 1500);
  if (!PUBLIC) console.log('NOTE: PUBLIC_BASE_URL is not set — voice recording / audio file notices will not work.');
});
