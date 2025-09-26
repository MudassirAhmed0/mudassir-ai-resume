// src/lib/speaker.ts
"use client";

import { ttsCacheKey } from "@/lib/hash";
import { DEFAULT_VOICE_ID, MAX_SAY_SECONDS } from "@/lib/tts-config";
import { speak as webSpeak, cancelSpeech as webCancel } from "@/lib/speech";
import { normalizeSay } from "@/lib/spokenizer";
import { recordSayChars } from "@/lib/usage";

/** Energy/progress sample emitted ~30fps while audio is playing. */
export type Boundary = {
  progress: number; // 0..1
  energy: number; // 0..1 (RMS)
};

type SpeakItem = {
  say: string;
  voiceId?: string;
  /** If true, skip length cap on the text sent to TTS (no truncation). */
  noCap?: boolean;
};

/* ----------------------------------------------------------------------------
 * IndexedDB cache (Blob)
 * --------------------------------------------------------------------------*/

const DB_NAME = "tts-cache";
const STORE = "audio";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open error"));
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const r = store.get(key);
      r.onsuccess = () =>
        resolve((r.result as { blob?: Blob } | undefined)?.blob ?? null);
      r.onerror = () => reject(r.error ?? new Error("idb get error"));
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const r = store.put({ blob, createdAt: Date.now() }, key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error ?? new Error("idb set error"));
    });
  } catch {
    // ignore
  }
}

/* ----------------------------------------------------------------------------
 * localStorage fallback (base64) — small blobs only
 * --------------------------------------------------------------------------*/

const LS_PREFIX = "tts-audio:";
const LS_MAX_BYTES = 2 * 1024 * 1024; // 2MB

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-restricted-globals
  return btoa(bin);
}

