/**
 * Web Audio plumbing for the interview page: mic capture via AudioWorklet
 * (resampled to 24 kHz PCM16) and gapless playback of the agent's 24 kHz PCM16
 * reply chunks, with level meters for the visualiser.
 */

export const AGENT_SAMPLE_RATE = 24000;

export class MicCapture {
  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf: Uint8Array<ArrayBuffer> | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  async start(onChunk: (pcm: ArrayBuffer) => void) {
    // Echo cancellation is essential: the agent's voice plays through the
    // speakers and must not be fed back as user speech.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await this.ctx.audioWorklet.addModule("/pcm-processor.js");
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, "pcm-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: { targetSampleRate: AGENT_SAMPLE_RATE, chunkMs: 50 },
    });
    this.worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(e.data);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Uint8Array(this.analyser.fftSize);
    source.connect(this.analyser);
    source.connect(this.worklet);
  }

  setMuted(muted: boolean) {
    this.worklet?.port.postMessage({ muted });
  }

  /** 0..1 RMS level of the mic input. */
  level(): number {
    if (!this.analyser || !this.levelBuf) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = (this.levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3);
  }

  stop() {
    this.worklet?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.worklet = null;
  }
}

export class AgentPlayer {
  private ctx: AudioContext;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private levelBuf: Uint8Array<ArrayBuffer>;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private pending: Int16Array[] = [];
  private pendingSamples = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Uint8Array(this.analyser.fftSize);
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  /** Queue a PCM16 chunk. Chunks are coalesced for ~40 ms before scheduling to keep node count sane. */
  enqueue(pcm: Int16Array) {
    this.pending.push(pcm);
    this.pendingSamples += pcm.length;
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flushPending(), 40);
  }

  private flushPending() {
    this.flushTimer = null;
    if (this.pendingSamples === 0) return;
    const f32 = new Float32Array(this.pendingSamples);
    let off = 0;
    for (const p of this.pending) {
      for (let i = 0; i < p.length; i++) f32[off + i] = p[i] / 32768;
      off += p.length;
    }
    this.pending = [];
    this.pendingSamples = 0;

    const buf = this.ctx.createBuffer(1, f32.length, AGENT_SAMPLE_RATE);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.06; // small lead-in to absorb jitter
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Stop everything queued — used on barge-in so the user doesn't hear stale speech. */
  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pending = [];
    this.pendingSamples = 0;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  get isPlaying() {
    return this.sources.size > 0 || this.pendingSamples > 0;
  }

  /** 0..1 RMS level of agent playback. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = (this.levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3);
  }

  destroy() {
    this.flush();
    this.analyser.disconnect();
    this.gain.disconnect();
  }
}
