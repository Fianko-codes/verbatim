"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { Insight, Interview, Study, Turn } from "@/db/schema";
import type { Viewer } from "@/lib/auth/session";
import { PlayQuoteButton, useQuotePlayer } from "@/components/quote-player";
import { ResearcherNav } from "@/components/researcher-nav";
import { Eyebrow, SentimentChip, Wordmark, formatDuration, timeAgo } from "@/components/ui";

type Data = { interview: Interview; study: Study; turns: Turn[]; insights: Insight[] };

export function InterviewDetail({
  data,
  viewer,
}: {
  data: Data;
  /** Null when a signed-out visitor is reading a published study. */
  viewer: Viewer | null;
}) {
  const { interview, study, turns, insights } = data;
  const player = useQuotePlayer();
  const s = interview.summary;
  const canPlay = Boolean(interview.aaiSessionId) && !interview.isSample && interview.status === "completed";
  const insightsByTurn = new Map<number, Insight[]>();
  for (const i of insights) {
    if (i.turnIdx == null) continue;
    const list = insightsByTurn.get(i.turnIdx) ?? [];
    list.push(i);
    insightsByTurn.set(i.turnIdx, list);
  }

  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link href={`/s/${study.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink min-w-0">
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Back to {study.title}</span>
              <span className="sm:hidden">Back</span>
            </span>
          </Link>
          {viewer && <ResearcherNav viewer={viewer} />}
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="min-w-0">
          <Eyebrow>Interview</Eyebrow>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.05] tracking-tight break-words">{interview.participantLabel || "Participant"}</h1>
            {interview.isSample && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">sample</span>}
            {s && <SentimentChip value={s.sentiment} />}
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {timeAgo(interview.startedAt)} · {formatDuration(interview.durationSeconds)} ·{" "}
            {interview.topicsCovered.length}/{study.topics.length} topics covered
          </div>

          {s && (
            <div className="card mt-6 p-6">
              <h2 className="font-display text-[26px] leading-snug">{s.headline}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.summary}</p>
              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                {s.painPoints.length > 0 && (
                  <div>
                    <Eyebrow>Pain points</Eyebrow>
                    <ul className="mt-2 space-y-1 text-[14px] text-ink-2">
                      {s.painPoints.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-neg">•</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.desires.length > 0 && (
                  <div>
                    <Eyebrow>Wants</Eyebrow>
                    <ul className="mt-2 space-y-1 text-[14px] text-ink-2">
                      {s.desires.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-pos">•</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {s.keyQuotes.length > 0 && (
                <div className="mt-5 space-y-2.5">
                  {s.keyQuotes.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl bg-paper-2/70 px-3.5 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[18px] leading-snug">“{q.text}”</div>
                        {q.theme && <div className="mt-0.5 text-[11.5px] uppercase tracking-wider text-muted">{q.theme}</div>}
                      </div>
                      {canPlay && <PlayQuoteButton interviewId={interview.id} quote={q.text} player={player} className="shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-8">
            <Eyebrow>Transcript</Eyebrow>
            {canPlay && <SessionRecording interviewId={interview.id} />}
            <div className="card mt-3 divide-y divide-line">
              {turns.length === 0 && <div className="p-5 text-[14px] text-muted">No transcript was recorded.</div>}
              {turns.map((t) => {
                const ins = insightsByTurn.get(t.idx) ?? [];
                return (
                  <div key={t.id} className="p-4 sm:p-5 grid sm:grid-cols-[80px_1fr] gap-2 sm:gap-4">
                    <div className="text-[11px] uppercase tracking-wider text-muted pt-1">
                      {t.role === "user" ? interview.participantLabel?.split(" ")[0] || "Participant" : "Verbatim"}
                      <div className="font-mono normal-case tracking-normal mt-0.5">{fmtMs(t.atMs)}</div>
                    </div>
                    <div>
                      <p className={`text-[15px] leading-relaxed ${t.role === "user" ? "text-ink" : "text-ink-2"}`}>
                        {t.text}
                        {t.interrupted && <span className="ml-1 text-[11px] uppercase tracking-wider text-muted">(interrupted)</span>}
                      </p>
                      {ins.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {ins.map((i) => (
                            <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-deep px-2.5 py-0.5 text-[12px]">
                              <span className="w-1 h-1 rounded-full bg-current" /> {i.theme}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 space-y-4 min-w-0">
          <div className="card p-5">
            <Eyebrow>Discussion guide</Eyebrow>
            <ol className="mt-3 space-y-2.5">
              {study.topics.map((t, i) => {
                const done = interview.topicsCovered.includes(t.id);
                return (
                  <li key={t.id} className="flex gap-3 text-[13.5px] leading-snug">
                    <span className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] ${done ? "bg-ink text-paper" : "bg-paper-2 text-muted"}`}>
                      {done ? <Check className="w-3 h-3" /> : i + 1}
                    </span>
                    <span className={done ? "text-ink" : "text-ink-2"}>{t.question}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <Eyebrow>Insights</Eyebrow>
              <span className="text-[12px] text-muted">{insights.length}</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {insights.length === 0 && <div className="text-[13px] text-muted">Nothing captured.</div>}
              {insights.map((i) => (
                <div key={i.id} className="rounded-xl border border-line px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13.5px] font-semibold leading-snug min-w-0">{i.theme}</div>
                    <SentimentChip value={i.sentiment} className="shrink-0" />
                  </div>
                  <div className="mt-1.5 font-display text-[16px] leading-snug">“{i.quote}”</div>
                  {i.note && <div className="mt-1 text-[12.5px] text-muted leading-snug">{i.note}</div>}
                  {canPlay && <PlayQuoteButton interviewId={interview.id} quote={i.quote} player={player} className="mt-2" />}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

/**
 * The full session recording. A pre-signed recording can be gone (expired, or
 * recorded under a different AssemblyAI key), and a bare <audio> shows a dead
 * control strip when that happens — so say what went wrong instead.
 */
function SessionRecording({ interviewId }: { interviewId: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="mt-3 rounded-xl border border-line bg-paper-2/60 px-3.5 py-2.5 text-[13px] text-muted">
        This session&apos;s recording is no longer available.
      </div>
    );
  }
  return (
    <audio
      className="mt-3 w-full"
      controls
      preload="none"
      src={`/api/interviews/${interviewId}/audio`}
      onError={() => setBroken(true)}
    >
      Your browser does not support audio playback.
    </audio>
  );
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
