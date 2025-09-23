// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import knowledge from "@/data/knowledge.json"; // ensure tsconfig has "resolveJsonModule": true
import { SYSTEM_PROMPT } from "@/lib/prompt";

type Role = "system" | "user" | "assistant";
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

    const inputMessages = Array.isArray(body?.messages) ? body.messages : [];

    // basic sanitization
    const allowedRoles: Role[] = ["system", "user", "assistant"];
    const sanitized: Message[] = inputMessages.filter(
      (m): m is Message =>
        m &&
        typeof m.content === "string" &&
        allowedRoles.includes(m.role as Role)
    );

    const openai = new OpenAI({ apiKey });

    const systemMessages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: "KNOWLEDGE = " + JSON.stringify(knowledge),
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [...systemMessages, ...sanitized],
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
