// pnpm add -D ws
// ts-node scripts/tts-ws-proxy.ts   (or compile & run with node)
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

const PORT = Number(process.env.TTS_PROXY_PORT ?? 8787);

const wss = new WebSocketServer({ port: PORT });
console.log(`[tts-proxy] ws://localhost:${PORT}/tts`);

wss.on("connection", (client, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/tts") {
    client.close();
    return;
  }

  const voiceId = url.searchParams.get("voiceId");
  const modelId = url.searchParams.get("modelId") || "eleven_turbo_v2_5";
  const format = url.searchParams.get("format") || "mp3_44100_128";
  if (!voiceId) {
    client.close(1008, "missing voiceId");
    return;
  }

  const el = new WebSocket(
    `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input` +
      `?model_id=${encodeURIComponent(
        modelId
      )}&output_format=${encodeURIComponent(format)}&auto_mode=true`,
    { headers: { "xi-api-key": process.env.ELEVEN_API_KEY || "" } }
  );

  const closeBoth = (code?: number, reason?: string) => {
    try {
      client.close(code, reason);
    } catch {}
    try {
      el.close(code, reason);
    } catch {}
  };

  el.on("open", () => {
    client.send(JSON.stringify({ type: "ready" })); // optional
  });

  // client -> elevenlabs
  client.on("message", (data) => {
    if (el.readyState === WebSocket.OPEN) el.send(data);
  });

  // elevenlabs -> client (audio chunks arrive as JSON with base64 'audio')
  el.on("message", (data) => {
    // Forward raw (string) JSON to browser; keep it simple
    client.readyState === WebSocket.OPEN && client.send(data);
  });

  client.on("close", () => closeBoth());
  client.on("error", () => closeBoth());
  el.on("close", () => closeBoth());
  el.on("error", () => closeBoth());
});

