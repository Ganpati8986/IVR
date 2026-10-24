// Records raw PCM straight from the microphone (no MediaRecorder / webm / decoding step).
export async function startRecorder(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    await ctx.audioWorklet.addModule('/recorder-worklet.js');
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (e) { stream.getTracks().forEach((t) => t.stop()); ctx.close(); throw e; }

  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'rec-processor');
  const chunks = []; let flushed;
  node.port.onmessage = (e) => {
    if (typeof e.data === 'string') { flushed?.(); return; }
    chunks.push(e.data);
    if (onLevel) { let s = 0; for (const x of e.data) s += x * x; onLevel(Math.min(1, Math.sqrt(s / e.data.length) * 4)); }
  };
  const mute = ctx.createGain(); mute.gain.value = 0; // keep the graph running without playing the mic back
  src.connect(node); node.connect(mute); mute.connect(ctx.destination);
  const cleanup = () => { stream.getTracks().forEach((t) => t.stop()); try { node.disconnect(); src.disconnect(); } catch { /* ignore */ } ctx.close(); };

  return {
    async stop() {
      await new Promise((res) => { flushed = res; node.port.postMessage('flush'); setTimeout(res, 400); });
      const rate = ctx.sampleRate; cleanup();
      const samples = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0; for (const c of chunks) { samples.set(c, o); o += c.length; }
      return { samples, rate };
    },
    cancel: cleanup,
  };
}
