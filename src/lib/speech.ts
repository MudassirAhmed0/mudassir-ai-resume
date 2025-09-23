let synth: SpeechSynthesis | null = null;
let current: SpeechSynthesisUtterance | null = null;

function ensureSynth() {
  if (typeof window === "undefined") return null;
  if (!synth) synth = window.speechSynthesis;
  return synth;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function voicesReady(): Promise<void> {
  const s = ensureSynth();
  if (!s) return;
  const existing = s.getVoices();
  if (existing && existing.length) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 300);
    s.onvoiceschanged = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

/**
 * Speak text with Web Speech API.
 * - Cancels previous first.
 * - Defaults: rate ≈ 1.02, pitch 1, lang "en-US".
 * - Calls onStart/onEnd hooks.
 */
export async function speak(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  opts?: { rate?: number; pitch?: number; lang?: string }
) {
  if (typeof window === "undefined") return;
  const s = ensureSynth();
  if (!s || !text?.trim()) return;

  // Cancel any ongoing speech
  try {
    if (s.speaking || s.paused) s.cancel();
  } catch {}

  // Small delay helps Chrome after cancel()
  await sleep(80);
  await voicesReady();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts?.rate ?? 1.02;
  u.pitch = opts?.pitch ?? 1;
  u.lang = opts?.lang ?? "en-US";

  // Optional: prefer an en-US voice if available
  try {
    const v = s
      .getVoices()
      .find((v) => (opts?.lang ?? "en-US").startsWith(v.lang));
    if (v) u.voice = v;
  } catch {}

  u.onstart = () => onStart?.();
  const done = () => {
    current = null;
    onEnd?.();
  };
  u.onend = done;
  u.onerror = done;

  current = u;
  s.speak(u);
}

/** Cancel any current speech immediately. */
export function cancelSpeech() {
  if (typeof window === "undefined") return;
  const s = ensureSynth();
  try {
    if (s && (s.speaking || s.paused)) s.cancel();
  } finally {
    current = null;
  }
}

/** Returns true while the synthesizer is speaking. */
export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  const s = ensureSynth();
  return !!s?.speaking;
}
