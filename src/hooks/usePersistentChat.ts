import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "@/types/chat";

const STORAGE_PREFIX = "ai-chat:";

export function usePersistentChat(
  conversationId: string,
  onMessage?: (m: ChatMessage, all: ChatMessage[]) => void
) {
  const storageKey = `${STORAGE_PREFIX}${conversationId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const hasWindow = typeof window !== "undefined";

  // load once
  useEffect(() => {
    if (!hasWindow) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      if (Array.isArray(parsed)) setMessages(parsed);
    } catch {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // persist
  useEffect(() => {
    if (!hasWindow) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey, hasWindow]);

  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, m];
        onMessage?.(m, next);
        return next;
      });
    },
    [onMessage]
  );

  return { messages, addMessage, setMessages };
}
