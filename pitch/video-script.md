# Verbatim — pitch video script & storyboard

Target length: **3:45** (limit 5:00). Record at 1440×900 or 1920×1080, browser only, no slides except the two cards noted. Use a real microphone and headphones. Speak the participant lines naturally — the pauses are the point.

Narration is in **bold**; on-screen action in *italics*.

---

## 0:00 – 0:25 — The problem *(landing page hero on screen)*

**"The best way to understand your users is to talk to them. It's also the one thing that doesn't scale — a researcher can run maybe five interviews a day, so most teams settle for surveys.**

**AI interviewers exist. The problem is they interrupt you. You pause to think, and the bot decides you're done.**

**This is Verbatim: an AI interviewer that listens like a researcher, and hands you the write-up like one."**

## 0:25 – 0:40 — The setup *(scroll to "How it works", then click "Try a 3-minute interview")*

**"A researcher writes a discussion guide — three or four open questions and a goal. That's it. Participants get a link."**

*Intro page. Type a first name. Click Start.*

## 0:40 – 2:10 — The interview (the demo)

*Verbatim greets and asks question one. Answer naturally, ~20 seconds.* Suggested answer:

> "Last one that mattered was a roadmap review on Tuesday. I had Notion open and I was typing the whole time... *(pause ~1.5 s, look up)* ...and honestly I'm either present or I'm taking notes, never both."

*Point at the sidebar as the note appears.*

**"That note on the right — 'Present or taking notes, never both' — is my exact words. Verbatim writes it down as I talk, and it's already tagged to the question and the sentiment."**

*Verbatim asks a follow-up. Start answering, pause mid-sentence for a beat — Verbatim waits. Say:*

**"Notice it didn't jump in. That pause is semantic turn detection from AssemblyAI's Voice Agent API — it's deciding from what I said whether I'm done, not from a silence timer."**

*Then interrupt Verbatim mid-question:* "Actually, wait — can I go back to something?" *Verbatim stops and yields.*

**"And I can interrupt it, the way you would a person."**

*Answer question two briefly (~15 s), then say "I think that's everything." Verbatim thanks you and ends the session on its own.*

## 2:10 – 2:35 — The thank-you page

*Write-up appears: headline, summary, sentiment, key quotes.*

**"The moment it ends, the interview is written up — a headline, what stood out, and the quotes that matter. Every quote is verbatim; nothing is paraphrased."**

## 2:35 – 3:15 — The researcher's view *(click "See what the researcher sees")*

*Dashboard. Your interview is highlighted "you". Scroll to the synthesis.*

**"This is what the researcher sees. Five interviews, synthesised into ranked themes — 'three of five participants said this' — with the quotes as evidence."**

*Click "Hear it" on one of your quotes. Let 3–4 seconds of your own voice play.*

**"And this is the part I love: every quote from a real session is one click from the participant actually saying it. The stereo recording and per-turn timeline come straight from AssemblyAI's session history."**

*Open your interview's detail page briefly: transcript with notes inline.*

## 3:15 – 3:40 — How it's built *(architecture card from the deck, or the "Built on AssemblyAI" section of the landing page)*

**"One WebSocket to the Voice Agent API runs the whole conversation — speech recognition, the model, text-to-speech and turn-taking. The interviewer takes notes with client-side tool calls, so live notes cost nothing extra. LLM Gateway writes up each interview and synthesises the study. Session recordings give every quote a timestamp. Next.js on Vercel, and the API key never touches the browser."**

## 3:40 – 3:45 — Close *(landing page)*

**"Verbatim. User interviews at the scale of a survey — in their own words."**

---

## Recording checklist

- Seed the demo (`pnpm db:seed`) so the dashboard has the four sample interviews plus yours.
- Do one warm-up interview off-camera so the synthesis includes a real, audio-backed interview to click "Hear it" on.
- Headphones on. Chrome. Close other tabs that use the mic.
- Have the two "notice" lines ready — the pause and the interruption are the two things judges won't have seen work before.
- Export MP4, ≤5 minutes, 1080p.
