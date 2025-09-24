// src/lib/spokenizer.ts
import { MAX_SAY_SECONDS } from "@/lib/tts-config";

export type NormalizeSayOpts = {
  enforceCap?: boolean; // default true
  addInvite?: boolean; // default true
};

/** Replace common verb phrases with spoken contractions (case-safe for leading letter). */
function applyContractions(input: string): string {
  type Rule = [RegExp, (m: RegExpMatchArray) => string];

  const cap = (s: string) => (s[0] ? s[0].toUpperCase() + s.slice(1) : s);

  const rules: Rule[] = [
    [/(\b)i am\b/gi, (m) => (m[1] === "I" ? "I’m" : `${cap(m[1])}’m`)], // I am
    [/(\b)i have\b/gi, (m) => (m[1] === "I" ? "I’ve" : `${cap(m[1])}’ve`)],
    [/(\b)i will\b/gi, (m) => (m[1] === "I" ? "I’ll" : `${cap(m[1])}’ll`)],
    [/\byou are\b/gi, () => "you’re"],
    [/\bwe are\b/gi, () => "we’re"],
    [/\bthey are\b/gi, () => "they’re"],
    [/\bhe is\b/gi, () => "he’s"],
    [/\bshe is\b/gi, () => "she’s"],
    [/\bit is\b/gi, () => "it’s"],
    [/\bthat is\b/gi, () => "that’s"],
    [/\bthere is\b/gi, () => "there’s"],
    [/\bthere are\b/gi, () => "there’re"],
    [/\bwe have\b/gi, () => "we’ve"],
    [/\byou have\b/gi, () => "you’ve"],
    [/\bthey have\b/gi, () => "they’ve"],
    [/\bdo not\b/gi, () => "don’t"],
    [/\bdoes not\b/gi, () => "doesn’t"],
    [/\bdid not\b/gi, () => "didn’t"],
    [/\bcan not\b/gi, () => "cannot"], // normalize
    [/\bcannot\b/gi, () => "can’t"],
    [/\bis not\b/gi, () => "isn’t"],
    [/\bare not\b/gi, () => "aren’t"],
    [/\bwas not\b/gi, () => "wasn’t"],
    [/\bwere not\b/gi, () => "weren’t"],
    [/\bshould not\b/gi, () => "shouldn’t"],
    [/\bcould not\b/gi, () => "couldn’t"],
    [/\bwould not\b/gi, () => "wouldn’t"],
    [/\bwill not\b/gi, () => "won’t"],
    [/\blet us\b/gi, () => "let’s"],
    [/\bthat will\b/gi, () => "that’ll"],
    [/\bit will\b/gi, () => "it’ll"],
    [/\bwe will\b/gi, () => "we’ll"],
    [/\byou will\b/gi, () => "you’ll"],
    [/\bthey will\b/gi, () => "they’ll"],
    [/\bwho is\b/gi, () => "who’s"],
    [/\bwhat is\b/gi, () => "what’s"],
    [/\bwhere is\b/gi, () => "where’s"],
  ];

  let out = input;
  for (const [re, rep] of rules) {
    out = out.replace(re, (...args) =>
      rep(args as unknown as RegExpMatchArray)
    );
  }
  return out;
}

/** Expand acronyms for the ear (spoken form). Keep case-insensitive. */
function expandAcronyms(input: string): string {
  return (
    input
      .replace(/\bSSR\b/gi, "server-side rendering")
      .replace(/\bISR\b/gi, "incremental static regeneration")
      .replace(/\bCI\/CD\b/gi, "C-I C-D")
      // optional helpful ones:
      .replace(/\bAPI\b/gi, "A-P-I")
      .replace(/\bSDK\b/gi, "S-D-K")
      .replace(/\bHTTP\b/gi, "H-T-T-P")
  );
}

/** Token representing plain text or an inline pause tag. */
type Token = { kind: "text"; value: string } | { kind: "pause"; ms: number };

/** Split text into tokens by [pause-###], preserving order. */
function tokenizeByPause(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /\[pause-(\d{2,4})\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(input))) {
    if (m.index > last) {
      tokens.push({ kind: "text", value: input.slice(last, m.index) });
    }
    const ms = Math.max(0, Math.min(4000, parseInt(m[1], 10) || 0));
    tokens.push({ kind: "pause", ms });
    last = re.lastIndex;
  }
  if (last < input.length) {
    tokens.push({ kind: "text", value: input.slice(last) });
  }
  return tokens;
}

