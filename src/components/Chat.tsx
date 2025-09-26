// src/components/Chat.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requestChatReply } from "@/lib/chatApi";
import { normalizeSay } from "@/lib/spokenizer";
import { speaker } from "@/lib/speaker";
import { useSTT } from "@/hooks/useSTT";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils"; // if you don't have cn, replace with className strings
import SettingsDrawer from "@/components/SettingsDrawer";
import { useToast } from "./ui/use-toast";
import { getAvgChars, onUsageChange } from "@/lib/usage";
import QAPanel from "@/components/dev/QAPanel";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  conversationId?: string;
  onMessage?: (msg: ChatMessage) => void;
  resumeHref?: string; // download link
};

const STORAGE_PREFIX = "ai-chat:";
const DRAFT_KEY_PREFIX = "ai-chat:draft:";

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function readMessages(id: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(id));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMessages(id: string, msgs: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(msgs));
  } catch {}
}

function readDraft(id: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DRAFT_KEY_PREFIX + id) || "";
}

function writeDraft(id: string, text: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + id, text);
  } catch {}
}

/** Robustly extract { say, show } from assistant string. */
function safeParseAssistant(raw: string): { say: string; show: string } {
  const text = (raw || "").trim();

  // Try code-fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidates: string[] = [];
  if (fenced) candidates.push(fenced);

  // Try whole string
  candidates.push(text);

  // Try extract the first balanced { ... } that contains "say" & "show"
  const i = text.indexOf("{");
  if (i !== -1) {
    for (
      let end = text.lastIndexOf("}");
      end > i;
      end = text.lastIndexOf("}", end - 1)
    ) {
      const slice = text.slice(i, end + 1);
      if (slice.includes('"say"') && slice.includes('"show"')) {
        candidates.push(slice);
        break;
      }
    }
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      let say = typeof obj?.say === "string" ? obj.say : "";
      let show = typeof obj?.show === "string" ? obj.show : "";

      // Clean show: strip pause tags if present
      if (show)
        show = show
          .replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ")
          .replace(/\s+/g, " ")
          .trim();

      if (say || show) {
        if (!say) say = show;
        if (!show) show = say.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();
        return { say, show };
      }
    } catch {}
  }

  // Fallback
  const clean = text.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();
  return { say: text, show: clean };
}

function isOutOfScope(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("i’m here as my professional avatar") ||
    t.includes("i'm here as my professional avatar")
  );
}

