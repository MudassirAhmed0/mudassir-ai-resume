// lib/segmenter.ts
export type SegmentResult = { ready: string[]; rest: string };

const PAUSE_RE = /\[pause-(\d{2,5})\]/y; // sticky
const CLOSERS = `"'")]`;

/** Common abbreviations to avoid splitting on their trailing period */
const ABBRS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "no",
  "nos",
  "etc",
  "e.g",
  "i.e",
  "vs",
  "fig",
  "cf",
  "inc",
  "ltd",
  "co",
  "u.s",
  "u.k",
  "ph.d",
]);

export function createSegmenter() {
  let tail = "";

  function push(chunk: string): SegmentResult {
    if (!chunk) return { ready: [], rest: tail };
    const s = tail + chunk;
    let i = 0;
    const ready: string[] = [];

    while (i < s.length) {
      // 1) Handle explicit pause tags as hard boundaries
      PAUSE_RE.lastIndex = i;
      const pm = PAUSE_RE.exec(s);
      if (pm && pm.index === i) {
        const end = PAUSE_RE.lastIndex; // include the pause tag
        const seg = s.slice(0, end);
        ready.push(seg);
        // consume everything up to end and restart with empty prefix
        const remaining = s.slice(end);
        i = 0;
        tail = remaining;
        continue;
      }

      const ch = s[i];

      // 2) Sentence final punctuation
      if (ch === "." || ch === "!" || ch === "?") {
        // a) Ellipsis: '...' → treat as boundary only when the run ends
        if (ch === ".") {
          const runLen = countRun(s, i, ".");
          // decimal numbers like 3.14 → don't split if digit before and after first dot
          const isDecimal =
            isDigit(s[i - 1]) && s[i + 1] === "."
              ? false
              : isDigit(s[i - 1]) && isDigit(s[i + 1]);
          if (runLen >= 3) {
            const after = i + runLen;
            const end = consumeClosers(s, after);
            const seg = s.slice(0, end);
            ready.push(seg);
            const remaining = s.slice(end);
            tail = remaining;
            i = 0;
            continue;
          }
          if (isDecimal) {
            i++;
            continue;
          }
          // Abbreviation check (token before the dot)
          const prevToken = readPrevToken(s, i);
          if (prevToken && ABBRS.has(prevToken.toLowerCase())) {
            i++;
            continue;
          }
        }

        // b) Standard sentence end if followed by space, newline, end, or a closer
        const next = s[i + 1];
        if (next === undefined || isSpace(next) || isCloser(next)) {
          const after = consumeClosers(s, i + 1);
          const seg = s.slice(0, after);
          ready.push(seg);
          const remaining = s.slice(after);
          tail = remaining;
          i = 0;
          continue;
        }
      }

      i++;
    }

    // Nothing finalized; keep everything in tail
    tail = s;
    return { ready, rest: tail };
  }

  /** Flush any remaining tail as a final segment (if non-empty) */
  function flush(): string[] {
    if (!tail.trim()) {
      tail = "";
      return [];
    }
    const out = [tail];
    tail = "";
    return out;
  }

  return { push, flush };
}

// ---------- helpers ----------
function isDigit(c?: string) {
  return !!c && c >= "0" && c <= "9";
}
function isSpace(c?: string) {
  return !!c && /\s/.test(c);
}
function isCloser(c?: string) {
  return !!c && CLOSERS.includes(c);
}

function countRun(s: string, idx: number, ch: string) {
  let n = 0;
  while (s[idx + n] === ch) n++;
  return n;
}

function consumeClosers(s: string, idx: number) {
  let i = idx;
  while (i < s.length && isCloser(s[i])) i++;
  return i;
}

function readPrevToken(s: string, idx: number) {
  // read back to previous space/punct; capture things like "U.S" or "Ph.D"
  let j = idx - 1;
  while (j >= 0 && /[A-Za-z\.\-]/.test(s[j])) j--;
  const token = s.slice(j + 1, idx);
  return token;
}
