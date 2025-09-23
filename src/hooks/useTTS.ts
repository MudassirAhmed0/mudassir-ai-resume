import { useCallback, useState } from "react";
import {
  speak as coreSpeak,
  cancelSpeech as coreCancel,
  TTSOptions,
} from "@/lib/speech";

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);

  const cancel = useCallback(() => {
    coreCancel();
    setSpeaking(false);
  }, []);

  const speakText = useCallback((text: string, opts?: TTSOptions) => {
    if (!text?.trim()) return;
    // cancel before starting to avoid overlaps
    coreCancel();
    coreSpeak(
      text,
      () => setSpeaking(true),
      () => setSpeaking(false),
      opts
    );
  }, []);

  return { speaking, speakText, cancel };
}
