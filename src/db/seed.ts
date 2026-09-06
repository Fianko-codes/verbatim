/**
 * Seeds the public demo study.
 *
 * The four sample interviews use scripted transcripts and notes (there's no way
 * to ship real participants' voices in a repo). Everything downstream of them —
 * the per-interview write-ups and the study synthesis — is produced by the real
 * pipeline (AssemblyAI LLM Gateway), so what judges see is what the product does.
 *
 *   pnpm db:seed                 # transcripts + notes, then real write-ups + synthesis
 *   SKIP_ANALYSIS=1 pnpm db:seed # transcripts + notes only (no API calls)
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "./index";
import { summarizeInterview, synthesizeStudy } from "../lib/analyst";
import { DEMO_STUDY_ID } from "../lib/constants";
import type { Sentiment, Study } from "./schema";

const study: Study = {
  id: DEMO_STUDY_ID,
  title: "Meeting notes & follow-ups",
  goal: "Understand how people capture decisions and action items from meetings, where follow-ups get lost, and what would make them trust an AI meeting assistant.",
  audience: "People who sit in five or more meetings a week.",
  topics: [
    {
      id: "t1",
      question: "Think about the last meeting you were in that actually mattered. How did you capture what was said and decided?",
      probes: ["Where do the notes live afterwards?", "Who else sees them?"],
    },
    {
      id: "t2",
      question: "What happens to those notes afterwards — what actually gets acted on, and what falls through the cracks?",
      probes: ["Tell me about a time something was forgotten.", "How do you find out something slipped?"],
    },
    {
      id: "t3",
      question: "If you could change one thing about how your team captures and follows up on meetings, what would it be?",
      probes: ["What have you already tried?", "What would make you trust an automatic summary?"],
    },
  ],
  durationMinutes: 3,
  voice: "jane",
  keyterms: ["Notion", "Slack", "Jira", "Google Docs", "Loom", "Gong", "Confluence", "action items", "standup", "retro"],
  languageCodes: [],
  showLiveNotes: true,
  isDemo: true,
  createdAt: new Date(Date.now() - 6 * 86400_000),
};

type Note = { theme: string; quote: string; note: string; sentiment: Sentiment; topicId: string; turnIdx: number };
type Script = {
  label: string;
  hoursAgo: number;
  durationSeconds: number;
  turns: [role: "agent" | "user", text: string][];
  notes: Note[];
};

const G =
  "Hi, I'm Verbatim. Thanks for joining. This is a short conversation about meeting notes and follow-ups, and there are no wrong answers. To start: think about the last meeting you were in that actually mattered. How did you capture what was said and decided?";

const scripts: Script[] = [
  {
    label: "Maya",
    hoursAgo: 52,
    durationSeconds: 402,
    turns: [
      ["agent", G],
      ["user", "So yesterday we had a roadmap review with engineering and design. I had a Notion doc open and I was typing while people talked. The problem is I'm either present or I'm taking notes, never both. Half the time I look up and I've missed why we decided something."],
      ["agent", "That's a real trade-off. When you look up and realise you've missed the why, what do you do?"],
      ["user", "Honestly I just write down the decision and hope someone remembers the reasoning later. Then a week later someone asks in Slack why we cut a feature and I'm digging through the doc and it just says 'cut feature X'. No context."],
      ["agent", "Got it. So what happens to those notes afterwards, what actually gets acted on and what falls through the cracks?"],
      ["user", "The action items I tag to myself get done because I live in Notion. The ones for other people, maybe half. There's no nudge. I end up being the person who chases everyone, which is not really my job, and it makes me feel like a nag."],
      ["agent", "Can you tell me about a specific time something slipped?"],
      ["user", "Two weeks ago we agreed design would mock up a new onboarding flow before the next sprint. Nobody wrote down who owned it, we both assumed the other person did, and we lost a whole sprint. I only found out when the engineer asked where the mocks were."],
      ["agent", "That makes sense. If you could change one thing about how your team captures and follows up on meetings, what would it be?"],
      ["user", "I want to just be in the meeting. If something could listen and write the decisions with the reasoning attached, and then put action items where people actually look, which is Slack, not Notion, I'd trust it as long as I could see the exact bit of conversation it came from. If it hallucinated a decision once I'd never use it again."],
      ["agent", "Thank you, Maya, this was really helpful. I appreciate your time and your honesty."],
    ],
    notes: [
      { turnIdx: 1, topicId: "t1", sentiment: "negative", theme: "Present or taking notes, never both", quote: "I'm either present or I'm taking notes, never both.", note: "Manual note-taking costs the PM the meeting itself." },
      { turnIdx: 3, topicId: "t1", sentiment: "negative", theme: "Decisions without the why", quote: "it just says 'cut feature X'. No context.", note: "Notes capture outcomes but lose the reasoning, so decisions get re-questioned." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "Chasing feels like nagging", quote: "I end up being the person who chases everyone, which is not really my job, and it makes me feel like a nag.", note: "Follow-up falls on whoever took the notes, at a social cost." },
      { turnIdx: 7, topicId: "t2", sentiment: "negative", theme: "No owner, lost sprint", quote: "Nobody wrote down who owned it, we both assumed the other person did, and we lost a whole sprint.", note: "Missing ownership, not missing notes, is the failure mode." },
      { turnIdx: 9, topicId: "t3", sentiment: "positive", theme: "Trust needs a source link", quote: "I'd trust it as long as I could see the exact bit of conversation it came from.", note: "Verifiability is the precondition for adopting an AI summary." },
    ],
  },
  {
    label: "Tom",
    hoursAgo: 31,
    durationSeconds: 318,
    turns: [
      ["agent", G],
      ["user", "I run a platform team. Last important one was an incident retro on Tuesday. I don't take notes. I rely on memory and whatever ends up in the Jira ticket, which is usually nothing."],
      ["agent", "When nothing ends up in the ticket, how does that play out later?"],
      ["user", "We re-litigate the same decisions. Like we decided in that retro to add a circuit breaker to the payment service, and a month from now someone will propose it again as if it's new, and we'll spend another thirty minutes arguing about it. Decisions just evaporate."],
      ["agent", "Got it. What actually gets acted on after a meeting like that, and what falls through?"],
      ["user", "If someone creates a ticket in the meeting, it gets done. If it's a verbal agreement, it's a coin flip. The problem is nobody wants to be the person typing tickets while people are talking, so it depends on whether I remember to do it afterwards. Usually I don't, I'm already in the next meeting."],
      ["agent", "That makes sense. If you could change one thing about how your team captures and follows up, what would it be?"],
      ["user", "Decisions should get logged to the ticket automatically. Not a summary, I don't read summaries. Just the decision and who said it, attached to the thing it's about. And it has to be right, if it puts a wrong decision on a ticket that's worse than nothing."],
      ["agent", "Thank you, Tom, that's really useful. I appreciate your time."],
    ],
    notes: [
      { turnIdx: 3, topicId: "t1", sentiment: "negative", theme: "Decisions get re-litigated", quote: "someone will propose it again as if it's new, and we'll spend another thirty minutes arguing about it.", note: "Without a record, settled decisions cost the team again and again." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "Tickets get done, words don't", quote: "If someone creates a ticket in the meeting, it gets done. If it's a verbal agreement, it's a coin flip.", note: "Follow-through depends on capture into the system of record." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "Nobody wants to type tickets live", quote: "nobody wants to be the person typing tickets while people are talking", note: "The social cost of live capture blocks the one thing that works." },
      { turnIdx: 7, topicId: "t3", sentiment: "mixed", theme: "Decisions on the ticket, not summaries", quote: "Not a summary, I don't read summaries. Just the decision and who said it, attached to the thing it's about.", note: "Wants structured, attributed decisions inside Jira, not prose." },
      { turnIdx: 7, topicId: "t3", sentiment: "negative", theme: "Wrong is worse than nothing", quote: "if it puts a wrong decision on a ticket that's worse than nothing", note: "The accuracy bar for automation is absolute." },
    ],
  },
  {
    label: "Aisha",
    hoursAgo: 20,
    durationSeconds: 366,
    turns: [
      ["agent", G],
      ["user", "I'm in sales, so for customer calls we use a call recorder, everything gets transcribed and summarised automatically and it's honestly great. But internal meetings, pipeline reviews, deal strategy, nothing. Those are the ones where I make promises to my own team and forget them."],
      ["agent", "Interesting. What's different about the internal meetings that means nothing gets captured?"],
      ["user", "Nobody's set it up, and it feels weird to record your colleagues. Customer calls are a business thing, recording a teammate feels like surveillance. So I scribble on paper and lose the paper."],
      ["agent", "Got it. So what actually gets acted on after those internal meetings, and what falls through the cracks?"],
      ["user", "When I'm back to back, whatever I promised in the first meeting is gone by the third. Last month I told marketing I'd send them three customer quotes for a case study. Completely forgot. They chased me two weeks later and by then the customer had gone quiet. That one hurt."],
      ["agent", "That sounds painful. If you could change one thing about how your team captures and follows up on meetings, what would it be?"],
      ["user", "I just want something to tell me what I promised. At the end of the day, a list: you said you'd do these four things. I don't need the whole meeting. And it should be private to me, I don't want my manager getting a report of everything I said."],
      ["agent", "Thank you, Aisha, this was really helpful. I appreciate your time."],
    ],
    notes: [
      { turnIdx: 1, topicId: "t1", sentiment: "mixed", theme: "Customer calls captured, internal ones not", quote: "But internal meetings, pipeline reviews, deal strategy, nothing.", note: "The tooling exists but only for external calls." },
      { turnIdx: 3, topicId: "t1", sentiment: "negative", theme: "Recording colleagues feels like surveillance", quote: "recording a teammate feels like surveillance", note: "A cultural barrier, not a technical one, keeps internal meetings uncaptured." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "Back-to-back meetings erase promises", quote: "whatever I promised in the first meeting is gone by the third", note: "Load, not carelessness, drives dropped follow-ups." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "A forgotten promise cost a customer story", quote: "They chased me two weeks later and by then the customer had gone quiet.", note: "Concrete business cost of one missed follow-up." },
      { turnIdx: 7, topicId: "t3", sentiment: "positive", theme: "Just tell me what I promised", quote: "At the end of the day, a list: you said you'd do these four things.", note: "Wants a personal commitments list, not a meeting summary." },
      { turnIdx: 7, topicId: "t3", sentiment: "mixed", theme: "Private by default", quote: "I don't want my manager getting a report of everything I said.", note: "Adoption hinges on output being private to the individual." },
    ],
  },
  {
    label: "Daniel",
    hoursAgo: 6,
    durationSeconds: 295,
    turns: [
      ["agent", G],
      ["user", "I'm a product designer. Last one was a design crit on Friday. I sketch during meetings, and then afterwards I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it."],
      ["agent", "How do you know nobody reads it?"],
      ["user", "Because people ask me questions that are answered in the email. Every time. So I've started doing shorter ones, just decisions at the top, but then people miss the nuance and we end up having the conversation again anyway."],
      ["agent", "Got it. What actually gets acted on, and what falls through the cracks?"],
      ["user", "Things with a deadline attached get done. Things like 'let's explore a different layout' just float. Nobody owns exploring. Then in the next crit someone says 'didn't we say we'd try the other layout' and we all look at each other."],
      ["agent", "That makes sense. If you could change one thing about how your team captures and follows up on meetings, what would it be?"],
      ["user", "Kill the summary email. Have one shared place where decisions show up as they happen, short, decision first, and each one links back to who said it and when. If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary."],
      ["agent", "Thank you, Daniel, that's really helpful. I appreciate your time."],
    ],
    notes: [
      { turnIdx: 1, topicId: "t1", sentiment: "negative", theme: "Summary emails nobody reads", quote: "I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it.", note: "Twenty minutes per meeting of effort that goes unread." },
      { turnIdx: 3, topicId: "t1", sentiment: "mixed", theme: "Shorter notes lose the nuance", quote: "then people miss the nuance and we end up having the conversation again anyway.", note: "Brevity and context are in tension in written summaries." },
      { turnIdx: 5, topicId: "t2", sentiment: "negative", theme: "Unowned explorations float", quote: "Things like 'let's explore a different layout' just float. Nobody owns exploring.", note: "Soft action items without an owner never land." },
      { turnIdx: 7, topicId: "t3", sentiment: "positive", theme: "Click a decision, hear the moment", quote: "If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary.", note: "Audio-linked decisions would replace written summaries entirely." },
    ],
  },
];

async function main() {
  const skipAnalysis = process.env.SKIP_ANALYSIS === "1" || !process.env.ASSEMBLYAI_API_KEY;
  if (skipAnalysis) console.log("Seeding transcripts + notes only (SKIP_ANALYSIS or no ASSEMBLYAI_API_KEY).");

  // Upsert the study and replace only the sample data — real interviews survive a re-seed.
  const { id: _id, createdAt: _createdAt, ...studyFields } = study;
  void _id;
  void _createdAt;
  await db.insert(schema.studies).values(study).onConflictDoUpdate({ target: schema.studies.id, set: studyFields });
  await db.delete(schema.interviews).where(and(eq(schema.interviews.studyId, DEMO_STUDY_ID), eq(schema.interviews.isSample, true)));
  await db.delete(schema.syntheses).where(eq(schema.syntheses.studyId, DEMO_STUDY_ID));
  console.log(`Study "${study.title}" ready.`);

  for (const s of scripts) {
    const interviewId = nanoid(12);
    const startedAt = new Date(Date.now() - s.hoursAgo * 3600_000);
    const turnRows = s.turns.map(([role, text], idx) => ({
      id: nanoid(12),
      interviewId,
      idx,
      role,
      text,
      atMs: Math.round(((idx + 1) / s.turns.length) * s.durationSeconds * 1000),
      interrupted: false,
    }));
    const insightRows = s.notes.map((n) => ({
      id: nanoid(12),
      interviewId,
      studyId: study.id,
      topicId: n.topicId,
      theme: n.theme,
      quote: n.quote,
      note: n.note,
      sentiment: n.sentiment,
      turnIdx: n.turnIdx,
      createdAt: new Date(startedAt.getTime() + turnRows[n.turnIdx].atMs + 1500),
    }));

    let summary = null;
    if (!skipAnalysis) {
      try {
        summary = await summarizeInterview({ study, turns: turnRows, insights: insightRows });
      } catch (err) {
        console.warn(`  write-up failed for ${s.label}:`, err instanceof Error ? err.message : err);
      }
    }

    await db.insert(schema.interviews).values({
      id: interviewId,
      studyId: study.id,
      participantLabel: s.label,
      status: "completed",
      startedAt,
      endedAt: new Date(startedAt.getTime() + s.durationSeconds * 1000),
      durationSeconds: s.durationSeconds,
      isSample: true,
      topicsCovered: ["t1", "t2", "t3"],
      summary,
    });
    await db.insert(schema.turns).values(turnRows);
    await db.insert(schema.insights).values(insightRows);
    console.log(`  ${s.label}: ${turnRows.length} turns, ${insightRows.length} notes${summary ? `, "${summary.headline}"` : ""}`);
  }

  if (!skipAnalysis) {
    const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.studyId, study.id));
    const allInsights = await db.select().from(schema.insights).where(eq(schema.insights.studyId, study.id));
    const interviews = rows.map((r) => ({ ...r, insights: allInsights.filter((i) => i.interviewId === r.id) }));
    try {
      const content = await synthesizeStudy({ study, interviews });
      await db.insert(schema.syntheses).values({
        id: nanoid(12),
        studyId: study.id,
        interviewCount: interviews.filter((i) => i.summary).length,
        content,
        createdAt: new Date(),
      });
      console.log(`Synthesis: "${content.headline}" — ${content.themes.length} themes`);
    } catch (err) {
      console.warn("synthesis failed:", err instanceof Error ? err.message : err);
    }
  }
  console.log("Done.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
