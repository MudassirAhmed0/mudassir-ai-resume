// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import knowledge from "@/data/knowledge.json"; // ensure tsconfig has "resolveJsonModule": true
import { SYSTEM_PROMPT, makeKnowledgeSystemMessage } from "@/lib/prompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const { messages = [] } = (await req.json()) as { messages: Msg[] };

    const systemMessages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: makeKnowledgeSystemMessage(knowledge) }, // "KNOWLEDGE = <stringified ...>"
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [...systemMessages, ...messages],
      temperature: 0.4,
    });

    return NextResponse.json({ reply: completion.choices[0].message });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
