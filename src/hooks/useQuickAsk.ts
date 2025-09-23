import { useState, useCallback } from "react";
import type { ChatMessage } from "@/types/chat";
import {
  DEFAULT_CONVERSATION_ID,
  appendMessages,
  readMessages,
  writeMessages,
} from "@/lib/conversationStorage";
import { requestChatReply } from "@/lib/chatApi";

export function useQuickAsk(conversationId: string = DEFAULT_CONVERSATION_ID) {
  const [loading, setLoading] = useState(false);

  const askQuick = useCallback(
    async (text: string) => {
      setLoading(true);
      const current = readMessages(conversationId);
      writeMessages(
        [...current, { role: "user", content: text }],
        conversationId
      );

      try {
        const reply = await requestChatReply([
          ...current,
          { role: "user", content: text },
        ]);
        appendMessages([{ role: "assistant", content: reply }], conversationId);
      } catch {
        appendMessages(
          [
            {
              role: "assistant",
              content:
                "Couldn’t reach the interview brain right now. Try again in a moment.",
            },
          ],
          conversationId
        );
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  return { askQuick, loading };
}
