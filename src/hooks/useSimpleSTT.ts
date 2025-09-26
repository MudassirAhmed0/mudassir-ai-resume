import { useCallback, useMemo, useRef, useState } from "react";

type SRConstructor = new () => SpeechRecognition;
function getSTTConstructor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window.SpeechRecognition as unknown as SRConstructor | undefined) ??
    (window.webkitSpeechRecognition as unknown as SRConstructor | undefined) ??
    null
  );
}

/**
 * Simplified STT hook that matches the VoiceChat component interface
 * Returns { start, stop, isRecording } for simple voice control
 */
export function useSTT() {
  const ctor = useMemo(getSTTConstructor, []);
  const supported = !!ctor;

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef<(text: string) => void>();

  const start = useCallback(
    (initialText: string = "") => {
      if (!supported || !ctor) return;

      if (!recognitionRef.current) {
        recognitionRef.current = new ctor();
        recognitionRef.current.lang = "en-US";
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;

        recognitionRef.current.onresult = (e: SpeechRecognitionEvent) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            const tx = r[0].transcript;
            if (r.isFinal) finalTranscript += (finalTranscript ? " " : "") + tx;
            else interimTranscript += (interimTranscript ? " " : "") + tx;
          }

          // For now, we'll just collect the final transcript
          // In a real implementation, you might want to emit interim results
          if (finalTranscript) {
            onFinalRef.current?.(finalTranscript);
          }
        };

        recognitionRef.current.onerror = (e) => {
          console.error("Speech recognition error:", e);
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }

      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Failed to start speech recognition:", error);
        setIsRecording(false);
      }
    },
    [ctor, supported]
  );

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  // Set up callback for final transcript
  const setOnFinal = useCallback((callback: (text: string) => void) => {
    onFinalRef.current = callback;
  }, []);

  return {
    supported,
    isRecording,
    start,
    stop,
    setOnFinal,
  };
}
