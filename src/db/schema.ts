import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * A researcher account. Participants never get one — they join studies through
 * an unauthenticated share link, so this table is only ever the dashboard side.
 */
export const researchers = sqliteTable(
  "researchers",
  {
    id: text("id").primaryKey(),
    /** Login name, stored lower-cased so lookups are case-insensitive. */
    username: text("username").notNull(),
    /** Display name shown in the dashboard header. */
    name: text("name").notNull().default(""),
    /** `scrypt$N$r$p$salt$hash` — see src/lib/auth/password.ts. Never leaves the server. */
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("researchers_username_idx").on(t.username)],
);

/**
 * A logged-in browser session. The cookie carries a random token; this table
 * stores only its SHA-256, so a database leak cannot be replayed as a login.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token held in the cookie. */
    id: text("id").primaryKey(),
    researcherId: text("researcher_id").notNull().references(() => researchers.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    /** Bumped on use so idle sessions can be expired and active ones rolled forward. */
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_researcher_idx").on(t.researcherId), index("sessions_expiry_idx").on(t.expiresAt)],
);

/** Windowed failed-sign-in counter, keyed by username and by client IP. */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }).notNull(),
});

/** A research study: one discussion guide, many interviews. */
export const studies = sqliteTable("studies", {
  id: text("id").primaryKey(),
  /**
   * The owning researcher. Nullable only so the column can be added to an
   * existing database without rewriting it; every code path that creates a
   * study sets it, and every read requires it to equal the viewer's id — so a
   * legacy row with NULL here is unreachable rather than public.
   * `pnpm db:adopt` assigns any such rows to an account.
   */
  researcherId: text("researcher_id").references(() => researchers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** What the researcher wants to learn. Drives the interviewer + analyst prompts. */
  goal: text("goal").notNull(),
  /** Who the participants are (e.g. "finance managers at mid-size companies"). */
  audience: text("audience").notNull().default(""),
  /** JSON: Topic[] — the discussion guide. */
  topics: text("topics", { mode: "json" }).$type<Topic[]>().notNull(),
  /** Target interview length in minutes. */
  durationMinutes: integer("duration_minutes").notNull().default(5),
  /** AssemblyAI voice id (e.g. "jane"). */
  voice: text("voice").notNull().default("jane"),
  /** JSON string[] — transcription bias terms (product names, jargon). */
  keyterms: text("keyterms", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** JSON string[] — optional ISO language codes for the participant's speech. */
  languageCodes: text("language_codes", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Show the analyst's live notes to the participant (demo mode). */
  showLiveNotes: integer("show_live_notes", { mode: "boolean" }).notNull().default(true),
  /**
   * Publish this study's dashboard to anyone with the link, no account needed.
   *
   * Off for every study the app creates — a researcher's work is private by
   * default and there is no UI to flip this. Only the seeded demo sets it, so
   * that a visitor can see both sides of the product without signing up. It
   * makes the transcripts, notes, write-ups and session recordings of everyone
   * who takes that study readable by the public, so it is not a setting to
   * enable on a study with real participants.
   */
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("studies_researcher_idx").on(t.researcherId)]);

export type Topic = {
  id: string;
  /** The opening question for this topic, phrased for speech. */
  question: string;
  /** Optional follow-up angles the interviewer may probe. */
  probes?: string[];
};

export type InterviewStatus = "in_progress" | "completed" | "abandoned";

/** One participant conversation. */
export const interviews = sqliteTable(
  "interviews",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull().references(() => studies.id, { onDelete: "cascade" }),
    /** AssemblyAI Voice Agent session id — used to fetch the recording + timeline later. */
    aaiSessionId: text("aai_session_id"),
    participantLabel: text("participant_label"),
    status: text("status").$type<InterviewStatus>().notNull().default("in_progress"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    durationSeconds: integer("duration_seconds"),
    /** JSON: string[] of topic ids the interviewer marked complete. */
    topicsCovered: text("topics_covered", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    /** JSON: InterviewSummary — produced after the session ends. */
    summary: text("summary", { mode: "json" }).$type<InterviewSummary | null>(),
    /** Sample data seeded for the demo dashboard (never a real session). */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("interviews_study_idx").on(t.studyId)],
);

export type InterviewSummary = {
  headline: string;
  summary: string;
  sentiment: Sentiment;
  keyQuotes: { text: string; theme: string }[];
  painPoints: string[];
  desires: string[];
};

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

/** Transcript turns, persisted as they happen so nothing is lost if the tab dies. */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    role: text("role").$type<"user" | "agent">().notNull(),
    text: text("text").notNull(),
    /** Milliseconds since the interview started, when this turn finished. */
    atMs: integer("at_ms").notNull(),
    interrupted: integer("interrupted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("turns_interview_idx").on(t.interviewId, t.idx)],
);

/** An insight the analyst extracted live from a participant's words. */
export const insights = sqliteTable(
  "insights",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
    studyId: text("study_id").notNull().references(() => studies.id, { onDelete: "cascade" }),
    topicId: text("topic_id"),
    /** 2–5 word label, e.g. "Chasing receipts". */
    theme: text("theme").notNull(),
    /** Verbatim words from the participant. */
    quote: text("quote").notNull(),
    /** One-sentence "so what" for the researcher. */
    note: text("note").notNull().default(""),
    sentiment: text("sentiment").$type<Sentiment>().notNull().default("neutral"),
    /** Index of the user turn this came from. */
    turnIdx: integer("turn_idx"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("insights_study_idx").on(t.studyId), index("insights_interview_idx").on(t.interviewId)],
);

/** Study-level synthesis across interviews. */
export const syntheses = sqliteTable(
  "syntheses",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull().references(() => studies.id, { onDelete: "cascade" }),
    interviewCount: integer("interview_count").notNull(),
    content: text("content", { mode: "json" }).$type<Synthesis>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("syntheses_study_idx").on(t.studyId)],
);

export type Synthesis = {
  headline: string;
  overview: string;
  themes: {
    name: string;
    description: string;
    /** Number of interviews in which this theme appeared. */
    prevalence: number;
    sentiment: Sentiment;
    quotes: { interviewId: string; text: string }[];
  }[];
  tensions: string[];
  recommendations: string[];
  nextQuestions: string[];
};

export type Researcher = typeof researchers.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type Study = typeof studies.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type Turn = typeof turns.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type SynthesisRow = typeof syntheses.$inferSelect;
