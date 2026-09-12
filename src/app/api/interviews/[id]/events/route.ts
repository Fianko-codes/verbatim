import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { authorizeInterviewWrite, crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { interviewEventInput } from "@/lib/validation";

/** Small state updates from the live interview page (session id, topic coverage). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return crossOriginRejected();
  const { id } = await ctx.params;

  const auth = await authorizeInterviewWrite(id);
  if (!auth.ok) return auth.response;
  const { interview } = auth;

  const parsed = interviewEventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

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
