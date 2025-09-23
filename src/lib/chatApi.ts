import type { ChatMessage } from "@/types/chat";

const API_URL = "/api/chat";

export async function requestChatReply(
  history: ChatMessage[]
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as { reply?: string; error?: string };
  return (
    (typeof data.reply === "string" ? data.reply : "") ||
    "Sorry, I couldn’t generate a reply."
  );
}
