import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { authorizeInterviewWrite, crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { getStudy } from "@/lib/queries";
import { insightInput } from "@/lib/validation";

/**
 * Persist a note the interviewer took mid-conversation (the `capture_insight`
 * client-side tool). The quote is re-checked against the participant's actual
 * words on the client before it gets here.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return crossOriginRejected();
  const { id } = await ctx.params;

  const auth = await authorizeInterviewWrite(id);
  if (!auth.ok) return auth.response;
  const { interview } = auth;

  const parsed = insightInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid insight" }, { status: 400 });

  const study = await getStudy(interview.studyId);
  const validTopics = new Set(study?.topics.map((t) => t.id) ?? []);

  const i = parsed.data;
  const row = {
    id: nanoid(12),
    interviewId: id,
    // Taken from the interview row, never from the request, so a note cannot be
    // filed against a study the participant was not talking to.
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
