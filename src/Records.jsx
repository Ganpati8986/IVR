// import { useEffect, useState } from 'react';
// import { Download, RefreshCw } from 'lucide-react';
// import { api } from './api';

// const L = { ANSWERED: ['Answered', 'g'], 'NO ANSWER': ['No answer', 'a'], BUSY: ['Busy', 'a'], FAILED: ['Failed', 'r'] };

// export default function Records() {
//   const [rows, setRows] = useState([]);
//   const [q, setQ] = useState('');
//   const [err, setErr] = useState('');
//   const [busy, setBusy] = useState(false);
//   const load = async () => {
//     setBusy(true); setErr('');
//     try { setRows((await api('GET', '/records?limit=300')).records); } catch (e) { setErr(e.message); }
//     setBusy(false);
//   };
//   useEffect(() => { load(); }, []);
//   const shown = rows.filter((r) => !q || `${r.to} ${r.from}`.includes(q.replace(/\D/g, '') || q));
//   const csv = () => {
//     const h = 'Date,From,To,Direction,Duration(sec),Status,Cost\n';
//     const b = shown.map((r) => [r.started_at, r.from, r.to, r.direction, r.duration, r.disposition, r.cost].join(',')).join('\n');
//     const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([h + b], { type: 'text/csv' }));
//     a.download = 'call-records.csv'; a.click();
//   };
//   return (
//     <>
//       <header className="head"><h1>Call records</h1><p>Every call: who it went to, how long it lasted and what it cost.</p></header>
//       <section className="card">
//         <div className="row between">
//           <input className="search" placeholder="Search by number" value={q} onChange={(e) => setQ(e.target.value)} />
//           <span className="row"><button className="ghost" onClick={load} disabled={busy}><RefreshCw size={14} /> Refresh</button><button className="ghost" onClick={csv}><Download size={14} /> Export CSV</button></span>
//         </div>
//         {err && <div className="alert r">{err}</div>}
//         <div className="tablewrap"><table>
//           <thead><tr><th>Date</th><th>Number</th><th>Talk time (sec)</th><th>Status</th><th>Cost</th></tr></thead>
//           <tbody>{shown.map((r) => { const [t, tone] = L[String(r.disposition).toUpperCase()] || [r.disposition, 'n']; return (
//             <tr key={r.cdr_id}><td className="mono">{r.started_at}</td><td className="mono">{r.to}</td><td className="mono">{r.duration}</td><td><span className={'badge ' + tone}>{t}</span></td><td className="mono">{r.cost}</td></tr>); })}</tbody>
//         </table></div>
//         {!shown.length && !busy && <div className="empty">No records found.</div>}
//       </section>
//     </>
//   );
// }




import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api } from './api';

const L = {
  ANSWERED: ['Answered', 'g'],
  'NO ANSWER': ['No answer', 'a'],
  BUSY: ['Busy', 'a'],
  FAILED: ['Failed', 'r'],
};

const formatDate = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-IN');
};

const escapeCsv = (value) => {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export default function Records() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setErr('');

    try {
      const response = await api('GET', '/records?limit=300');

      console.log('Call records response:', response);

      // Support both { records: [...] } and { data: { records: [...] } }
      const records = Array.isArray(response)
        ? response
        : response?.records ?? response?.data?.records;

      if (!Array.isArray(records)) {
        throw new Error('Invalid records response from API');
      }

      setRows(records);
    } catch (e) {
      setRows([]);
      setErr(e.message || 'Failed to load call records');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const search = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  const shown = rows.filter((r) => {
    if (!search) return true;

    const numbers = `${r.dst ?? ''} ${r.src ?? ''}`;

    return (
      numbers.toLowerCase().includes(search) ||
      (digits.length > 0 && numbers.includes(digits))
    );
  });

  const csv = () => {
    const headers = [
      'ID',
      'Date',
      'From',
      'To',
      'Direction',
      'Channel Type',
      'DID',
      'Duration (sec)',
      'Status',
      'Cost',
      'Recording URL',
    ];

    const lines = shown.map((r) =>
      [
        r.id,
        r.start_at,
        r.src,
        r.dst,
        r.direction,
        r.channel_type,
        r.did,
        r.billsec,
        r.disposition,
        r.cost,
        r.recording_url,
      ]
        .map(escapeCsv)
        .join(',')
    );

    const content = [
      headers.map(escapeCsv).join(','),
      ...lines,
    ].join('\r\n');

    const blob = new Blob(
      ['\uFEFF', content],
      { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'call-records.csv';
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="head">
        <h1>Call records</h1>
        <p>
          Every call: who it went to, how long it lasted
          and what it cost.
        </p>
      </header>

      <section className="card">
        <div className="row between">
          <input
            className="search"
            placeholder="Search by number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <span className="row">
            <button
              className="ghost"
              onClick={load}
              disabled={busy}
            >
              <RefreshCw size={14} />
              {busy ? ' Loading...' : ' Refresh'}
            </button>

            <button
              className="ghost"
              onClick={csv}
              disabled={!shown.length}
            >
              <Download size={14} />
              {' Export CSV'}
            </button>
          </span>
        </div>

        {err && <div className="alert r">{err}</div>}

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>Number</th>
                <th>Direction</th>
                <th>Talk time (sec)</th>
                <th>Status</th>
                <th>Cost</th>
              </tr>
            </thead>

            <tbody>
              {shown.map((r) => {
                const [label, tone] =
                  L[String(r.disposition).toUpperCase()] ||
                  [r.disposition || 'Unknown', 'n'];

                return (
                  <tr key={r.id}>
                    <td className="mono">
                      {formatDate(r.start_at)}
                    </td>

                    <td className="mono">{r.src ?? '-'}</td>

                    <td className="mono">{r.dst ?? '-'}</td>

                    <td>{r.direction ?? '-'}</td>

                    <td className="mono">{r.billsec ?? 0}</td>

                    <td>
                      <span className={`badge ${tone}`}>
                        {label}
                      </span>
                    </td>

                    <td className="mono">
                      {r.cost ?? '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!shown.length && !busy && !err && (
          <div className="empty">No records found.</div>
        )}
      </section>
    </>
  );
}
