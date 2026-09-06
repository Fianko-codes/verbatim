/**
 * AudioWorklet: captures mic audio at the context's native rate, resamples to
 * 24 kHz (what the AssemblyAI Voice Agent API expects), converts Float32 → Int16
 * PCM, and posts fixed-size chunks (~50 ms) to the main thread.
 *
 * Runs at whatever sample rate the AudioContext has (48 kHz on Safari, 44.1/48
 * elsewhere), so echo cancellation keeps working on Firefox and the output is
 * correct on Safari. See:
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.target = opts.targetSampleRate || 24000;
    this.ratio = sampleRate / this.target; // `sampleRate` is a worklet global
    this.chunkSamples = Math.round(this.target * (opts.chunkMs || 50) / 1000);
    this.carry = new Float32Array(0);
    this.frac = 0;
    this.out = new Int16Array(this.chunkSamples);
    this.outLen = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.muted === "boolean") this.muted = e.data.muted;
    };
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    // Concatenate leftover samples from the previous block with the new block.
    const src = new Float32Array(this.carry.length + input.length);
    src.set(this.carry, 0);
    src.set(input, this.carry.length);

    // Linear-interpolation resample.
    let pos = this.frac;
    while (pos + 1 < src.length) {
      const i = pos | 0;
      const t = pos - i;
      let s = src[i] * (1 - t) + src[i + 1] * t;
      if (this.muted) s = 0;
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      this.out[this.outLen++] = (s * 32767) | 0;
      if (this.outLen === this.chunkSamples) {
        this.port.postMessage(this.out.buffer.slice(0));
        this.outLen = 0;
      }
      pos += this.ratio;
    }
    const keepFrom = pos | 0;
    this.carry = src.slice(keepFrom);
    this.frac = pos - keepFrom;
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
