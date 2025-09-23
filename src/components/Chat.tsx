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
  onMessage?: (message: ChatMessage, all: ChatMessage[]) => void;
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

  // --- Web Speech Recognition (webkit) ---
  const supportsSTT = useMemo(
    () => typeof window !== "undefined" && "webkitSpeechRecognition" in window,
    []
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sttBaseRef = useRef<string>(""); // text that was in input before recording
  const sttFinalRef = useRef<string>(""); // accumulated final pieces
  const sttInterimRef = useRef<string>(""); // current interim piece

  // Load persisted
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  // sendMessage supports an override so STT can submit immediately on end
  const sendMessage = useCallback(
    async (override?: string) => {
      if (loading) return;
      const content = (override ?? input).trim();
      if (!content) return;

      // stop any current TTS before sending (avoid echo)
      cancelSpeech();
      setSpeaking(false);

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...messages, userMsg];

      addMessage(userMsg);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = (await res.json()) as { reply?: string; error?: string };

        const replyText =
          (typeof data.reply === "string" ? data.reply : "") ||
          "Sorry, I couldn’t generate a reply.";

        const aiMsg: ChatMessage = { role: "assistant", content: replyText };
        addMessage(aiMsg);

        // ensure mic is off before TTS
        try {
          recognitionRef.current?.abort();
        } catch {}
        setIsRecording(false);

        // TTS
        speak(
          replyText,
          () => setSpeaking(true),
          () => setSpeaking(false)
        );
      } catch {
        addMessage({
          role: "assistant",
          content:
            "Something went wrong reaching the interview brain. Try again in a moment.",
        });
      } finally {
        setLoading(false);
      }
    },
    [addMessage, input, loading, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // ----- Mic: start/stop recognition; stream interim; submit on end -----
  const toggleRecording = useCallback(() => {
    if (!supportsSTT) return;

    // @ts-ignore - webkitSpeechRecognition exists on Chrome-based browsers
    const Ctor = window.webkitSpeechRecognition as {
      new (): SpeechRecognition;
    };

    // stop TTS if starting mic
    cancelSpeech();
    setSpeaking(false);

    if (!recognitionRef.current) {
      recognitionRef.current = new Ctor();
      recognitionRef.current.lang = "en-US";
      recognitionRef.current.continuous = false; // phrase mode
      recognitionRef.current.interimResults = true;
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (e: any) => {
        let finalChunk = "";
        let interimChunk = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const txt = res[0].transcript;
          if (res.isFinal) finalChunk += (finalChunk ? " " : "") + txt;
          else interimChunk += (interimChunk ? " " : "") + txt;
        }

        if (finalChunk) {
          sttFinalRef.current = [sttFinalRef.current, finalChunk]
            .filter(Boolean)
            .join(" ");
        }
        sttInterimRef.current = interimChunk;

        const live = [
          sttBaseRef.current,
          sttFinalRef.current,
          sttInterimRef.current,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ");
        setInput(live);
      };

      recognitionRef.current.onend = async () => {
        setIsRecording(false);
        sttInterimRef.current = "";
        const finalText = [sttBaseRef.current, sttFinalRef.current]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        // clear interim on UI
        setInput(finalText);

        if (finalText) {
          // Auto-submit the final transcript
          await sendMessage(finalText);
        }
      };

      recognitionRef.current.onerror = () => {
        setIsRecording(false);
      };
    }

    if (!isRecording) {
      // snapshot current typed text as base, reset buffers
      sttBaseRef.current = input;
      sttFinalRef.current = "";
      sttInterimRef.current = "";

      setIsRecording(true);
      try {
        recognitionRef.current.start();
      } catch {
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, [input, sendMessage, supportsSTT, isRecording]);

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

      <ScrollArea className="flex-1 px-4 py-4">
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
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
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
            disabled={!supportsSTT || loading || speaking}
            title={
              !supportsSTT
                ? "Voice input not supported"
                : speaking
                ? "Wait for the bot to finish speaking"
                : "Toggle voice input"
            }
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

          <Button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
