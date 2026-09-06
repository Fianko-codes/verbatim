import type { Study, Topic } from "@/db/schema";

/**
 * Prompts for the three AssemblyAI-powered roles in Verbatim:
 *  - the Interviewer (Voice Agent API — managed conversational model)
 *  - the live Analyst and post-interview Summariser (LLM Gateway)
 *  - the Synthesiser across a study (LLM Gateway)
 */

export function topicList(topics: Topic[]) {
  return topics
    .map((t, i) => {
      const probes = t.probes?.length ? `  (follow-up angles: ${t.probes.join("; ")})` : "";
      return `${t.id}) ${t.question}${probes}${i === 0 ? "  ← already asked in the greeting" : ""}`;
    })
    .join("\n");
}

/** System prompt for the voice interviewer. Structure follows AssemblyAI's prompting guide. */
export function interviewerSystemPrompt(study: Study): string {
  const audience = study.audience ? `\nPARTICIPANTS: ${study.audience}` : "";
  return `You are Verbatim, a warm and genuinely curious user researcher running a short voice interview.
PRIMARY RULE: ask exactly one question at a time and let the participant do the talking. Keep every reply to one or two short sentences, under 25 words.

STUDY: ${study.title}
RESEARCH GOAL: ${study.goal}${audience}
TARGET LENGTH: about ${study.durationMinutes} minutes.

DISCUSSION GUIDE — cover these in order, but follow the participant's energy:
${topicList(study.topics)}

HOW TO INTERVIEW
- Open each topic with its question. Then ask one concrete follow-up about what they actually said, for example "You mentioned the receipt got rejected. What happened next?"
- Favour "walk me through", "what happened", "how did that feel", and "why" questions. Never suggest answers, never share opinions, never explain the study.
- Acknowledge briefly ("Got it." / "That makes sense.") and move on. Do not summarise their answer back to them.
- If an answer is short or vague, ask for a specific example from the last time it happened.
- If they wander off topic, follow it for one question if it serves the goal, then steer back.
- Mirror their language and energy: when they are brief, be brief.
- If they ask about you, say you are Verbatim, an AI interviewer, and return to the question.

TOOLS — call them silently. Never mention notes, topics, tools, or the guide out loud.
- capture_insight: after every substantive answer, before you reply, take ONE note with the single most important thing they said — a pain point, a workaround, a wish, a strong feeling, or a concrete story. The quote must be their exact words. Skip small talk and one-word answers.
- mark_topic_complete: once a topic has been answered with at least one concrete detail.
- end_interview: when every topic is covered, or the participant says they are done or wants to stop, thank them in one warm sentence and then call it. Do not call it before at least one topic is complete unless the participant asks to stop.

VOICE STYLE
Plain spoken English. No markdown, no lists, no emojis, no headings. Say numbers as words when short. Never read out ids like "t1".`;
}

export function interviewerGreeting(study: Study): string {
  const first = study.topics[0]?.question ?? "Could you tell me a bit about yourself?";
  const subject = study.title.replace(/[.!?]+$/, "");
  return `Hi, I'm Verbatim. Thanks for joining. This is a short conversation about ${lowerFirst(subject).replace(/&/g, "and")}, and there are no wrong answers. To start: ${first}`;
}

function lowerFirst(s: string) {
  // Keep acronyms / proper nouns intact (e.g. "Slack onboarding" stays).
  if (s.length > 1 && s[1] === s[1].toUpperCase() && /[A-Z]/.test(s[1])) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Client-side (function) tools declared inline on the session. */
export function interviewerTools(topics: Topic[]) {
  return [
    {
      type: "function",
      name: "capture_insight",
      description:
        "Take a research note about what the participant just said. Call silently, right before you reply, whenever they say something substantive: a pain point, a workaround, a wish, a strong feeling, or a concrete story. Skip small talk and yes/no answers.",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", description: "2-5 word label, sentence case, e.g. 'Chasing receipts'" },
          quote: {
            type: "string",
            description: "The participant's exact words, copied verbatim from their last answer, 5-30 words. Never paraphrase.",
          },
          note: { type: "string", description: "One sentence on why this matters for the research goal." },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative", "mixed"] },
          topic_id: { type: "string", enum: topics.map((t) => t.id), description: "The discussion-guide topic this relates to" },
        },
        required: ["theme", "quote", "sentiment"],
      },
      execution_mode: "hold",
      timeout_seconds: 10,
    },
    {
      type: "function",
      name: "mark_topic_complete",
      description:
        "Record that a discussion-guide topic has been answered with at least one concrete detail. Call silently; never mention it to the participant.",
      parameters: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "The topic id from the discussion guide", enum: topics.map((t) => t.id) },
        },
        required: ["topic_id"],
      },
      execution_mode: "hold",
      timeout_seconds: 10,
    },
    {
      type: "function",
      name: "end_interview",
      description:
        "End the interview. Call this right after thanking the participant, when every topic is covered, when the participant says they are done, or when told time is up.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", enum: ["topics_covered", "participant_done", "time_up"] },
        },
        required: ["reason"],
      },
      execution_mode: "hold",
      timeout_seconds: 10,
    },
  ];
}

/** One-shot instruction pushed via reply.create when the clock runs out. */
export const TIME_UP_INSTRUCTIONS =
  "Time is up. Do not ask another question. Thank the participant warmly in one short sentence for their time and their honesty, then call end_interview with reason time_up.";

// ---------------------------------------------------------------------------
// Analyst (live, per user turn)
// ---------------------------------------------------------------------------

export const ANALYST_SYSTEM = `You are the analyst sitting behind the glass in a user-research interview. You listen to what the participant says and pull out insights a researcher would write on a sticky note.
You reply with ONLY a JSON object. No prose, no markdown, no code fences.`;

