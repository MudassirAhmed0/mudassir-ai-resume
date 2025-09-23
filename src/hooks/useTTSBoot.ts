"use client";

import { useEffect } from "react";
import { configureTTS, listVoices } from "@/lib/speech";

export type UseTTSBootOptions = {
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceName?: string;
  voiceLangStartsWith?: string;
  debug?: boolean;
};

export function useTTSBoot(options: UseTTSBootOptions = {}) {
  useEffect(() => {
    configureTTS({
      rate: options.rate ?? 1.28,
      pitch: options.pitch ?? 1,
      lang: options.lang ?? "en-US",
      voiceName: options.voiceName,
      voiceLangStartsWith: options.voiceLangStartsWith ?? "en-IN",
      substitutions: [
        { pattern: /\bMudassir\b/gi, replace: "Mud-das-sir" },
        // { pattern: /\bAhmed\b/gi, replace: "ah-mad" },
      ],
    });

    if (options.debug) {
      // log all available voices to console
      console.table(listVoices());
    }
  }, [options]);
}
