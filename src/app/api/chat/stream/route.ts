import type { NextRequest } from "next/server";
import knowledge from "@/data/knowledge.json";
import { SYSTEM_PROMPT } from "@/lib/prompt";

export const runtime = "edge"; // low-latency streaming

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Role = "user" | "assistant"; // disallow client 'system' injection
type Message = { role: Role; content: string };

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      `event: done\ndata: ${JSON.stringify({
        raw: { error: "Missing OPENAI_API_KEY" },
      })}\n\n`,
      sseHeaders()
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: Message[];
    temperature?: number;
  };

  const input = Array.isArray(body?.messages) ? body.messages : [];
  const temperature =
    typeof body.temperature === "number" ? body.temperature : 0.7;

  // sanitize client messages (user/assistant only)
  const sanitized: Message[] = input.filter(
    (m): m is Message =>
      m &&
      typeof m.content === "string" &&
      (m.role === "user" || m.role === "assistant")
  );

  // Build OpenAI messages with SYSTEM + KNOWLEDGE
  const sys = {
    role: "system",
    content: `${SYSTEM_PROMPT}\n\nDomain knowledge (context):\n${JSON.stringify(
      knowledge
    )}`.trim(),
  };

  const openaiBody = JSON.stringify({
    model: MODEL,
    stream: true,
    temperature,
    max_tokens: 600,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mudassir_tracks",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["say", "show"],
          properties: {
            say: { type: "string", maxLength: 600 }, // ~90 words cap
            show: { type: "string", maxLength: 800 }, // concise, but room for bullets
          },
        },
      },
    },
    messages: [sys, ...sanitized],
  });

  const upstream = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: openaiBody,
  });

  if (!upstream.ok || !upstream.body) {
    const err = await safeText(upstream);
    return new Response(
      `event: done\ndata: ${JSON.stringify({
        raw: { error: err || upstream.statusText },
      })}\n\n`,
      sseHeaders()
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Optional: initial ping (keeps some proxies happy)
      controller.enqueue(encoder.encode(`:ok\n\n`));

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullText = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE frames
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            // Each frame can contain multiple lines like:
            // data: {...}
            // (ignore "role", "model", etc. lines if present)
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const data = dataLine.slice(6).trim();
            if (data === "[DONE]") {
              // At the end, emit full JSON {say, show}
              const raw = finalizeRaw(fullText);
              send("done", { raw });
              controller.close();
              return;
            }

            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta;

              // Stream only natural text tokens (ignore tool_calls etc.)
              const token = delta?.content;
              if (token) {
                fullText += token;
                send("token", { text: token });
              }
            } catch {
              // ignore malformed frame
            }
          }
        }

        const raw = finalizeRaw(fullText);
        send("done", { raw });
        controller.close();
      } catch (e: any) {
        send("done", { raw: { error: e?.message || "stream error" } });
        controller.close();
      }
    },
  });

  return new Response(stream, sseHeaders());
}

function sseHeaders() {
  return {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // for some proxies
    },
  };
}

function finalizeRaw(fullText: string) {
  // Try to parse a trailing {...} JSON object for {say, show}; otherwise fall back.
  // Common pattern: assistant writes text, then ends with a fenced JSON block.
  const raw = tryExtractJson(fullText);
  if (raw && typeof raw.say === "string" && typeof raw.show === "string")
    return raw;
  return { say: stripMarkdown(fullText).slice(0, 1200), show: fullText };
}

function tryExtractJson(s: string) {
  // look for last { ... } block
  const lastOpen = s.lastIndexOf("{");
  const lastClose = s.lastIndexOf("}");
  if (lastOpen >= 0 && lastClose > lastOpen) {
    const maybe = s.slice(lastOpen, lastClose + 1);
    try {
      return JSON.parse(maybe);
    } catch {}
  }
  // try fenced ```json blocks
  const m = s.match(/```json\s*([\s\S]*?)\s*```/i);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  return null;
}

function stripMarkdown(t: string) {
  // super light MD stripper for TTS
  return t.replace(/[*_`#>~\-]/g, "").replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return null;
  }
}
