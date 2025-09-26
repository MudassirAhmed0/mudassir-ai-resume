// src/lib/usage.ts
"use client";

export type UsageState = {
  total: number; // total chars ever sent
  samples: number; // total sends
  last: number[]; // rolling window (up to 10)
};

const KEY = "tts:usage:v1";
const MAX_WINDOW = 10;

function load(): UsageState {
  if (typeof window === "undefined") return { total: 0, samples: 0, last: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { total: 0, samples: 0, last: [] };
    const p = JSON.parse(raw) as UsageState;
    if (!Array.isArray(p.last)) p.last = [];
    return {
      total: p.total || 0,
      samples: p.samples || 0,
      last: p.last.slice(-MAX_WINDOW),
    };
  } catch {
    return { total: 0, samples: 0, last: [] };
  }
}
function save(state: UsageState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("usage:changed"));
  } catch {}
}

export function recordSayChars(len: number) {
  const s = load();
  s.total += len;
  s.samples += 1;
  s.last.push(len);
  if (s.last.length > MAX_WINDOW) s.last.shift();
  save(s);
}

export function getAvgChars(n = 10): number {
  const s = load();
  const arr = s.last.slice(-n);
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/** Subscribe to changes; returns an unsubscribe fn. */
export function onUsageChange(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("usage:changed", handler);
  return () => window.removeEventListener("usage:changed", handler);
}
