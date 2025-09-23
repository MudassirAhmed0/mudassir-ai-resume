"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import Avatar from "./Avatar";
import { speak, cancelSpeech, isSpeaking } from "@/lib/speech";

type Role = "user" | "assistant";
export type ChatMessage = { role: Role; content: string };

type Props = {
  /** Optional hook to bubble message events (each time a message is added). */
  onMessage?: (message: ChatMessage, allMessages: ChatMessage[]) => void;
};

const CONVERSATION_ID = "default";
const STORAGE_KEY = `ai-chat:${CONVERSATION_ID}`;

export default function Chat({ onMessage }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, speaking]);

  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, m];
        onMessage?.(m, next);
        return next;
      });
    },
    [onMessage]
  );

  const sendMessage = useCallback(async () => {
    if (loading) return;
    const content = input.trim();
    if (!content) return;

    // Stop any current TTS before sending a new message
    cancelSpeech();
    setSpeaking(false);

    // Push user message
    const userMsg: ChatMessage = { role: "user", content };
    addMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = (await res.json()) as { reply?: string; error?: string };

      const replyText =
        (typeof data.reply === "string" ? data.reply : "") ||
        "Sorry, I couldn’t generate a reply.";

      const aiMsg: ChatMessage = { role: "assistant", content: replyText };
      addMessage(aiMsg);

      // Speak the reply and toggle Avatar pulse while speaking
      speak(
        replyText,
        () => setSpeaking(true),
        () => setSpeaking(false)
      );
    } catch (err) {
      const aiMsg: ChatMessage = {
        role: "assistant",
        content:
          "Something went wrong reaching the interview brain. Try again in a moment.",
      };
      addMessage(aiMsg);
    } finally {
      setLoading(false);
    }
  }, [addMessage, input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // Basic Speech-to-Text using Web Speech API (if available)
  const canUseSTT = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }, []);

  const toggleRecording = useCallback(() => {
    if (!canUseSTT) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const SR: typeof window.SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!recognitionRef.current) {
      recognitionRef.current = new SR();
      recognitionRef.current.lang = "en-US";
      recognitionRef.current.interimResults = true;
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (e) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setInput((prev) => {
          const base = prev ? prev + " " : "";
          return (base + transcript).trimStart();
        });
      };
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
      recognitionRef.current.onerror = () => {
        setIsRecording(false);
      };
    }

    if (!isRecording) {
      setIsRecording(true);
      recognitionRef.current.start();
    } else {
      setIsRecording(false);
      recognitionRef.current.stop();
    }
  }, [canUseSTT, isRecording]);

  return (
    <div className="flex h-[100dvh] max-h-screen flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar speaking={speaking && isSpeaking()} />
          <div className="text-sm">
            <div className="font-semibold">Mudassir (AI)</div>
            <div className="text-muted-foreground">
              Resume Interview Assistant
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-4" ref={scrollAreaRef as any}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={`flex items-start gap-2 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && (
                  <div className="mt-0.5">
                    <Avatar speaking={speaking && isSpeaking()} size={36} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                <Avatar size={36} />
              </div>
              <div className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
                <span className="animate-pulse">AI is typing…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
          <Button
            type="button"
            variant={isRecording ? "secondary" : "outline"}
            onClick={toggleRecording}
            disabled={!canUseSTT || loading}
            title={canUseSTT ? "Toggle voice input" : "Voice not supported"}
          >
            {/* Mic icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isRecording ? "animate-pulse" : ""}
            >
              <path d="M12 1v11" />
              <rect x="9" y="1" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <path d="M12 19v4" />
            </svg>
          </Button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about my roles, projects, stack…"
            disabled={loading}
          />

          <Button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
