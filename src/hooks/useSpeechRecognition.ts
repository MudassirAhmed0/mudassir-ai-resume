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

export function useSpeechRecognition(opts: {
  onInterim: (text: string) => void;
  onFinalSubmit: (text: string) => void;
}) {
  const ctor = useMemo(getSTTConstructor, []);
  const supported = !!ctor;
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // buffers
  const baseRef = useRef<string>(""); // text in input before recording
  const finalRef = useRef<string>("");
  const interimRef = useRef<string>("");

  const start = useCallback(
    (currentInput: string) => {
      if (!supported || !ctor) return;
      if (!recognitionRef.current) {
        recognitionRef.current = new ctor();
        recognitionRef.current.lang = "en-US";
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;

        recognitionRef.current.onresult = (e: SpeechRecognitionEvent) => {
          let finals = "";
          let interim = "";

          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            const tx = r[0].transcript;
            if (r.isFinal) finals += (finals ? " " : "") + tx;
            else interim += (interim ? " " : "") + tx;
          }

          if (finals) {
            finalRef.current = [finalRef.current, finals]
              .filter(Boolean)
              .join(" ");
          }
          interimRef.current = interim;

          const live = [baseRef.current, finalRef.current, interimRef.current]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ");
          opts.onInterim(live);
        };

        recognitionRef.current.onerror = (_e: SpeechRecognitionErrorEvent) => {
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
          interimRef.current = "";
          const finalText = [baseRef.current, finalRef.current]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          opts.onFinalSubmit(finalText);
        };
      }

      baseRef.current = currentInput;
      finalRef.current = "";
      interimRef.current = "";

      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch {
        setIsRecording(false);
      }
    },
    [ctor, opts, supported]
  );

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const abort = useCallback(() => {
    try {
      recognitionRef.current?.abort();
    } catch {}
  }, []);

  return { supported, isRecording, start, stop, abort };
}
