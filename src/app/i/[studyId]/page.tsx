import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStudy } from "@/lib/queries";
import { InterviewRoom } from "./interview-room";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { studyId } = await params;
  const study = await getStudy(studyId);
  return { title: study ? `Interview · ${study.title}` : "Interview" };
}

export default async function InterviewPage({ params }: Props) {
  const { studyId } = await params;
  const study = await getStudy(studyId);
  if (!study) notFound();
  return (
    <InterviewRoom
      study={{
        id: study.id,
        title: study.title,
        goal: study.goal,
        topics: study.topics,
        durationMinutes: study.durationMinutes,
        showLiveNotes: study.showLiveNotes,
        isDemo: study.isDemo,
      }}
    />
  );
}
