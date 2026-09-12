import { NextResponse } from "next/server";
import { currentViewer, getReadableStudy } from "@/lib/auth/guards";
import { getStudyBundle } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * The dashboard's polling endpoint. Readable by the study's owner, or by anyone
 * if the study is published — the same rule the page itself uses, so a public
 * dashboard keeps updating live for a visitor with no account.
 *
 * A private study answers 404 whether or not it exists, so ids cannot be probed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getReadableStudy(id, await currentViewer());
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bundle = await getStudyBundle(id);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bundle);
}
