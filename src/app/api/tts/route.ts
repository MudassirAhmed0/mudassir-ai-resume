// src/app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_VOICE_ID,
  ELEVEN_MODEL_ID,
  ELEVEN_BASE_URL,
  MAX_SAY_SECONDS,
} from "@/lib/tts-config";

export const runtime = "nodejs"; // ensure Node (not edge) for external fetch

type Body = {
  say?: string;
  voiceId?: string;
  modelId?: string;
};

const MAX_CHARS = MAX_SAY_SECONDS * 200; // rough 200 chars/sec estimate

function truncateAtSentenceBoundary(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const slice = trimmed.slice(0, max);
  const lastDot = slice.lastIndexOf(".");
  const lastQ = slice.lastIndexOf("?");
  const lastEx = slice.lastIndexOf("!");
  const lastPunct = Math.max(lastDot, lastQ, lastEx);

  if (lastPunct > 0) return slice.slice(0, lastPunct + 1).trimEnd() + "…";

  // fallback to last space
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) return slice.slice(0, lastSpace).trimEnd() + "…";

  // hard cut
  return slice.trimEnd() + "…";
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "tts_unavailable" }, { status: 502 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const sayRaw = typeof body.say === "string" ? body.say : "";
    const say = sayRaw.trim();

    if (!say) {
      return NextResponse.json({ error: "missing_say" }, { status: 400 });
    }

    const safeSay = truncateAtSentenceBoundary(say, MAX_CHARS);
    const voiceId = (body.voiceId || DEFAULT_VOICE_ID).trim();
    const modelId = (body.modelId || ELEVEN_MODEL_ID).trim();

    const url = `${ELEVEN_BASE_URL}/text-to-speech/${encodeURIComponent(
      voiceId
    )}`;

    const elevenRes = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: safeSay,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.7,
        },
      }),
    });

    if (!elevenRes.ok || !elevenRes.body) {
      return NextResponse.json({ error: "tts_unavailable" }, { status: 502 });
    }

    // Stream audio/mpeg back to client
    return new Response(elevenRes.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // Optional: pass-through caching headers if desired
        // "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("TTS route error:", err);
    return NextResponse.json({ error: "tts_unavailable" }, { status: 502 });
  }
}
