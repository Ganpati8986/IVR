export async function api(method, path, body, raw) {
  const opt = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'school-app' } };
  if (raw) { opt.body = raw.body; opt.headers['Content-Type'] = 'application/octet-stream'; opt.headers['x-file-ext'] = raw.ext; }
  else if (body) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch('/api' + path, opt); } catch { throw new Error('Could not connect to the server.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login' && path !== '/me') window.dispatchEvent(new Event('auth-lost'));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
