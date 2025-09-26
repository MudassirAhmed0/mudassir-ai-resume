// src/components/Chat.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requestChatReply } from "@/lib/chatApi";
import {
  streamChat,
  type ChatMessage as StreamChatMessage,
} from "@/lib/streamChat";
import { normalizeSay } from "@/lib/spokenizer";
import { speaker } from "@/lib/speaker";
import { createSegmenter } from "@/lib/segmenter";
import { useSTT } from "@/hooks/useSTT";
import { openTTSStream } from "@/lib/ttsWsClient";
import { ElevenPlayer } from "@/lib/ElevenPlayer";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils"; // if you don't have cn, replace with className strings
import SettingsDrawer from "@/components/SettingsDrawer";
import { useToast } from "./ui/use-toast";
import { getAvgChars, onUsageChange } from "@/lib/usage";
import QAPanel from "@/components/dev/QAPanel";

// State machine types
type LoopState = "idle" | "listening" | "thinking" | "speaking";

type FSM = {
  state: LoopState;
  pending: number; // how many utterances are queued/playing
  streamDone: boolean; // chat SSE finished?
};

type Act =
  | { type: "LISTEN" }
  | { type: "HEARD"; text: string }
  | { type: "THINK" }
  | { type: "SPEAK_SEG"; count: number }
  | { type: "UTTER_END" }
  | { type: "STREAM_DONE" }
  | { type: "CANCEL" };

