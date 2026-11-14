import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { SHOWCASE_MESSAGE, liveEnabled } from "@/lib/mode";
import { getStudy } from "@/lib/queries";
import { Wordmark, buttonClass } from "@/components/ui";
import { InterviewRoom } from "./interview-room";
import { SampleReplay, type ReplaySample } from "./sample-replay";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ studyId: string }>; searchParams: Promise<{ sample?: string }> };

/** Daniel's write-up survived in full, so his interview is the default replay. */
const DEFAULT_SAMPLE = "Daniel";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { studyId } = await params;
  const study = await getStudy(studyId);
  return { title: study ? `Interview · ${study.title}` : "Interview" };
}

export default async function InterviewPage({ params, searchParams }: Props) {
  const { studyId } = await params;
  const study = await getStudy(studyId);
  if (!study) notFound();

  const view = {
    id: study.id,
    title: study.title,
    goal: study.goal,
    topics: study.topics,
    durationMinutes: study.durationMinutes,
    showLiveNotes: study.showLiveNotes,
    isDemo: study.isDemo,
  };

  if (liveEnabled()) return <InterviewRoom study={view} />;

  // Showcase: the demo study replays a sample interview; any other study can't run.
  if (!study.isDemo) return <ShowcaseClosed />;

  const samples = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.studyId, study.id), eq(schema.interviews.isSample, true)))
    .orderBy(asc(schema.interviews.startedAt));
  if (samples.length === 0) return <ShowcaseClosed />;

  const { sample: wanted } = await searchParams;
  const chosen =
    samples.find((s) => s.participantLabel === wanted) ??
    samples.find((s) => s.participantLabel === DEFAULT_SAMPLE) ??
    samples[0];

  const [turns, insights] = await Promise.all([
    db.select().from(schema.turns).where(eq(schema.turns.interviewId, chosen.id)).orderBy(asc(schema.turns.idx)),
    db.select().from(schema.insights).where(eq(schema.insights.interviewId, chosen.id)).orderBy(asc(schema.insights.createdAt)),
  ]);

  const sample: ReplaySample = {
    interviewId: chosen.id,
    label: chosen.participantLabel ?? "Participant",
    turns: turns.map((t) => ({ idx: t.idx, role: t.role, text: t.text })),
    insights: insights.map((i) => ({
      id: i.id,
      theme: i.theme,
      quote: i.quote,
      note: i.note,
      sentiment: i.sentiment,
      topicId: i.topicId,
      turnIdx: i.turnIdx,
    })),
    summary: chosen.summary,
  };
  const others = samples.map((s) => s.participantLabel ?? "Participant").filter((l) => l !== sample.label);

  return <SampleReplay study={view} sample={sample} others={others} />;
}

function ShowcaseClosed() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-6 max-w-5xl mx-auto w-full">
        <Wordmark />
      </header>
      <section className="flex-1 grid place-items-center px-6 pb-16">
        <div className="w-full max-w-lg animate-fade-up">
          <h1 className="font-display text-[36px] sm:text-[44px] leading-[1.05] tracking-tight">Interviews are paused here.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            {SHOWCASE_MESSAGE} You can still watch a sample interview and open the researcher&apos;s dashboard.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/i/demo" className={buttonClass({ size: "lg" })}>
              Watch a sample interview
            </Link>
            <Link href="/s/demo" className={buttonClass({ variant: "secondary", size: "lg" })}>
              See the researcher&apos;s view
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
