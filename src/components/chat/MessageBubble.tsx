"use client";

import type { ChatMessage } from "@/types/chat";
import { isOutOfScope } from "@/lib/scope";

type Props = {
  message: ChatMessage;
};

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const scopeChip = !isUser && isOutOfScope(message.content);

  return (
    <div className="flex max-w-[80%] flex-col">
      <div
        className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {message.content}
      </div>
      {scopeChip && (
        <div
          className="mt-1 inline-flex items-center gap-1 self-start rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600"
          aria-label="professional topics only"
        >
          professional topics only
        </div>
      )}
    </div>
  );
}
