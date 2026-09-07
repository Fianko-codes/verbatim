import { z } from "zod";
import type { Insight, Interview, InterviewSummary, Study, Synthesis, Turn } from "@/db/schema";
import { chatJSON } from "@/lib/llm";
import { SUMMARY_SYSTEM, SYNTHESIS_SYSTEM, summaryUserPrompt, synthesisUserPrompt } from "@/lib/prompts";
import { enforceVerbatim, norm, titleCase } from "@/lib/text";

/**
 * The post-conversation analysis layer, on AssemblyAI's LLM Gateway:
 *  - summarizeInterview: one call the moment an interview ends
 *  - synthesizeStudy:    one call across every completed interview
 *
 * Live note-taking during the interview is done by the interviewer itself via
 * the `capture_insight` tool (see prompts.ts), so it costs no extra LLM calls.
 */

const sentimentSchema = z
  .string()
  .transform((s) => s.toLowerCase().trim())
  .pipe(z.enum(["positive", "neutral", "negative", "mixed"]))
  .catch("neutral");

/** Small models sometimes return a lone string where a list was asked for. */
const stringList = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() ? [v] : []) : Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
  z.array(z.string()),
);

const summarySchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  sentiment: sentimentSchema,
  keyQuotes: z.array(z.object({ text: z.string().min(1), theme: z.string().default("") })).default([]),
  painPoints: stringList.default([]),
  desires: stringList.default([]),
});

export async function summarizeInterview(input: {
  study: Study;
  turns: Pick<Turn, "role" | "text">[];
  insights: Pick<Insight, "theme" | "quote">[];
}): Promise<InterviewSummary> {
  const userText = input.turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ");
  const s = await chatJSON({
    system: SUMMARY_SYSTEM,
    user: summaryUserPrompt(input),
    schema: summarySchema,
    maxTokens: 900,
    temperature: 0.3,
  });
  return {
    headline: s.headline.trim(),
    summary: s.summary.trim(),
    sentiment: s.sentiment,
    keyQuotes: s.keyQuotes.slice(0, 3).map((q) => ({ text: enforceVerbatim(q.text, userText), theme: titleCase(q.theme) })),
    painPoints: s.painPoints.slice(0, 4),
    desires: s.desires.slice(0, 3),
  };
}

const synthesisSchema = z.object({
  headline: z.string().min(1),
  overview: z.string().min(1),
  themes: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().default(""),
        prevalence: z.coerce.number().default(1),
        sentiment: sentimentSchema,
        quoteCodes: stringList.default([]),
      }),
    )
    .min(1),
  tensions: stringList.default([]),
  recommendations: stringList.default([]),
  nextQuestions: stringList.default([]),
});

export async function synthesizeStudy(input: {
  study: Study;
  interviews: (Interview & { insights: Insight[] })[];
}): Promise<Synthesis> {
  const completed = input.interviews.filter((i) => i.summary);
  const codes = new Map<string, string>(); // interviewId -> P#
  completed.forEach((i, idx) => codes.set(i.id, `P${idx + 1}`));

  // Citation pool: live notes + write-up key quotes, coded Q1..Qn.
  const pool: { code: string; interviewId: string; participant: string; theme: string; text: string }[] = [];
  for (const i of completed) {
    const p = codes.get(i.id)!;
    for (const ins of i.insights) pool.push({ code: "", interviewId: i.id, participant: p, theme: ins.theme, text: ins.quote });
    for (const q of i.summary?.keyQuotes ?? []) {
      if (!pool.some((x) => x.interviewId === i.id && norm(x.text) === norm(q.text)))
        pool.push({ code: "", interviewId: i.id, participant: p, theme: q.theme, text: q.text });
    }
  }
  // Keep the prompt inside a small model's comfort zone: spread the budget across participants.
  const perParticipant = Math.max(3, Math.floor(36 / Math.max(1, completed.length)));
  const counts = new Map<string, number>();
  const quotes = pool
    .filter((q) => {
      const n = counts.get(q.interviewId) ?? 0;
      if (n >= perParticipant) return false;
      counts.set(q.interviewId, n + 1);
      return true;
    })
    .map((q, idx) => ({ ...q, code: `Q${idx + 1}` }));

  const s = await chatJSON({
    system: SYNTHESIS_SYSTEM,
    user: synthesisUserPrompt({
      study: input.study,
      interviews: completed.map((i) => ({
        code: codes.get(i.id)!,
        headline: i.summary!.headline,
        painPoints: i.summary!.painPoints,
        desires: i.summary!.desires,
        sentiment: i.summary!.sentiment,
      })),
      quotes,
    }),
    schema: synthesisSchema,
    maxTokens: 3000,
    temperature: 0.3,
    timeoutMs: 60_000,
  });

  const byCode = new Map(quotes.map((q) => [q.code.toUpperCase(), q]));
  const n = completed.length;
  return {
    headline: s.headline.trim(),
    overview: s.overview.trim(),
    themes: s.themes.slice(0, 5).map((t) => {
      const cited = t.quoteCodes
        .map((c) => byCode.get(String(c).toUpperCase().replace(/[^Q0-9]/g, "")))
        .filter((q): q is NonNullable<typeof q> => Boolean(q));
      // If the model cited nothing usable, fall back to quotes whose theme label overlaps.
      const chosen = cited.length ? cited : quotes.filter((q) => norm(q.theme) === norm(t.name));
      // One quote per wording, and prefer spreading evidence across participants.
      const seenText = new Set<string>();
      const seenParticipant = new Set<string>();
      const fallback = [...chosen]
        .sort((a, b) => Number(seenParticipant.has(a.interviewId)) - Number(seenParticipant.has(b.interviewId)))
        .filter((q) => {
          const key = norm(q.text);
          if (seenText.has(key)) return false;
          seenText.add(key);
          seenParticipant.add(q.interviewId);
          return true;
        });
      const distinct = new Set(fallback.map((q) => q.interviewId)).size;
      return {
        name: titleCase(t.name),
        description: t.description.trim(),
        prevalence: Math.max(1, Math.min(n, Math.round(t.prevalence) || distinct || 1)),
        sentiment: t.sentiment,
        quotes: fallback.slice(0, 3).map((q) => ({ interviewId: q.interviewId, text: q.text })),
      };
    }),
    tensions: s.tensions.slice(0, 3),
    recommendations: s.recommendations.slice(0, 4),
    nextQuestions: s.nextQuestions.slice(0, 3),
  };
}
