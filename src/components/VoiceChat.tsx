"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mic, MicOff, MoreHorizontal } from "lucide-react";
import Image from "next/image";

// ==== OPTIONAL HOOKS (wire these to your real implementations) =================
// Voice (STT)
import { useSTT } from "@/hooks/useSimpleSTT"; // { start(''), stop(), isRecording }
// TTS speaker events to know when we're speaking (for state chip + ring)
import { speaker } from "@/lib/speaker"; // supports .onStart(cb) and .onEnd(cb)

// Chat messages source. If you already have one, pass messages in via props or
// adapt the two TODOs below. Keeping as a prop-first component.

// ==============================================================================

export type ChatMessage = {
  id?: string | number;
  role: "user" | "assistant" | "system";
  content: string;
};

type VoiceState = "listening" | "thinking" | "speaking" | "idle";

type Props = {
  /** Live message stream; omit `system` if you don't want it listed */
  messages?: ChatMessage[];
  /** True when the model is generating a response */
  isThinking?: boolean;
  /** Avatar image for the big center portrait */
  avatarUrl?: string;
  /** Minimal text composer toggle default (hidden by default) */
  defaultShowComposer?: boolean;
  /** Optional: onSend handler if you enable the tiny composer */
  onSendText?: (text: string) => void;
};

