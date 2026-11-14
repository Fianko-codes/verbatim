"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, FastForward, Play, RotateCcw, SkipForward } from "lucide-react";
import type { InterviewSummary, Sentiment, Topic } from "@/db/schema";
import { Button, SentimentChip, Wordmark, buttonClass } from "@/components/ui";
import { InsightCard } from "./interview-room";

/**
 * Showcase mode: replays one of the demo study's sample interviews in the same
 * room a live participant sees — captions, transcript, live notes, topic
 * progress — without a microphone or any API call. The transcript and notes
 * are the seeded sample's; the write-up at the end is the one stored for it.
 */

export type ReplaySample = {
  interviewId: string;
  label: string;
  turns: { idx: number; role: "user" | "agent"; text: string }[];
  insights: {
    id: string;
    theme: string;
    quote: string;
    note: string;
    sentiment: Sentiment;
    topicId: string | null;
    turnIdx: number | null;
  }[];
  summary: InterviewSummary | null;
};

type StudyView = { id: string; title: string; topics: Topic[]; durationMinutes: number; showLiveNotes: boolean };
type Phase = "intro" | "playing" | "done";
type OrbState = "idle" | "thinking" | "speaking" | "listening";

const AGENT_MS_PER_WORD = 230;
const USER_MS_PER_WORD = 150;

