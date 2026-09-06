import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { synthesizeStudy } from "@/lib/analyst";
import { getStudyBundle } from "@/lib/queries";

export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bundle = await getStudyBundle(id);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const completed = bundle.interviews.filter((i) => i.status === "completed" && i.summary);
  if (completed.length === 0) {
    return NextResponse.json({ error: "No completed interviews to synthesise yet" }, { status: 409 });
  }
  try {
    const content = await synthesizeStudy({ study: bundle.study, interviews: completed });
    const row = { id: nanoid(12), studyId: id, interviewCount: completed.length, content, createdAt: new Date() };
    await db.insert(schema.syntheses).values(row);
    return NextResponse.json(row);
  } catch (err) {
    console.error("[synthesize]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Synthesis failed" }, { status: 502 });
  }
}
