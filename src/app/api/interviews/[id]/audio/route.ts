import { NextResponse } from "next/server";
import { getVoiceAgentAudioUrl } from "@/lib/aai";
import { getInterview } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Redirect to a fresh pre-signed URL for the session recording
 * (stereo OGG/Opus: left = participant, right = interviewer).
 * Pre-signed URLs expire quickly, so we never store them — always re-fetch.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const interview = await getInterview(id);
  if (!interview?.aaiSessionId) return NextResponse.json({ error: "No recording" }, { status: 404 });
  try {
    const url = await getVoiceAgentAudioUrl(interview.aaiSessionId);
    if (!url) return NextResponse.json({ error: "Recording not ready yet" }, { status: 404 });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[audio]", err);
    return NextResponse.json({ error: "Recording unavailable" }, { status: 502 });
  }
}