function base64ToBlob(b64: string, mime = "audio/mpeg"): Blob {
  // eslint-disable-next-line no-restricted-globals
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function lsGet(key: string): Blob | null {
  try {
    const s = localStorage.getItem(LS_PREFIX + key);
    if (!s) return null;
    return base64ToBlob(s, "audio/mpeg");
  } catch {
    return null;
  }
}

async function lsSet(key: string, blob: Blob) {
  try {
    if (blob.size > LS_MAX_BYTES) return;
    const b64 = await blobToBase64(blob);
    localStorage.setItem(LS_PREFIX + key, b64);
  } catch {
    // ignore
  }
}

/* ----------------------------------------------------------------------------
 * Speaker (singleton)
 * --------------------------------------------------------------------------*/

export class Speaker {
  private queue: SpeakItem[] = [];
  private playing = false;
  private destroyed = false;

  private controller: AbortController | null = null;
  private audioEl: HTMLAudioElement | null = null;

  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private _analyser: AnalyserNode | null = null;

  private vuTimer: number | null = null;
  private fallbackEnabled = true;

  /** Hooks */
  public onStart: (() => void) | null = null;
  public onEnd: (() => void) | null = null;
  public onBoundary: ((b: Boundary) => void) | null = null;
  /** Notify UI (toasts) for 429/402 etc. */
  public onNotice: ((msg: string) => void) | null = null;

  /** Public controls ------------------------------------------------------- */

  setFallbackEnabled(v: boolean) {
    this.fallbackEnabled = !!v;
  }

  getAnalyser(): AnalyserNode | null {
    return this._analyser;
  }

  async speak({ say, voiceId, noCap }: SpeakItem): Promise<void> {
    if (this.destroyed) return;
    const trimmed = (say ?? "").trim();
    if (!trimmed) return;

    this.queue.push({
      say: trimmed,
      voiceId: voiceId || DEFAULT_VOICE_ID,
      noCap: !!noCap,
    });

    if (!this.playing) void this.processQueue();
  }

  cancel() {
    if (this.vuTimer) {
      window.clearInterval(this.vuTimer);
      this.vuTimer = null;
    }

    try {
      this.controller?.abort();
    } catch {}
    this.controller = null;

    try {
      this.audioEl?.pause();
      if (this.audioEl?.src?.startsWith("blob:")) {
        URL.revokeObjectURL(this.audioEl.src);
      }
    } catch {}
    this.audioEl = null;

    this.teardownAnalyser();

    try {
      webCancel?.();
    } catch {}

    this.queue = [];
    this.playing = false;
    this.onEnd?.();
  }

  destroy() {
    this.destroyed = true;
    this.cancel();
  }

  /** Internals ------------------------------------------------------------ */

  private async processQueue() {
    if (this.playing || this.destroyed) return;
    const item = this.queue.shift();
    if (!item) return;

    this.playing = true;
    this.onStart?.();

    // SAFEGUARD #1: If say > budget, run spokenizer trim (no invite).
    const charBudget = MAX_SAY_SECONDS * 200;
    const safeSay =
      item.noCap || item.say.length <= charBudget
        ? item.say
        : normalizeSay(item.say, { enforceCap: true, addInvite: false });

    try {
      // Cache key uses the spoken content
      const key = await ttsCacheKey(item.voiceId || DEFAULT_VOICE_ID, safeSay);

      // SAFEGUARD #2: Reuse cached audio if present
      let blob = await idbGet(key);
      if (!blob) blob = lsGet(key);

      let fetched = false;
      let status = 0;

      if (!blob) {
        const res = await this.fetchTTS(
          safeSay,
          item.voiceId,
          item.noCap === true
        );
        blob = res.blob;
        status = res.status;
        fetched = !!blob && status === 200;
        if (blob) {
          void idbSet(key, blob);
          void lsSet(key, blob);
        }
      }

      if (blob) {
        if (fetched) recordSayChars(safeSay.length);
        await this.playBlob(blob, safeSay);
      } else {
        // SAFEGUARD #4: Handle 429/402 explicitly
        if (status === 429 || status === 402) {
          this.onNotice?.("Voice server busy, using local voice");
        } else if (status !== 0) {
          this.onNotice?.("Voice service unavailable, using local voice");
        } else {
          this.onNotice?.("No network to voice service, using local voice");
        }
        if (this.fallbackEnabled) await this.fallbackSpeak(safeSay);
      }
    } catch {
      this.onNotice?.("Voice request failed, using local voice");
      if (this.fallbackEnabled) await this.fallbackSpeak(safeSay);
    }

    this.playing = false;
    if (this.queue.length) void this.processQueue();
    else this.onEnd?.();
  }

  private async fetchTTS(
    say: string,
    voiceId?: string,
    noCap?: boolean
  ): Promise<{ blob: Blob | null; status: number }> {
    try {
      this.controller?.abort();
    } catch {}
    this.controller = new AbortController();

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.controller.signal,
        body: JSON.stringify({
          say,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          noCap: !!noCap,
        }),
      });

      const status = res.status;
      const ct = res.headers.get("Content-Type") || "";

      if (!res.ok || !ct.includes("audio")) {
        return { blob: null, status };
      }
      const blob = await res.blob();
      return { blob, status };
    } catch {
      return { blob: null, status: 0 };
    }
  }

  private async playBlob(blob: Blob, sayForProgress: string): Promise<void> {
    try {
      this.audioEl?.pause();
    } catch {}
    this.audioEl = null;

    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.preload = "auto";
    this.audioEl = el;

    await this.buildAnalyser(el);
    this.startVuLoop(el, sayForProgress);

    try {
      await el.play();
    } catch {
      // Autoplay blocked → fallback
      URL.revokeObjectURL(url);
      this.onNotice?.("Autoplay blocked, using local voice");
      if (this.fallbackEnabled) {
        await this.fallbackSpeak(sayForProgress);
      }
      return;
    }

    await new Promise<void>((resolve) => {
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
      el.onended = cleanup;
      el.onerror = cleanup;
    });
  }

  private async buildAnalyser(el: HTMLMediaElement) {
    try {
      this.ctx = new (window.AudioContext ||
        // @ts-expect-error - webkit prefix in Safari
        window.webkitAudioContext)();
      this.source = this.ctx.createMediaElementSource(el);
      this._analyser = this.ctx.createAnalyser();
      this._analyser.fftSize = 2048;
      this._analyser.smoothingTimeConstant = 0.85;

      this.source.connect(this._analyser);
      this._analyser.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.source = null;
      this._analyser = null;
    }
  }

  private teardownAnalyser() {
    try {
      this.source?.disconnect();
      this._analyser?.disconnect();
      this.ctx?.close();
    } catch {}
    this.source = null;
    this._analyser = null;
    this.ctx = null;
  }

  private startVuLoop(audio: HTMLAudioElement, fallbackText: string) {
    if (!this._analyser) {
      // synthetic animation if analyser missing
      const start = performance.now();
      const totalMs = Math.min(MAX_SAY_SECONDS * 1000, 15000);
      this.vuTimer = window.setInterval(() => {
        const t = performance.now() - start;
        const progress = Math.min(1, t / totalMs);
        const energy = 0.25 + 0.15 * Math.sin((t / 180) * Math.PI);
        this.onBoundary?.({ progress, energy });
      }, 1000 / 30);
      return;
    }

    const bufRef = { current: null as Uint8Array | null };
    this.vuTimer = window.setInterval(() => {
      // progress
      const dur =
        audio.duration ||
        Math.max(3, fallbackText.split(/\s+/).length / (130 / 60));
      const progress = Math.min(
        1,
        Math.max(0, (audio.currentTime || 0) / (dur || 1))
      );

      // energy from time-domain RMS
      if (!bufRef.current) {
        bufRef.current = new Uint8Array(this._analyser!.fftSize);
      }
      const buf = bufRef.current!;
      this._analyser!.getByteTimeDomainData(
        buf as unknown as Uint8Array<ArrayBuffer>
      );

      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const energy = Math.min(1, Math.max(0, (rms - 0.02) * 3.2));

      this.onBoundary?.({ progress, energy });
    }, 1000 / 30);
  }

  private async fallbackSpeak(text: string): Promise<void> {
    const start = performance.now();
    const totalMs = Math.min(MAX_SAY_SECONDS * 1000, 15000);
    if (!this.vuTimer) {
      this.vuTimer = window.setInterval(() => {
        const t = performance.now() - start;
        const progress = Math.min(1, t / totalMs);
        const energy = 0.25 + 0.15 * Math.sin((t / 160) * Math.PI);
        this.onBoundary?.({ progress, energy });
      }, 1000 / 30);
    }

    await new Promise<void>((resolve) => {
      webSpeak(
        text,
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
}

/** Singleton instance */
export const speaker = new Speaker();
