/**
 * Live vs showcase.
 *
 * Live interviews spend AssemblyAI credit by the minute, so a deployment only
 * runs them when it has a key. Without one, Verbatim runs as a showcase: the
 * public demo dashboard, and a replay of a sample interview in the real
 * interview room. Nothing in showcase mode calls an external API, so it can be
 * hosted for free indefinitely.
 *
 *   ASSEMBLYAI_API_KEY unset      → showcase
 *   ASSEMBLYAI_API_KEY set        → live
 *   VERBATIM_LIVE=0 (with a key)  → showcase anyway
 */
export function liveEnabled(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY) && process.env.VERBATIM_LIVE !== "0";
}

/**
 * Upper bound on live interviews started across the whole deployment in any
 * rolling 24 hours, so a public link can't run up an unbounded bill.
 * 0 disables the cap.
 */
export function liveInterviewsPerDay(): number {
  const raw = Number(process.env.LIVE_INTERVIEWS_PER_DAY ?? 20);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 20;
}

export const SHOWCASE_MESSAGE =
  "Live voice interviews are switched off on this deployment, because each one costs API credit by the minute.";
