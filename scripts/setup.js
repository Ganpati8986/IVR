import fs from 'node:fs';
import crypto from 'node:crypto';
if (fs.existsSync('.env')) { console.log('.env already exists — left unchanged.'); process.exit(0); }
let t = fs.readFileSync('.env.example', 'utf8');
t = t.replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
fs.writeFileSync('.env', t);
console.log('.env created. Now fill in OMIXO_API_KEY (and PUBLIC_BASE_URL) in it.');
