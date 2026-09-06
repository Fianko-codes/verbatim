import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getInterview, turnExists } from "@/lib/queries";
import { turnInput } from "@/lib/validation";

/** Persist a finished transcript turn as it happens, so nothing is lost if the tab dies. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = turnInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid turn" }, { status: 400 });

  const interview = await getInterview(id);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
