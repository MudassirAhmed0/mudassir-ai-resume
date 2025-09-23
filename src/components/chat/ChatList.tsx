"use client";

import Avatar from "@/components/Avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isSpeaking } from "@/lib/speech";
import type { ChatMessage } from "@/types/chat";
import MessageBubble from "./MessageBubble";
import { ForwardedRef, forwardRef } from "react";

type Props = {
  messages: ChatMessage[];
  loading: boolean;
  speaking: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
};

const ChatList = forwardRef<HTMLDivElement, Props>(function ChatListInner(
  { messages, loading, speaking, endRef }: Props,
  _ref: ForwardedRef<HTMLDivElement>
) {
  return (
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
              <MessageBubble message={m} />
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
  );
});

export default ChatList;
