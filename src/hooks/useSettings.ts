"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  type Settings,
  type Casualness,
  SETTINGS_LS_KEY,
} from "@/lib/settings";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // cross-tab + external updates
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_LS_KEY) setSettings(loadSettings());
    };
    const onChanged = () => setSettings(loadSettings());

    window.addEventListener("storage", onStorage);
    window.addEventListener("settings:changed", onChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("settings:changed", onChanged);
    };
  }, []);

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  return { settings, update };
}

export type { Settings, Casualness };
