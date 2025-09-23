let synth: SpeechSynthesis | null = null;

export function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined") return;
  if (!synth) synth = window.speechSynthesis;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => {
    if (onEnd) onEnd();
  };

  synth.speak(utterance);
}

export function cancelSpeech() {
  if (synth && synth.speaking) synth.cancel();
}

export function isSpeaking(): boolean {
  return synth ? synth.speaking : false;
}
