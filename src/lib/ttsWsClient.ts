export type TTSStream = {
  sendText: (text: string, trigger?: boolean) => void;
  flush: () => void;
  close: () => void;
};

export function openTTSStream(opts: {
  voiceId: string;
  modelId?: string;
  format?: string; // default mp3_44100_128
  onAudio: (base64: string, isFinal?: boolean) => void;
  onReady?: () => void;
  onError?: (err: string) => void;
}): TTSStream {
  const { voiceId, modelId, format, onAudio, onReady, onError } = opts;
  const proxyPort = (window as unknown as { TTS_PROXY_PORT?: number }).TTS_PROXY_PORT ?? 8787;
  const url = new URL(`ws://localhost:${proxyPort}/tts`);
  url.searchParams.set("voiceId", voiceId);
  if (modelId) url.searchParams.set("modelId", modelId);
  if (format) url.searchParams.set("format", format);

  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      if (msg.type === "ready") {
        onReady?.();
        return;
      }
      // ElevenLabs audio frames
      if (typeof msg.audio === "string") onAudio(msg.audio, msg.isFinal);
    } catch {
      /* ignore non-JSON */
    }
  };
  ws.onerror = () => onError?.("tts ws error");

  // 1) Initialize connection (voice settings optional)
  const init = () => {
    const initFrame = {
      // Some integrations use a typed message; others accept a first text+settings frame.
      // This form (text + voice_settings) follows the public docs example.
      text: " ",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 },
    };
    ws.readyState === WebSocket.OPEN
      ? ws.send(JSON.stringify(initFrame))
      : ws.addEventListener("open", () => ws.send(JSON.stringify(initFrame)), {
          once: true,
        });
  };
  init();

  return {
    sendText(text: string, trigger = true) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ text, try_trigger_generation: trigger }));
    },
    flush() {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ text: "" })); // signals end-of-input
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}
