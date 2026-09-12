import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { crossOriginRejected, requireApiViewer, sameOrigin } from "@/lib/auth/guards";
import { createStudyInput } from "@/lib/validation";

/** Create a study owned by the signed-in researcher. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOriginRejected();
  const auth = await requireApiViewer();
  if (!auth.ok) return auth.response;

  const parsed = createStudyInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid study", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  const id = nanoid(10);
  await db.insert(schema.studies).values({
    id,
    researcherId: auth.viewer.id,
    title: input.title,
    goal: input.goal,
    audience: input.audience,
    topics: input.topics.map((t, i) => ({ id: `t${i + 1}`, question: t.question, probes: t.probes ?? [] })),
    durationMinutes: input.durationMinutes,
    voice: input.voice,
    keyterms: input.keyterms,
    languageCodes: input.languageCodes,
    showLiveNotes: input.showLiveNotes,
  });
  return NextResponse.json({ id }, { status: 201 });
}
