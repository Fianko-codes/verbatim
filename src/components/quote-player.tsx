"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type TimelineTurn = { text: string; start: number; end: number | null };

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the participant turn a quote came from, by containment then by word overlap. */
function locate(turns: TimelineTurn[], quote: string): TimelineTurn | null {
  const q = norm(quote);
  if (!q) return null;
  const exact = turns.find((t) => norm(t.text).includes(q));
  if (exact) return exact;
  const words = new Set(q.split(" ").filter((w) => w.length > 3));
  let best: TimelineTurn | null = null;
  let bestScore = 0;
  for (const t of turns) {
    const tw = norm(t.text).split(" ");
    const score = tw.filter((w) => words.has(w)).length / Math.max(1, words.size);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * Plays the exact moment a participant said a quote, using the AssemblyAI
 * session recording + timeline. One shared audio element per interview.
 */
export function useQuotePlayer() {
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const timelines = useRef(new Map<string, Promise<TimelineTurn[]>>());
  const stopAt = useRef<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const key = (interviewId: string, quote: string) => `${interviewId}::${quote}`;

  const stop = useCallback(() => {
    for (const a of audios.current.values()) a.pause();
    stopAt.current = null;
    setPlaying(null);
  }, []);

  const getTimeline = (interviewId: string) => {
    let p = timelines.current.get(interviewId);
    if (!p) {
      p = fetch(`/api/interviews/${interviewId}/timeline`)
        .then((r) => (r.ok ? r.json() : { turns: [] }))
        .then((d: { turns: TimelineTurn[] }) => d.turns ?? []);
      timelines.current.set(interviewId, p);
    }
    return p;
  };

  const getAudio = (interviewId: string) => {
    let a = audios.current.get(interviewId);
    if (!a) {
      a = new Audio(`/api/interviews/${interviewId}/audio`);
      a.preload = "auto";
      a.addEventListener("timeupdate", () => {
        if (stopAt.current != null && a!.currentTime >= stopAt.current) {
          a!.pause();
          stopAt.current = null;
          setPlaying(null);
        }
      });
      a.addEventListener("ended", () => setPlaying(null));
      a.addEventListener("pause", () => setPlaying((p) => (p && p.startsWith(interviewId) ? null : p)));
      audios.current.set(interviewId, a);
    }
    return a;
  };

  const play = useCallback(
    async (interviewId: string, quote: string) => {
      const k = key(interviewId, quote);
      if (playing === k) {
        stop();
        return;
      }
      stop();
      setLoading(k);
      try {
        const turns = await getTimeline(interviewId);
        const turn = locate(turns, quote);
        const a = getAudio(interviewId);
        const start = turn?.start ?? 0;
        // Play the whole turn (bounded) so the quote lands in context.
        const end = turn?.end != null ? Math.min(turn.end + 0.4, start + 25) : start + 12;
        stopAt.current = end;
        await new Promise<void>((resolve) => {
          const go = () => {
            a.currentTime = start;
            resolve();
          };
          if (a.readyState >= 1) go();
          else a.addEventListener("loadedmetadata", go, { once: true });
        });
        await a.play();
        setPlaying(k);
      } catch (err) {
        console.warn("quote playback failed", err);
        setPlaying(null);
      } finally {
        setLoading(null);
      }
    },
    [playing, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { play, stop, playing, loading, key };
}

export function PlayQuoteButton({
  interviewId,
  quote,
  player,
  className = "",
}: {
  interviewId: string;
  quote: string;
  player: ReturnType<typeof useQuotePlayer>;
  className?: string;
}) {
  const k = player.key(interviewId, quote);
  const active = player.playing === k;
  const busy = player.loading === k;
  return (
    <button
      type="button"
      onClick={() => player.play(interviewId, quote)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[12px] font-medium transition ${
        active ? "bg-accent text-white border-accent" : "bg-white border-line text-ink-2 hover:border-ink/30"
      } ${className}`}
      title="Hear the participant say this"
      aria-pressed={active}
    >
      {active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      {busy ? "Loading…" : active ? "Playing" : "Hear it"}
    </button>
  );
}