const SENTENCE_SPLIT_RE = /([^.?!]+[.?!]+|\S+$)/g;

/** Split a text segment into sentence-ish chunks. */
function splitSentences(text: string): string[] {
  const chunks: string[] = [];
  const norm = text.replace(/\s+/g, " ").trim();
  if (!norm) return chunks;
  const parts = norm.match(SENTENCE_SPLIT_RE);
  if (!parts) return [norm];
  for (const p of parts) {
    const t = p.trim();
    if (t) chunks.push(t);
  }
  return chunks;
}

/** Estimate seconds: 130 wpm → 60/130 ≈ 0.4615s/word. */
const SECS_PER_WORD = 60 / 130;

/** Build a normalized string respecting pause tags & time cap. */
export function normalizeSay(
  input: string,
  opts: NormalizeSayOpts = {}
): string {
  const enforceCap = opts.enforceCap ?? true;
  const addInvite = opts.addInvite ?? true;
  const invite = "… Want the longer version?";

  let text = applyContractions(input);
  // expand acronyms first so CI/CD is protected
  text = expandAcronyms(text);
  // replace remaining letter/space slashes with "and"
  text = text.replace(
    /([A-Za-z])\s*\/\s*(?=[A-Za-z])(?!C-I C-D\b)/g,
    "$1 and "
  );

  const tokens = tokenizeByPause(text);
  // sentence split…
  const pieces: (
    | { kind: "text"; value: string }
    | { kind: "pause"; ms: number }
  )[] = [];
  for (const t of tokens) {
    if (t.kind === "pause") pieces.push(t);
    else
      splitSentences(t.value).forEach((s) =>
        pieces.push({ kind: "text", value: s })
      );
  }

  const maxSecs = Math.max(1, MAX_SAY_SECONDS);
  const SECS_PER_WORD = 60 / 130;

  let secs = 0;
  const kept: typeof pieces = [];

  for (const p of pieces) {
    if (!enforceCap) {
      kept.push(p);
      continue;
    }
    if (p.kind === "pause") {
      if (secs + p.ms / 1000 > maxSecs) break;
      kept.push(p);
      secs += p.ms / 1000;
    } else {
      const add = p.value.split(/\s+/).filter(Boolean).length * SECS_PER_WORD;
      if (secs + add > maxSecs) break;
      kept.push(p);
      secs += add;
    }
  }

  const trimmed = enforceCap && kept.length < pieces.length;

  let out = (enforceCap ? kept : pieces)
    .map((p) => (p.kind === "pause" ? `[pause-${p.ms}]` : p.value))
    .join(" ")
    .replace(/\s*\[pause-(\d{2,4})\]\s*/g, " [pause-$1] ")
    .replace(/\s+/g, " ")
    .trim();

  if (addInvite && trimmed) out = out.replace(/[.?!]*\s*$/, "") + ` ${invite}`;
  return out;
}

/** Convert a `say` string into playback chunks. Pause tags → pauseMs. */
export function chunkSayForPlayback(
  say: string
): { text: string; pauseMs?: number }[] {
  const tokens = tokenizeByPause(say);
  const chunks: { text: string; pauseMs?: number }[] = [];

  for (const t of tokens) {
    if (t.kind === "pause") {
      chunks.push({ text: "", pauseMs: t.ms });
      continue;
    }
    // Split text into sentence-ish bits for smoother enqueue
    const sentences = splitSentences(t.value);
    for (const s of sentences) {
      const clean = s
        .replace(/\s*\[pause-(\d{2,4})\]\s*/gi, " ") // defensive strip
        .replace(/\s+/g, " ")
        .trim();
      if (clean) chunks.push({ text: clean });
    }
  }

  // Merge adjacent empty-pause pairs if any (defensive)
  const merged: { text: string; pauseMs?: number }[] = [];
  for (const c of chunks) {
    if (c.text === "" && c.pauseMs && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.text === "" && prev.pauseMs) {
        prev.pauseMs += c.pauseMs;
        continue;
      }
    }
    merged.push(c);
  }

  return merged;
}
