import { useCallback, useEffect, useState } from "react";
import { usePersistentChat } from "@/hooks/usePersistentChat";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useSTT } from "@/hooks/useSTT";
import { useTTS } from "@/hooks/useTTS";
import { requestChatReply } from "@/lib/chatApi";
import type { ChatMessage } from "@/types/chat";
import { cancelSpeech } from "@/lib/speech";

type Params = {
  conversationId?: string;
  onMessage?: (m: ChatMessage, all: ChatMessage[]) => void;
};

export function useChatController(params: Params = {}) {
  const { conversationId = "default", onMessage } = params;

  const { messages, addMessage } = usePersistentChat(conversationId, onMessage);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // TTS
  const tts = useTTS();

  // STT — stream interim into input; submit on end
  const stt = useSTT({
    onInterim: setInput,
    onFinalSubmit: async (finalText) => {
      if (!finalText) return;
      await send(finalText);
    },
  });

  // Prevent echo: whenever TTS starts, abort STT session if any
  useEffect(() => {
    if (tts.speaking) stt.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.speaking]);

  const endRef = useAutoScroll([messages, loading, tts.speaking]);

  const send = useCallback(
    async (contentOverride?: string) => {
      if (loading) return;
      const content = (contentOverride ?? input).trim();
      if (!content) return;

      // stop any ongoing speech before sending
      cancelSpeech();
      if (tts.speaking) tts.cancel();

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...messages, userMsg];

      addMessage(userMsg);
      setInput("");
      setLoading(true);

      try {
        const reply = await requestChatReply(history);
        const aiMsg: ChatMessage = { role: "assistant", content: reply };
        addMessage(aiMsg);

        // speak the reply
        tts.speakText(reply);
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
    [addMessage, input, loading, messages, tts]
  );

  const toggleMic = useCallback(() => {
    if (!stt.supported || loading || tts.speaking) return;
    stt.toggle(input);
  }, [input, loading, stt, tts.speaking]);

  return {
    // state for UI
    messages,
    input,
    setInput,
    loading,
    ttsSpeaking: tts.speaking,
    // actions
    send,
    // STT bridge for InputBar
    stt: {
      supported: stt.supported,
      isRecording: stt.isRecording,
      toggle: toggleMic,
    },
    // layout utility
    endRef,
  };
}