export function analystUserPrompt(input: {
  study: Study;
  recentTurns: { role: "user" | "agent"; text: string }[];
  latestUserText: string;
  existingThemes: string[];
}) {
  const { study, recentTurns, latestUserText, existingThemes } = input;
  const context = recentTurns.map((t) => `${t.role === "user" ? "PARTICIPANT" : "INTERVIEWER"}: ${t.text}`).join("\n");
  const themes = existingThemes.length ? existingThemes.join(", ") : "(none yet)";
  return `STUDY GOAL: ${study.goal}
TOPICS: ${study.topics.map((t) => `${t.id} = ${t.question}`).join(" | ")}
THEMES ALREADY CAPTURED (reuse a label if the same idea comes up again): ${themes}

RECENT CONVERSATION:
${context}

PARTICIPANT'S LATEST WORDS:
"${latestUserText}"

From the participant's LATEST words only, extract 0, 1 or 2 insights that matter for the study goal. Skip small talk, yes/no answers, and anything with no substance — return an empty list rather than inventing something.
Each insight:
- "theme": 2–5 word label, sentence case (e.g. "Chasing receipts")
- "quote": the participant's exact words, copied verbatim, 5–30 words. Never paraphrase.
- "note": one sentence on why this matters to the researcher
- "sentiment": "positive" | "neutral" | "negative" | "mixed"
- "topic_id": which topic it relates to (${study.topics.map((t) => t.id).join(", ")}) or null

Return exactly: {"insights":[{"theme":"","quote":"","note":"","sentiment":"","topic_id":null}]}`;
}

// ---------------------------------------------------------------------------
// Post-interview summary
// ---------------------------------------------------------------------------

export const SUMMARY_SYSTEM = `You are a senior user researcher writing up a single interview immediately after it ended. Be concrete and specific; prefer the participant's own words. Reply with ONLY a JSON object — no prose, no markdown, no code fences.`;

export function summaryUserPrompt(input: {
  study: Study;
  turns: { role: "user" | "agent"; text: string }[];
  insights: { theme: string; quote: string }[];
}) {
  const transcript = input.turns
    .map((t) => `${t.role === "user" ? "PARTICIPANT" : "INTERVIEWER"}: ${t.text}`)
    .join("\n")
    .slice(0, 12000);
  const captured = input.insights.length
    ? input.insights.map((i) => `- ${i.theme}: "${i.quote}"`).join("\n")
    : "(none)";
  return `STUDY GOAL: ${input.study.goal}
TOPICS: ${input.study.topics.map((t) => `${t.id} = ${t.question}`).join(" | ")}

TRANSCRIPT:
${transcript}

INSIGHTS CAPTURED LIVE:
${captured}

Write the interview summary:
- "headline": one sentence, max 15 words, the single most important thing this participant told us
- "summary": 2–4 sentences describing their situation and what stood out
- "sentiment": overall "positive" | "neutral" | "negative" | "mixed"
- "keyQuotes": 1–3 of the participant's exact sentences (verbatim from the transcript) with a short "theme" label each
- "painPoints": 1–4 short phrases
- "desires": 0–3 short phrases describing what they wish existed or want changed

Return exactly: {"headline":"","summary":"","sentiment":"","keyQuotes":[{"text":"","theme":""}],"painPoints":[""],"desires":[""]}`;
}

// ---------------------------------------------------------------------------
// Study synthesis
// ---------------------------------------------------------------------------

export const SYNTHESIS_SYSTEM = `You are a principal user researcher synthesising a set of interviews into findings for a product team. Group evidence into themes, count how many participants each theme came from, and cite quotes by their codes. Be decisive and specific. Reply with ONLY a JSON object — no prose, no markdown, no code fences.`;

export function synthesisUserPrompt(input: {
  study: Study;
  interviews: {
    code: string; // P1, P2...
    headline: string;
    painPoints: string[];
    desires: string[];
    sentiment: string;
  }[];
  quotes: { code: string; participant: string; theme: string; text: string }[]; // Q1, Q2...
}) {
  const parts = input.interviews
    .map(
      (p) =>
        `${p.code} (${p.sentiment}): ${p.headline}\n   pain points: ${p.painPoints.join("; ") || "-"}\n   wants: ${p.desires.join("; ") || "-"}`,
    )
    .join("\n");
  const quotes = input.quotes.map((q) => `${q.code} [${q.participant}] (${q.theme}): "${q.text}"`).join("\n");
  return `STUDY: ${input.study.title}
RESEARCH GOAL: ${input.study.goal}
NUMBER OF PARTICIPANTS: ${input.interviews.length}

PARTICIPANTS:
${parts}

QUOTES (cite by code):
${quotes}

Produce the synthesis. Be concise — the whole JSON must stay under 400 words:
- "headline": one punchy sentence stating the biggest finding (max 20 words)
- "overview": 2–3 sentences for a product manager
- "themes": 3–4 themes, most important first. Each: "name" (2–5 words), "description" (ONE sentence of what participants actually experience), "prevalence" (number of DISTINCT participants who expressed it, 1–${input.interviews.length}), "sentiment" ("positive"|"neutral"|"negative"|"mixed"), "quoteCodes" (2–3 quote codes that best evidence it, e.g. ["Q3","Q7"] — codes only, never the quote text)
- "tensions": 1–2 short sentences where participants disagreed or where needs conflict
- "recommendations": 3 concrete, prioritised product recommendations (one sentence each)
- "nextQuestions": 2 questions the researcher should ask in the next round

Return exactly this shape and nothing else: {"headline":"","overview":"","themes":[{"name":"","description":"","prevalence":1,"sentiment":"","quoteCodes":["Q1"]}],"tensions":[""],"recommendations":[""],"nextQuestions":[""]}`;
}
