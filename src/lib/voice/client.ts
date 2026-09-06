/**
 * Browser client for the AssemblyAI Voice Agent API.
 *
 * Wire protocol (verified against https://www.assemblyai.com/docs/voice-agents/voice-agent-api/api-spec/voice-agent-websocket):
 *   connect  wss://agents.assemblyai.com/v1/ws?token=<single-use token minted server-side>
 *   →  session.update { session: {...inline config} }
 *   ←  session.updated, session.ready { session_id }
 *   →  input.audio { audio: <base64 PCM16 mono 24 kHz> }   (only after session.ready)
 *   ←  input.speech.started / stopped, transcript.user.delta / transcript.user
 *   ←  reply.started, reply.audio { data }, transcript.agent.delta, transcript.agent, reply.done { status }
 *   ←  tool.call { call_id, name, arguments }   →  tool.result { call_id, result: <JSON string> }
 *   →  session.end   ←  session.ended
 */

export type VoiceAgentSessionConfig = {
  system_prompt: string;
  greeting?: string;
  tools?: unknown[];
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

export type ServerEvent =
  | { type: "session.ready"; session_id: string; expires_at?: number }
  | { type: "session.updated" }
  | { type: "session.ended"; session_duration_seconds: number }
  | { type: "session.error"; code: string; message: string; param?: string }
  | { type: "input.speech.started" }
  | { type: "input.speech.stopped" }
  | { type: "transcript.user.delta"; text: string; item_id: string }
  | { type: "transcript.user"; text: string; item_id: string }
  | { type: "reply.started"; reply_id: string; item_id: string }
  | { type: "reply.audio"; data: string }
  | { type: "transcript.agent.delta"; reply_id: string; delta: string; start_ms: number | null; end_ms: number | null }
  | { type: "transcript.agent"; text: string; reply_id: string; interrupted: boolean }
  | { type: "reply.done"; reply_id: string; status: "completed" | "interrupted" }
  | { type: "tool.call"; call_id: string; name: string; arguments: Record<string, unknown> };

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;

type Listener = (ev: ServerEvent) => void;

export type ConnectionState = "idle" | "connecting" | "live" | "ending" | "closed" | "error";

const WS_URL = "wss://agents.assemblyai.com/v1/ws";

export class VoiceAgentClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private _state: ConnectionState = "idle";
  private ready = false;
  private pendingTools: { call_id: string; result: string }[] = [];
  private lastEvent: string | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private toolHandler: ToolHandler) {}

  get state() {
    return this._state;
  }
  get isReady() {
    return this.ready;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onState(fn: (s: ConnectionState) => void) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  private setState(s: ConnectionState) {
    this._state = s;
    for (const fn of this.stateListeners) fn(s);
  }

  connect(token: string, config: VoiceAgentSessionConfig): Promise<{ sessionId: string }> {
    this.setState("connecting");
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      let settled = false;

      ws.onopen = () => {
        this.send({ type: "session.update", session: config });
      };
      ws.onmessage = (m) => {
        let ev: ServerEvent;
        try {
          ev = JSON.parse(String(m.data)) as ServerEvent;
        } catch {
          return;
        }
        if (ev.type === "session.ready") {
          this.ready = true;
          this.setState("live");
          if (!settled) {
            settled = true;
            resolve({ sessionId: ev.session_id });
          }
        } else if (ev.type === "session.error") {
          console.error("[voice-agent] session.error", ev);
          if (!settled) {
            settled = true;
            this.setState("error");
            reject(new Error(`${ev.code}: ${ev.message}`));
          }
        } else if (ev.type === "session.ended") {
          this.ready = false;
          if (this.endTimer) clearTimeout(this.endTimer);
          this.setState("closed");
        }
        this.trackTurnState(ev);
        for (const fn of this.listeners) fn(ev);
        if (ev.type === "tool.call") void this.handleToolCall(ev);
        if (ev.type === "session.ended") {
          try {
            ws.close(1000);
          } catch {
            /* noop */
          }
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          this.setState("error");
          reject(new Error("WebSocket connection failed"));
        }
      };
      ws.onclose = (e) => {
        this.ready = false;
        if (this._state !== "closed" && this._state !== "error") {
          this.setState(e.code === 1000 ? "closed" : "error");
        }
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket closed during connect (code ${e.code})`));
        }
      };
    });
  }

  /** Send 24 kHz mono PCM16 bytes (already chunked to ~50 ms by the worklet). */
  sendAudio(pcm: ArrayBuffer) {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "input.audio", audio: base64Encode(new Uint8Array(pcm)) }));
  }

  /** Update mutable session fields mid-conversation (system_prompt, tools, turn_detection, volume...). */
  updateSession(session: Partial<VoiceAgentSessionConfig> & Record<string, unknown>) {
    this.send({ type: "session.update", session });
  }

  /** Ask the agent to speak now, optionally with a one-shot instruction. */
  createReply(instructions?: string) {
    this.send(instructions ? { type: "reply.create", instructions } : { type: "reply.create" });
  }

  /** Graceful shutdown: sends session.end and waits for session.ended (or a timeout). */
  end(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.setState("closed");
        resolve();
        return;
      }
      this.setState("ending");
      const off = this.onState((s) => {
        if (s === "closed" || s === "error") {
          off();
          resolve();
        }
      });
      this.send({ type: "session.end" });
      this.endTimer = setTimeout(() => {
        off();
        try {
          this.ws?.close();
        } catch {
          /* noop */
        }
        this.setState("closed");
        resolve();
      }, 4000);
    });
  }

  /** Best-effort end for pagehide/unload — fire and forget. */
  endImmediately() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "session.end" });
    }
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  // --- tool-call plumbing -------------------------------------------------
  // Per docs: send tool.result only when the latest event is reply.done; drop
  // pending results if that reply.done was "interrupted".

  private trackTurnState(ev: ServerEvent) {
    if (ev.type === "reply.started" || ev.type === "input.speech.started") this.lastEvent = ev.type;
    else if (ev.type === "reply.done") {
      this.lastEvent = ev.type;
      if (ev.status === "interrupted") this.pendingTools = [];
      else this.flushTools();
    }
  }

  private async handleToolCall(ev: Extract<ServerEvent, { type: "tool.call" }>) {
    let result: string;
    try {
      const out = await this.toolHandler(ev.name, ev.arguments ?? {});
      result = JSON.stringify(out ?? { ok: true });
    } catch (err) {
      result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
    this.pendingTools.push({ call_id: ev.call_id, result });
    this.flushTools();
  }

  private flushTools() {
    if (this.lastEvent !== "reply.done" || this.pendingTools.length === 0) return;
    for (const t of this.pendingTools) this.send({ type: "tool.result", call_id: t.call_id, result: t.result });
    this.pendingTools = [];
  }
}

// --- base64 helpers (chunked to avoid call-stack limits) --------------------

export function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x2000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  }
  return btoa(bin);
}

export function base64Decode(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}
