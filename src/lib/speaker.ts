// src/lib/speaker.ts
"use client";

import { ttsCacheKey } from "@/lib/hash";
import { DEFAULT_VOICE_ID, MAX_SAY_SECONDS } from "@/lib/tts-config";
import { speak as webSpeak, cancelSpeech as webCancel } from "@/lib/speech";

/** Item to speak */
type SpeakItem = {
  say: string;
  voiceId?: string;
};

/** Boundary sample payload */
export type Boundary = {
  /** 0..1 playback progress (best-effort) */
  progress: number;
  /** 0..1 energy estimate (RMS from analyser or synthetic) */
  energy: number;
};

type CacheEntry = {
  key: string;
  blob: Blob;
  createdAt: number;
};

/* -------------------------------------------------------------------------- */
/*                            IndexedDB small helper                          */
/* -------------------------------------------------------------------------- */

const DB_NAME = "tts-cache";
const STORE_NAME = "audio";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () =>
        resolve((req.result as CacheEntry | undefined)?.blob ?? null);
      req.onerror = () => reject(req.error ?? new Error("idb get error"));
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = { key, blob, createdAt: Date.now() };
      const req = store.put(entry, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("idb set error"));
    });
  } catch {
    // ignore; we'll try localStorage fallback below
  }
}

/* -------------------------- localStorage fallback -------------------------- */

const LS_PREFIX = "tts-audio:";

/** Only store if small enough to avoid quota pain. */
const LS_MAX_BYTES = 2 * 1024 * 1024; // 2MB

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  // base64
  // eslint-disable-next-line no-restricted-globals
  return btoa(binary);
}
function base64ToBlob(b64: string, type = "audio/mpeg"): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function lsGet(key: string): Blob | null {
  try {
    const val = localStorage.getItem(LS_PREFIX + key);
    if (!val) return null;
    return base64ToBlob(val, "audio/mpeg");
  } catch {
    return null;
  }
}

