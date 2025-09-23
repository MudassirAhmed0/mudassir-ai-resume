"use client";

import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import QuickChips from "@/components/QuickChips";
import { useSpeakingRaf } from "@/hooks/useSpeakingRaf";
import { useConversationSeed } from "@/hooks/useConversationSeed";
import { useQuickAsk } from "@/hooks/useQuickAsk";

const CONVERSATION_ID = "default";

const CHIPS = [
  "Show projects",
  "Experience timeline",
  "Why hire you?",
  "How would you build our MVP chat?",
];

export default function InterviewPage() {
  const speaking = useSpeakingRaf();

  // Seed greeting if first visit, and get a key to remount Chat after storage mutations
  const { chatKey, remountChat } = useConversationSeed({
    conversationId: CONVERSATION_ID,
  });

  // Quick-ask auto-sends and writes into the same conversation storage
  const { askQuick, loading } = useQuickAsk(CONVERSATION_ID);

  const handleChip = async (label: string) => {
    await askQuick(label);
    remountChat(); // ensure Chat reloads the latest messages
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[320px_1fr]">
      {/* Left column: avatar + quick chips */}
      <aside className="border-b md:border-b-0 md:border-r bg-white">
        <div className="p-6 flex flex-col items-center gap-4">
          <Avatar speaking={speaking} size={96} />
          <div className="text-center">
            <h2 className="font-semibold">Mudassir (AI)</h2>
            <p className="text-sm text-muted-foreground">
              Resume Interview Assistant
            </p>
          </div>
          <QuickChips items={CHIPS} onSelect={handleChip} disabled={loading} />
        </div>
      </aside>

      {/* Right column: Chat */}
      <main className="bg-white">
        <Chat key={chatKey} conversationId={CONVERSATION_ID} />
      </main>
    </div>
  );
}