export default function Chat({
  conversationId = "default",
  onMessage,
  resumeHref = "/resume.pdf",
}: Props) {
  // settings (voice/fallback/casualness)
  const { settings } = useSettings();

  // mirror fallback toggle into speaker
  useEffect(() => {
    speaker.setFallbackEnabled(settings.fallback);
  }, [settings.fallback]);

  // speaking state (driven by speaker)
  const [speaking, setSpeaking] = useState(false);
  const { toast } = useToast();
  const [avgChars10, setAvgChars10] = useState<number>(() => getAvgChars(10));
  useEffect(() => {
    speaker.onStart = () => setSpeaking(true);
    speaker.onEnd = () => setSpeaking(false);
    return () => {
      speaker.onStart = null;
      speaker.onEnd = null;
      speaker.onBoundary = null;
    };
  }, []);

  // hook speaker notices -> toast
  useEffect(() => {
    speaker.onNotice = (msg) => toast({ description: msg });
    return () => {
      speaker.onNotice = null;
    };
  }, [toast]);

  // listen to usage changes
  useEffect(() => {
    const unsub = onUsageChange(() => setAvgChars10(getAvgChars(10)));
    return unsub;
  }, []);

  // messages
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    readMessages(conversationId)
  );
  const [input, setInput] = useState<string>(() => readDraft(conversationId));
  const [loading, setLoading] = useState(false);

  // persist
  useEffect(() => {
    writeMessages(conversationId, messages);
  }, [conversationId, messages]);
  useEffect(() => {
    writeDraft(conversationId, input);
  }, [conversationId, input]);

  // auto scroll
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, speaking]);

  // STT
  const stt = useSTT({
    onInterim: setInput,
    onFinalSubmit: async (finalText: string) => {
      if (!finalText) return;
      await send(finalText);
    },
    debounceMs: 1200,
  });

  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, m];
        onMessage?.(m);
        return next;
      });
    },
    [onMessage]
  );

  const send = useCallback(
    async (override?: string, meta?: Record<string, string>) => {
      if (loading) return;
      const content = (override ?? input).trim();
      if (!content) return;

      // barge-in: cancel any ongoing TTS
      speaker.cancel();

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...messages, userMsg];
      addMessage(userMsg);
      setInput("");
      setLoading(true);

      try {
        // system hints
        const metaMessages: ChatMessage[] = [
          { role: "system", content: `CASUALNESS_HINT=${settings.casualness}` },
          ...Object.entries(meta ?? {}).map(
            ([k, v]) =>
              ({ role: "system", content: `${k}=${v}` } as ChatMessage)
          ),
        ];

        const reply = await requestChatReply([...history, ...metaMessages]);

        // Parse assistant JSON safely
        const parsed = safeParseAssistant(reply);

        // Source of truth: what we show
        let show = parsed.show.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();
        if (!show)
          show = parsed.say.replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ").trim();

        // derive spoken track from what we show
        const wantCapInvite = meta?.CAP_POLICY === "cap+invite";
        const say = normalizeSay(show, {
          enforceCap: wantCapInvite ? true : false,
          addInvite: wantCapInvite ? true : false,
        });

        // Render bubble
        const aiMsg: ChatMessage = { role: "assistant", content: show };
        addMessage(aiMsg);

        // TTS
        await speaker.speak({
          say,
          voiceId: settings.voiceId,
          noCap: !wantCapInvite, // if we asked for cap+invite, let TTS cap too
        });
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
    [
      addMessage,
      input,
      loading,
      messages,
      settings.casualness,
      settings.voiceId,
    ]
  );

  const toggleMic = useCallback(() => {
    // barge-in if speaking
    if (speaking) speaker.cancel();
    if (!stt.supported || loading) return;
    stt.toggle(input);
  }, [input, loading, speaking, stt]);

  // UI bits
  const isSendingDisabled = loading;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-[100dvh] max-h-screen flex-col">
      {/* Hidden QA panel (Cmd/Ctrl+Alt+Q) */}
      <QAPanel onRun={(prompt, meta) => void send(prompt, meta)} />
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="text-sm font-medium">Mudassir AI — Interview</div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={resumeHref}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4 text-primary hover:opacity-80"
          >
            Download Resume (PDF)
          </a>
          <SettingsDrawer />
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            const showScope = !isUser && isOutOfScope(m.content);

            return (
              <div
                key={idx}
                className={cn(
                  "mb-3 flex w-full",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm max-w-[85%] leading-relaxed",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {m.content}
                  {!isUser && showScope && (
                    <div className="mt-1">
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px]">
                        professional topics only
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div className="mb-3 flex w-full justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="sr-only">Typing</span>
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.2s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.1s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-foreground/50" />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Input row */}
      <div className="border-t px-3 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button
            type="button"
            variant={stt.isRecording ? "destructive" : "secondary"}
            onClick={toggleMic}
            className={cn(stt.isRecording && "animate-pulse")}
            title={stt.isRecording ? "Stop mic" : "Start mic"}
          >
            {stt.isRecording ? "Stop" : "Mic"}
          </Button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about roles, projects, trade-offs…"
            disabled={isSendingDisabled}
          />

          <Button
            type="button"
            onClick={() => void send()}
            disabled={isSendingDisabled}
          >
            Send
          </Button>
        </div>
      </div>
      {/* Hidden usage counter for diagnostics */}
      <div className="sr-only" data-avg-chars-10={avgChars10}>
        avg chars / 10: {avgChars10}
      </div>
    </div>
  );
}
