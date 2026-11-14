/**
 * Archived pipeline output for the demo study.
 *
 * During the hackathon the seed ran the real pipeline (AssemblyAI LLM Gateway)
 * over the four sample interviews. That output is preserved here so a
 * deployment without an API key still shows what the product actually
 * produced:
 *
 * - the four write-ups, exported from the hackathon database;
 * - the study synthesis over those four interviews, copied word for word from
 *   docs/shots/dashboard-full.png (the database only kept a later synthesis
 *   that also included a test interview).
 *
 * Running `pnpm db:seed` with ASSEMBLYAI_API_KEY set regenerates all of it
 * from the live pipeline instead.
 */
import type { InterviewSummary, Synthesis } from "./schema";

export const ARCHIVED_SUMMARIES: Record<string, InterviewSummary> = {
  Maya: {
    headline:
      "Participants struggle to capture context and follow up without feeling like naggers.",
    summary:
      "Maya describes the trade-off of being present versus taking notes, leading to decisions lacking context and action items slipping through the cracks. She feels the burden of chasing others on follow-ups and lost a sprint due to assumed ownership.",
    sentiment: "negative",
    keyQuotes: [
      {
        text: "I'm either present or I'm taking notes, never both.",
        theme: "Note-taking trade-off",
      },
      {
        text: "I end up being the person who chases everyone, which is not really my job, and it makes me feel like a nag.",
        theme: "Follow-up burden",
      },
      {
        text: "I'd trust it as long as I could see the exact bit of conversation it came from.",
        theme: "Trust requirement",
      },
    ],
    painPoints: [
      "Missing context on decisions",
      "Action items lost to assumed ownership",
      "Feeling like a nag chasing follow-ups",
      "No clear owner for tasks",
    ],
    desires: [
      "AI assistant that captures reasoning with decisions",
      "Action items posted directly in Slack",
      "Source links to verify AI-generated decisions",
    ],
  },
  Tom: {
    headline: "Tom found that decisions evaporate without automatic logging.",
    summary:
      "Tom runs a platform team where important decisions from meetings like incident retros often vanish because no one takes live notes. He observes that verbal agreements are rarely acted upon, leading to the same decisions being re-litigated months later as if they were new.",
    sentiment: "negative",
    keyQuotes: [
      {
        text: "Decisions just evaporate.",
        theme: "Decision loss",
      },
      {
        text: "If someone creates a ticket in the meeting, it gets done. If it's a verbal agreement, it's a coin flip.",
        theme: "Action gap",
      },
      {
        text: "Just the decision and who said it, attached to the thing it's about.",
        theme: "Desired format",
      },
    ],
    painPoints: [
      "decisions re-litigated",
      "verbal agreements ignored",
      "manual note-taking skipped",
    ],
    desires: ["automatic decision logging", "decision accuracy over summaries"],
  },
  Aisha: {
    headline:
      "Sales rep struggles to capture internal meeting commitments due to privacy concerns.",
    summary:
      "Aisha, a sales professional, relies on automated transcription for customer calls but skips internal meetings like pipeline reviews because recording colleagues feels like surveillance. She admits that promises made in these unrecorded sessions are frequently forgotten by the time the next meeting occurs, leading to missed deadlines and lost customer opportunities.",
    sentiment: "negative",
    keyQuotes: [
      {
        text: "But internal meetings, pipeline reviews, deal strategy, nothing.",
        theme: "Lack of capture",
      },
      {
        text: "recording a teammate feels like surveillance.",
        theme: "Privacy concern",
      },
      {
        text: "At the end of the day, a list: you said you'd do these four things.",
        theme: "Desired output",
      },
    ],
    painPoints: [
      "no capture for internal meetings",
      "feeling surveilled by recording",
      "promises forgotten quickly",
      "lost customer opportunities",
    ],
    desires: [
      "automated list of personal commitments",
      "private notes without manager visibility",
      "reliable tracking of personal promises",
    ],
  },
  Daniel: {
    headline:
      "Daniel hates writing unreadable summary emails that lose nuance.",
    summary:
      "Daniel, a product designer, spends twenty minutes writing detailed meeting summaries that he assumes no one reads, yet he still gets asked questions about them. He observes that only tasks with deadlines get acted upon, while open explorations float without ownership, leading to repeated conversations. His ideal solution is a live, shared decision log where he can click a decision to hear the original thirty-second discussion.",
    sentiment: "negative",
    keyQuotes: [
      {
        text: "I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it.",
        theme: "Unread summaries",
      },
      {
        text: "Things like 'let's explore a different layout' just float. Nobody owns exploring.",
        theme: "Lost ownership",
      },
      {
        text: "If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary.",
        theme: "Desire for context",
      },
    ],
    painPoints: [
      "Time-consuming manual summaries",
      "Assumed unreadability",
      "Loss of nuance in notes",
      "Tasks without deadlines get lost",
    ],
    desires: [
      "Live shared decision log",
      "Click to hear original discussion context",
      "Decision-first capture format",
    ],
  },
};

