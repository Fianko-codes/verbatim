import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { mintVoiceAgentToken } from "@/lib/aai";
import { getStudy } from "@/lib/queries";
import { buildSessionConfig, maxSessionSeconds } from "@/lib/session-config";

const input = z.object({
  studyId: z.string().min(1),
  participantLabel: z.string().trim().max(60).optional(),
});

/**
 * Start an interview: create the row, mint a single-use Voice Agent token, and
 * hand the browser the session config to forward as `session.update`.
 * The API key never leaves the server.
 */
export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const study = await getStudy(parsed.data.studyId);
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  let token: string;
  try {
    token = await mintVoiceAgentToken({ maxSessionSeconds: maxSessionSeconds(study) });
  } catch (err) {
    console.error("[interviews] token mint failed", err);
    return NextResponse.json({ error: "Could not start a voice session. Please try again." }, { status: 502 });
  }

  const id = nanoid(12);
  await db.insert(schema.interviews).values({
    id,
    studyId: study.id,
    participantLabel: parsed.data.participantLabel || null,
    status: "in_progress",
    startedAt: new Date(),
  });

  return NextResponse.json({
    interviewId: id,
    token,
    sessionConfig: buildSessionConfig(study),
    durationMinutes: study.durationMinutes,
    topics: study.topics,
    showLiveNotes: study.showLiveNotes,
  });
}
