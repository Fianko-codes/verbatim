"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Headphones, Mic, MicOff, PhoneOff, RotateCcw } from "lucide-react";
import type { Insight, InterviewSummary, Sentiment, Topic } from "@/db/schema";
import { TIME_UP_INSTRUCTIONS } from "@/lib/prompts";
import { enforceVerbatim, titleCase } from "@/lib/text";
import { AgentPlayer, MicCapture } from "@/lib/voice/audio";
import { VoiceAgentClient, base64Decode, type ServerEvent, type VoiceAgentSessionConfig } from "@/lib/voice/client";
import { Button, SentimentChip, Wordmark, buttonClass, inputClass } from "@/components/ui";

type StudyView = {
  id: string;
  title: string;
  goal: string;
  topics: Topic[];
  durationMinutes: number;
  showLiveNotes: boolean;
  isDemo: boolean;
};

type Phase = "intro" | "connecting" | "live" | "ending" | "done" | "error";
type Turn = { idx: number; role: "user" | "agent"; text: string; interrupted?: boolean };

type StartResponse = {
  interviewId: string;
  token: string;
  sessionConfig: VoiceAgentSessionConfig;
  durationMinutes: number;
  topics: Topic[];
  showLiveNotes: boolean;
};

const HARD_STOP_GRACE_MS = 45_000;

