import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getInterview } from "@/lib/queries";
import { interviewEventInput } from "@/lib/validation";

/** Small state updates from the live interview page (session id, topic coverage). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = interviewEventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const interview = await getInterview(id);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ev = parsed.data;
  if (ev.type === "session") {
    await db.update(schema.interviews).set({ aaiSessionId: ev.aaiSessionId }).where(eq(schema.interviews.id, id));
  } else if (ev.type === "topic") {
    const covered = Array.from(new Set([...interview.topicsCovered, ev.topicId]));
    await db.update(schema.interviews).set({ topicsCovered: covered }).where(eq(schema.interviews.id, id));
    return NextResponse.json({ ok: true, topicsCovered: covered });
  }
  return NextResponse.json({ ok: true });
}
