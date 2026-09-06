import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInterviewDetail } from "@/lib/queries";
import { InterviewDetail } from "./interview-detail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string; interviewId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { interviewId } = await params;
  const d = await getInterviewDetail(interviewId);
  return { title: d ? `${d.interview.participantLabel || "Participant"} · ${d.study.title}` : "Interview" };
}

export default async function InterviewDetailPage({ params }: Props) {
  const { studyId, interviewId } = await params;
  const d = await getInterviewDetail(interviewId);
  if (!d || d.study.id !== studyId) notFound();
  return <InterviewDetail data={JSON.parse(JSON.stringify(d))} />;
}
