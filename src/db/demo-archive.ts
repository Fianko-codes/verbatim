/**
 * Archived pipeline output for the demo study.
 *
 * During the hackathon the seed ran the real pipeline (AssemblyAI LLM Gateway)
 * over the four sample interviews. That output is preserved here, copied word
 * for word from the screenshots in docs/shots/, so a deployment without an
 * API key still shows what the product actually produced.
 *
 * What survived: the full study synthesis, Daniel's full write-up, and the
 * headline and sentiment of the other three. Nothing has been written to fill
 * the gaps, so those three write-ups are headline-only. Running `pnpm db:seed`
 * with ASSEMBLYAI_API_KEY set regenerates all of it from the live pipeline.
 */
import type { InterviewSummary, Synthesis } from "./schema";

export const ARCHIVED_SUMMARIES: Record<string, InterviewSummary> = {
  Daniel: {
    headline: "Daniel wants AI to capture meeting decisions with context instead of summary emails.",
    summary:
      "As a product designer, Daniel spends twenty minutes writing summary emails that nobody reads, leading to lost nuance and unowned action items that float until the next meeting. He believes the current system fails because decisions lack ownership and context, causing teams to repeat conversations.",
    sentiment: "negative",
    keyQuotes: [
      { text: "I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it.", theme: "Low engagement" },
      { text: "If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary.", theme: "Desire for context" },
      { text: "Things like 'let's explore a different layout' just float. Nobody owns exploring.", theme: "Lost accountability" },
    ],
    painPoints: ["summary emails ignored", "nuance lost in short notes", "explorations lack ownership", "decisions repeated"],
    desires: ["shared place for live decisions", "link to original discussion context", "decision-first capture method"],
  },
  Aisha: {
    headline: "Aisha struggles to capture internal meeting commitments due to privacy concerns.",
    summary: "",
    sentiment: "negative",
    keyQuotes: [],
    painPoints: [],
    desires: [],
  },
  Tom: {
    headline: "Decisions evaporate without tickets, causing teams to re-litigate old issues.",
    summary: "",
    sentiment: "negative",
    keyQuotes: [],
    painPoints: [],
    desires: [],
  },
  Maya: {
    headline: "Maya struggles to capture meeting context while taking notes.",
    summary: "",
    sentiment: "negative",
    keyQuotes: [],
    painPoints: [],
    desires: [],
  },
};

/** Quotes reference participants by label; the seed maps them to interview ids. */
type ArchivedSynthesis = Omit<Synthesis, "themes"> & {
  themes: (Omit<Synthesis["themes"][number], "quotes"> & { quotes: { participant: string; text: string }[] })[];
};

export const ARCHIVED_SYNTHESIS: ArchivedSynthesis = {
  headline: "Decisions evaporate without context, ownership, or ticket integration.",
  overview:
    "Participants consistently report that verbal agreements and summary emails are ignored, leading to lost ownership and repeated re-litigation of old issues. Trust in an AI assistant hinges on its ability to link decisions to original context and automatically log them into actionable tickets rather than generating unreadable summaries.",
  themes: [
    {
      name: "Lost Context & Ownership",
      description: "Decisions lack the 'why' and specific owners, causing teams to re-argue past issues or assume responsibility incorrectly.",
      prevalence: 4,
      sentiment: "negative",
      quotes: [
        { participant: "Maya", text: "it just says 'cut feature X'. No context." },
        { participant: "Maya", text: "Nobody wrote down who owned it, we both assumed the other person did, and we lost a whole sprint." },
        { participant: "Tom", text: "someone will propose it again as if it's new, and we'll spend another thirty minutes arguing about it." },
      ],
    },
    {
      name: "Verbal Agreements vs. Tickets",
      description: "Teams rely on verbal promises which vanish quickly, whereas creating live tickets ensures accountability and completion.",
      prevalence: 2,
      sentiment: "negative",
      quotes: [
        { participant: "Tom", text: "If someone creates a ticket in the meeting, it gets done. If it's a verbal agreement, it's a coin flip." },
        { participant: "Tom", text: "nobody wants to be the person typing tickets while people are talking" },
      ],
    },
    {
      name: "Privacy & Internal Capture",
      description: "Participants avoid recording internal meetings due to surveillance fears, leaving commitments untracked and forgotten.",
      prevalence: 1,
      sentiment: "negative",
      quotes: [
        { participant: "Aisha", text: "recording a teammate feels like surveillance" },
        { participant: "Aisha", text: "I don't want my manager getting a report of everything I said." },
      ],
    },
    {
      name: "Summary Fatigue",
      description: "Long summary emails and short notes fail to capture nuance, resulting in ignored content and repeated conversations.",
      prevalence: 2,
      sentiment: "negative",
      quotes: [
        { participant: "Daniel", text: "I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it." },
        { participant: "Daniel", text: "then people miss the nuance and we end up having the conversation again anyway." },
      ],
    },
    {
      name: "Trust via Source Links",
      description: "Users will trust an AI assistant only if it provides direct links to the exact conversation segment for a decision.",
      prevalence: 1,
      sentiment: "neutral",
      quotes: [
        { participant: "Maya", text: "I'd trust it as long as I could see the exact bit of conversation it came from." },
        { participant: "Daniel", text: "If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary." },
      ],
    },
  ],
  tensions: [
    "Participants want high-accuracy decision logging but fear wrong data on tickets is worse than no data.",
    "There is a conflict between the desire for private personal action lists and the need for shared team accountability.",
  ],
  recommendations: [
    "Build an AI assistant that automatically attaches decisions to existing tickets rather than sending summary emails.",
    "Implement a 'source link' feature that lets users click a decision to hear the exact 30-second context.",
    "Allow users to toggle between private personal action lists and shared team commitments within the same interface.",
  ],
  nextQuestions: [
    "How do teams currently handle the 'coin flip' of ownership when no one is assigned in verbal meetings?",
    "What specific privacy controls would make participants comfortable recording internal strategy meetings?",
  ],
};