export default function VoiceChat({
  messages = [],
  isThinking = false,
  avatarUrl = "/mudassir.jpeg",
  defaultShowComposer = false,
  onSendText,
}: Props) {
  const { start: startSTT, stop: stopSTT, isRecording, setOnFinal } = useSTT();

  // Track TTS speaking state via speaker events
  const [isSpeaking, setIsSpeaking] = useState(false);
  useEffect(() => {
    const offStart = (speaker as any)?.onStart?.(() => setIsSpeaking(true));
    const offEnd = (speaker as any)?.onEnd?.(() => setIsSpeaking(false));
    return () => {
      try {
        offStart?.();
      } catch {}
      try {
        offEnd?.();
      } catch {}
    };
  }, []);

  // Set up speech recognition callback
  useEffect(() => {
    setOnFinal((text: string) => {
      if (text.trim() && onSendText) {
        onSendText(text.trim());
      }
    });
  }, [setOnFinal, onSendText]);

  // Derive voice state priority: Speaking > Listening > Thinking > Idle
  const voiceState: VoiceState = useMemo(() => {
    if (isSpeaking) return "speaking";
    if (isRecording) return "listening";
    if (isThinking) return "thinking";
    return "idle";
  }, [isRecording, isSpeaking, isThinking]);

  // Transcript auto-scroll
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  // Mic toggle
  const toggleMic = useCallback(() => {
    if (isRecording) stopSTT();
    else startSTT("");
  }, [isRecording, startSTT, stopSTT]);

  // Tiny composer visibility
  const [showComposer, setShowComposer] = useState(defaultShowComposer);

  return (
    <div className="mx-auto w-full max-w-2xl p-6 min-h-[85vh] flex flex-col items-center justify-center gap-6">
      {/* ===== Big Avatar with Energy Ring + State Chip ===== */}
      <div className="relative">
        <EnergyRing state={voiceState} size={260} thickness={18} />
        <div className="absolute inset-0 grid place-content-center">
          <div className="rounded-full overflow-hidden shadow-xl ring-2 ring-white/70">
            <Image
              src={avatarUrl}
              alt="Avatar"
              width={180}
              height={180}
              className="h-[180px] w-[180px] object-cover"
              priority
            />
          </div>
        </div>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
          <StateChip state={voiceState} />
        </div>
      </div>

      {/* ===== Thin Transcript List (auto-scroll) ===== */}
      <div
        ref={listRef}
        className="w-full max-w-xl h-44 overflow-y-auto rounded-2xl border border-zinc-200/70 bg-white/60 backdrop-blur p-3 shadow-sm"
      >
        <Transcript messages={messages} />
      </div>

      {/* ===== Controls: Mic only + more (⋯) to reveal text input ===== */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMic}
          aria-pressed={isRecording}
          className="grid place-content-center size-11 rounded-full ring-1 ring-zinc-300 bg-white/90 hover:bg-zinc-50 shadow"
          title={isRecording ? "Stop mic" : "Start mic"}
        >
          {isRecording ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        <span className="text-sm text-zinc-600">
          {voiceState === "listening" && "Listening…"}
          {voiceState === "thinking" && "Thinking…"}
          {voiceState === "speaking" && "Speaking…"}
          {voiceState === "idle" && "Tap mic to start"}
        </span>

        <button
          onClick={() => setShowComposer((v) => !v)}
          className="ml-2 grid place-content-center size-9 rounded-full ring-1 ring-zinc-300 bg-white/90 hover:bg-zinc-50 shadow"
          title="More"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* ===== Minimal text UI (hidden by default) ===== */}
      {showComposer && <TinyComposer onSend={onSendText} />}

      {/* Styles for the ring animations */}
      <style jsx global>{`
        @keyframes swirl {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes breathe {
          0%,
          100% {
            transform: scale(1);
            filter: blur(16px);
            opacity: 0.65;
          }
          50% {
            transform: scale(1.04);
            filter: blur(18px);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
}

// ===================== Subcomponents ==========================================

function Transcript({ messages }: { messages?: ChatMessage[] }) {
  if (!messages?.length) {
    return (
      <div className="text-xs text-zinc-500">Transcript will appear here…</div>
    );
  }
  return (
    <div className="space-y-2 text-[13px] leading-snug">
      {messages
        .filter((m) => m.role !== "system")
        .map((m, i) => (
          <div key={m.id ?? i} className="flex gap-2">
            <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-zinc-300 text-zinc-700 bg-white/80">
              {m.role === "user" ? "You" : "Avatar"}
            </span>
            <p className="text-zinc-800/90">{m.content}</p>
          </div>
        ))}
    </div>
  );
}

function TinyComposer({ onSend }: { onSend?: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!value.trim()) return;
      onSend?.(value.trim());
      setValue("");
    },
    [onSend, value]
  );

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-xl flex items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-sm"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type (optional)…"
        className="flex-1 bg-transparent outline-none text-sm px-2 py-1"
      />
      <button
        type="submit"
        className="rounded-xl px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-300 bg-white hover:bg-zinc-50 shadow"
      >
        Send
      </button>
    </form>
  );
}

function StateChip({ state }: { state: VoiceState }) {
  const label =
    state === "listening"
      ? "Listening"
      : state === "thinking"
      ? "Thinking"
      : state === "speaking"
      ? "Speaking"
      : "Ready";
  return (
    <span className="px-3 py-1 text-xs font-medium rounded-full shadow ring-1 ring-zinc-300 bg-white/90 text-zinc-800">
      {label}
    </span>
  );
}

function EnergyRing({
  state,
  size = 240,
  thickness = 16,
}: {
  state: VoiceState;
  size?: number;
  thickness?: number;
}) {
  // Colors per state
  const stops = {
    listening: ["#22c55e", "#a3e635", "#22c55e"], // greenish
    thinking: ["#818cf8", "#06b6d4", "#818cf8"], // indigo→cyan
    speaking: ["#f97316", "#f43f5e", "#f97316"], // orange→rose
    idle: ["#9ca3af", "#cbd5e1", "#9ca3af"], // gray
  }[state];

  const ringStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "9999px",
    background: `conic-gradient(from 0deg, ${stops[0]}, ${stops[1]}, ${stops[2]})`,
    WebkitMask: `radial-gradient(farthest-side, transparent calc(50% - ${thickness}px), black calc(50% - ${
      thickness - 1
    }px))`,
    mask: `radial-gradient(farthest-side, transparent calc(50% - ${thickness}px), black calc(50% - ${
      thickness - 1
    }px))`,
    animation:
      state === "listening"
        ? "swirl 3.5s linear infinite, breathe 3s ease-in-out infinite"
        : state === "thinking"
        ? "swirl 6s linear infinite"
        : state === "speaking"
        ? "swirl 2s linear infinite, breathe 2.4s ease-in-out infinite"
        : "swirl 12s linear infinite",
    filter: state === "idle" ? "grayscale(0.4) opacity(0.8)" : undefined,
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Glow */}
      <div
        style={{
          ...ringStyle,
          position: "absolute",
          inset: 0,
          transform: "scale(1.05)",
          filter: "blur(18px)",
          opacity: 0.75,
        }}
      />
      {/* Crisp ring */}
      <div style={{ ...ringStyle, position: "absolute", inset: 0 }} />
    </div>
  );
}
