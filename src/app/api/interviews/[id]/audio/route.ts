import { NextResponse } from "next/server";
import { getVoiceAgentAudioUrl } from "@/lib/aai";
import { currentViewer, getReadableInterview } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Redirect to a fresh pre-signed URL for the session recording
 * (stereo OGG/Opus: left = participant, right = interviewer).
 * Pre-signed URLs expire quickly, so we never store them — always re-fetch.
 *
 * This is a participant's actual voice. It follows the study: private by
 * default and owner-only, public only for a published study, where the "Hear
 * it" button is the point. The pre-signed URL is minted only after that check.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getReadableInterview(id, await currentViewer());
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.interview.aaiSessionId) return NextResponse.json({ error: "No recording" }, { status: 404 });

  try {
    const url = await getVoiceAgentAudioUrl(access.interview.aaiSessionId);
    if (!url) return NextResponse.json({ error: "Recording not ready yet" }, { status: 404 });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[audio]", err);
    return NextResponse.json({ error: "Recording unavailable" }, { status: 502 });
  }
}
