let synth: SpeechSynthesis | null = null;
let current: SpeechSynthesisUtterance | null = null;

/**
 * Speaks text using the Web Speech API.
 * - Cancels any ongoing speech before starting.
 * - Default rate ≈1.02, pitch 1, lang "en-US".
 * - Calls onStart/onEnd at appropriate times.
 */
export function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined") return; // noop on server
  if (!synth) synth = window.speechSynthesis;

  // cancel any ongoing speech
  try {
    if (synth && synth.speaking) synth.cancel();
  } catch {
    /* ignore */
  }

  if (!text?.trim()) return;

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  u.lang = "en-US";

  u.onstart = () => onStart?.();
  const cleanup = () => {
    current = null;
    onEnd?.();
  };
  u.onend = cleanup;
  u.onerror = cleanup;

  current = u;
  synth!.speak(u);
}

/** Cancel any current speech immediately. */
export function cancelSpeech() {
  if (typeof window === "undefined") return;
  if (!synth) synth = window.speechSynthesis;
  try {
    if (synth && (synth.speaking || synth.paused)) synth.cancel();
  } finally {
    current = null;
  }
}

/** Returns true while the synthesizer is speaking. */
export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  if (!synth) synth = window.speechSynthesis;
  return !!synth?.speaking;
}
