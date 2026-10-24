import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { api } from './api';
import { LABEL, TONE } from './lib';

export default function Track({ selected, setSelected }) {
  const [list, setList] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dr = useRef(null); dr.current = data;
  const loadList = useCallback(() => api('GET', '/notices').then((d) => setList(d.notices)).catch((e) => setErr(e.message)), []);
  useEffect(() => { loadList(); }, [loadList]);
  const n = list.find((x) => x.id === selected) || list[0];

  const refresh = useCallback(async () => {
    if (!n) return;
    try { setData(await api('GET', `/notices/${n.id}/status`)); setErr(''); } catch (e) { setErr(e.message); }
  }, [n?.id]); // eslint-disable-line
  useEffect(() => {
    setData(null); refresh();
    const t = setInterval(() => { if (dr.current?.counts.pending !== 0) refresh(); }, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!n) return <header className="head"><h1>Delivery status</h1><p>{err || 'No notices have been sent yet.'}</p></header>;

  const c = data?.counts; const total = n.total - n.rejected;
  const finished = c ? total - c.pending : 0;
  const retry = async () => {
    setBusy(true);
    try { const d = await api('POST', `/notices/${n.id}/retry`); await loadList(); setSelected(d.id); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <header className="head"><h1>Delivery status</h1><p>Updates automatically every 6 seconds.</p></header>
      <div className="picker">
        {list.slice(0, 12).map((x) => (
          <button key={x.id} className={x.id === n.id ? 'on' : ''} onClick={() => setSelected(x.id)}>
            <b>{x.title}</b><small>{new Date(x.created_at).toLocaleString()} · {x.total} numbers · {x.username}</small>
          </button>
        ))}
      </div>
      <section className="card">
        <div className="row between"><h2>{n.title}</h2><button className="ghost" onClick={refresh}><RefreshCw size={14} /> Refresh</button></div>
        {err && <div className="alert r">{err}</div>}
        <div className="prog"><i style={{ width: `${total ? (finished / total) * 100 : 0}%` }} /></div>
        <small>{finished} / {total} calls completed</small>
        <div className="stats4">
          {['done', 'missed', 'failed', 'pending'].map((g) => <div key={g} className={'s ' + TONE[g]}><strong>{c ? c[g] : '–'}</strong><span>{LABEL[g]}</span></div>)}
        </div>
        {c && c.pending === 0 && data.retryCount > 0 && (
          <button className="primary" disabled={busy} onClick={retry}><RotateCcw size={16} /> Call again those who didn’t answer ({data.retryCount})</button>
        )}
      </section>
      {data?.calls.length > 0 && (
        <section className="card"><div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Number</th><th>Status</th><th>Talk time (sec)</th></tr></thead>
          <tbody>{data.calls.map((x, i) => (
            <tr key={i}><td>{x.name || '—'}</td><td className="mono">{x.to}</td><td><span className={'badge ' + TONE[x.group]}>{LABEL[x.group]}</span></td><td className="mono">{x.duration}</td></tr>
          ))}</tbody>
        </table></div></section>
      )}
    </>
  );
}