async function lsSet(key: string, blob: Blob) {
  try {
    if (blob.size > LS_MAX_BYTES) return; // don’t blow quota
    const b64 = await blobToBase64(blob);
    localStorage.setItem(LS_PREFIX + key, b64);
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Speaker                                   */
/* -------------------------------------------------------------------------- */

export class Speaker {
  /** Queue of pending items */
  private queue: SpeakItem[] = [];
  /** Currently playing <audio> element, if any */
  private audioEl: HTMLAudioElement | null = null;
  /** Current fetch controller */
  private controller: AbortController | null = null;

  /** WebAudio context & analyser bound to current audio */
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  public analyser: AnalyserNode | null = null;

  /** State flags */
  private playing = false;
  private destroyed = false;

  /** Handlers */
  public onStart: (() => void) | null = null;
  public onEnd: (() => void) | null = null;
  public onBoundary: ((b: Boundary) => void) | null = null;

  /** Synthetic boundary timer */
  private vuTimer: number | null = null;

  /** Enqueue & maybe start playing */
  async speak({ say, voiceId }: SpeakItem): Promise<void> {
    if (this.destroyed) return;
    const trimmed = (say ?? "").trim();
    if (!trimmed) return;

    // Hard cap by length to control cost; ~200 chars/sec estimate
    const maxChars = MAX_SAY_SECONDS * 200;
    const safeSay = this.truncateAtSentenceBoundary(trimmed, maxChars);

    this.queue.push({ say: safeSay, voiceId: voiceId || DEFAULT_VOICE_ID });
    if (!this.playing) {
      void this.processQueue();
    }
  }

  /** Cancel current playback & clear queue */
  cancel() {
    // stop timers
    if (this.vuTimer) {
      window.clearInterval(this.vuTimer);
      this.vuTimer = null;
    }

    // abort network
    try {
      this.controller?.abort();
    } catch {}
    this.controller = null;

    // stop audio
    try {
      if (this.audioEl) {
        this.audioEl.pause();
        URL.revokeObjectURL(this.audioEl.src);
      }
    } catch {}
    this.audioEl = null;

    // teardown audio graph
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch {}
    this.source = null;
    this.analyser = null;
    this.ctx = null;

    // cancel web speech if fallback in progress
    try {
      webCancel();
    } catch {}

    this.queue = [];
    this.playing = false;

    // fire end to reset UI
    this.onEnd?.();
  }

  /** For completeness if you need to clean up on route change */
  destroy() {
    this.destroyed = true;
    this.cancel();
  }

  /* ------------------------------ Core driver ------------------------------ */

  private async processQueue() {
    if (this.playing || this.destroyed) return;
    const next = this.queue.shift();
    if (!next) return;

    this.playing = true;

    // notify start (UI might disable mic etc.)
    this.onStart?.();

    // Try cache -> network -> fallback
    const key = await ttsCacheKey(next.voiceId || DEFAULT_VOICE_ID, next.say);
    let blob = await idbGet(key);
    if (!blob) {
      blob = lsGet(key);
    }

    try {
      if (!blob) {
        blob = await this.fetchTTS(next.say, next.voiceId);
        if (blob) {
          // cache best-effort
          idbSet(key, blob).catch(() => {});
          lsSet(key, blob).catch(() => {});
        }
      }

      if (blob) {
        await this.playBlob(blob, next.say);
      } else {
        // Fallback
        await this.fallbackSpeak(next.say);
      }
    } catch {
      await this.fallbackSpeak(next.say);
    }

    // Done current → move on
    this.playing = false;

    // proceed to next
    if (this.queue.length > 0) {
      void this.processQueue();
    } else {
      // ensure end fires if no more work
      this.onEnd?.();
    }
  }

  private async fetchTTS(say: string, voiceId?: string): Promise<Blob | null> {
    // cancel any prior fetch
    try {
      this.controller?.abort();
    } catch {}
    this.controller = new AbortController();

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: this.controller.signal,
      body: JSON.stringify({
        say,
        voiceId: voiceId || DEFAULT_VOICE_ID,
      }),
    });

    if (!res.ok) return null;

    // Eleven returns audio/mpeg; ensure body exists
    const ct = res.headers.get("Content-Type") || "";
    if (!ct.includes("audio")) return null;

    return await res.blob();
  }

  private async playBlob(blob: Blob, say: string): Promise<void> {
    // Stop existing
    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {}
      this.audioEl = null;
    }

    // Create element
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";
    this.audioEl = audio;

    // Build audio graph for analyser
    await this.buildAnalyser(audio);

    // Boundary loop (progress + energy)
    this.startVuLoop(audio, say);

    await audio.play().catch(async () => {
      // Autoplay may fail without user gesture; attempt a user-gesture resume hook if needed
      await this.fallbackSpeak(say);
    });

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        if (this.vuTimer) {
          window.clearInterval(this.vuTimer);
          this.vuTimer = null;
        }
        try {
          URL.revokeObjectURL(url);
        } catch {}
        this.teardownAnalyser();
        resolve();
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
    });
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private async buildAnalyser(el: HTMLMediaElement) {
    try {
      this.ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      // Some browsers need resume on first gesture; we assume you already interacted (mic)
      this.source = this.ctx.createMediaElementSource(el);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.85;

      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch {
      // Best-effort; analyser may be null
      this.ctx = null;
      this.source = null;
      this.analyser = null;
    }
  }

  private teardownAnalyser() {
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch {}
    this.source = null;
    this.analyser = null;
    this.ctx = null;
  }

  private startVuLoop(audio: HTMLAudioElement, say: string) {
    if (!this.analyser) {
      // synthetic boundary on a timer if no analyser
      const started = performance.now();
      const totalMs = Math.min(MAX_SAY_SECONDS * 1000, 15000);
      this.vuTimer = window.setInterval(() => {
        const t = performance.now() - started;
        const progress = Math.min(1, t / totalMs);
        const energy = 0.25 + 0.15 * Math.sin((t / 180) * Math.PI); // gentle wobble
        this.onBoundary?.({ progress, energy });
      }, 1000 / 30);
      return;
    }

    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.vuTimer = window.setInterval(() => {
      // progress
      const duration = audio.duration || MAX_SAY_SECONDS;
      const progress =
        duration && isFinite(duration)
          ? Math.min(1, (audio.currentTime || 0) / duration)
          : 0;

      // energy (RMS on frequency bins)
      this.analyser!.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length) / 255; // 0..1
      const energy = Math.min(1, Math.max(0, rms));

      this.onBoundary?.({ progress, energy });
    }, 1000 / 30);
  }

  private async fallbackSpeak(say: string) {
    // No analyser from Web Speech — synth a timer so UI still animates a bit
    const started = performance.now();
    const totalMs = Math.min(MAX_SAY_SECONDS * 1000, 12000);
    if (!this.vuTimer) {
      this.vuTimer = window.setInterval(() => {
        const t = performance.now() - started;
        const progress = Math.min(1, t / totalMs);
        const energy = 0.25 + 0.15 * Math.sin((t / 160) * Math.PI);
        this.onBoundary?.({ progress, energy });
      }, 1000 / 30);
    }

    return new Promise<void>((resolve) => {
      webSpeak(
        say,
        () => this.onStart?.(),
        () => {
          if (this.vuTimer) {
            window.clearInterval(this.vuTimer);
            this.vuTimer = null;
          }
          resolve();
        }
      );
    });
  }

  private truncateAtSentenceBoundary(text: string, max: number): string {
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;

    const slice = trimmed.slice(0, max);
    const lastDot = slice.lastIndexOf(".");
    const lastQ = slice.lastIndexOf("?");
    const lastEx = slice.lastIndexOf("!");
    const lastPunct = Math.max(lastDot, lastQ, lastEx);

    if (lastPunct > 0) return slice.slice(0, lastPunct + 1).trimEnd() + "…";

    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 0) return slice.slice(0, lastSpace).trimEnd() + "…";

    return slice.trimEnd() + "…";
  }
}

/* ------------------------------ Singleton API ----------------------------- */

export const speaker = new Speaker();
