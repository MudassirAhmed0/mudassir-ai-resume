"use client";

import { useLayoutEffect } from "react";
import type { ChatMessage } from "@/types/chat";
import {
  DEFAULT_CONVERSATION_ID,
  readMessages,
  writeMessages,
} from "@/lib/conversationStorage";
import { useRemountKey } from "./useRemountKey";

export function useConversationSeed(opts?: {
  conversationId?: string;
  seed?: ChatMessage;
}) {
  const conversationId = opts?.conversationId ?? DEFAULT_CONVERSATION_ID;
  const seed =
    opts?.seed ??
    ({
      role: "assistant",
      content:
        "Hey, I’m Mudassir’s avatar. Ask me about roles, projects, or how I’d build your MVP.",
    } as ChatMessage);

  const { key, bump } = useRemountKey();

  useLayoutEffect(() => {
    const msgs = readMessages(conversationId);
    if (msgs.length === 0) {
      writeMessages([seed], conversationId);
      bump(); // ensure Chat mounts after seeding
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return { chatKey: key, remountChat: bump };
}
