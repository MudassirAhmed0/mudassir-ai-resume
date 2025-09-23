"use client";

import { useEffect } from "react";
import { configureTTS, listVoices } from "@/lib/speech";

export function useTTSBoot({ debug = false }) {
  useEffect(() => {
    const synth = window.speechSynthesis;

    function pickVoice() {
      const voices = listVoices();
      if (!voices.length) return; // still empty, skip

      // Priority chain: en-IN → en-GB → en-US
      const pick =
        voices.find((v) => v.name.startsWith("Microsoft Mark")) ??
        voices.find((v) => v.lang.startsWith("en-GB")) ??
        voices.find((v) => v.lang.startsWith("en-US")) ??
        null;

      configureTTS({
        rate: 1.28,
        lang: "en-US",
        voiceName: pick?.name,
        substitutions: [
          { pattern: /\bMudassir\b/gi, replace: "Moo-dah-sir" },
          { pattern: /\bAhmed\b/gi, replace: "Ah-med" },
        ],
      });

      if (debug) {
        console.table(voices);
        console.log(
          "✅ TTS Boot configured with voice:",
          pick?.name ?? "default"
        );
      }

      // Once we have voices, stop listening
      synth.onvoiceschanged = null;
    }

    // Try immediately
    pickVoice();

    // If empty, wait for voiceschanged event
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = pickVoice;
    }
  }, [debug]);
}
