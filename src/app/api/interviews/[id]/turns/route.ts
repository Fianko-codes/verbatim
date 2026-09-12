import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { authorizeInterviewWrite, crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { turnExists } from "@/lib/queries";
import { turnInput } from "@/lib/validation";

/** Persist a finished transcript turn as it happens, so nothing is lost if the tab dies. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return crossOriginRejected();
  const { id } = await ctx.params;

  const auth = await authorizeInterviewWrite(id);
  if (!auth.ok) return auth.response;

  const parsed = turnInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid turn" }, { status: 400 });
  const turn = parsed.data;

  if (!(await turnExists(id, turn.idx))) {
    await db.insert(schema.turns).values({
      id: nanoid(12),
      interviewId: id,
      idx: turn.idx,
      role: turn.role,
      text: turn.text,
      atMs: turn.atMs,
      interrupted: turn.interrupted,
    });
  }
  return NextResponse.json({ ok: true });
}
