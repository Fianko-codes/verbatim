import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { summarizeInterview } from "@/lib/analyst";
import { getInterview, getStudy } from "@/lib/queries";
import { completeInput } from "@/lib/validation";

export const maxDuration = 60;

/** Mark the interview finished and produce the post-interview summary. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = completeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const interview = await getInterview(id);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.status === "completed" && interview.summary) {
    return NextResponse.json({ summary: interview.summary, status: interview.status });
  }

  const [study, turns, insights] = await Promise.all([
    getStudy(interview.studyId),
    db.select().from(schema.turns).where(eq(schema.turns.interviewId, id)).orderBy(asc(schema.turns.idx)),
    db.select().from(schema.insights).where(eq(schema.insights.interviewId, id)),
  ]);
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  const userTurns = turns.filter((t) => t.role === "user");
  // Too little said to be worth a summary: record as abandoned so it doesn't pollute the study.
  const status = parsed.data.status === "abandoned" || userTurns.length === 0 ? "abandoned" : "completed";

  let summary = null;
  if (status === "completed") {
    try {
      summary = await summarizeInterview({ study, turns, insights });
    } catch (err) {
      console.error("[complete] summary failed", err);
    }
  }

  await db
    .update(schema.interviews)
    .set({ status, endedAt: new Date(), durationSeconds: parsed.data.durationSeconds, summary })
    .where(eq(schema.interviews.id, id));

  return NextResponse.json({ summary, status });
}
