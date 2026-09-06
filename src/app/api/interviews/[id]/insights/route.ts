import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getInterview, getStudy } from "@/lib/queries";
import { insightInput } from "@/lib/validation";

/**
 * Persist a note the interviewer took mid-conversation (the `capture_insight`
 * client-side tool). The quote is re-checked against the participant's actual
 * words on the client before it gets here.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = insightInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid insight" }, { status: 400 });

  const interview = await getInterview(id);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const study = await getStudy(interview.studyId);
  const validTopics = new Set(study?.topics.map((t) => t.id) ?? []);

  const i = parsed.data;
  const row = {
    id: nanoid(12),
    interviewId: id,
    studyId: interview.studyId,
    topicId: i.topicId && validTopics.has(i.topicId) ? i.topicId : null,
    theme: i.theme,
    quote: i.quote,
    note: i.note,
    sentiment: i.sentiment,
    turnIdx: i.turnIdx ?? null,
    createdAt: new Date(),
  };
  await db.insert(schema.insights).values(row);
  return NextResponse.json({ insight: row }, { status: 201 });
}
