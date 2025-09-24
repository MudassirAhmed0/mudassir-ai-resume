"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatList from "@/components/chat/ChatList";
import InputBar from "@/components/chat/InputBar";
import { usePersistentChat } from "@/hooks/usePersistentChat";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useSTT } from "@/hooks/useSTT";
import { requestChatReply } from "@/lib/chatApi";
import type { ChatMessage } from "@/types/chat";
import { speaker } from "@/lib/speaker";
import { DEFAULT_VOICE_ID } from "@/lib/tts-config";

/* ----------------------------- helpers & state ---------------------------- */

const VOICE_LS_KEY = "tts:voiceId";

function getSavedVoiceId(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE_ID;
  return localStorage.getItem(VOICE_LS_KEY) || DEFAULT_VOICE_ID;
}

function saveVoiceId(id: string) {
  try {
    localStorage.setItem(VOICE_LS_KEY, id);
  } catch {}
}

/** Robustly extract { say, show } from assistant string. */
function safeParseAssistant(raw: string): { say: string; show: string } {
  const trimmed = (raw || "").trim();

  // Try to locate a JSON object even if wrapped in code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    const say = typeof parsed?.say === "string" ? parsed.say : trimmed;
    const show = typeof parsed?.show === "string" ? parsed.show : trimmed;
    return { say, show };
  } catch {
    // fallback: just mirror into show
    return { say: trimmed, show: trimmed };
  }
}

/* -------------------------------- component ------------------------------- */

type Props = {
  conversationId?: string;
  showHeader?: boolean;
  resumeHref?: string;
};

export default function Chat({
  conversationId = "default",
  showHeader = true,
  resumeHref = "/resume.pdf",
}: Props) {
  const { messages, addMessage } = usePersistentChat(conversationId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceId, setVoiceId] = useState<string>(() => getSavedVoiceId());

  useEffect(() => {
    saveVoiceId(voiceId);
  }, [voiceId]);

  // Hook speaker events to UI
  useEffect(() => {
    speaker.onStart = () => setSpeaking(true);
    speaker.onEnd = () => setSpeaking(false);
    // Optional: drive CSS var from analyser via onBoundary if you want
    // speaker.onBoundary = ({ energy }) => {
    //   document.documentElement.style.setProperty("--vu", energy.toFixed(3));
    // };
    return () => {
      speaker.onStart = null;
      speaker.onEnd = null;
      speaker.onBoundary = null;
    };
  }, []);

  const endRef = useAutoScroll([messages, loading, speaking]);

  const send = useCallback(
    async (override?: string) => {
      if (loading) return;
      const content = (override ?? input).trim();
      if (!content) return;

      // barge-in: cancel any current TTS before sending
      speaker.cancel();

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...messages, userMsg];

      addMessage(userMsg);
      setInput("");
      setLoading(true);

      try {
        const reply = await requestChatReply(history);

        // Parse assistant JSON safely
        const { say, show } = safeParseAssistant(reply);

        // Render "show" in bubble
        const aiMsg: ChatMessage = { role: "assistant", content: show };
        addMessage(aiMsg);

        // Speak "say" via ElevenLabs Speaker (queue-aware)
        const useVoice = getSavedVoiceId() || voiceId || DEFAULT_VOICE_ID;
        setVoiceId(useVoice); // persist last used
        await speaker.speak({ say, voiceId: useVoice });
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
    [addMessage, input, loading, messages, voiceId]
  );

  // STT — stream interim; submit on final (debounced inside hook)
  const stt = useSTT({
    onInterim: setInput,
    onFinalSubmit: async (finalText) => {
      if (!finalText) return;
      await send(finalText);
    },
  });

  // Barge-in: if user taps mic while speaking, cancel current audio first
  const toggleMic = useCallback(() => {
    if (speaking) speaker.cancel();
    if (!stt.supported || loading) return;
    stt.toggle(input);
  }, [input, loading, speaking, stt]);

  // Also barge-in: if user types & hits Enter/send while TTS is playing,
  // speaker.cancel() is already called inside send() above.

  const disableInput = useMemo(() => loading, [loading]);

  return (
    <div className="flex h-[100dvh] max-h-screen flex-col">
      {showHeader && <ChatHeader speaking={speaking} resumeHref={resumeHref} />}

      <ChatList
        messages={messages}
        loading={loading}
        speaking={speaking}
        endRef={endRef}
      />

      <InputBar
        value={input}
        onChange={setInput}
        onSend={() => void send()}
        disabled={disableInput}
        sttSupported={stt.supported}
        sttRecording={stt.isRecording}
        onToggleMic={toggleMic}
        speaking={speaking}
      />
    </div>
  );
}
