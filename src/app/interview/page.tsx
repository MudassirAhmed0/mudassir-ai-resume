"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import Chat, { type ChatMessage } from "@/components/Chat";
import { Button } from "@/components/ui/button";
import { isSpeaking } from "@/lib/speech";

const STORAGE_KEY = "ai-chat:default";

function readMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMessages(msgs: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {}
}

export default function InterviewPage() {
  const [chatKey, setChatKey] = useState(() => Date.now());
  const [speaking, setSpeaking] = useState(false);

  // Seed an initial greeting from the avatar if the thread is empty.
  useLayoutEffect(() => {
    const msgs = readMessages();
    if (msgs.length === 0) {
      const seed: ChatMessage = {
        role: "assistant",
        content:
          "Hey, I’m Mudassir’s avatar. Ask me about roles, projects, or how I’d build your MVP.",
      };
      writeMessages([seed]);
      // force Chat to mount after we wrote the seed
      setChatKey(Date.now());
    }
  }, []);

  // Mirror TTS speaking state on the left avatar
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setSpeaking(isSpeaking());
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Quick actions – auto-send message & get answer, then remount Chat so it picks
  // up updated localStorage state. (If you prefer "prefill input" only, see note below.)
  const askQuick = async (text: string) => {
    const current = readMessages();
    const userMsg: ChatMessage = { role: "user", content: text };
    writeMessages([...current, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...current, userMsg] }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      const reply =
        (typeof data.reply === "string" ? data.reply : "") ||
        "Sorry, I couldn’t generate a reply.";
      const after = readMessages();
      writeMessages([...after, { role: "assistant", content: reply }]);
    } catch {
      const after = readMessages();
      writeMessages([
        ...after,
        {
          role: "assistant",
          content:
            "Couldn’t reach the interview brain right now. Try again in a moment.",
        },
      ]);
    } finally {
      // remount Chat to reload messages from localStorage
      setChatKey(Date.now());
    }
  };

  // If you strictly want chips to *prefill input* (not auto-send),
  // replace `askQuick(label)` in the onClick with:
  //   localStorage.setItem("ai-chat:draft", label); setChatKey(Date.now());
  // and add a tiny effect in Chat to read that draft into its input on mount.

  const chips = useMemo(
    () => [
      "Show projects",
      "Experience timeline",
      "Why hire you?",
      "How would you build our MVP chat?",
    ],
    []
  );

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[320px_1fr]">
      {/* Left column: avatar + quick chips */}
      <aside className="border-b md:border-b-0 md:border-r bg-white">
        <div className="p-6 flex flex-col items-center gap-4">
          <Avatar speaking={speaking} size={96} />
          <div className="text-center">
            <h2 className="font-semibold">Mudassir (AI)</h2>
            <p className="text-sm text-muted-foreground">
              Resume Interview Assistant
            </p>
          </div>

          <div className="mt-4 w-full flex flex-wrap gap-2">
            {chips.map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => askQuick(label)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right column: Chat */}
      <main className="bg-white">
        <Chat
          key={chatKey}
          onMessage={() => {
            // we already mirror speaking via isSpeaking(); nothing else needed here
          }}
        />
      </main>
    </div>
  );
}
