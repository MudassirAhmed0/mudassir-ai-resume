export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamOpts = {
  messages: ChatMessage[];
  temperature?: number;
  onToken: (t: string) => void; // append to live bubble
  onDone: (raw: { say?: string; show?: string; [k: string]: unknown }) => void; // replace bubble
  onError?: (err: string) => void;
  signal?: AbortSignal;
};

export function streamChat(opts: StreamOpts) {
  const { messages, temperature, onToken, onDone, onError, signal } = opts;

  const controller = new AbortController();
  const abort = () => controller.abort();

  // Allow external abort, too
  if (signal) {
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  (async () => {
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ messages, temperature }),
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        onError?.(`HTTP ${res.status}`);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDone = false;
      let suppressed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (frame.startsWith(":")) continue;
          const lines = frame.split("\n");
          let event: string | null = null;
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!event) continue;
          try {
            const data = JSON.parse(dataStr || "{}");
            if (event === "token" && typeof data.text === "string") {
              if (!suppressed) {
                const w = data.text;
                if (/[{][\s\n]*"say"\s*:|[{][\s\n]*"show"\s*:|```json/i.test(w)) {
                  suppressed = true;
                } else {
                  onToken(w);
                }
              }
            }
            if (event === "done") { onDone(data.raw ?? {}); sawDone = true; }
          } catch {
            // ignore bad frames
          }
        }
      }
      // If the loop breaks without seeing a "done" frame, treat as abrupt close
      if (buffer && !sawDone) {
        onError?.("disconnected");
        return;
      }
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "name" in e && (e as { name?: string }).name !== "AbortError") {
        onError?.((e as { message?: string }).message || "stream aborted");
      }
    }
  })();
  return { cancel: abort };
}