export function InterviewRoom({ study }: { study: StudyView }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [agentCaption, setAgentCaption] = useState("");
  const [userPartial, setUserPartial] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [covered, setCovered] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [summary, setSummary] = useState<InterviewSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  // Mutable runtime handles live outside React state.
  const rt = useRef<{
    ctx: AudioContext | null;
    mic: MicCapture | null;
    player: AgentPlayer | null;
    client: VoiceAgentClient | null;
    startedAt: number;
    turnIdx: number;
    ending: boolean;
    endingRequested: boolean;
    timeUpSent: boolean;
    replyActive: boolean;
    userActive: boolean;
    replyAudioStart: number | null;
    captionTimers: ReturnType<typeof setTimeout>[];
    pendingDeltas: { delta: string; start_ms: number | null }[];
    captionText: string;
    finalized: boolean;
    interviewId: string | null;
    idleWaiters: (() => void)[];
    hardStop: ReturnType<typeof setTimeout> | null;
    timeUpTimer: ReturnType<typeof setTimeout> | null;
    lastUserText: string;
    lastUserIdx: number | null;
    repliesSinceEnding: number;
    endFallback: ReturnType<typeof setTimeout> | null;
  }>({
    ctx: null,
    mic: null,
    player: null,
    client: null,
    startedAt: 0,
    turnIdx: 0,
    ending: false,
    endingRequested: false,
    timeUpSent: false,
    replyActive: false,
    userActive: false,
    replyAudioStart: null,
    captionTimers: [],
    pendingDeltas: [],
    captionText: "",
    finalized: false,
    interviewId: null,
    idleWaiters: [],
    hardStop: null,
    timeUpTimer: null,
    lastUserText: "",
    lastUserIdx: null,
    repliesSinceEnding: 0,
    endFallback: null,
  });

  const orbRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  const post = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }, []);

  const persistTurn = useCallback(
    async (turn: Turn) => {
      const r = rt.current;
      if (!r.interviewId) return;
      try {
        await post(`/api/interviews/${r.interviewId}/turns`, {
          idx: turn.idx,
          role: turn.role,
          text: turn.text,
          atMs: Math.max(0, Math.round(performance.now() - r.startedAt)),
          interrupted: Boolean(turn.interrupted),
        });
      } catch (err) {
        console.warn("persistTurn failed", err);
      }
    },
    [post],
  );

  const clearCaptionTimers = () => {
    const r = rt.current;
    for (const t of r.captionTimers) clearTimeout(t);
    r.captionTimers = [];
    r.pendingDeltas = [];
  };

  /** Show a word at the moment its audio plays (deltas arrive ahead of audio). */
  const scheduleDelta = (delta: string, startMs: number | null) => {
    const r = rt.current;
    if (r.replyAudioStart == null) {
      r.pendingDeltas.push({ delta, start_ms: startMs });
      return;
    }
    const showAt = r.replyAudioStart + (startMs ?? 0) + 90;
    const wait = Math.max(0, showAt - performance.now());
    const timer = setTimeout(() => {
      r.captionText = r.captionText ? `${r.captionText} ${delta}` : delta;
      setAgentCaption(r.captionText);
    }, wait);
    r.captionTimers.push(timer);
  };

  const resolveIdleWaiters = () => {
    const r = rt.current;
    if (r.replyActive || r.userActive) return;
    const waiters = r.idleWaiters;
    r.idleWaiters = [];
    for (const w of waiters) w();
  };

  const whenIdle = (fn: () => void) => {
    const r = rt.current;
    if (!r.replyActive && !r.userActive) fn();
    else r.idleWaiters.push(fn);
  };

  const finalize = useCallback(
    async (status: "completed" | "abandoned" = "completed") => {
      const r = rt.current;
      if (r.finalized) return;
      r.finalized = true;
      if (r.hardStop) clearTimeout(r.hardStop);
      if (r.timeUpTimer) clearTimeout(r.timeUpTimer);
      if (r.endFallback) clearTimeout(r.endFallback);
      clearCaptionTimers();
      r.mic?.stop();
      r.player?.destroy();
      try {
        await r.ctx?.close();
      } catch {
        /* noop */
      }
      setPhase("done");
      if (!r.interviewId) return;
      setSummaryState("loading");
      try {
        const data = (await post(`/api/interviews/${r.interviewId}/complete`, {
          durationSeconds: Math.round((performance.now() - r.startedAt) / 1000),
          status,
        })) as { summary: InterviewSummary | null };
        if (data.summary) {
          setSummary(data.summary);
          setSummaryState("ready");
        } else setSummaryState("failed");
      } catch {
        setSummaryState("failed");
      }
    },
    [post],
  );

  /** Ask the agent to close out; falls back to a hard end if it doesn't. */
  const endGracefully = useCallback(async () => {
    const r = rt.current;
    if (!r.client || r.endingRequested) return;
    r.endingRequested = true;
    setPhase("ending");
    // Wait for any audio in flight so the goodbye isn't clipped.
    const started = performance.now();
    while (r.player?.isPlaying && performance.now() - started < 8000) {
      await new Promise((res) => setTimeout(res, 120));
    }
    await r.client.end();
    await finalize("completed");
  }, [finalize]);

  const hangUp = useCallback(async () => {
    const r = rt.current;
    if (!r.client) return;
    r.endingRequested = true;
    setPhase("ending");
    r.player?.flush();
    await r.client.end();
    await finalize(rt.current.turnIdx > 1 ? "completed" : "abandoned");
  }, [finalize]);

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  const handleEvent = useCallback(
    (ev: ServerEvent) => {
      const r = rt.current;
      switch (ev.type) {
        case "reply.started": {
          r.replyActive = true;
          if (r.ending) r.repliesSinceEnding += 1;
          if (r.endFallback) {
            clearTimeout(r.endFallback);
            r.endFallback = null;
          }
          r.replyAudioStart = null;
          r.captionText = "";
          clearCaptionTimers();
          setAgentCaption("");
          setThinking(true);
          break;
        }
        case "reply.audio": {
          if (r.replyAudioStart == null) {
            r.replyAudioStart = performance.now();
            setThinking(false);
            setAgentSpeaking(true);
            const queued = r.pendingDeltas;
            r.pendingDeltas = [];
            for (const d of queued) scheduleDelta(d.delta, d.start_ms);
          }
          r.player?.enqueue(base64Decode(ev.data));
          break;
        }
        case "transcript.agent.delta": {
          scheduleDelta(ev.delta, ev.start_ms);
          break;
        }
        case "transcript.agent": {
          const turn: Turn = { idx: r.turnIdx++, role: "agent", text: ev.text, interrupted: ev.interrupted };
          setTurns((prev) => [...prev, turn]);
          void persistTurn(turn);
          break;
        }
        case "reply.done": {
          r.replyActive = false;
          setThinking(false);
          if (ev.status === "interrupted") {
            r.player?.flush();
            clearCaptionTimers();
            setAgentSpeaking(false);
          } else {
            // Let the tail of the audio play out before flipping the orb.
            const player = r.player;
            const check = () => {
              if (!player?.isPlaying) setAgentSpeaking(false);
              else setTimeout(check, 100);
            };
            setTimeout(check, 150);
          }
          if (r.ending && !r.endingRequested) {
            if (r.repliesSinceEnding >= 1) void endGracefully();
            else if (!r.endFallback) r.endFallback = setTimeout(() => void endGracefully(), 6000);
          }
          resolveIdleWaiters();
          break;
        }
        case "input.speech.started": {
          r.userActive = true;
          setUserSpeaking(true);
          // Barge-in: stop stale agent audio immediately.
          if (r.player?.isPlaying) {
            r.player.flush();
            clearCaptionTimers();
            setAgentSpeaking(false);
          }
          break;
        }
        case "transcript.user.delta": {
          setUserPartial(ev.text);
          break;
        }
        case "input.speech.stopped": {
          setUserSpeaking(false);
          break;
        }
        case "transcript.user": {
          r.userActive = false;
          setUserSpeaking(false);
          setUserPartial("");
          const turn: Turn = { idx: r.turnIdx++, role: "user", text: ev.text };
          r.lastUserText = ev.text;
          r.lastUserIdx = turn.idx;
          setTurns((prev) => [...prev, turn]);
          void persistTurn(turn);
          resolveIdleWaiters();
          break;
        }
        case "session.error": {
          console.error("session.error", ev);
          if (ev.code === "UNAUTHORIZED" || ev.code === "session_not_found") {
            setError(ev.message);
            setPhase("error");
          }
          break;
        }
        case "session.ended": {
          void finalize(rt.current.turnIdx > 1 ? "completed" : "abandoned");
          break;
        }
        default:
          break;
      }
    },
    [persistTurn, finalize, endGracefully],
  );

  const toolHandler = useCallback(
    async (nameOfTool: string, args: Record<string, unknown>) => {
      const r = rt.current;
      if (nameOfTool === "capture_insight") {
        const rawQuote = String(args.quote ?? "").trim();
        const source = r.lastUserText || rawQuote;
        if (!rawQuote || !source) return { ok: false, error: "nothing to note" };
        const sentiment = String(args.sentiment ?? "neutral").toLowerCase();
        const payload = {
          theme: titleCase(String(args.theme ?? "Note")).slice(0, 80),
          quote: enforceVerbatim(rawQuote, source).slice(0, 600),
          note: String(args.note ?? "").slice(0, 400),
          sentiment: (["positive", "neutral", "negative", "mixed"].includes(sentiment) ? sentiment : "neutral") as Sentiment,
          topicId: args.topic_id ? String(args.topic_id) : null,
          turnIdx: r.lastUserIdx,
        };
        if (r.interviewId) {
          post(`/api/interviews/${r.interviewId}/insights`, payload)
            .then((d: { insight: Insight }) => setInsights((prev) => [...prev, d.insight]))
            .catch(() => {});
        }
        return { ok: true };
      }
      if (nameOfTool === "mark_topic_complete") {
        const topicId = String(args.topic_id ?? "");
        if (topicId) {
          setCovered((prev) => (prev.includes(topicId) ? prev : [...prev, topicId]));
          if (r.interviewId) void post(`/api/interviews/${r.interviewId}/events`, { type: "topic", topicId }).catch(() => {});
        }
        return { ok: true };
      }
      if (nameOfTool === "end_interview") {
        r.ending = true;
        r.repliesSinceEnding = 0;
        return { ok: true, message: "Recorded. Now say goodbye to the participant." };
      }
      return { ok: false, error: `Unknown tool ${nameOfTool}` };
    },
    [post],
  );

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------

  const start = useCallback(async () => {
    const r = rt.current;
    setError(null);
    setPhase("connecting");
    try {
      // AudioContext must be created inside the user gesture.
      const ctx = new AudioContext();
      r.ctx = ctx;
      const mic = new MicCapture(ctx);
      const player = new AgentPlayer(ctx);
      r.mic = mic;
      r.player = player;

      const client = new VoiceAgentClient(toolHandler);
      r.client = client;
      client.on(handleEvent);

      // Mic permission first so the prompt appears right on click.
      await mic.start((chunk) => client.sendAudio(chunk));

      const data = (await post("/api/interviews", { studyId: study.id, participantLabel: name.trim() || undefined })) as StartResponse;
      r.interviewId = data.interviewId;
      setInterviewId(data.interviewId);

      const { sessionId } = await client.connect(data.token, data.sessionConfig);
      r.startedAt = performance.now();
      setPhase("live");
      void post(`/api/interviews/${data.interviewId}/events`, { type: "session", aaiSessionId: sessionId }).catch(() => {});

      const totalMs = data.durationMinutes * 60_000;
      r.timeUpTimer = setTimeout(() => {
        whenIdle(() => {
          if (r.endingRequested || r.timeUpSent) return;
          r.timeUpSent = true;
          // The agent says goodbye; the page ends the session when that reply is done.
          r.ending = true;
          r.repliesSinceEnding = 0;
          client.createReply(TIME_UP_INSTRUCTIONS);
        });
      }, totalMs);
      r.hardStop = setTimeout(() => void endGracefully(), totalMs + HARD_STOP_GRACE_MS);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /NotAllowed|Permission|denied/i.test(msg)
          ? "Microphone access was blocked. Allow the microphone for this site and try again."
          : msg,
      );
      setPhase("error");
      r.mic?.stop();
      r.player?.destroy();
      try {
        await r.ctx?.close();
      } catch {
        /* noop */
      }
    }
  }, [study.id, name, toolHandler, handleEvent, post, endGracefully]);

  // Clock
  useEffect(() => {
    if (phase !== "live" && phase !== "ending") return;
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - rt.current.startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  // Orb level loop
  useEffect(() => {
    if (phase !== "live" && phase !== "ending" && phase !== "connecting") return;
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const r = rt.current;
      const level = agentSpeaking ? (r.player?.level() ?? 0) : userSpeaking ? (r.mic?.level() ?? 0) : 0;
      smooth = smooth + (level - smooth) * 0.35;
      orbRef.current?.style.setProperty("--level", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, agentSpeaking, userSpeaking]);

  // Keep transcript pinned to the bottom
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, userPartial]);

  // End the session if the tab goes away so it doesn't keep billing.
  useEffect(() => {
    const onHide = () => rt.current.client?.endImmediately();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    rt.current.mic?.setMuted(next);
  };

  const orbState = useMemo(() => {
    if (agentSpeaking) return "speaking";
    if (userSpeaking) return "listening";
    if (thinking) return "thinking";
    return "idle";
  }, [agentSpeaking, userSpeaking, thinking]);

  const remaining = Math.max(0, study.durationMinutes * 60 - elapsed);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (phase === "intro" || phase === "error") {
    return (
      <Intro
        study={study}
        name={name}
        setName={setName}
        onStart={start}
        error={phase === "error" ? error : null}
      />
    );
  }

  if (phase === "done") {
    return (
      <Done
        study={study}
        interviewId={interviewId}
        summary={summary}
        summaryState={summaryState}
        insightCount={insights.length}
        turns={turns}
      />
    );
  }

  const showNotes = study.showLiveNotes;

  return (
    <main className="flex-1 flex flex-col">
      <header className="px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
        <Wordmark />
        <div className="hidden sm:flex items-center gap-2">
          {study.topics.map((t, i) => {
            const done = covered.includes(t.id);
            return (
              <span
                key={t.id}
                title={t.question}
                className={`h-7 min-w-7 px-2 rounded-full grid place-items-center text-[12px] font-medium border transition ${
                  done ? "bg-ink text-paper border-ink" : "bg-white text-muted border-line"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-muted tabular-nums" title="Time remaining">
            {fmt(remaining)}
          </span>
          <Button variant="secondary" size="sm" onClick={toggleMute} aria-pressed={muted}>
            {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button variant="danger" size="sm" onClick={hangUp} disabled={phase === "ending"}>
            <PhoneOff className="w-3.5 h-3.5" /> End
          </Button>
        </div>
      </header>

      <div className={`flex-1 grid ${showNotes ? "lg:grid-cols-[1fr_360px]" : ""} gap-0 min-h-0`}>
        <section className="flex flex-col items-center px-5 sm:px-8 pb-8 min-h-0">
          <div className="w-full max-w-2xl flex-1 flex flex-col items-center min-h-0">
            <div className="relative mt-6 sm:mt-10 w-36 h-36 sm:w-44 sm:h-44 grid place-items-center">
              <div ref={orbRef} className={`orb ${orbState}`} />
            </div>
            <div className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-muted h-4">
              {phase === "connecting"
                ? "Connecting…"
                : phase === "ending"
                  ? "Wrapping up…"
                  : orbState === "speaking"
                    ? "Verbatim is speaking"
                    : orbState === "listening"
                      ? "Listening"
                      : orbState === "thinking"
                        ? "Thinking"
                        : "Your turn — take your time"}
            </div>

            <p
              className={`mt-4 min-h-[4.5rem] text-center font-display leading-snug text-ink max-w-xl transition-[font-size] ${
                (agentCaption || lastAgentLine(turns)).length > 140 ? "text-[20px] sm:text-[22px]" : "text-[24px] sm:text-[28px]"
              }`}
            >
              {agentCaption || (phase === "connecting" ? "" : lastAgentLine(turns))}
            </p>

            <div className="mt-2 min-h-[2.5rem] text-center text-[15px] text-teal">
              {userPartial ? <span className="animate-fade-up">{userPartial}</span> : null}
            </div>

            <div
              ref={transcriptRef}
              className="scrollbar-thin mt-6 w-full max-h-[34vh] overflow-y-auto rounded-2xl border border-line bg-white/70 backdrop-blur px-4 py-3 space-y-2.5 text-[14px] leading-relaxed"
            >
              {turns.length === 0 && (
                <div className="text-muted text-[13px]">
                  Transcript appears here. Answer in your own words — pause whenever you need to think, Verbatim will wait.
                </div>
              )}
              {turns.map((t) => (
                <div key={t.idx} className={`flex gap-3 ${t.role === "user" ? "text-ink" : "text-ink-2"}`}>
                  <span className="shrink-0 w-14 text-[11px] uppercase tracking-wider text-muted pt-1">
                    {t.role === "user" ? "You" : "Verbatim"}
                  </span>
                  <span>
                    {t.text}
                    {t.interrupted && <span className="text-muted"> —</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {showNotes && (
          <aside className="border-t lg:border-t-0 lg:border-l border-line bg-paper-2/60 px-5 py-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Live notes</div>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-teal animate-blink" /> Taking notes
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Verbatim writes down what matters as you talk — the researcher sees these, in your exact words.
            </p>
            <div className="scrollbar-thin mt-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {insights.length === 0 && (
                <div className="rounded-xl border border-dashed border-line px-3.5 py-4 text-[13px] text-muted">
                  Nothing captured yet. Insights appear a moment after you finish an answer.
                </div>
              )}
              {insights.map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

function lastAgentLine(turns: Turn[]) {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "agent") return turns[i].text;
  return "";
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function InsightCard({ insight }: { insight: Pick<Insight, "theme" | "quote" | "note" | "sentiment"> }) {
  return (
    <div className="card px-3.5 py-3 animate-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13.5px] font-semibold leading-snug">{insight.theme}</div>
        <SentimentChip value={insight.sentiment as Sentiment} />
      </div>
      <div className="mt-1.5 font-display text-[16px] leading-snug text-ink">“{insight.quote}”</div>
      {insight.note && <div className="mt-1.5 text-[12.5px] text-muted leading-snug">{insight.note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------

function Intro({
  study,
  name,
  setName,
  onStart,
  error,
}: {
  study: StudyView;
  name: string;
  setName: (v: string) => void;
  onStart: () => void;
  error: string | null;
}) {
  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-6 max-w-5xl mx-auto w-full">
        <Wordmark />
      </header>
      <section className="flex-1 grid place-items-center px-6 pb-16">
        <div className="w-full max-w-lg animate-fade-up">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">You&apos;re invited to a short interview</div>
          <h1 className="mt-3 font-display text-[40px] sm:text-[48px] leading-[1.02] tracking-tight">{study.title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            You&apos;ll talk with Verbatim, an AI interviewer, for about {study.durationMinutes} minutes. It asks{" "}
            {study.topics.length} open questions and follows up on what you say. Speak naturally — you can interrupt it,
            pause to think, or say &ldquo;I&apos;m done&rdquo; at any time.
          </p>

          <div className="card mt-7 p-5 space-y-4">
            <div>
              <label className="text-[13px] font-medium" htmlFor="name">
                What should we call you? <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                id="name"
                className={`${inputClass} mt-1.5`}
                placeholder="First name or a nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
            <ul className="text-[13px] text-ink-2 space-y-1.5">
              <li className="flex gap-2">
                <Headphones className="w-4 h-4 mt-0.5 text-muted shrink-0" />
                <span>Headphones help — otherwise Verbatim may hear itself.</span>
              </li>
              <li className="flex gap-2">
                <Mic className="w-4 h-4 mt-0.5 text-muted shrink-0" />
                <span>The conversation is recorded and transcribed so the research team can hear your exact words.</span>
              </li>
            </ul>
            {error && (
              <div className="rounded-xl bg-neg-soft text-neg px-3.5 py-2.5 text-[13px]">
                {error}
              </div>
            )}
            <Button size="lg" className="w-full" onClick={onStart} data-testid="start-interview">
              {error ? <RotateCcw className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {error ? "Try again" : "Start the interview"}
            </Button>
          </div>
          {study.isDemo && (
            <p className="mt-4 text-[12.5px] text-muted">
              This is the public demo study. Your interview will appear on the{" "}
              <Link href={`/s/${study.id}`} className="underline hover:text-ink">
                researcher dashboard
              </Link>{" "}
              alongside sample interviews.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

function Done({
  study,
  interviewId,
  summary,
  summaryState,
  insightCount,
  turns,
}: {
  study: StudyView;
  interviewId: string | null;
  summary: InterviewSummary | null;
  summaryState: "idle" | "loading" | "ready" | "failed";
  insightCount: number;
  turns: Turn[];
}) {
  const said = turns.filter((t) => t.role === "user").length;
  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-6 max-w-5xl mx-auto w-full">
        <Wordmark />
      </header>
      <section className="flex-1 px-6 pb-16">
        <div className="max-w-2xl mx-auto animate-fade-up">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Thank you</div>
          <h1 className="mt-3 font-display text-[44px] leading-[1.02] tracking-tight">
            That&apos;s a wrap.
            {said > 0 && <span className="text-muted"> Here&apos;s what we heard.</span>}
          </h1>

          {said === 0 ? (
            <p className="mt-4 text-[15px] text-ink-2">
              We didn&apos;t catch anything from you this time. Check your microphone and give it another go.
            </p>
          ) : (
            <div className="card mt-7 p-6">
              {summaryState === "loading" && (
                <div className="flex items-center gap-3 text-[14px] text-muted">
                  <span className="w-2 h-2 rounded-full bg-accent animate-blink" /> Writing up your interview…
                </div>
              )}
              {summaryState === "failed" && (
                <div className="text-[14px] text-ink-2">
                  Your interview was saved ({said} answers, {insightCount} insights). The write-up will appear on the dashboard shortly.
                </div>
              )}
              {summaryState === "ready" && summary && (
                <div className="animate-fade-up">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-[26px] leading-snug">{summary.headline}</h2>
                    <SentimentChip value={summary.sentiment} className="mt-2 shrink-0" />
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{summary.summary}</p>
                  {summary.keyQuotes.length > 0 && (
                    <div className="mt-5 space-y-2">
                      {summary.keyQuotes.map((q, i) => (
                        <blockquote key={i} className="border-l-2 border-accent pl-3 text-[15px] leading-snug">
                          <span className="font-display text-[18px]">“{q.text}”</span>
                          {q.theme && <span className="ml-2 text-[12px] text-muted uppercase tracking-wide">{q.theme}</span>}
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/s/${study.id}${interviewId ? `?highlight=${interviewId}` : ""}`} className={buttonClass({ size: "lg" })}>
              See what the researcher sees <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href={`/i/${study.id}`} className={buttonClass({ variant: "secondary", size: "lg" })}>
              <RotateCcw className="w-4 h-4" /> Do another interview
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
