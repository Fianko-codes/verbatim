import type { Study } from "@/db/schema";
import type { VoiceAgentSessionConfig } from "@/lib/voice/client";
import { interviewerGreeting, interviewerSystemPrompt, interviewerTools } from "@/lib/prompts";

/**
 * Build the inline `session.update` payload for a study.
 * Field names verified against
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration
 */
export function buildSessionConfig(study: Study): VoiceAgentSessionConfig {
  const keyterms = Array.from(new Set(["Verbatim", ...study.keyterms])).slice(0, 100);
  const transcriptionPrompt = `A user-research interview about ${study.title}. ${study.goal}`.slice(0, 1750);
  const input: Record<string, unknown> = {
    format: { encoding: "audio/pcm" },
    keyterms,
    transcription_prompt: transcriptionPrompt,
    // Turn detection is intentionally left on the adaptive defaults: setting
    // min/max_silence disables semantic end-of-turn detection for the session.
    turn_detection: { interrupt_response: true },
  };
  if (study.languageCodes.length) input.language_codes = study.languageCodes;

  return {
    system_prompt: interviewerSystemPrompt(study),
    greeting: interviewerGreeting(study),
    tools: interviewerTools(study.topics),
    input,
    output: { voice: study.voice, format: { encoding: "audio/pcm" } },
  };
}

/** Hard cap on the AssemblyAI session, with headroom for a graceful wrap-up. */
export function maxSessionSeconds(study: Study) {
  return Math.min(10800, study.durationMinutes * 60 + 180);
}
