import { z } from "zod";

export const VOICES = [
  { id: "jane", label: "Jane", accent: "American" },
  { id: "alba", label: "Alba", accent: "American" },
  { id: "michael", label: "Michael", accent: "American" },
  { id: "george", label: "George", accent: "American" },
  { id: "eve", label: "Eve", accent: "American" },
  { id: "anna", label: "Anna", accent: "British" },
  { id: "charles", label: "Charles", accent: "British" },
  { id: "vera", label: "Vera", accent: "British" },
  { id: "lola", label: "Lola", accent: "Spanish" },
  { id: "estelle", label: "Estelle", accent: "French" },
  { id: "juergen", label: "Juergen", accent: "German" },
  { id: "giovanni", label: "Giovanni", accent: "Italian" },
  { id: "rafael", label: "Rafael", accent: "Portuguese" },
] as const;

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
  { code: "vi", label: "Vietnamese" },
  { code: "he", label: "Hebrew" },
] as const;

const voiceIds = VOICES.map((v) => v.id) as [string, ...string[]];

export const topicInput = z.object({
  question: z.string().trim().min(5).max(300),
  probes: z.array(z.string().trim().min(1).max(200)).max(4).optional(),
});

export const createStudyInput = z.object({
  title: z.string().trim().min(3).max(120),
  goal: z.string().trim().min(10).max(1000),
  audience: z.string().trim().max(200).default(""),
  topics: z.array(topicInput).min(1).max(8),
  durationMinutes: z.coerce.number().int().min(2).max(30).default(5),
  voice: z.enum(voiceIds).default("jane"),
  keyterms: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  languageCodes: z.array(z.string().trim().min(2).max(5)).max(5).default([]),
  showLiveNotes: z.boolean().default(true),
});

export type CreateStudyInput = z.infer<typeof createStudyInput>;

export const turnInput = z.object({
  idx: z.number().int().min(0),
  role: z.enum(["user", "agent"]),
  text: z.string().min(1).max(5000),
  atMs: z.number().int().min(0),
  interrupted: z.boolean().default(false),
});

export const interviewEventInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session"), aaiSessionId: z.string().min(1) }),
  z.object({ type: z.literal("topic"), topicId: z.string().min(1) }),
]);

export const insightInput = z.object({
  theme: z.string().trim().min(1).max(80),
  quote: z.string().trim().min(1).max(600),
  note: z.string().trim().max(400).default(""),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).default("neutral"),
  topicId: z.string().nullable().optional(),
  turnIdx: z.number().int().min(0).nullable().optional(),
});

export const completeInput = z.object({
  durationSeconds: z.number().int().min(0),
  status: z.enum(["completed", "abandoned"]).default("completed"),
});
