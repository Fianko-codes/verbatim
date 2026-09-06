import { NextResponse } from "next/server";
import { getVoiceAgentTimeline } from "@/lib/aai";
import { getInterview } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Per-turn timestamps from the AssemblyAI session timeline, normalised to
 * seconds from the start of the recording so the dashboard can seek to a quote.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const interview = await getInterview(id);
  if (!interview?.aaiSessionId) return NextResponse.json({ turns: [] });
  try {
    const tl = await getVoiceAgentTimeline(interview.aaiSessionId);
    if (!tl) return NextResponse.json({ turns: [] });
    const t0 = tl.started_at_unix_ms;
    const turns = tl.turns
      .filter((t) => t.user_transcript && t.user_speech_started_at_ms)
      .map((t) => ({
        text: t.user_transcript as string,
        start: Math.max(0, ((t.user_speech_started_at_ms as number) - t0) / 1000),
        end: t.user_speech_ended_at_ms ? (t.user_speech_ended_at_ms - t0) / 1000 : null,
      }));
    return NextResponse.json({ turns });
  } catch (err) {
    console.error("[timeline]", err);
    return NextResponse.json({ turns: [] });
  }
}
