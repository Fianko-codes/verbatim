import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStudyBundle } from "@/lib/queries";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string }>; searchParams: Promise<{ highlight?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { studyId } = await params;
  const bundle = await getStudyBundle(studyId);
  return { title: bundle ? bundle.study.title : "Study" };
}

export default async function StudyPage({ params, searchParams }: Props) {
  const { studyId } = await params;
  const { highlight } = await searchParams;
  const bundle = await getStudyBundle(studyId);
  if (!bundle) notFound();
  return <Dashboard initial={JSON.parse(JSON.stringify(bundle))} highlight={highlight ?? null} />;
}
