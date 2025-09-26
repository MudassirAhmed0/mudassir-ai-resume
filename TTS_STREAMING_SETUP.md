# ElevenLabs WebSocket TTS Streaming Setup

This implementation provides near-instant TTS streaming using ElevenLabs WebSocket API with continuous audio playback.

## Setup

1. **Install dependencies** (already done):

   ```bash
   pnpm add -D ws @types/ws dotenv ts-node
   ```

2. **Set up environment variables**:
   Create a `.env.local` file with:

   ```
   ELEVEN_API_KEY=your_elevenlabs_api_key_here
   TTS_PROXY_PORT=8787
   ```

3. **Start the WebSocket proxy server**:

   ```bash
   pnpm run tts-proxy
   ```

   This runs on port 8787 by default.

4. **Start the Next.js app** (in another terminal):
   ```bash
   pnpm dev
   ```

## How it works

1. **WebSocket Proxy** (`scripts/tts-ws-proxy.ts`):

   - Runs as a standalone server
   - Proxies browser WebSocket connections to ElevenLabs
   - Keeps API key server-side for security

2. **Browser Client** (`src/lib/ttsWsClient.ts`):

   - Connects to the local proxy
   - Sends text segments as they arrive from the segmenter
   - Receives base64 audio chunks from ElevenLabs

3. **Audio Player** (`src/lib/ElevenPlayer.ts`):

   - Uses MediaSource API for continuous playback
   - Appends MP3 chunks as they arrive
   - Provides gapless audio streaming

4. **Chat Integration** (`src/components/Chat.tsx`):
   - Opens TTS stream when assistant starts responding
   - Feeds each finalized segment to TTS immediately
   - Supports barge-in (STT interrupts TTS)

## Features

- **Near-instant onset**: First segment triggers immediate audio generation
- **Continuous playback**: No gaps between segments
- **Barge-in support**: STT can interrupt TTS at any time
- **Fallback**: Falls back to browser TTS if WebSocket fails

## Configuration

- **Model**: `eleven_turbo_v2_5` (fast, good quality)
- **Format**: `mp3_44100_128` (compatible with MediaSource)
- **Voice settings**: Stability 0.5, Similarity boost 0.8, Speed 1.0

## Deployment Notes

- The WebSocket proxy can be deployed as a separate service
- For platforms without WebSocket support in route handlers, keep the standalone proxy
- ElevenLabs WebSocket endpoint: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`

