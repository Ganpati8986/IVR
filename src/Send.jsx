// import { useEffect, useMemo, useRef, useState } from 'react';
// import { Send as SendIcon, Upload, Volume2, TriangleAlert, Mic, Square, Trash2, Download } from 'lucide-react';
// import { parseRecipients } from './lib';
// import { api } from './api';
// import { samplesToWav, fileToWav, uploadAudio } from './audio';
// import { startRecorder } from './recorder';

// const TEMPLATES = [
//   ['Holiday', 'Hello {name}, this is a notice from school. The school will remain closed tomorrow. Thank you.'],
//   ['PTM', 'Hello {name}, a Parent-Teacher Meeting is scheduled this Saturday at 10 AM. Please attend. Thank you.'],
//   ['Fees', 'Hello {name}, the school fee due date is approaching. Please pay on time. Thank you.'],
// ];
// const MAX_SEC = 120;

// export default function Send({ onSent }) {
//   const [mode, setMode] = useState('say'); // say | record | file
//   const [msg, setMsg] = useState(TEMPLATES[0][1]);
//   const [clip, setClip] = useState(null); // {blob, url, duration}
//   const [rec, setRec] = useState(false);
//   const [secs, setSecs] = useState(0);
//   const [level, setLevel] = useState(0);
//   const [text, setText] = useState('');
//   const [confirm, setConfirm] = useState(false);
//   const [stage, setStage] = useState('');
//   const [err, setErr] = useState('');
//   const recRef = useRef(null); const timer = useRef(null); const stopRef = useRef(null);
//   const r = useMemo(() => parseRecipients(text), [text]);
//   const [pub, setPub] = useState(null);
//   const checkPub = () => { setPub(null); api('GET', '/public-check').then(setPub).catch((e) => setPub({ ok: false, error: e.message })); };
//   useEffect(() => { if (mode !== 'say') checkPub(); }, [mode]); // eslint-disable-line
//   useEffect(() => () => { clearInterval(timer.current); recRef.current?.cancel(); }, []);

//   const setWav = (w) => {
//     if (w.peak < 0.005) { setErr('No sound was captured. Check your microphone (and that it is not muted) and try again.'); return; }
//     if (clip) URL.revokeObjectURL(clip.url);
//     setClip({ blob: w.blob, url: URL.createObjectURL(w.blob), duration: w.duration });
//   };
//   const switchMode = (m) => { setMode(m); setErr(''); setConfirm(false); };

//   const start = async () => {
//     setErr('');
//     try {
//       recRef.current = await startRecorder(setLevel);
//       setRec(true); setSecs(0);
//       timer.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SEC) stopRef.current?.(); return s + 1; }), 1000);
//     } catch (e) { setErr(`Could not start the microphone (${e.name || e.message}). Allow the mic permission in your browser — it only works on localhost or https.`); }
//   };
//   const stop = async () => {
//     clearInterval(timer.current); setRec(false); setLevel(0);
//     const R = recRef.current; recRef.current = null; if (!R) return;
//     try {
//       const { samples, rate } = await R.stop();
//       if (samples.length < rate * 0.5) { setErr('Recording was too short. Please record again.'); return; }
//       setWav(await samplesToWav(samples, rate));
//     } catch { setErr('Could not process the recording. Please try again.'); }
//   };
//   stopRef.current = stop;

//   const pickFile = async (e) => {
//     const f = e.target.files[0]; e.target.value = ''; if (!f) return;
//     setErr('');
//     try { setWav(await fileToWav(f)); } catch { setErr('Could not read this audio file. Please use a normal mp3, wav or m4a file.'); }
//   };
//   const readCsv = (e) => {
//     const f = e.target.files[0]; if (!f) return;
//     f.text().then((t) => setText((p) => (p ? p + '\n' : '') + t.replace(/\r/g, '').replace(/^\D*number.*\n/i, '')));
//     e.target.value = '';
//   };

//   const problem = () => {
//     if (mode === 'say' && !msg.trim()) return 'Please write the notice message.';
//     if (mode === 'record' && !clip) return 'Please record your voice first.';
//     if (mode === 'file' && !clip) return 'Please choose an audio file.';
//     if (!r.valid.length) return 'Enter at least one valid mobile number.';
//     return '';
//   };

//   const go = async () => {
//     setErr('');
//     try {
//       let audio_url;
//       if (mode !== 'say') { setStage('Uploading audio…'); audio_url = await uploadAudio(clip.blob); }
//       setStage('Queuing calls…');
//       const d = await api('POST', '/notices', { mode: mode === 'say' ? 'say' : 'audio', msg: mode === 'say' ? msg : undefined, audio_url, people: r.valid });
//       onSent(d.id);
//     } catch (e) { setErr(e.message); setConfirm(false); }
//     setStage('');
//   };
//   const busy = !!stage;
//   const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <>
//       <header className="head"><h1>Send a notice</h1><p>Write a message or record your voice, add the numbers and send. Anyone who picks up will hear the notice.</p></header>

