# lablab.ai submission copy

**Project name:** Verbatim

**Tagline (≤ 100 chars):** AI-moderated user interviews at the scale of a survey — in the participant's own words.

**Short description (≤ 300 chars):**
Verbatim runs real research interviews by voice. Write a discussion guide, share a link; an AI interviewer asks follow-ups and never cuts people off. Every interview is written up instantly and synthesised into ranked themes with verbatim quotes you can hear.

**Long description:**

Moderated user interviews are the highest-signal research method a product team has, and the least scalable — a researcher can run a handful a day, so most teams fall back to surveys. The AI interviewers people have tried share a flaw: they interrupt. A pause to think looks like the end of an answer to a silence timer.

Verbatim is built on AssemblyAI's Voice Agent API, whose semantic turn detection decides from *what you said* whether you're finished. The result is a conversation that feels like talking to a good researcher: it opens each topic, asks a concrete follow-up about what you actually said, waits while you think, and yields when you interrupt.

**For researchers:** write a title, a research goal and 3–6 open questions; get a participant link. The dashboard fills in live as people talk. Each interview gets an instant write-up (headline, summary, sentiment, key quotes, pain points, wants). One click synthesises the whole study into ranked themes — "3 of 5 participants" — with cited verbatim quotes, tensions, recommendations, and questions for the next round. Every quote from a real session has a **Hear it** button that plays the moment the participant said it.

**For participants:** a short intro, then a natural voice conversation with live captions. In demo mode they can watch the interviewer take notes in their exact words.

**How AssemblyAI is used**
- **Voice Agent API** — one WebSocket for STT, the conversational model, TTS and turn-taking, configured per study (`system_prompt` from the guide, `keyterms`, `transcription_prompt`, `language_codes`, voice). Client-side tools `capture_insight`, `mark_topic_complete` and `end_interview` run in hold mode; `reply.create` wraps the interview up when time is up. Single-use tokens keep the key server-side; `session.end` on hang-up and `pagehide`.
- **LLM Gateway** — one call per interview for the write-up, one per synthesis (schema-validated, quotes cited by code so nothing is fabricated).
- **Session history** — the stereo recording + per-turn timeline power quote playback.

**Stack:** Next.js (App Router) · TypeScript · Tailwind · Drizzle + libSQL/Turso · Vercel · raw WebSocket + AudioWorklet (24 kHz PCM, resampled per browser).

**What's next:** phone participation via Twilio SIP and stored agents; analyst "whispers" suggesting probes mid-conversation; team workspaces and exports to Notion/Dovetail.

**Links:**
- Live demo: `<VERCEL_URL>` — click *Try a 3-minute interview*
- Repo (MIT): `<GITHUB_URL>`
- Video: `<VIDEO_URL>`
- Deck: `pitch/deck.pdf`

**Technologies tags:** AssemblyAI, Voice Agent API, LLM Gateway, Next.js, TypeScript, Vercel, Turso
