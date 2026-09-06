/**
 * Server-side helpers for the AssemblyAI Voice Agent API.
 * Docs: https://www.assemblyai.com/docs/voice-agents/voice-agent-api
 *
 * NOTE: the Voice Agent API requires `Authorization: Bearer <key>` — unlike the
 * transcription + LLM Gateway APIs, which take the raw key.
 */

const AGENTS_BASE = "https://agents.assemblyai.com";

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return key;
}

function bearer() {
  return { Authorization: `Bearer ${apiKey()}` };
}

/** Mint a single-use browser token for the Voice Agent WebSocket. */
export async function mintVoiceAgentToken(opts: { maxSessionSeconds: number; expiresInSeconds?: number }) {
  const url = new URL(`${AGENTS_BASE}/v1/token`);
  url.searchParams.set("expires_in_seconds", String(opts.expiresInSeconds ?? 300));
  url.searchParams.set("max_session_duration_seconds", String(Math.min(10800, Math.max(60, opts.maxSessionSeconds))));
  const res = await fetch(url, { headers: bearer(), cache: "no-store" });
  if (!res.ok) throw new Error(`Token mint failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_in_seconds: number };
  return data.token;
}

export type AaiSessionArtifact = { type: "audio" | "timeline" | "metadata"; url: string; content_type: string };
export type AaiSession = {
  id: string;
  status: string;
  duration_seconds: number | null;
  created_at: string | null;
  ended_at: string | null;
  artifacts: AaiSessionArtifact[];
};

export async function getVoiceAgentSession(sessionId: string): Promise<AaiSession> {
  const res = await fetch(`${AGENTS_BASE}/v1/sessions/${encodeURIComponent(sessionId)}`, {
    headers: bearer(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Get session failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as AaiSession;
}

export type AaiTimelineTurn = {
  turn_id: string;
  item_id: string;
  status: string;
  trigger: string;
  user_transcript: string | null;
  user_speech_started_at_ms: number | null;
  user_speech_ended_at_ms: number | null;
  agent_text: string | null;
  agent_reply_started_at_ms: number | null;
  agent_reply_ended_at_ms: number | null;
  interrupted_at_ms: number | null;
  time_to_first_audio_ms: number | null;
};
export type AaiTimeline = { session_id: string; started_at_unix_ms: number; turns: AaiTimelineTurn[] };

/** Fetch the session timeline artifact (per-turn timestamps). Returns null until the session is complete. */
export async function getVoiceAgentTimeline(sessionId: string): Promise<AaiTimeline | null> {
  const session = await getVoiceAgentSession(sessionId);
  const art = session.artifacts?.find((a) => a.type === "timeline");
  if (!art) return null;
  const res = await fetch(art.url, { cache: "no-store" }); // pre-signed: no auth header
  if (!res.ok) return null;
  return (await res.json()) as AaiTimeline;
}

/** Fresh pre-signed URL for the stereo OGG/Opus recording (left=user, right=agent). */
export async function getVoiceAgentAudioUrl(sessionId: string): Promise<string | null> {
  const session = await getVoiceAgentSession(sessionId);
  return session.artifacts?.find((a) => a.type === "audio")?.url ?? null;
}
