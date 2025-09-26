import { useCallback, useEffect, useRef, useState } from "react";
import { useSTT } from "@/hooks/useSTT";
import { speaker } from "@/lib/speaker";

export function useVoiceMode() {
  const [voiceMode, setVoiceMode] = useState(false);
  const [listeningUI, setListeningUI] = useState(false);
  const endUnsubRef = useRef<null | (() => void)>(null);
  const isRecordingRef = useRef(false);

  // STT hook with continuous mode for voice interviews
  const {
    start: startSTT,
    stop: stopSTT,
    isRecording,
    supported: sttSupported,
  } = useSTT({
    onInterim: () => {
      // Handle interim results if needed
    },
    onFinalSubmit: () => {
      // Handle final submission if needed
    },
    continuous: true,
    debounceMs: 1200,
  });

  // Keep recording state in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        endUnsubRef.current?.();
      } catch {}
      try {
        speaker.cancel();
      } catch {}
      try {
        stopSTT();
      } catch {}
    };
  }, [stopSTT]);

  const resumeIfPaused = useCallback(() => {
    if (!isRecordingRef.current) {
      startSTT("");
      setListeningUI(true);
    }
  }, [startSTT]);

  const handleStartInterview = useCallback(() => {
    // 1) Switch to voice mode and reflect UI
    setVoiceMode(true);
    setListeningUI(true);

    // 2) Start STT immediately
    startSTT("");

    // 3) Fire greeting TTS
    const say = "Hey—I'm Mudassir's avatar… Ask away.";
    const ssml = "Hey—I'm Mudassir's avatar… <break time='300ms'/> Ask away.";

    // Store the original onEnd callback
    const originalOnEnd = speaker.onEnd;

    // Set up our callback
    speaker.onEnd = () => {
      // Restore original callback
      speaker.onEnd = originalOnEnd;
      // Resume STT if not recording
      resumeIfPaused();
    };

    // Use the speaker's speak method
    speaker.speak({ say });
  }, [resumeIfPaused, startSTT]);

  const toggleMic = useCallback(() => {
    if (isRecording) {
      stopSTT();
      setListeningUI(false);
    } else {
      startSTT("");
      setListeningUI(true);
    }
  }, [isRecording, startSTT, stopSTT]);

  const exitVoiceMode = useCallback(() => {
    setVoiceMode(false);
    setListeningUI(false);
    stopSTT();
    speaker.cancel();
    // Clear any pending callbacks
    endUnsubRef.current?.();
    endUnsubRef.current = null;
  }, [stopSTT]);

  return {
    voiceMode,
    listeningUI,
    isRecording,
    sttSupported,
    handleStartInterview,
    toggleMic,
    exitVoiceMode,
  };
}
