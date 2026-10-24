import { api } from './api';

const RATE = 8000; // telephony sample rate

// Any AudioBuffer -> 8 kHz mono 16-bit PCM WAV (volume-normalised, with a little silence before/after)
export async function toTelephonyWav(ab) {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(ab.duration * RATE)), RATE);
  const src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  let peak = 0; for (const s of pcm) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1;

  const lead = Math.round(RATE * 0.4);                              // lets the call path open before speech starts
  const n = Math.max(lead + pcm.length + Math.round(RATE * 0.6), RATE * 5); // at least 5 s total
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + (lead + i) * 2, Math.round(Math.max(-1, Math.min(1, pcm[i] * gain)) * 0x7fff), true);
  return { blob: new Blob([v], { type: 'audio/wav' }), peak, duration: n / RATE };
}

export async function samplesToWav(samples, rate) {
  const ab = new AudioBuffer({ length: samples.length, sampleRate: rate, numberOfChannels: 1 });
  ab.copyToChannel(samples, 0);
  return toTelephonyWav(ab);
}

export async function fileToWav(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try { return await toTelephonyWav(await ctx.decodeAudioData(await file.arrayBuffer())); } finally { ctx.close(); }
}

export async function uploadAudio(blob) {
  return (await api('POST', '/upload', null, { body: blob, ext: 'wav' })).url;
}
