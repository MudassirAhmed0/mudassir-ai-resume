// App-wide voice/tts prefs persisted to localStorage

import { DEFAULT_VOICE_ID } from "@/lib/tts-config";

export type Casualness = "Light" | "Normal" | "Spicy";

export type Settings = {
  voiceId: string;
  casualness: Casualness;
  fallback: boolean; // fallback to browser TTS if ElevenLabs fails
};

export const SETTINGS_LS_KEY = "ai-settings:v1";

export const DEFAULT_SETTINGS: Settings = {
  voiceId: DEFAULT_VOICE_ID,
  casualness: "Normal",
  fallback: true,
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: Settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("settings:changed"));
  } catch {}
}
