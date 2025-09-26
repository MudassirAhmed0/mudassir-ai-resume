"use client";

import { useState, useCallback } from "react";
import VoiceChat from "@/components/VoiceChat";
import { requestChatReply } from "@/lib/chatApi";
import {
  streamChat,
  type ChatMessage as StreamChatMessage,
} from "@/lib/streamChat";
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

  // streaming state
  const [liveText, setLiveText] = useState("");

  const handleSendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);
      setLiveText("");

      try {
        // Get AI response using streaming
        const history = [...messages, userMsg];
        const metaMessages: ChatMessage[] = [
          { role: "system", content: `CASUALNESS_HINT=${settings.casualness}` },
        ];

        // Convert to stream format
        const streamMessages: StreamChatMessage[] = [
          ...history,
          ...metaMessages,
        ];

        const { cancel } = streamChat({
          messages: streamMessages,
          temperature: 0.7,
          onToken: (token) => {
            setLiveText((prev) => prev + token);
          },
          onDone: async (raw) => {
            // Replace live text with final assistant message
            let show = raw.show || liveText;
            let say = raw.say || show;

            // Clean up pause tags
            show = show.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();
            say = say.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();

            // Add assistant message
            const aiMsg: ChatMessage = { role: "assistant", content: show };
            setMessages((prev) => [...prev, aiMsg]);
            setLiveText("");

            // Speak the response
            const normalizedSay = normalizeSay(show, {
              enforceCap: false,
              addInvite: false,
            });

            await speaker.speak({
              say: normalizedSay,
              voiceId: settings.voiceId,
              noCap: true,
            });
          },
          onError: (err) => {
            console.error("Streaming error:", err);
            const errorMsg: ChatMessage = {
              role: "assistant",
              content: `⚠️ ${err}`,
            };
            setMessages((prev) => [...prev, errorMsg]);
            setLiveText("");
          },
        });

        // Store cancel function for cleanup if needed
      } catch (error) {
        console.error("Error getting response:", error);
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        setMessages((prev) => [...prev, errorMsg]);
        setLiveText("");
      } finally {
        setIsThinking(false);
      }
    },
    [messages, settings.casualness, settings.voiceId, liveText]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <VoiceChat
        messages={messages}
        isThinking={isThinking}
        avatarUrl="/mudassir.jpeg"
        defaultShowComposer={true}
        onSendText={handleSendText}
        liveText={liveText}
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
