"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import Avatar from "./Avatar";
import { speak, isSpeaking } from "@/lib/speech";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages as Message[]);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: newMessages }),
    });

    const data = await res.json();
    const reply = data.reply?.content || "…";

    setMessages([
      ...(newMessages as Message[]),
      { role: "assistant", content: reply },
    ]);
    setLoading(false);

    setSpeaking(true);
    speak(reply, () => setSpeaking(false));
  }

  return (
    <div className="flex flex-col flex-1">
      <ScrollArea className="flex-1 p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 ${
              m.role === "user" ? "justify-end" : ""
            }`}
          >
            {m.role === "assistant" && (
              <Avatar speaking={speaking && isSpeaking()} />
            )}
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-500 text-white ml-auto"
                  : "bg-gray-200 text-gray-900"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-sm text-gray-500 italic">AI is typing…</div>
        )}
      </ScrollArea>
      <div className="p-4 flex gap-2 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <Button onClick={sendMessage} disabled={loading}>
          Send
        </Button>
      </div>
    </div>
  );
}
