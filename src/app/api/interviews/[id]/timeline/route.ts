import { NextResponse } from "next/server";
import { VoiceAgentSessionNotFound, getVoiceAgentTimeline } from "@/lib/aai";
import { currentViewer, getReadableInterview } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Per-turn timestamps from the AssemblyAI session timeline, normalised to
 * seconds from the start of the recording so the dashboard can seek to a quote.
 *
 * The payload carries the participant's transcript, so it follows the same rule
 * as the recording: owner-only unless the study is published.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getReadableInterview(id, await currentViewer());
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.interview.aaiSessionId) return NextResponse.json({ turns: [] });

  try {
    const tl = await getVoiceAgentTimeline(access.interview.aaiSessionId);
    if (!tl) return NextResponse.json({ turns: [] });
    const t0 = tl.started_at_unix_ms;
    // `!= null`, not truthiness: a turn that starts at exactly 0 ms is valid.
    const turns = tl.turns
      .filter((t) => t.user_transcript && t.user_speech_started_at_ms != null)
      .map((t) => ({
        text: t.user_transcript as string,
        start: Math.max(0, ((t.user_speech_started_at_ms as number) - t0) / 1000),
        end: t.user_speech_ended_at_ms != null ? (t.user_speech_ended_at_ms - t0) / 1000 : null,
      }));
    return NextResponse.json({ turns });
  } catch (err) {
    if (err instanceof VoiceAgentSessionNotFound) console.warn("[timeline]", err.message);
    else console.error("[timeline]", err);
    return NextResponse.json({ turns: [] });
  }
}
