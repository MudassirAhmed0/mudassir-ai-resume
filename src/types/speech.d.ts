export {};

declare global {
  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly [index: number]: SpeechRecognitionAlternative;
    readonly length: number;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }

  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;

    onaudioend?: (event: Event) => void;
    onaudiostart?: (event: Event) => void;
    onend?: (event: Event) => void;
    onerror?: (event: SpeechRecognitionErrorEvent) => void;
    onnomatch?: (event: Event) => void;
    onresult?: (event: SpeechRecognitionEvent) => void;
    onsoundend?: (event: Event) => void;
    onsoundstart?: (event: Event) => void;
    onspeechend?: (event: Event) => void;
    onspeechstart?: (event: Event) => void;
    onstart?: (event: Event) => void;
  }

  interface Window {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  }
}
