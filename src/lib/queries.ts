import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Insight, Interview, Study, SynthesisRow, Turn } from "@/db/schema";

export async function getStudy(id: string): Promise<Study | null> {
  const rows = await db.select().from(schema.studies).where(eq(schema.studies.id, id)).limit(1);
  return rows[0] ?? null;
}

export type StudyBundle = {
  study: Study;
  interviews: (Interview & { insights: Insight[] })[];
  synthesis: SynthesisRow | null;
};

/**
 * Interviews whose tab vanished never send `complete`. Anything still
 * "in progress" well past the study's length is marked abandoned so the
 * dashboard doesn't show ghosts under "Live now".
 */
async function sweepStaleInterviews(study: Study) {
  const cutoff = new Date(Date.now() - (study.durationMinutes + 5) * 60_000);
  await db
    .update(schema.interviews)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(
      and(
        eq(schema.interviews.studyId, study.id),
        eq(schema.interviews.status, "in_progress"),
        lt(schema.interviews.startedAt, cutoff),
      ),
    );
}

/** Everything the researcher dashboard needs in one shot. */
export async function getStudyBundle(id: string): Promise<StudyBundle | null> {
  const study = await getStudy(id);
  if (!study) return null;
  await sweepStaleInterviews(study);
  const [interviews, insights, syntheses] = await Promise.all([
    db.select().from(schema.interviews).where(eq(schema.interviews.studyId, id)).orderBy(desc(schema.interviews.startedAt)),
    db.select().from(schema.insights).where(eq(schema.insights.studyId, id)).orderBy(asc(schema.insights.createdAt)),
    db
      .select()
      .from(schema.syntheses)
      .where(eq(schema.syntheses.studyId, id))
      .orderBy(desc(schema.syntheses.createdAt))
      .limit(1),
  ]);
  const byInterview = new Map<string, Insight[]>();
  for (const i of insights) {
    const list = byInterview.get(i.interviewId) ?? [];
    list.push(i);
    byInterview.set(i.interviewId, list);
  }
  return {
    study,
    interviews: interviews.map((i) => ({ ...i, insights: byInterview.get(i.id) ?? [] })),
    synthesis: syntheses[0] ?? null,
  };
}

export async function getInterview(id: string): Promise<Interview | null> {
  const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getInterviewDetail(id: string): Promise<{
  interview: Interview;
  study: Study;
  turns: Turn[];
  insights: Insight[];
} | null> {
  const interview = await getInterview(id);
  if (!interview) return null;
  const [study, turns, insights] = await Promise.all([
    getStudy(interview.studyId),
    db.select().from(schema.turns).where(eq(schema.turns.interviewId, id)).orderBy(asc(schema.turns.idx)),
    db.select().from(schema.insights).where(eq(schema.insights.interviewId, id)).orderBy(asc(schema.insights.createdAt)),
  ]);
  if (!study) return null;
  return { interview, study, turns, insights };
}

export async function getRecentTurns(interviewId: string, limit = 8): Promise<Turn[]> {
  const rows = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.interviewId, interviewId))
    .orderBy(desc(schema.turns.idx))
    .limit(limit);
  return rows.reverse();
}

export async function getStudyThemes(studyId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ theme: schema.insights.theme })
    .from(schema.insights)
    .where(eq(schema.insights.studyId, studyId));
  return rows.map((r) => r.theme);
}

export async function turnExists(interviewId: string, idx: number) {
  const rows = await db
    .select({ id: schema.turns.id })
    .from(schema.turns)
    .where(and(eq(schema.turns.interviewId, interviewId), eq(schema.turns.idx, idx)))
    .limit(1);
  return rows.length > 0;
}