function reducer(s: FSM, a: Act): FSM {
  switch (a.type) {
    case "LISTEN":
      return { state: "listening", pending: 0, streamDone: false };
    case "HEARD":
      return { state: "thinking", pending: 0, streamDone: false };
    case "THINK":
      return { ...s, state: "thinking" };
    case "SPEAK_SEG":
      return { ...s, state: "speaking", pending: s.pending + a.count };
    case "UTTER_END": {
      const pending = Math.max(0, s.pending - 1);
      const backToListening = s.streamDone && pending === 0;
      return {
        state: backToListening ? "listening" : s.state,
        pending,
        streamDone: s.streamDone,
      };
    }
    case "STREAM_DONE": {
      const backToListening = s.pending === 0;
      return {
        state: backToListening ? "listening" : s.state,
        pending: s.pending,
        streamDone: true,
      };
    }
    case "CANCEL":
      return { state: "listening", pending: 0, streamDone: false };
    default:
      return s;
  }
}

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

  // Boot greet refs
  const hasBootGreeted = useRef(false);
  const isGreetingRef = useRef(false);

  // State machine
  const [{ state, pending, streamDone }, dispatch] = useReducer(reducer, {
    state: "idle",
    pending: 0,
    streamDone: false,
  });

  // settings (voice/fallback/casualness)
  const { settings } = useSettings();

  // --- STT first ---
  const stt = useSTT({
    onInterim: (text: string) => {
      setInput(text);
      // Handle barge-in during greeting
      if (isGreetingRef.current && text.trim()) {
        isGreetingRef.current = false;
        try { speaker.cancel?.(); } catch {}
      }
    },
    onFinalSubmit: async (finalText: string) => {
      if (!finalText) return;
      // Handle barge-in during greeting
      if (isGreetingRef.current) {
        isGreetingRef.current = false;
        try { speaker.cancel?.(); } catch {}
      }
      dispatch({ type: "HEARD", text: finalText });
      handleUserTurn(finalText);
    },
    debounceMs: 1200,
  });

  // mirror fallback toggle into speaker
  useEffect(() => {
    speaker.setFallbackEnabled(settings.fallback);
  }, [settings.fallback]);

  // speaking state (driven by speaker)
  const [speaking, setSpeaking] = useState(false);
  const { toast } = useToast();
  const [avgChars10, setAvgChars10] = useState<number>(() => getAvgChars(10));
  useEffect(() => {
    speaker.onStart = () => {
      setSpeaking(true);
      setIsSpeaking(true);
    };
    speaker.onEnd = () => {
      setSpeaking(false);
      setIsSpeaking(false);
      dispatch({ type: "UTTER_END" });
    };
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

  // State machine effects
  const segRef = useRef(createSegmenter());
  const streamCancelRef = useRef<null | (() => void)>(null);
  const isStreamingRef = useRef(false);

  // --- Then bootGreet uses stt.start safely ---
  const bootGreet = useCallback(() => {
    if (hasBootGreeted.current) return;
    hasBootGreeted.current = true;

    dispatch({ type: "LISTEN" });
    stt.start(""); // now stt is already defined

    isGreetingRef.current = true;
    speaker.speak({
      say: "Hey—ready when you are.",
      voiceId: settings.voiceId,
      noCap: true,
    });
  }, [stt, settings.voiceId, dispatch]);

  /** Auto-enter Listening and greet on first mount */
  useEffect(() => {
    if (state === "idle") dispatch({ type: "LISTEN" });
    if (state === "listening") bootGreet();
  }, [state, bootGreet]);

  // messages
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    readMessages(conversationId)
  );
  const [input, setInput] = useState<string>(() => readDraft(conversationId));
  const [loading, setLoading] = useState(false);

  // streaming state
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveCommitted, setLiveCommitted] = useState("");
  const [liveTail, setLiveTail] = useState("");

  // segmenter for real-time TTS (moved to state machine effects)

  // TTS streaming refs
  const ttsRef = useRef<ReturnType<typeof openTTSStream> | null>(null);
  const playerRef = useRef<ElevenPlayer | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // persist
  useEffect(() => {
    writeMessages(conversationId, messages);
  }, [conversationId, messages]);
  useEffect(() => {
    writeDraft(conversationId, input);
  }, [conversationId, input]);

  // auto scroll
  const endRef = useRef<HTMLDivElement | null>(null);
  const liveText = liveCommitted + liveTail;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, speaking, liveText]);

  // ...existing code...

  /** When we enter Listening, ensure STT is running */
  useEffect(() => {
    if (state === "listening" && !stt.isRecording) stt.start("");
  }, [state, stt.isRecording, stt.start]);

  /** When we leave Listening (Thinking/Speaking), pause STT to avoid echo */
  useEffect(() => {
    if ((state === "thinking" || state === "speaking") && stt.isRecording)
      stt.stop();
  }, [state, stt.isRecording, stt.stop]);

  /** Barge-in: if user starts mic while we are Thinking/Speaking -> cancel stream+TTS and go listen */
  useEffect(() => {
    if (stt.isRecording && (state === "thinking" || state === "speaking")) {
      try {
        speaker.cancel?.();
      } catch {}
      try {
        streamCancelRef.current?.();
      } catch {}
      isStreamingRef.current = false;
      streamCancelRef.current = null;
      dispatch({ type: "CANCEL" });
    }
  }, [stt.isRecording, state]);

  /** Barge-in: cancel greet if user speaks mid-greet */
  useEffect(() => {
    // Stop marking greeting once its utterance ends
    speaker.onEnd = () => { isGreetingRef.current = false; };

    return () => { speaker.onEnd = null; };
  }, []);

  // TTS streaming function
  function beginTrueStreaming(voiceId: string) {
    // 1) open ws
    ttsRef.current?.close();
    ttsRef.current = openTTSStream({
      voiceId,
      modelId: "eleven_turbo_v2_5",
      format: "mp3_44100_128",
      onAudio: (b64) => playerRef.current?.pushBase64(b64),
    });

    // 2) start player
    if (!audioElRef.current) {
      const el = new Audio();
      audioElRef.current = el;
    }
    playerRef.current?.stop();
    playerRef.current = new ElevenPlayer(audioElRef.current!);
    playerRef.current.start("audio/mpeg");
  }

  const [isSpeaking, setIsSpeaking] = useState(false);

  // Barge-in: if user starts STT while we're speaking or streaming -> kill TTS + SSE
  useEffect(() => {
    if (!stt.isRecording) return;
    if (isSpeaking || isStreamingRef.current) {
      try {
        speaker.cancel?.();
      } catch {}
      try {
        streamCancelRef.current?.();
      } catch {}
      try {
        ttsRef.current?.close();
      } catch {}
      try {
        playerRef.current?.stop();
      } catch {}
      streamCancelRef.current = null;
      isStreamingRef.current = false;

      // clear live bubble if you want an immediate clean slate
      setLiveCommitted("");
      setLiveTail("");
      setLiveId(null);
    }
  }, [stt.isRecording, isSpeaking]);

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

  // ---- send one user turn, stream assistant, speak segments ----
  const handleUserTurn = useCallback(
    (userText: string) => {
      // add user to transcript UI if you have it
      const userMsg: ChatMessage = { role: "user", content: userText };
      addMessage(userMsg);

      // reset segmenter and live bubble
      segRef.current = createSegmenter();

      // start streaming
      const { cancel } = streamChat({
        messages: [...messages, userMsg],
        onToken: (t) => {
          const { ready, rest } = segRef.current.push(t);

          // live bubble update:
          setLiveCommitted((prev) => prev + ready.join(""));
          setLiveTail(rest);

          if (ready.length) {
            // enqueue TTS for each finalized segment
            for (const seg of ready) {
              const say = normalizeSay(seg, {
                enforceCap: false,
                addInvite: false,
              });
              speaker.speak({ say, voiceId: settings.voiceId, noCap: true });
            }
            dispatch({ type: "SPEAK_SEG", count: ready.length });
          }
        },
        onDone: (raw) => {
          // flush remainder (optional to speak)
          const leftover = segRef.current.flush();
          if (leftover.length) {
            const say = normalizeSay(leftover.join(""), {
              enforceCap: false,
              addInvite: false,
            });
            if (say.trim()) {
              speaker.speak({ say, voiceId: settings.voiceId, noCap: true });
              dispatch({ type: "SPEAK_SEG", count: 1 });
            }
          }

          // finalize transcript UI
          const finalShow = raw?.show ?? liveCommitted + liveTail;
          const aiMsg: ChatMessage = {
            role: "assistant",
            content: finalShow,
          };
          addMessage(aiMsg);
          setLiveCommitted("");
          setLiveTail("");

          isStreamingRef.current = false;
          streamCancelRef.current = null;
          dispatch({ type: "STREAM_DONE" });

          // you may also prefer Eleven's canonical say:
          if (raw?.say) {
            // Optional: if you rely strictly on raw.say, remove the leftover speak above.
          }
        },
        onError: () => {
          isStreamingRef.current = false;
          streamCancelRef.current = null;
          dispatch({ type: "STREAM_DONE" }); // treat as ended so we return to Listening
          const aiMsg: ChatMessage = {
            role: "assistant",
            content: "⚠️ Stream error",
          };
          addMessage(aiMsg);
          setLiveCommitted("");
          setLiveTail("");
        },
      });

      isStreamingRef.current = true;
      streamCancelRef.current = cancel;
      dispatch({ type: "THINK" });
    },
    [settings.voiceId, messages, addMessage, liveCommitted, liveTail]
  );

  const send = useCallback(
    async (override?: string, meta?: Record<string, string>) => {
      if (loading) return;
      const content = (override ?? input).trim();
      if (!content) return;

      // barge-in: cancel any ongoing TTS
      speaker.cancel();
      ttsRef.current?.close();
      playerRef.current?.stop();

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...messages, userMsg];
      addMessage(userMsg);
      setInput("");
      setLoading(true);

      // Add a live bubble placeholder
      const id = crypto.randomUUID();
      setLiveId(id);
      setLiveCommitted("");
      setLiveTail("");

      // Reset segmenter for new message
      segRef.current = createSegmenter();

      // Start TTS streaming
      beginTrueStreaming(settings.voiceId);

      try {
        // system hints
        const metaMessages: ChatMessage[] = [
          { role: "system", content: `CASUALNESS_HINT=${settings.casualness}` },
          ...Object.entries(meta ?? {}).map(
            ([k, v]) =>
              ({ role: "system", content: `${k}=${v}` } as ChatMessage)
          ),
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
            const { ready, rest } = segRef.current.push(token);

            if (ready.length) {
              // 1) Append finalized pieces to the bubble immediately
              const appended = ready.join("");
              setLiveCommitted((prev) => prev + appended);

              // 2) Send each finalized segment to TTS stream
              for (const seg of ready) {
                const say = normalizeSay(seg, {
                  enforceCap: false,
                  addInvite: false,
                });
                // Send to TTS stream with immediate trigger
                ttsRef.current?.sendText(say, true);
              }
            }

            // 3) Show current tail as the live-typing remainder
            setLiveTail(rest);
          },
          onDone: async (raw) => {
            isStreamingRef.current = false;
            streamCancelRef.current = null;

            // Flush any remainder as the last segment
            const leftover = segRef.current.flush();
            if (leftover.length) {
              const tailSeg = leftover.join("");
              setLiveCommitted((prev) => prev + tailSeg);
              // Send the final tail to TTS stream
              const say = normalizeSay(tailSeg, {
                enforceCap: false,
                addInvite: false,
              });
              ttsRef.current?.sendText(say, true);
            }

            // Flush TTS stream to signal end-of-input
            ttsRef.current?.flush();

            const finalShow = raw?.show ?? liveCommitted + liveTail;
            const aiMsg: ChatMessage = {
              role: "assistant",
              content: finalShow,
            };
            addMessage(aiMsg);
            setLiveId(null);
            setLiveCommitted("");
            setLiveTail("");

            // Also speak the canonical `raw.say` if provided (preferred):
            if (raw?.say) {
              const wantCapInvite = meta?.CAP_POLICY === "cap+invite";
              await speaker.speak({
                say: raw.say,
                voiceId: settings.voiceId,
                noCap: !wantCapInvite,
              });
            }
          },
          onError: (err) => {
            isStreamingRef.current = false;
            streamCancelRef.current = null;

            const aiMsg: ChatMessage = {
              role: "assistant",
              content: `⚠️ ${err}`,
            };
            addMessage(aiMsg);
            setLiveId(null);
            setLiveCommitted("");
            setLiveTail("");
          },
        });

        // Store cancel function for cleanup if needed
        isStreamingRef.current = true;
        streamCancelRef.current = cancel;
      } catch {
        addMessage({
          role: "assistant",
          content:
            "Something went wrong reaching the interview brain. Try again in a moment.",
        });
        setLiveId(null);
        setLiveCommitted("");
        setLiveTail("");
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
      liveCommitted,
      liveTail,
    ]
  );

  const toggleMic = useCallback(() => {
    // barge-in if speaking
    if (speaking) {
      speaker.cancel();
      ttsRef.current?.close();
      playerRef.current?.stop();
    }
    if (!stt.supported || loading) return;
    stt.toggle(input);
  }, [input, loading, speaking, stt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        streamCancelRef.current?.();
      } catch {}
      try {
        speaker.cancel?.();
      } catch {}
      try {
        ttsRef.current?.close();
      } catch {}
      try {
        playerRef.current?.stop();
      } catch {}
    };
  }, []);

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

          {/* Live streaming bubble */}
          {liveId && (
            <div className="mb-3 flex w-full justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm max-w-[85%] leading-relaxed">
                {liveText.length ? liveText : "…"}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {loading && !liveId && (
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
            title={
              state === "listening"
                ? "Listening..."
                : state === "thinking"
                ? "Thinking..."
                : state === "speaking"
                ? "Speaking..."
                : stt.isRecording
                ? "Stop mic"
                : "Start mic"
            }
          >
            {state === "listening"
              ? "Listening"
              : state === "thinking"
              ? "Thinking"
              : state === "speaking"
              ? "Speaking"
              : stt.isRecording
              ? "Stop"
              : "Mic"}
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
