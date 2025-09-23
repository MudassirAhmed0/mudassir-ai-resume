"use client";

import ChatHeader from "@/components/chat/ChatHeader";
import ChatList from "@/components/chat/ChatList";
import InputBar from "@/components/chat/InputBar";
import { useChatController } from "@/hooks/useChatController";
import type { ChatMessage } from "@/types/chat";

type Props = {
  conversationId?: string;
  onMessage?: (m: ChatMessage, all: ChatMessage[]) => void;
  showHeader?: boolean;
  resumeHref?: string;
};

export default function Chat({
  conversationId = "default",
  onMessage,
  showHeader = true,
  resumeHref = "/resume.pdf",
}: Props) {
  const c = useChatController({ conversationId, onMessage });

  return (
    <div className="flex h-[100dvh] max-h-screen flex-col">
      {showHeader && (
        <ChatHeader speaking={c.ttsSpeaking} resumeHref={resumeHref} />
      )}

      <ChatList
        messages={c.messages}
        loading={c.loading}
        speaking={c.ttsSpeaking}
        endRef={c.endRef}
      />

      <InputBar
        value={c.input}
        onChange={c.setInput}
        onSend={() => void c.send()}
        disabled={c.loading}
        sttSupported={c.stt.supported}
        sttRecording={c.stt.isRecording}
        onToggleMic={c.stt.toggle}
        speaking={c.ttsSpeaking}
      />
    </div>
  );
}
