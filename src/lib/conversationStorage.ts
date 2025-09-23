import type { ChatMessage } from "@/types/chat";

export const STORAGE_PREFIX = "ai-chat:";
export const DEFAULT_CONVERSATION_ID = "default";

export function getStorageKey(
  conversationId: string = DEFAULT_CONVERSATION_ID
) {
  return `${STORAGE_PREFIX}${conversationId}`;
}

export function readMessages(
  conversationId: string = DEFAULT_CONVERSATION_ID
): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(conversationId));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeMessages(
  msgs: ChatMessage[],
  conversationId: string = DEFAULT_CONVERSATION_ID
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(conversationId), JSON.stringify(msgs));
  } catch {}
}

export function appendMessages(
  append: ChatMessage[],
  conversationId: string = DEFAULT_CONVERSATION_ID
) {
  const current = readMessages(conversationId);
  const next = [...current, ...append];
  writeMessages(next, conversationId);
  return next;
}