//       <section className="card">
//         <h2>1. How should the notice be heard?</h2>
//         <div className="seg">
//           <button className={mode === 'say' ? 'on' : ''} onClick={() => switchMode('say')}>Type a message</button>
//           <button className={mode === 'record' ? 'on' : ''} onClick={() => switchMode('record')}>Record now</button>
//           <button className={mode === 'file' ? 'on' : ''} onClick={() => switchMode('file')}>Audio file</button>
//         </div>

//         {mode === 'say' && (<>
//           <div className="chips tpl">{TEMPLATES.map(([t, m]) => <button key={t} className="ghost" onClick={() => setMsg(m)}>{t}</button>)}</div>
//           <textarea rows={4} maxLength={800} value={msg} onChange={(e) => setMsg(e.target.value)} className="big" />
//           <small>{msg.length}/800 · <code>{'{name}'}</code> is replaced with the student / parent name (computer voice).</small>
//           <div className="preview"><Volume2 size={16} /> {msg.replace(/\{name\}|\{\{name\}\}/g, 'Rahul')}</div>
//         </>)}

//         {mode === 'record' && (
//           <div className="recbox">
//             {!rec ? <button className="recbtn" onClick={start}><Mic size={22} /> {clip ? 'Record again' : 'Start recording'}</button>
//               : <button className="recbtn live" onClick={stop}><Square size={20} /> Stop · {mm(secs)}</button>}
//             {rec && <div className="meter" title="Microphone level"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>}
//             <small>Speak in your own voice (max {MAX_SEC / 60} min). While recording, the green bar should move when you speak. Names are not spoken in recordings — everyone hears the same recording.</small>
//           </div>
//         )}

//         {mode === 'file' && (
//           <div className="recbox">
//             <label className="ghost file"><Upload size={14} /> Choose audio from your computer (mp3, wav, m4a…)<input type="file" accept="audio/*" hidden onChange={pickFile} /></label>
//           </div>
//         )}

//         {mode !== 'say' && clip && (
//           <div className="clip">
//             <audio controls src={clip.url} />
//             <small>This is exactly what recipients will hear · {clip.duration.toFixed(1)} s</small>
//             <a className="ghost" href={clip.url} download="notice.wav"><Download size={14} /> Download</a>
//             <button className="ghost" onClick={() => setClip(null)}><Trash2 size={14} /> Remove</button>
//           </div>
//         )}
//         {mode !== 'say' && (pub === null ? <div className="alert a">Checking that Omixo can reach your audio link…</div>
//           : pub.ok ? <div className="alert g">Public audio link is reachable ✓ <small>{pub.url}</small></div>
//           : <div className="alert r">{pub.error} <button className="link" onClick={checkPub}>Test again</button></div>)}
//       </section>

//       <section className="card">
//         <h2>2. Who should receive it?</h2>
//         <p className="desc">One per line: <code>mobile number, name</code> (name is optional). Copy-paste from Excel / CSV works too.</p>
//         <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'9565990444, Rahul’s father\n9811122233, Priya’s mother'} />
//         <div className="row between">
//           <label className="ghost file"><Upload size={14} /> Add from CSV file<input type="file" accept=".csv,.txt" hidden onChange={readCsv} /></label>
//           <span><b>{r.valid.length}</b> valid number{r.valid.length === 1 ? '' : 's'}{r.dups ? ` · ${r.dups} duplicate${r.dups === 1 ? '' : 's'} removed` : ''}{r.invalid.length ? ` · ${r.invalid.length} invalid` : ''}</span>
//         </div>
//         {r.invalid.length > 0 && <div className="alert a"><TriangleAlert size={16} /> Invalid numbers (must be a 10-digit mobile number): {r.invalid.slice(0, 3).join(' | ')}{r.invalid.length > 3 ? ' …' : ''}</div>}
//       </section>

//       {err && <div className="alert r">{err}</div>}
//       {!confirm ? (
//         <button className="primary lg" onClick={() => { const p = problem(); setErr(p); if (!p) setConfirm(true); }}><SendIcon size={18} /> Send notice</button>
//       ) : (
//         <div className="card confirm">
//           <h2>Are you sure?</h2>
//           <p>Calls will go to <b>{r.valid.length}</b> number{r.valid.length === 1 ? '' : 's'}. Once sent, it cannot be recalled, and every call is charged to your wallet.</p>
//           <div className="row">
//             <button className="primary" disabled={busy} onClick={go}>{busy ? stage : 'Yes, send'}</button>
//             <button className="ghost" disabled={busy} onClick={() => setConfirm(false)}>Back</button>
//           </div>
//         </div>
//       )}
//     </>
//   );
// }


