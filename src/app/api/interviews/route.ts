import { and, count, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { mintVoiceAgentToken } from "@/lib/aai";
import { crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { PARTICIPANT_COOKIE, appendGrant, participantCookieOptions } from "@/lib/auth/participant";
import { SHOWCASE_MESSAGE, liveEnabled, liveInterviewsPerDay } from "@/lib/mode";
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
 *
 * Deliberately unauthenticated — a participant arrives on a share link with no
 * account. What the browser gets back is a signed, HTTP-only grant for this one
 * interview id, which the write endpoints then require. That is the whole of a
 * participant's "identity": proof they started this conversation, nothing more.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOriginRejected();
  if (!liveEnabled()) return NextResponse.json({ error: SHOWCASE_MESSAGE }, { status: 503 });

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const study = await getStudy(parsed.data.studyId);
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  // A public link must not be able to run up an unbounded bill.
  const cap = liveInterviewsPerDay();
  if (cap > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.isSample, false), gte(schema.interviews.startedAt, new Date(Date.now() - 86_400_000))));
    if (n >= cap) {
      return NextResponse.json(
        { error: "This deployment has reached today's limit on live interviews. Please try again tomorrow." },
        { status: 429 },
      );
    }
  }

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

  const jar = await cookies();
  jar.set(PARTICIPANT_COOKIE, appendGrant(jar.get(PARTICIPANT_COOKIE)?.value, id), participantCookieOptions());

  return NextResponse.json({
    interviewId: id,
    token,
    sessionConfig: buildSessionConfig(study),
    durationMinutes: study.durationMinutes,
    topics: study.topics,
    showLiveNotes: study.showLiveNotes,
  });
}
