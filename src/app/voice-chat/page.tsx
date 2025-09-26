"use client";

import { useState, useCallback } from "react";
import VoiceChat from "@/components/VoiceChat";
import { requestChatReply } from "@/lib/chatApi";
import { normalizeSay } from "@/lib/spokenizer";
import { speaker } from "@/lib/speaker";
import { useSettings } from "@/hooks/useSettings";

type ChatMessage = {
  id?: string | number;
  role: "user" | "assistant" | "system";
  content: string;
};

export default function VoiceChatPage() {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const handleSendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);

      try {
        // Get AI response
        const history = [...messages, userMsg];
        const metaMessages: ChatMessage[] = [
          { role: "system", content: `CASUALNESS_HINT=${settings.casualness}` },
        ];

        const reply = await requestChatReply([...history, ...metaMessages]);

        // Parse assistant response
        const parsed = parseAssistantResponse(reply);
        const show = parsed.show || parsed.say;

        // Add assistant message
        const aiMsg: ChatMessage = { role: "assistant", content: show };
        setMessages((prev) => [...prev, aiMsg]);

        // Speak the response
        const say = normalizeSay(show, {
          enforceCap: false,
          addInvite: false,
        });

        await speaker.speak({
          say,
          voiceId: settings.voiceId,
          noCap: true,
        });
      } catch (error) {
        console.error("Error getting response:", error);
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsThinking(false);
      }
    },
    [messages, settings.casualness, settings.voiceId]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <VoiceChat
        messages={messages}
        isThinking={isThinking}
        avatarUrl="/mudassir.jpeg"
        defaultShowComposer={true}
        onSendText={handleSendText}
      />
    </div>
  );
}

// Simple assistant response parser
function parseAssistantResponse(raw: string): { say: string; show: string } {
  const text = (raw || "").trim();

  // Try to parse JSON response
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.say === "string" && typeof obj?.show === "string") {
      return { say: obj.say, show: obj.show };
    }
  } catch {}

  // Try to extract from code blocks
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try {
      const obj = JSON.parse(fenced);
      if (typeof obj?.say === "string" && typeof obj?.show === "string") {
        return { say: obj.say, show: obj.show };
      }
    } catch {}
  }

  // Fallback to plain text
  const clean = text.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();
  return { say: clean, show: clean };
}
