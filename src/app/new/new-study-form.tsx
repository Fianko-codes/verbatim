"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { Viewer } from "@/lib/auth/session";
import { LANGUAGES, VOICES } from "@/lib/validation";
import { ResearcherNav } from "@/components/researcher-nav";
import { Button, Eyebrow, Label, Wordmark, inputClass } from "@/components/ui";

type TopicDraft = { question: string; probes: string };

const EXAMPLE = {
  title: "Onboarding to a new developer tool",
  goal: "Understand what developers do in the first hour with a new API — what they try first, where they get stuck, and what makes them give up or commit.",
  audience: "Developers who have integrated a third-party API in the last three months.",
  topics: [
    { question: "Think about the last API you integrated. Walk me through the first hour, from signing up to the first request that worked.", probes: "What did you skip? What did you read?" },
    { question: "Where did you get stuck, and what did you do about it?", probes: "Did you ask anyone? Did you consider a different vendor?" },
    { question: "What made you decide it was worth continuing — or not?", probes: "What would have made that decision faster?" },
  ],
  keyterms: "SDK, API key, webhook, rate limit, sandbox",
};

export function NewStudyForm({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [topics, setTopics] = useState<TopicDraft[]>([{ question: "", probes: "" }, { question: "", probes: "" }, { question: "", probes: "" }]);
  const [duration, setDuration] = useState(5);
  const [voice, setVoice] = useState("jane");
  const [language, setLanguage] = useState("");
  const [keyterms, setKeyterms] = useState("");
  const [showLiveNotes, setShowLiveNotes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillExample = () => {
    setTitle(EXAMPLE.title);
    setGoal(EXAMPLE.goal);
    setAudience(EXAMPLE.audience);
    setTopics(EXAMPLE.topics);
    setKeyterms(EXAMPLE.keyterms);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        title,
        goal,
        audience,
        topics: topics
          .filter((t) => t.question.trim())
          .map((t) => ({
            question: t.question.trim(),
            probes: t.probes
              .split(/[;\n]/)
              .map((p) => p.trim())
              .filter(Boolean)
              .slice(0, 4),
          })),
        durationMinutes: duration,
        voice,
        keyterms: keyterms
          .split(/[,\n]/)
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 50),
        languageCodes: language ? [language] : [],
        showLiveNotes,
      };
      const res = await fetch("/api/studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.[0]?.message ? `${data.issues[0].path?.join(".")}: ${data.issues[0].message}` : data.error ?? "Could not create study");
      router.push(`/s/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create study");
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/studies" className="text-[13px] text-ink-2 hover:text-ink whitespace-nowrap">
            Your studies
          </Link>
          <ResearcherNav viewer={viewer} />
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <Eyebrow>New study</Eyebrow>
        <h1 className="mt-2 font-display text-[36px] sm:text-[44px] leading-[1.02] tracking-tight">Write the guide. Verbatim does the interviews.</h1>
        <p className="mt-3 text-[15px] text-ink-2">
          Open questions work best — Verbatim will ask the follow-ups. You&apos;ll get a share link in a moment.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <div className="card p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-medium">About the study</div>
              <Button type="button" variant="ghost" size="sm" onClick={fillExample}>
                <Sparkles className="w-3.5 h-3.5" /> Use an example
              </Button>
            </div>
            <div>
              <Label>Title</Label>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Meeting notes & follow-ups" required maxLength={120} />
            </div>
            <div>
              <Label hint="What do you want to learn?">Research goal</Label>
              <textarea className={`${inputClass} min-h-[88px]`} value={goal} onChange={(e) => setGoal(e.target.value)} required maxLength={1000} placeholder="Understand how… where… and what would make them…" />
            </div>
            <div>
              <Label hint="Optional">Who are the participants?</Label>
              <input className={inputClass} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Finance managers at mid-size companies" maxLength={200} />
            </div>
          </div>

          <div className="card p-5 sm:p-6 space-y-4">
            <div className="text-[13px] font-medium">Discussion guide</div>
            {topics.map((t, i) => (
              <div key={i} className="rounded-xl border border-line p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Question {i + 1}</span>
                  {topics.length > 1 && (
                    <button type="button" className="text-muted hover:text-neg" onClick={() => setTopics(topics.filter((_, j) => j !== i))} aria-label="Remove question">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <textarea
                  className={`${inputClass} min-h-[64px]`}
                  value={t.question}
                  onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  placeholder="Walk me through the last time you…"
                  required={i === 0}
                  maxLength={300}
                />
                <input
                  className={inputClass}
                  value={t.probes}
                  onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, probes: e.target.value } : x)))}
                  placeholder="Follow-up angles, separated by semicolons (optional)"
                />
              </div>
            ))}
            {topics.length < 8 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setTopics([...topics, { question: "", probes: "" }])}>
                <Plus className="w-3.5 h-3.5" /> Add a question
              </Button>
            )}
          </div>

          <div className="card p-5 sm:p-6 grid sm:grid-cols-2 gap-5">
            <div>
              <Label>Target length</Label>
              <select className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[3, 4, 5, 7, 10, 15, 20].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Interviewer voice</Label>
              <select className={inputClass} value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} · {v.accent}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label hint="Verbatim understands 18 languages">Participant language</Label>
              <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">Auto-detect</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label hint="Product names, jargon">Vocabulary hints</Label>
              <input className={inputClass} value={keyterms} onChange={(e) => setKeyterms(e.target.value)} placeholder="Comma-separated" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-3 text-[13.5px] text-ink-2">
              <input type="checkbox" className="mt-1" checked={showLiveNotes} onChange={(e) => setShowLiveNotes(e.target.checked)} />
              <span>
                Show participants the analyst&apos;s live notes during the interview.{" "}
                <span className="text-muted">Great for demos; turn off for real studies to avoid influencing answers.</span>
              </span>
            </label>
          </div>

          {error && <div className="rounded-xl bg-neg-soft text-neg px-3.5 py-2.5 text-[13px]">{error}</div>}
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Creating…" : "Create study & get link"}
          </Button>
        </form>
      </section>
    </main>
  );
}