import { useEffect, useMemo, useRef, useState } from 'react';
import { Send as SendIcon, Upload, Volume2, TriangleAlert, Mic, Square, Trash2, Download } from 'lucide-react';
import { parseRecipients } from './lib';
import { api } from './api';
import { samplesToWav, fileToWav, uploadAudio } from './audio';
import { startRecorder } from './recorder';
import { fileToLines } from './importFile';

const TEMPLATES = [
  ['Holiday', 'Hello {name}, this is a notice from school. The school will remain closed tomorrow. Thank you.'],
  ['PTM', 'Hello {name}, a Parent-Teacher Meeting is scheduled this Saturday at 10 AM. Please attend. Thank you.'],
  ['Fees', 'Hello {name}, the school fee due date is approaching. Please pay on time. Thank you.'],
];
const MAX_SEC = 120;

export default function Send({ onSent }) {
  const [mode, setMode] = useState('say'); // say | record | file
  const [msg, setMsg] = useState(TEMPLATES[0][1]);
  const [clip, setClip] = useState(null); // {blob, url, duration}
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [stage, setStage] = useState('');
  const [err, setErr] = useState('');
  const recRef = useRef(null); const timer = useRef(null); const stopRef = useRef(null);
  const r = useMemo(() => parseRecipients(text), [text]);
  const [pub, setPub] = useState(null);
  const checkPub = () => { setPub(null); api('GET', '/public-check').then(setPub).catch((e) => setPub({ ok: false, error: e.message })); };
  useEffect(() => { if (mode !== 'say') checkPub(); }, [mode]); // eslint-disable-line
  useEffect(() => () => { clearInterval(timer.current); recRef.current?.cancel(); }, []);

  const setWav = (w) => {
    if (w.peak < 0.005) { setErr('No sound was captured. Check your microphone (and that it is not muted) and try again.'); return; }
    if (clip) URL.revokeObjectURL(clip.url);
    setClip({ blob: w.blob, url: URL.createObjectURL(w.blob), duration: w.duration });
  };
  const switchMode = (m) => { setMode(m); setErr(''); setConfirm(false); };

  const start = async () => {
    setErr('');
    try {
      recRef.current = await startRecorder(setLevel);
      setRec(true); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SEC) stopRef.current?.(); return s + 1; }), 1000);
    } catch (e) { setErr(`Could not start the microphone (${e.name || e.message}). Allow the mic permission in your browser — it only works on localhost or https.`); }
  };
  const stop = async () => {
    clearInterval(timer.current); setRec(false); setLevel(0);
    const R = recRef.current; recRef.current = null; if (!R) return;
    try {
      const { samples, rate } = await R.stop();
      if (samples.length < rate * 0.5) { setErr('Recording was too short. Please record again.'); return; }
      setWav(await samplesToWav(samples, rate));
    } catch { setErr('Could not process the recording. Please try again.'); }
  };
  stopRef.current = stop;

  const pickFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    setErr('');
    try { setWav(await fileToWav(f)); } catch { setErr('Could not read this audio file. Please use a normal mp3, wav or m4a file.'); }
  };
  const readList = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    setErr('');
    try { const lines = await fileToLines(f); setText((p) => (p.trim() ? p.replace(/\s+$/, '') + '\n' : '') + lines.join('\n')); }
    catch (x) { setErr(x.message || 'Could not read this file.'); }
  };

  const problem = () => {
    if (mode === 'say' && !msg.trim()) return 'Please write the notice message.';
    if (mode === 'record' && !clip) return 'Please record your voice first.';
    if (mode === 'file' && !clip) return 'Please choose an audio file.';
    if (!r.valid.length) return 'Enter at least one valid mobile number.';
    return '';
  };

  const go = async () => {
    setErr('');
    try {
      let audio_url;
      if (mode !== 'say') { setStage('Uploading audio…'); audio_url = await uploadAudio(clip.blob); }
      setStage('Queuing calls…');
      const d = await api('POST', '/notices', { mode: mode === 'say' ? 'say' : 'audio', msg: mode === 'say' ? msg : undefined, audio_url, people: r.valid });
      onSent(d.id);
    } catch (e) { setErr(e.message); setConfirm(false); }
    setStage('');
  };
  const busy = !!stage;
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <>
      <header className="head"><h1>Send a notice</h1><p>Write a message or record your voice, add the numbers and send. Anyone who picks up will hear the notice.</p></header>

      <section className="card">
        <h2>1. How should the notice be heard?</h2>
        <div className="seg">
          <button className={mode === 'say' ? 'on' : ''} onClick={() => switchMode('say')}>Type a message</button>
          <button className={mode === 'record' ? 'on' : ''} onClick={() => switchMode('record')}>Record now</button>
          <button className={mode === 'file' ? 'on' : ''} onClick={() => switchMode('file')}>Audio file</button>
        </div>

        {mode === 'say' && (<>
          <div className="chips tpl">{TEMPLATES.map(([t, m]) => <button key={t} className="ghost" onClick={() => setMsg(m)}>{t}</button>)}</div>
          <textarea rows={4} maxLength={800} value={msg} onChange={(e) => setMsg(e.target.value)} className="big" />
          <small>{msg.length}/800 · <code>{'{name}'}</code> is replaced with the student / parent name (computer voice).</small>
          <div className="preview"><Volume2 size={16} /> {msg.replace(/\{name\}|\{\{name\}\}/g, 'Rahul')}</div>
        </>)}

        {mode === 'record' && (
          <div className="recbox">
            {!rec ? <button className="recbtn" onClick={start}><Mic size={22} /> {clip ? 'Record again' : 'Start recording'}</button>
              : <button className="recbtn live" onClick={stop}><Square size={20} /> Stop · {mm(secs)}</button>}
            {rec && <div className="meter" title="Microphone level"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>}
            <small>Speak in your own voice (max {MAX_SEC / 60} min). While recording, the green bar should move when you speak. Names are not spoken in recordings — everyone hears the same recording.</small>
          </div>
        )}

        {mode === 'file' && (
          <div className="recbox">
            <label className="ghost file"><Upload size={14} /> Choose audio from your computer (mp3, wav, m4a…)<input type="file" accept="audio/*" hidden onChange={pickFile} /></label>
          </div>
        )}

        {mode !== 'say' && clip && (
          <div className="clip">
            <audio controls src={clip.url} />
            <small>This is exactly what recipients will hear · {clip.duration.toFixed(1)} s</small>
            <a className="ghost" href={clip.url} download="notice.wav"><Download size={14} /> Download</a>
            <button className="ghost" onClick={() => setClip(null)}><Trash2 size={14} /> Remove</button>
          </div>
        )}
        {mode !== 'say' && (pub === null ? <div className="alert a">Checking that Omixo can reach your audio link…</div>
          : pub.ok ? <div className="alert g">Public audio link is reachable ✓ <small>{pub.url}</small></div>
          : <div className="alert r">{pub.error} <button className="link" onClick={checkPub}>Test again</button></div>)}
      </section>

      <section className="card">
        <h2>2. Who should receive it?</h2>
        <p className="desc">One per line: <code>mobile number, name</code> (name is optional). Or use “Add from Excel / CSV file” (.xlsx, .csv) — a column named Mobile / Phone and a column named Name are picked up automatically.</p>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'9565990444, Rahul’s father\n9811122233, Priya’s mother'} />
        <div className="row between">
          <label className="ghost file"><Upload size={14} /> Add from Excel / CSV file<input type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={readList} /></label>
          <span><b>{r.valid.length}</b> valid number{r.valid.length === 1 ? '' : 's'}{r.dups ? ` · ${r.dups} duplicate${r.dups === 1 ? '' : 's'} removed` : ''}{r.invalid.length ? ` · ${r.invalid.length} invalid` : ''}</span>
        </div>
        {r.invalid.length > 0 && <div className="alert a"><TriangleAlert size={16} /> Invalid numbers (must be a 10-digit mobile number): {r.invalid.slice(0, 3).join(' | ')}{r.invalid.length > 3 ? ' …' : ''}</div>}
      </section>

      {err && <div className="alert r">{err}</div>}
      {!confirm ? (
        <button className="primary lg" onClick={() => { const p = problem(); setErr(p); if (!p) setConfirm(true); }}><SendIcon size={18} /> Send notice</button>
      ) : (
        <div className="card confirm">
          <h2>Are you sure?</h2>
          <p>Calls will go to <b>{r.valid.length}</b> number{r.valid.length === 1 ? '' : 's'}. Once sent, it cannot be recalled, and every call is charged to your wallet.</p>
          <div className="row">
            <button className="primary" disabled={busy} onClick={go}>{busy ? stage : 'Yes, send'}</button>
            <button className="ghost" disabled={busy} onClick={() => setConfirm(false)}>Back</button>
          </div>
        </div>
      )}
    </>
  );
}

