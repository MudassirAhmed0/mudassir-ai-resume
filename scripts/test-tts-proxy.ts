// Test script for TTS WebSocket proxy
// Run with: ts-node scripts/test-tts-proxy.ts

import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:8787/tts?voiceId=test_voice");

ws.on("open", () => {
  console.log("Connected to TTS proxy");

  // Send initialization frame
  ws.send(
    JSON.stringify({
      text: " ",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 },
    })
  );

  // Send test text
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        text: "Hello, this is a test of the TTS streaming system.",
        try_trigger_generation: true,
      })
    );
  }, 1000);

  // Flush after 2 seconds
  setTimeout(() => {
    ws.send(JSON.stringify({ text: "" }));
    ws.close();
  }, 2000);
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "ready") {
      console.log("TTS proxy ready");
    } else if (msg.audio) {
      console.log(`Received audio chunk: ${msg.audio.length} chars`);
    }
  } catch (e) {
    console.log("Received non-JSON message:", data.toString());
  }
});

ws.on("error", (error) => {
  console.error("WebSocket error:", error);
});

ws.on("close", () => {
  console.log("Connection closed");
  process.exit(0);
});

