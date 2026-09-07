"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Mic, Radio, RefreshCw, Sparkles } from "lucide-react";
import type { Insight, Interview, Sentiment, Study, Synthesis, SynthesisRow } from "@/db/schema";
import { PlayQuoteButton, useQuotePlayer } from "@/components/quote-player";
import { Button, Eyebrow, SentimentChip, Wordmark, buttonClass, formatDuration, timeAgo } from "@/components/ui";

type InterviewWithInsights = Interview & { insights: Insight[] };
type Bundle = { study: Study; interviews: InterviewWithInsights[]; synthesis: SynthesisRow | null };

export function Dashboard({ initial, highlight }: { initial: Bundle; highlight: string | null }) {
  const [bundle, setBundle] = useState<Bundle>(initial);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const player = useQuotePlayer();
  const { study, interviews, synthesis } = bundle;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/studies/${study.id}`, { cache: "no-store" });
      if (res.ok) setBundle((await res.json()) as Bundle);
    } catch {
      /* transient */
    }
  }, [study.id]);

  // Keep the dashboard live: interviews and insights land while a participant is talking.
  useEffect(() => {
    const live = interviews.some((i) => i.status === "in_progress");
    const id = setInterval(refresh, live ? 3000 : 8000);
    return () => clearInterval(id);
  }, [refresh, interviews]);

  const highlightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight && highlightRef.current) highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const completed = useMemo(() => interviews.filter((i) => i.status === "completed"), [interviews]);
  const live = useMemo(() => interviews.filter((i) => i.status === "in_progress"), [interviews]);
  const insightCount = interviews.reduce((n, i) => n + i.insights.length, 0);
  const totalSeconds = completed.reduce((n, i) => n + (i.durationSeconds ?? 0), 0);
  const sentiment = useMemo(() => {
    const c: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    for (const i of completed) if (i.summary) c[i.summary.sentiment] += 1;
    return c;
  }, [completed]);
  const newSince = synthesis ? completed.filter((i) => i.summary).length - synthesis.interviewCount : 0;
  const byId = useMemo(() => new Map(interviews.map((i) => [i.id, i])), [interviews]);

  const synthesize = async () => {
    setSynthesizing(true);
    setSynthError(null);
    try {
      const res = await fetch(`/api/studies/${study.id}/synthesize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Synthesis failed");
      setBundle((b) => ({ ...b, synthesis: data as SynthesisRow }));
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : "Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  };

  // Server snapshot is "" so SSR and hydration markup match; the real origin fills in on the client.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const shareUrl = `${origin}/i/${study.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Link href="/new" className={`${buttonClass({ variant: "ghost", size: "sm" })} hidden sm:inline-flex`}>
            New study
          </Link>
          <Link href={`/i/${study.id}`} className={buttonClass({ size: "sm" })}>
            <Mic className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Open interview link</span><span className="sm:hidden">Interview link</span>
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        {/* Title block */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
          <div>
            <Eyebrow>Study</Eyebrow>
            <h1 className="mt-2 font-display text-[44px] sm:text-[52px] leading-[1.02] tracking-tight">{study.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2 max-w-2xl">{study.goal}</p>
            {study.audience && <p className="mt-1 text-[13px] text-muted">Participants: {study.audience}</p>}
          </div>
          <div className="card p-4">
            <div className="text-[12px] font-medium text-muted">Participant link</div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-paper-2 px-2.5 py-1.5 text-[12.5px] font-mono">{shareUrl}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Interviews" value={String(completed.length)} />
              <Stat label="Minutes" value={String(Math.round(totalSeconds / 60))} />
              <Stat label="Insights" value={String(insightCount)} />
            </div>
            {completed.length > 0 && (
              <div className="mt-3">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-paper-3">
                  {(["positive", "mixed", "neutral", "negative"] as Sentiment[]).map((s) => {
                    const w = (sentiment[s] / completed.length) * 100;
                    const bg = { positive: "bg-pos", mixed: "bg-mixed", neutral: "bg-neu", negative: "bg-neg" }[s];
                    return w ? <span key={s} className={bg} style={{ width: `${w}%` }} /> : null;
                  })}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  {(["positive", "mixed", "neutral", "negative"] as Sentiment[])
                    .filter((s) => sentiment[s] > 0)
                    .map((s) => (
                      <span key={s}>
                        {sentiment[s]} {s}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live interviews */}
        {live.length > 0 && (
          <div className="mt-10">
            <Eyebrow className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-accent animate-blink" /> Live now
            </Eyebrow>
            <div className="mt-3 grid md:grid-cols-2 gap-4">
              {live.map((i) => (
                <div key={i.id} className="card p-5 border-accent/40">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{i.participantLabel || "Participant"}</div>
                    <span className="text-[12px] text-muted">started {timeAgo(i.startedAt)}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {i.insights.length === 0 && <div className="text-[13px] text-muted">Listening…</div>}
                    {i.insights.slice(-3).map((ins) => (
                      <div key={ins.id} className="rounded-xl bg-paper-2 px-3 py-2 animate-pop">
                        <div className="text-[13px] font-medium">{ins.theme}</div>
                        <div className="text-[13px] text-ink-2">“{ins.quote}”</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synthesis */}
        <div className="mt-12">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <Eyebrow>Synthesis</Eyebrow>
              <h2 className="mt-1 font-display text-[30px] leading-tight">What we&apos;re hearing</h2>
            </div>
            <div className="flex items-center gap-3">
              {synthesis && (
                <span className="text-[12.5px] text-muted">
                  From {synthesis.interviewCount} interview{synthesis.interviewCount === 1 ? "" : "s"} · {timeAgo(synthesis.createdAt)}
                  {newSince > 0 && <span className="text-accent"> · {newSince} new since</span>}
                </span>
              )}
              <Button
                variant={synthesis && newSince === 0 ? "secondary" : "primary"}
                size="sm"
                onClick={synthesize}
                disabled={synthesizing || completed.filter((i) => i.summary).length === 0}
              >
                {synthesizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {synthesizing ? "Synthesising…" : synthesis ? "Re-synthesise" : `Synthesise ${completed.length} interviews`}
              </Button>
            </div>
          </div>
          {synthError && <div className="mt-3 rounded-xl bg-neg-soft text-neg px-3.5 py-2.5 text-[13px]">{synthError}</div>}

          {synthesis ? (
            <SynthesisView content={synthesis.content} byId={byId} player={player} total={synthesis.interviewCount} />
          ) : (
            <div className="card mt-5 p-8 text-center">
              <div className="font-display text-[24px]">No synthesis yet.</div>
              <p className="mt-1 text-[14px] text-ink-2">
                {completed.length === 0
                  ? "Once the first interview is complete, Verbatim can group everything it heard into themes."
                  : "Group what participants said into ranked themes, with the quotes that prove them."}
              </p>
            </div>
          )}
        </div>

        {/* Interviews */}
        <div className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>Interviews</Eyebrow>
              <h2 className="mt-1 font-display text-[30px] leading-tight">
                {completed.length} conversation{completed.length === 1 ? "" : "s"}
              </h2>
            </div>
          </div>
          {interviews.some((i) => i.isSample) && (
            <p className="mt-2 text-[12.5px] text-muted">
              Interviews marked <span className="font-medium">sample</span> use scripted transcripts and notes so the dashboard has something to show — their write-ups and the study synthesis are produced by the real pipeline.
            </p>
          )}
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            {interviews
              .filter((i) => i.status === "completed" || i.id === highlight)
              .map((i) => (
                <div key={i.id} ref={i.id === highlight ? highlightRef : undefined}>
                  <InterviewCard interview={i} studyId={study.id} highlighted={i.id === highlight} />
                </div>
              ))}
            {completed.length === 0 && (
              <div className="card p-6 text-[14px] text-ink-2 md:col-span-2">
                No interviews yet. Share the participant link — or{" "}
                <Link href={`/i/${study.id}`} className="underline">
                  take it yourself
                </Link>
                .
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper-2 py-2">
      <div className="font-display text-[24px] leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function SynthesisView({
  content,
  byId,
  player,
  total,
}: {
  content: Synthesis;
  byId: Map<string, InterviewWithInsights>;
  player: ReturnType<typeof useQuotePlayer>;
  total: number;
}) {
  return (
    <div className="mt-5 grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div className="space-y-5">
        <div className="card p-6">
          <h3 className="font-display text-[30px] leading-[1.15]">{content.headline}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{content.overview}</p>
        </div>
        <div className="space-y-3">
          {content.themes.map((t, idx) => (
            <div key={idx} className="card p-5 animate-fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[12px] text-muted">{String(idx + 1).padStart(2, "0")}</span>
                  <h4 className="text-[17px] font-semibold leading-snug">{t.name}</h4>
                </div>
                <SentimentChip value={t.sentiment} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-paper-3 overflow-hidden">
                  <div className="prevalence-bar h-full rounded-full" style={{ width: `${Math.round((t.prevalence / Math.max(1, total)) * 100)}%` }} />
                </div>
                <span className="text-[12px] text-muted whitespace-nowrap">
                  {t.prevalence} of {total} participant{total === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{t.description}</p>
              {t.quotes.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {t.quotes.map((q, qi) => {
                    const iv = byId.get(q.interviewId);
                    const canPlay = Boolean(iv?.aaiSessionId) && !iv?.isSample && iv?.status === "completed";
                    return (
                      <div key={qi} className="flex items-start gap-3 rounded-xl bg-paper-2/70 px-3.5 py-2.5">
                        <div className="flex-1">
                          <div className="font-display text-[17px] leading-snug">“{q.text}”</div>
                          <div className="mt-1 text-[12px] text-muted">
                            {iv?.participantLabel || "Participant"}
                            {iv?.isSample ? " · sample" : ""}
                          </div>
                        </div>
                        {canPlay && <PlayQuoteButton interviewId={q.interviewId} quote={q.text} player={player} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <ListCard title="Recommendations" items={content.recommendations} accent />
        <ListCard title="Tensions" items={content.tensions} />
        <ListCard title="Ask next round" items={content.nextQuestions} />
      </div>
    </div>
  );
}

function ListCard({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="card p-5">
      <Eyebrow>{title}</Eyebrow>
      <ol className="mt-3 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-snug text-ink-2">
            <span className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold ${accent ? "bg-accent-soft text-accent-deep" : "bg-paper-2 text-muted"}`}>
              {i + 1}
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function InterviewCard({ interview, studyId, highlighted }: { interview: InterviewWithInsights; studyId: string; highlighted: boolean }) {
  const s = interview.summary;
  const themes = Array.from(new Set(interview.insights.map((i) => i.theme))).slice(0, 3);
  return (
    <Link
      href={`/s/${studyId}/${interview.id}`}
      className={`card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${highlighted ? "ring-2 ring-accent/50" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{interview.participantLabel || "Participant"}</span>
          {interview.isSample && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-muted">sample</span>}
          {highlighted && <span className="rounded-full bg-accent-soft text-accent-deep px-2 py-0.5 text-[10.5px] uppercase tracking-wider">you</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[12px] text-muted">
          <span>{formatDuration(interview.durationSeconds)}</span>
          <span>·</span>
          <span>{timeAgo(interview.startedAt)}</span>
        </div>
      </div>
      {interview.status === "abandoned" ? (
        <div className="mt-3 text-[13px] text-muted">Ended before anything was said.</div>
      ) : s ? (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="font-display text-[20px] leading-snug">{s.headline}</div>
            <SentimentChip value={s.sentiment} className="mt-1 shrink-0" />
          </div>
          {themes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {themes.map((t) => (
                <span key={t} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[12px] text-ink-2">
                  {t}
                </span>
              ))}
              {interview.insights.length > 3 && <span className="text-[12px] text-muted self-center">+{interview.insights.length - 3}</span>}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 text-[13px] text-muted">Write-up pending…</div>
      )}
      <div className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-ink-2">
        Transcript, insights &amp; recording <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

export function ExternalLinkIcon() {
  return <ExternalLink className="w-3.5 h-3.5" />;
}
