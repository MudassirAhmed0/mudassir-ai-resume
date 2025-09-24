import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import knowledge from "@/data/knowledge.json";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { ChatCompletionMessageParam } from "openai/resources";

type Role = "user" | "assistant"; // ← disallow client 'system' injection
type Message = { role: Role; content: string };

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      messages?: Message[];
    };
    const input = Array.isArray(body?.messages) ? body.messages : [];

    // sanitize client messages (user/assistant only)
    const sanitized: Message[] = input.filter(
      (m): m is Message =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant")
    );

    const openai = new OpenAI({ apiKey });
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: "KNOWLEDGE = " + JSON.stringify(knowledge) },
      ...(body.messages ?? []), // assuming you parsed the POST body
    ];
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: "KNOWLEDGE = " + JSON.stringify(knowledge) },
        ...messages,
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("api/chat error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
