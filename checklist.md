# checklist.md — Phase-2 (voice-first) MVP

## A. Model contract (`/api/chat`)

- [ ] Returns **both tracks** per turn:

  ```json
  {
    "say": "hey—got it. give me 5 sec…",
    "show": "Got it. I’ll review the repo and summarize in a few minutes."
  }
  ```

- [ ] say = short, casual, spoken style; no markdown; includes natural pauses (commas/ellipses).

- [ ] show = clean chat text; may include markdown/links.

- [ ] If OOS (out-of-scope), say includes a brief redirect; show contains the full policy line.

- [ ] API never leaks secrets; validates input; returns 400 on malformed; 5xx on upstream errors.

## B. ElevenLabs TTS integration

- [ ] Server-side proxy endpoint /api/tts (POST { text, voiceId? }) calls ElevenLabs (free tier).

- [ ] Reads ELEVENLABS_API_KEY only server-side; not exposed to client.

- [ ] Supports streamed audio (prefer) or buffered; content-type audio/mpeg.

- [ ] Startup latency to first audio < 1200 ms p95 on fast network.

- [ ] Configurable default voice; override by voiceId.

- [ ] Rate/pitch controls (if supported) or documented as N/A.

## C. Playback, queueing, cancel (client)

- [ ] Queue: FIFO of say items; only one plays at a time.

- [ ] Cancel: Cancel() stops current audio, clears queue, and resets avatar state.

- [ ] Barge-in: new user speech or Send → auto-cancel current playback.

- [ ] Fallback: if ElevenLabs fails/timeouts (>2s) → speak via Web Speech (speechSynthesis) with our pronunciation rules.

- [ ] Resilience: network error shows toast + still renders show bubble.

## D. Avatar driven by audio energy

- [ ] Uses AudioContext + AnalyserNode on the playing audio.

- [ ] Computes RMS/peak ~60fps; maps to CSS var --vu (0..1).

- [ ] Avatar pulse/scale/border-glow is bound to --vu; silent frames decay smoothly.

- [ ] When paused/stopped, avatar returns to idle within 200ms.

## E. UI behavior

- [ ] Bubble renders show; timestamp + scope chip on OOS: “professional topics only”.

- [ ] While audio plays: typing disabled mic? (configurable) default: mic enabled; barge-in cancels.

- [ ] “Stop” button visible during playback; ESC also cancels.

- [ ] If fallback Web Speech is active, UI still drives avatar using a synthetic analyser node (gain from onboundary or timer).

## F. Web Speech fallback (client)

- [ ] speechSynthesis wrapper with: rate ~1.28, en-IN/en-GB/en-US voice pick (in that order).

- [ ] Pronunciation substitutions for “Mudassir Ahmed” applied before speaking.

- [ ] Waits for voiceschanged before first speak (no wrong first-voice issue).

## G. Mic & STT (existing)

- [ ] Webkit STT runs in continuous mode or debounced onend (≥1200ms) to avoid breath-submit.

- [ ] Interim results stream into input; final submit triggers send + cancels current TTS.

## H. Performance & UX

- [ ] First audible audio < 1.2s p95; gaps between sentences < 250ms.

- [ ] No overlapping audio; queue depth visible in logs (dev).

- [ ] Memory/handles cleaned on route change/unmount.

## I. Security & config

- [ ] ELEVENLABS_API_KEY and voice IDs are server-only; never sent to client.

- [ ] Rate-limit /api/tts to prevent abuse; validate text length.

- [ ] Graceful 429 handling from ElevenLabs (toast + fallback).

## J. Tests / Demos

- [ ] Happy path: ask → say plays via ElevenLabs; show renders.

- [ ] Force ElevenLabs error (kill key) → fallback Web Speech kicks in.

- [ ] While speaking, start talking (STT) → TTS cancels (barge-in), new turn begins.

- [ ] Cancel button stops audio immediately; avatar returns to idle.

- [ ] OOS question → scope chip appears; say gives short redirect.

- [ ] Energy-driven avatar visibly reacts to voice amplitude.

Done = All boxes checked in dev + recorded screen demo showing: ElevenLabs voice playback, cancel, fallback, avatar anim from analyser, and OOS chip.
