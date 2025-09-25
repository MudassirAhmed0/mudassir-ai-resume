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
import { normalizeSay } from "@/lib/spokenizer";

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
        const parsed = safeParseAssistant(reply);
        const show = parsed.show
          .replace(/\s*\[pause-\d{2,4}\]\s*/gi, " ")
          .trim();

        const say = normalizeSay(show, { enforceCap: false, addInvite: false });
        // Render "show" in bubble
        const aiMsg: ChatMessage = { role: "assistant", content: show };
        addMessage(aiMsg);

        // Speak "say" via ElevenLabs Speaker (queue-aware)
        const useVoice = getSavedVoiceId() || voiceId || DEFAULT_VOICE_ID;
        setVoiceId(useVoice); // persist last used
        await speaker.speak({ say, voiceId: useVoice, noCap: true });
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
