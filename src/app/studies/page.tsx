import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mic, Plus, Radio } from "lucide-react";
import { requireViewer } from "@/lib/auth/guards";
import { listStudiesForResearcher } from "@/lib/queries";
import { ResearcherNav } from "@/components/researcher-nav";
import { Eyebrow, Wordmark, buttonClass, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your studies" };

export default async function StudiesPage() {
  const viewer = await requireViewer("/studies");
  const rows = await listStudiesForResearcher(viewer.id);

  return (
    <main className="flex-1">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link href="/new" className={buttonClass({ size: "sm" })}>
            <Plus className="w-3.5 h-3.5" /> New study
          </Link>
          <ResearcherNav viewer={viewer} />
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <Eyebrow>Your studies</Eyebrow>
        <h1 className="mt-2 font-display text-[36px] sm:text-[44px] leading-[1.02] tracking-tight">
          {rows.length === 0 ? "Nothing here yet." : `${rows.length} ${rows.length === 1 ? "study" : "studies"}`}
        </h1>

        {rows.length === 0 ? (
          <div className="card mt-8 p-8 text-center">
            <p className="text-[15px] text-ink-2 max-w-md mx-auto">
              A study is a discussion guide and a share link. Write three to six open questions and Verbatim will run
              the conversations for you.
            </p>
            <Link href="/new" className={`${buttonClass({ size: "lg" })} mt-6`}>
              Create your first study <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {rows.map(({ study, completed, live }) => (
              <Link key={study.id} href={`/s/${study.id}`} className="card p-5 block hover:border-ink/25 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-[24px] leading-tight min-w-0 truncate">{study.title}</h2>
                      {live > 0 && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-accent">
                          <Radio className="w-3 h-3 animate-blink" /> {live} live
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2 line-clamp-2">{study.goal}</p>
                    <div className="mt-2.5 text-[12.5px] text-muted">
                      {completed} {completed === 1 ? "interview" : "interviews"} · {study.durationMinutes} min ·
                      created {timeAgo(study.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-muted">
                    <Mic className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
