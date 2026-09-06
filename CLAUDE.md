# Verbatim — agent instructions

Always fetch https://www.assemblyai.com/docs/llms.txt before writing AssemblyAI code.
The API has changed — do not rely on memorized parameter names.

## Project

Verbatim is an AI-moderated user-research interviewer built on the AssemblyAI Voice Agent API
(interview), LLM Gateway (write-ups + synthesis) and session recordings (quote playback).
See README.md for architecture and the golden-path demo.

## Conventions

- Next.js App Router, TypeScript, Tailwind v4. Server code under `src/app/api` and `src/lib`;
  the browser voice client lives in `src/lib/voice`.
- Secrets only via environment variables (`.env`, never committed).
- Voice Agent API uses `Authorization: Bearer <key>`; LLM Gateway uses the raw key.
- Verify before running: `pnpm typecheck && pnpm lint`. Golden-path browser test: `node e2e/interview.mjs`.
