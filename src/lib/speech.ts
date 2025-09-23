// src/lib/speech.ts
let synth: SpeechSynthesis | null = null;

export type SubRule = { pattern: RegExp; replace: string };

export type TTSOptions = {
  rate?: number; // 0.1 – 10 (default ~1.25)
  pitch?: number; // 0 – 2 (default 1)
  lang?: string; // e.g. "en-US", "en-IN"
  voiceName?: string; // exact match for SpeechSynthesisVoice.name
  voiceLangStartsWith?: string; // e.g. "en-IN" → prefer voices with that prefix
  substitutions?: SubRule[]; // replace text before speaking
};
export type SpeakOptions = {
  rate?: number; // 0.1–10
  pitch?: number; // 0–2
  lang?: string; // e.g. "en-IN", "en-US"
  voiceName?: string; // exact name match
  voiceLangStartsWith?: string; // <--- this must be here
  substitutions?: { pattern: RegExp; replace: string }[];
};

type TTSDefaults = Required<Pick<SpeakOptions, "rate" | "pitch" | "lang">> & {
  voiceName?: string;
  voiceLangStartsWith?: string;
  substitutions: SubRule[];
};

const DEFAULTS: TTSDefaults = {
  // Faster by default
  rate: 1.25,
  pitch: 1,
  lang: "en-US",
  voiceName: undefined,
  voiceLangStartsWith: undefined,
  // Built-in name fixes
  substitutions: [
    // Say “Moo-dus-sir Ah-med”
    { pattern: /\bMudassir Ahmed\b/gi, replace: "Moo-dus-sir Ah-med" },
    { pattern: /\bMudassir\b/gi, replace: "Moo-dus-sir" },
    { pattern: /\bAhmed\b/gi, replace: "Ah-med" },
  ],
};

export function configureTTS(prefs: Partial<TTSDefaults>) {
  if (prefs.rate != null) DEFAULTS.rate = prefs.rate;
  if (prefs.pitch != null) DEFAULTS.pitch = prefs.pitch;
  if (prefs.lang != null) DEFAULTS.lang = prefs.lang;
  if (prefs.voiceName !== undefined) DEFAULTS.voiceName = prefs.voiceName;
  if (prefs.voiceLangStartsWith !== undefined)
    DEFAULTS.voiceLangStartsWith = prefs.voiceLangStartsWith;
  if (prefs.substitutions) DEFAULTS.substitutions = prefs.substitutions;
}

function ensureSynth() {
  if (typeof window === "undefined") return null;
  if (!synth) synth = window.speechSynthesis;
  return synth;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function voicesReady() {
  if (typeof window === "undefined") return;
  const s = window.speechSynthesis;
  if (!s) return;

  // Already loaded
  if (s.getVoices().length > 0) return;

  // Otherwise wait for event or timeout
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 300);
    s.onvoiceschanged = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function pickVoice(
  opts: SpeakOptions,
  s: SpeechSynthesis
): SpeechSynthesisVoice | null {
  const voices = s.getVoices();
  // Priority 1: explicit name
  if (opts.voiceName) {
    const v = voices.find((v) => v.name === opts.voiceName);
    if (v) return v;
  }
  // Priority 2: explicit prefix on call
  if (opts.voiceLangStartsWith) {
    const v = voices.find((v) => v.lang?.startsWith(opts.voiceLangStartsWith!));
    if (v) return v;
  }
  // Priority 3: configured defaults
  if (DEFAULTS.voiceName) {
    const v = voices.find((v) => v.name === DEFAULTS.voiceName);
    if (v) return v;
  }
  if (DEFAULTS.voiceLangStartsWith) {
    const v = voices.find((v) =>
      v.lang?.startsWith(DEFAULTS.voiceLangStartsWith!)
    );
    if (v) return v;
  }
  // Priority 4: lang on call
  if (opts.lang) {
    const v = voices.find((v) => v.lang?.startsWith(opts.lang!));
    if (v) return v;
  }
  // Priority 5: default lang
  const v = voices.find((v) => v.lang?.startsWith(DEFAULTS.lang));
  return v ?? null;
}

function applySubs(text: string, extra?: SubRule[]) {
  const rules = [...DEFAULTS.substitutions, ...(extra ?? [])];
  return rules.reduce((acc, r) => acc.replace(r.pattern, r.replace), text);
}

/** List voices (handy for picking a good one in dev tools). */
export function listVoices(): { name: string; lang: string }[] {
  const s = ensureSynth();
  if (!s) return [];
  return s.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
}

/** Main speak API (backwards compatible) */
export async function speak(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  opts: TTSOptions = {}
) {
  if (typeof window === "undefined") return;
  const s = window.speechSynthesis;
  if (!s || !text?.trim()) return;

  // Cancel ongoing
  try {
    if (s.speaking || s.paused) s.cancel();
  } catch {}

  // ✅ Ensure voices are loaded
  await voicesReady();

  const utterText = applySubs(text, opts.substitutions);
  const u = new SpeechSynthesisUtterance(utterText);

  u.rate = opts.rate ?? DEFAULTS.rate;
  u.pitch = opts.pitch ?? DEFAULTS.pitch;
  u.lang = opts.lang ?? DEFAULTS.lang;

  const chosen = pickVoice(opts, s);
  if (chosen) u.voice = chosen;

  u.onstart = () => onStart?.();
  const done = () => onEnd?.();
  u.onend = done;
  u.onerror = done;

  s.speak(u);
}

export function cancelSpeech() {
  const s = ensureSynth();
  try {
    if (s && (s.speaking || s.paused)) s.cancel();
  } catch {}
}

/** True if currently speaking. */
export function isSpeaking(): boolean {
  const s = ensureSynth();
  return !!s?.speaking;
}
