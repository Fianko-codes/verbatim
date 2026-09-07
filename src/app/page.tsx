import Link from "next/link";
import { ArrowRight, AudioLines, MessageSquareQuote, Mic, Sparkles } from "lucide-react";
import { DEMO_STUDY_ID, REPO_URL } from "@/lib/constants";
import { Eyebrow, Wordmark, buttonClass } from "@/components/ui";

export default function Home() {
  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm">
          <Link href={`/s/${DEMO_STUDY_ID}`} className={`${buttonClass({ variant: "ghost", size: "sm" })} hidden sm:inline-flex`}>
            Researcher dashboard
          </Link>
          <Link href="/new" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Create a study
          </Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-14 pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
        <div className="animate-fade-up">
          <Eyebrow className="mb-5">AI-moderated user research</Eyebrow>
          <h1 className="font-display text-[56px] sm:text-[72px] leading-[0.98] tracking-tight text-ink">
            User interviews at the scale of a survey.
            <br />
            <span className="italic text-accent">In their own words.</span>
          </h1>
          <p className="mt-7 text-[18px] leading-relaxed text-ink-2 max-w-xl">
            Verbatim is an AI interviewer that runs real research conversations — it asks the follow-up, waits while
            you think, and never cuts you off. Every interview becomes themes, verbatim quotes and sentiment the
            moment it ends.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={`/i/${DEMO_STUDY_ID}`} className={buttonClass({ size: "lg" })}>
              <Mic className="w-4 h-4" /> Try a 3-minute interview
            </Link>
            <Link href={`/s/${DEMO_STUDY_ID}`} className={buttonClass({ variant: "secondary", size: "lg" })}>
              See the researcher&apos;s view <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted">Works in the browser with a microphone. Headphones recommended.</p>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <DemoPreview />
        </div>
      </section>

      <section className="border-t border-line bg-paper-2/60">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-10">
          <Step
            n="01"
            icon={<Sparkles className="w-4 h-4" />}
            title="Write the discussion guide"
            body="Three to six open questions and a research goal. Verbatim turns it into an interviewer with a plan — and the judgement to leave it."
          />
          <Step
            n="02"
            icon={<AudioLines className="w-4 h-4" />}
            title="Share a link, get real conversations"
            body="Participants talk, not type. Semantic turn detection means a pause to think is never mistaken for the end of an answer."
          />
          <Step
            n="03"
            icon={<MessageSquareQuote className="w-4 h-4" />}
            title="Read the synthesis, hear the evidence"
            body="Verbatim takes notes as people talk, in their exact words. When the study is done, themes are ranked by how many participants said them — and every quote plays back in the participant's own voice."
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <Eyebrow className="mb-6">Built on AssemblyAI</Eyebrow>
        <div className="grid md:grid-cols-3 gap-4">
          <Tech
            name="Voice Agent API"
            body="One WebSocket runs the whole interview: speech recognition, the conversational model, text-to-speech and semantic turn-taking. Client-side tools let the interviewer take verbatim notes, track the guide, and end gracefully."
          />
          <Tech
            name="LLM Gateway"
            body="The moment an interview ends, a second model writes it up. Across the study it synthesises ranked themes, tensions and recommendations — citing the interviewer's verbatim notes as evidence."
          />
          <Tech
            name="Session recordings"
            body="Every session comes back as a stereo recording with a per-turn timeline, so each quote in the report is one click from the participant actually saying it."
          />
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-[13px] text-muted">
          <span>Built for the AssemblyAI Voice Agent Hackathon · MIT licensed</span>
          <div className="flex items-center gap-4">
            <a className="hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="hover:text-ink" href="https://www.assemblyai.com/docs/voice-agents/voice-agent-api" target="_blank" rel="noreferrer">
              Voice Agent API docs
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-3 text-muted">
        <span className="font-mono text-[12px]">{n}</span>
        <span className="w-7 h-7 rounded-full bg-white border border-line grid place-items-center text-ink">{icon}</span>
      </div>
      <h3 className="mt-4 font-display text-[26px] leading-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

function Tech({ name, body }: { name: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="text-[13px] font-semibold">{name}</div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

/** A static, illustrative snapshot of an interview in progress. */
function DemoPreview() {
  return (
    <div className="card p-5 sm:p-6 relative overflow-hidden">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-blink" /> Live interview
        </span>
        <span className="font-mono">02:14</span>
      </div>
      <div className="mt-6 flex items-center gap-5">
        <div className="w-16 h-16 shrink-0">
          <div className="orb idle" style={{ ["--level" as string]: 0.35 }} />
        </div>
        <p className="font-display text-[22px] leading-snug text-ink">
          You said the notes end up in three places. Which one do people actually go back to?
        </p>
      </div>
      <div className="mt-5 rounded-2xl bg-paper-2 px-4 py-3 text-[14px] text-ink-2 leading-relaxed">
        <span className="text-muted">You:</span> Honestly, none of them. The Notion doc is where decisions go to die.
        People just ask me in Slack a week later…
      </div>
      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">Live notes</div>
        <div className="space-y-2">
          <Note theme="Notes go to die" quote="The Notion doc is where decisions go to die" sentiment="negative" />
          <Note theme="Slack as the real record" quote="People just ask me in Slack a week later" sentiment="mixed" />
        </div>
      </div>
      <div className="pointer-events-none absolute -right-16 -bottom-16 w-48 h-48 rounded-full bg-accent-soft blur-3xl" />
    </div>
  );
}

function Note({ theme, quote, sentiment }: { theme: string; quote: string; sentiment: "negative" | "mixed" }) {
  const color = sentiment === "negative" ? "bg-neg" : "bg-mixed";
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-2.5 animate-pop">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className={`w-1.5 h-1.5 rounded-full ${color}`} /> {theme}
      </div>
      <div className="mt-1 text-[13px] text-ink-2">“{quote}”</div>
    </div>
  );
}