export function SampleReplay({ study, sample, others }: { study: StudyView; sample: ReplaySample; others: string[] }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [speed, setSpeed] = useState(1);
  const [shown, setShown] = useState(0); // number of completed turns
  const [caption, setCaption] = useState("");
  const [userPartial, setUserPartial] = useState("");
  const [orb, setOrb] = useState<OrbState>("idle");
  const [noteCount, setNoteCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const speedRef = useRef(1);
  const runId = useRef(0);
  const orbRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const turns = sample.turns;
  const visibleTurns = turns.slice(0, shown);
  const visibleNotes = sample.insights.slice(0, noteCount);
  const covered = coveredTopics(study.topics, visibleNotes, phase === "done");

  // The playback script. Each run gets an id so a restart or skip cancels the old one.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = ++runId.current;
    let cancelled = false;
    const alive = () => !cancelled && runId.current === id;
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms / speedRef.current));

    (async () => {
      for (let t = 0; t < turns.length; t++) {
        const turn = turns[t];
        const words = turn.text.split(/\s+/);
        if (turn.role === "agent") {
          setOrb("thinking");
          await wait(700);
          if (!alive()) return;
          setOrb("speaking");
          for (let w = 1; w <= words.length; w++) {
            setCaption(words.slice(0, w).join(" "));
            await wait(AGENT_MS_PER_WORD);
            if (!alive()) return;
          }
          setShown(t + 1);
          setOrb("idle");
          await wait(900);
        } else {
          setOrb("listening");
          for (let w = 1; w <= words.length; w++) {
            setUserPartial(words.slice(0, w).join(" "));
            await wait(USER_MS_PER_WORD);
            if (!alive()) return;
          }
          setUserPartial("");
          setShown(t + 1);
          setOrb("thinking");
          // Notes land a moment after the answer, as they do live.
          const notesHere = sample.insights.filter((n) => n.turnIdx === turn.idx).length;
          for (let n = 0; n < notesHere; n++) {
            await wait(650);
            if (!alive()) return;
            setNoteCount((c) => c + 1);
          }
        }
        if (!alive()) return;
      }
      await wait(1200);
      if (alive()) setPhase("done");
    })();

    return () => {
      cancelled = true;
    };
    // Speed is read through a ref so changing it doesn't restart the replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Clock, scaled with the replay speed.
  useEffect(() => {
    if (phase !== "playing") return;
    const tick = setInterval(() => setElapsed((e) => e + speedRef.current), 1000);
    return () => clearInterval(tick);
  }, [phase]);

  // The orb's pulse: synthetic, since there is no audio to measure.
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const loop = (now: number) => {
      const active = orb === "speaking" || orb === "listening";
      const level = active ? 0.35 + 0.3 * Math.abs(Math.sin(now / 140)) * Math.abs(Math.sin(now / 410)) : 0;
      orbRef.current?.style.setProperty("--level", level.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, orb]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, userPartial]);

  const start = () => {
    setShown(0);
    setNoteCount(0);
    setCaption("");
    setUserPartial("");
    setElapsed(0);
    setOrb("idle");
    setPhase("playing");
  };

  const toggleSpeed = () => {
    const next = speed === 1 ? 2 : 1;
    speedRef.current = next;
    setSpeed(next);
  };

  const skip = () => {
    runId.current++;
    setShown(turns.length);
    setNoteCount(sample.insights.length);
    setPhase("done");
  };

  if (phase === "intro") {
    return (
      <main className="flex-1 flex flex-col">
        <header className="px-6 py-6 max-w-5xl mx-auto w-full">
          <Wordmark />
        </header>
        <section className="flex-1 grid place-items-center px-6 pb-16">
          <div className="w-full max-w-lg animate-fade-up">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sample interview replay</div>
            <h1 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[1.02] tracking-tight break-words">{study.title}</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
              Watch Verbatim interview <span className="font-medium text-ink">{sample.label}</span> about meeting notes, in the
              same room a participant sees: the interviewer&apos;s questions, the answers as they come in, and the notes it
              takes in the participant&apos;s exact words.
            </p>
            <div className="card mt-7 p-5 space-y-4">
              <p className="text-[13px] text-ink-2 leading-relaxed">
                Live voice interviews are switched off on this deployment, because each one costs API credit by the minute.
                This is a scripted sample transcript played back as text, with no audio.
              </p>
              <Button size="lg" className="w-full" onClick={start} data-testid="start-replay">
                <Play className="w-4 h-4" /> Watch the interview
              </Button>
              {others.length > 0 && (
                <div className="text-[13px] text-muted">
                  Or watch{" "}
                  {others.map((o, i) => (
                    <span key={o}>
                      {i > 0 && (i === others.length - 1 ? " or " : ", ")}
                      <Link href={`/i/${study.id}?sample=${encodeURIComponent(o)}`} className="underline hover:text-ink">
                        {o}
                      </Link>
                    </span>
                  ))}
                  .
                </div>
              )}
            </div>
            <p className="mt-4 text-[12.5px] text-muted">
              The source runs live interviews with an AssemblyAI key.{" "}
              <Link href={`/s/${study.id}`} className="underline hover:text-ink">
                Skip to the researcher&apos;s dashboard
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (phase === "done") {
    const s = sample.summary;
    return (
      <main className="flex-1 flex flex-col">
        <header className="px-6 py-6 max-w-5xl mx-auto w-full">
          <Wordmark />
        </header>
        <section className="flex-1 px-6 pb-16">
          <div className="max-w-2xl mx-auto animate-fade-up">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">End of the replay</div>
            <h1 className="mt-3 font-display text-[36px] sm:text-[44px] leading-[1.02] tracking-tight">
              That&apos;s a wrap. <span className="text-muted">Here&apos;s the write-up.</span>
            </h1>
            <div className="card mt-7 p-6">
              {s ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-[24px] sm:text-[26px] leading-snug min-w-0">{s.headline}</h2>
                    <SentimentChip value={s.sentiment} className="mt-2 shrink-0" />
                  </div>
                  {s.summary && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.summary}</p>}
                  {s.keyQuotes.length > 0 && (
                    <div className="mt-5 space-y-2">
                      {s.keyQuotes.map((q, i) => (
                        <blockquote key={i} className="border-l-2 border-accent pl-3 text-[15px] leading-snug">
                          <span className="font-display text-[18px]">“{q.text}”</span>
                          {q.theme && <span className="ml-2 text-[12px] text-muted uppercase tracking-wide">{q.theme}</span>}
                        </blockquote>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-ink-2">
                  {sample.insights.length} notes were taken in this interview. Its write-up is on the researcher&apos;s dashboard.
                </p>
              )}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={`/s/${study.id}?highlight=${sample.interviewId}`} className={buttonClass({ size: "lg" })}>
                See what the researcher sees <ArrowRight className="w-4 h-4" />
              </Link>
              <Button variant="secondary" size="lg" onClick={start}>
                <RotateCcw className="w-4 h-4" /> Watch again
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const lastAgent = [...visibleTurns].reverse().find((t) => t.role === "agent")?.text ?? "";
  const line = orb === "speaking" ? caption : lastAgent;

  return (
    <main className="flex-1 flex flex-col">
      <div className="bg-ink text-paper text-center text-[12.5px] px-4 py-1.5">
        Replay of a sample interview with {sample.label}. Scripted transcript, no audio.
      </div>
      <header className="px-4 sm:px-8 py-4 flex items-center justify-between gap-3 sm:gap-4">
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[13px] text-muted tabular-nums" title="Elapsed">
            {fmt(elapsed)}
          </span>
          <Button variant="secondary" size="sm" onClick={toggleSpeed} aria-pressed={speed === 2}>
            <FastForward className="w-3.5 h-3.5" /> {speed}×
          </Button>
          <Button variant="secondary" size="sm" onClick={skip}>
            <SkipForward className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Skip to write-up</span>
            <span className="sm:hidden">Skip</span>
          </Button>
        </div>
      </header>

      <div className={`flex-1 grid ${study.showLiveNotes ? "lg:grid-cols-[1fr_360px]" : ""} gap-0 min-h-0`}>
        <section className="flex flex-col items-center px-4 sm:px-8 pb-8 min-h-0 min-w-0">
          <div className="w-full max-w-2xl flex-1 flex flex-col items-center min-h-0">
            <div className="relative mt-6 sm:mt-10 w-36 h-36 sm:w-44 sm:h-44 grid place-items-center">
              <div ref={orbRef} className={`orb ${orb}`} />
            </div>
            <div className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-muted h-4">
              {orb === "speaking"
                ? "Verbatim is speaking"
                : orb === "listening"
                  ? `${sample.label} is answering`
                  : orb === "thinking"
                    ? "Thinking"
                    : `${sample.label}'s turn`}
            </div>
            <p
              className={`mt-4 min-h-[4.5rem] text-center font-display leading-snug text-ink max-w-xl ${
                line.length > 140 ? "text-[20px] sm:text-[22px]" : "text-[24px] sm:text-[28px]"
              }`}
            >
              {line}
            </p>
            <div className="mt-2 min-h-[2.5rem] text-center text-[15px] text-teal">{userPartial}</div>
            <div
              ref={transcriptRef}
              className="scrollbar-thin mt-6 w-full max-h-[34vh] overflow-y-auto rounded-2xl border border-line bg-white/70 backdrop-blur px-4 py-3 space-y-2.5 text-[14px] leading-relaxed"
            >
              {visibleTurns.length === 0 && <div className="text-muted text-[13px]">The transcript appears here.</div>}
              {visibleTurns.map((t) => (
                <div key={t.idx} className={`flex gap-3 ${t.role === "user" ? "text-ink" : "text-ink-2"}`}>
                  <span className="shrink-0 w-16 text-[11px] uppercase tracking-wider text-muted pt-1 truncate">
                    {t.role === "user" ? sample.label : "Verbatim"}
                  </span>
                  <span className="min-w-0 break-words">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {study.showLiveNotes && (
          <aside className="border-t lg:border-t-0 lg:border-l border-line bg-paper-2/60 px-4 sm:px-5 py-5 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Live notes</div>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-teal animate-blink" /> Taking notes
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Verbatim writes down what matters as the participant talks, in their exact words.
            </p>
            <div className="scrollbar-thin mt-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {visibleNotes.length === 0 && (
                <div className="rounded-xl border border-dashed border-line px-3.5 py-4 text-[13px] text-muted">
                  Nothing captured yet. Notes appear a moment after an answer.
                </div>
              )}
              {visibleNotes.map((n) => (
                <InsightCard key={n.id} insight={n} />
              ))}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

/** A topic counts as covered once the notes have moved past it, or at the end. */
function coveredTopics(topics: Topic[], notes: { topicId: string | null }[], all: boolean): string[] {
  if (all) return topics.map((t) => t.id);
  const order = topics.map((t) => t.id);
  const reached = notes.reduce((max, n) => Math.max(max, n.topicId ? order.indexOf(n.topicId) : -1), -1);
  return order.slice(0, Math.max(0, reached));
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
