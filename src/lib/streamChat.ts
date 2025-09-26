export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamOpts = {
  messages: ChatMessage[];
  temperature?: number;
  onToken: (t: string) => void; // append to live bubble
  onDone: (raw: { say?: string; show?: string; [k: string]: any }) => void; // replace bubble
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, temperature }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError?.(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split into SSE events
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          // Comments/keepalives start with ':'
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
            if (event === "token" && typeof data.text === "string")
              onToken(data.text);
            if (event === "done") onDone(data.raw ?? {});
          } catch {
            // ignore bad frames
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") onError?.(e?.message || "stream aborted");
    }
  })();

  return { cancel: abort };
}
