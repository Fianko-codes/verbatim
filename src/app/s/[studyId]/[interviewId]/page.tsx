import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentViewer, getReadableInterview } from "@/lib/auth/guards";
import { getInterviewDetail } from "@/lib/queries";
import { InterviewDetail } from "./interview-detail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string; interviewId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { interviewId } = await params;
  const access = await getReadableInterview(interviewId, await currentViewer());
  return {
    title: access ? `${access.interview.participantLabel || "Participant"} · ${access.study.title}` : "Interview",
  };
}

export default async function InterviewDetailPage({ params }: Props) {
  const { studyId, interviewId } = await params;
  const viewer = await currentViewer();

  // One query settles all three questions: the interview exists, it belongs to
  // the study in the URL, and the viewer may read it (owner, or published).
  const access = await getReadableInterview(interviewId, viewer);
  if (!access || access.study.id !== studyId) {
    if (!viewer) redirect(`/signin?next=${encodeURIComponent(`/s/${studyId}/${interviewId}`)}`);
    notFound();
  }

  const d = await getInterviewDetail(interviewId);
  if (!d) notFound();
  return <InterviewDetail data={JSON.parse(JSON.stringify(d))} viewer={viewer} />;
}
