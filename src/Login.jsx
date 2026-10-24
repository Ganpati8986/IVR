import { useState } from 'react';
import { School } from 'lucide-react';
import { api } from './api';

export default function Login({ onLogin }) {
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { onLogin((await api('POST', '/login', { username: u, password: p })).user); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div className="loginwrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand dark"><School size={26} /> <span>St. Mary's<br /><small>Samtoli Simdega</small></span></div>
        <label><span>Username</span><input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required autoFocus /></label>
        <label><span>Password</span><input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="alert r">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>
      </form>
    </div>
  );
}