/** Quotes reference participants by label; the seed maps them to interview ids. */
type ArchivedSynthesis = Omit<Synthesis, "themes"> & {
  themes: (Omit<Synthesis["themes"][number], "quotes"> & {
    quotes: { participant: string; text: string }[];
  })[];
};

export const ARCHIVED_SYNTHESIS: ArchivedSynthesis = {
  headline:
    "Decisions evaporate without context, ownership, or ticket integration.",
  overview:
    "Participants consistently report that verbal agreements and summary emails are ignored, leading to lost ownership and repeated re-litigation of old issues. Trust in an AI assistant hinges on its ability to link decisions to original context and automatically log them into actionable tickets rather than generating unreadable summaries.",
  themes: [
    {
      name: "Lost Context & Ownership",
      description:
        "Decisions lack the 'why' and specific owners, causing teams to re-argue past issues or assume responsibility incorrectly.",
      prevalence: 4,
      sentiment: "negative",
      quotes: [
        {
          participant: "Maya",
          text: "it just says 'cut feature X'. No context.",
        },
        {
          participant: "Maya",
          text: "Nobody wrote down who owned it, we both assumed the other person did, and we lost a whole sprint.",
        },
        {
          participant: "Tom",
          text: "someone will propose it again as if it's new, and we'll spend another thirty minutes arguing about it.",
        },
      ],
    },
    {
      name: "Verbal Agreements vs. Tickets",
      description:
        "Teams rely on verbal promises which vanish quickly, whereas creating live tickets ensures accountability and completion.",
      prevalence: 2,
      sentiment: "negative",
      quotes: [
        {
          participant: "Tom",
          text: "If someone creates a ticket in the meeting, it gets done. If it's a verbal agreement, it's a coin flip.",
        },
        {
          participant: "Tom",
          text: "nobody wants to be the person typing tickets while people are talking",
        },
      ],
    },
    {
      name: "Privacy & Internal Capture",
      description:
        "Participants avoid recording internal meetings due to surveillance fears, leaving commitments untracked and forgotten.",
      prevalence: 1,
      sentiment: "negative",
      quotes: [
        {
          participant: "Aisha",
          text: "recording a teammate feels like surveillance",
        },
        {
          participant: "Aisha",
          text: "I don't want my manager getting a report of everything I said.",
        },
      ],
    },
    {
      name: "Summary Fatigue",
      description:
        "Long summary emails and short notes fail to capture nuance, resulting in ignored content and repeated conversations.",
      prevalence: 2,
      sentiment: "negative",
      quotes: [
        {
          participant: "Daniel",
          text: "I write a summary email, which takes me about twenty minutes, and I'm fairly sure nobody reads it.",
        },
        {
          participant: "Daniel",
          text: "then people miss the nuance and we end up having the conversation again anyway.",
        },
      ],
    },
    {
      name: "Trust via Source Links",
      description:
        "Users will trust an AI assistant only if it provides direct links to the exact conversation segment for a decision.",
      prevalence: 1,
      sentiment: "neutral",
      quotes: [
        {
          participant: "Maya",
          text: "I'd trust it as long as I could see the exact bit of conversation it came from.",
        },
        {
          participant: "Daniel",
          text: "If I could click a decision and hear the thirty seconds where we made it, I'd never write another summary.",
        },
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
