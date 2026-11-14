import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentViewer, getReadableStudy, requireReadableStudy } from "@/lib/auth/guards";
import { liveEnabled } from "@/lib/mode";
import { getStudyBundle } from "@/lib/queries";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string }>; searchParams: Promise<{ highlight?: string }> };

/**
 * Titles render before the page does, so this needs the same guard — otherwise
 * a private study's name would leak through the <title> of a 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { studyId } = await params;
  const access = await getReadableStudy(studyId, await currentViewer());
  return { title: access ? access.study.title : "Study" };
}

export default async function StudyPage({ params, searchParams }: Props) {
  const { studyId } = await params;
  const { highlight } = await searchParams;

  // Readable by the owner, or by anyone if the study is published. A private
  // study is a 404 for a signed-in stranger and a sign-in redirect for a
  // signed-out one, so the response never confirms that the id exists.
  const { viewer, isOwner } = await requireReadableStudy(studyId, `/s/${studyId}`);

  const bundle = await getStudyBundle(studyId);
  if (!bundle) notFound();
  return (
    <Dashboard
      initial={JSON.parse(JSON.stringify(bundle))}
      highlight={highlight ?? null}
      viewer={viewer}
      isOwner={isOwner}
      live={liveEnabled()}
    />
  );
}
