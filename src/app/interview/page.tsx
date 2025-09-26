"use client";

import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import QuickChips from "@/components/QuickChips";
import { useConversationSeed } from "@/hooks/useConversationSeed";
import { useQuickAsk } from "@/hooks/useQuickAsk";
import { useVoiceMode } from "@/hooks/useVoiceMode";
import { speaker } from "@/lib/speaker";
import { useEffect, useState } from "react";

const CHIPS = [
  "Show projects",
  "Experience timeline",
  "Why hire you?",
  "How would you build our MVP chat?",
];

export default function InterviewPage() {
  const { chatKey, remountChat } = useConversationSeed({
    conversationId: "default",
  });
  const { askQuick, loading } = useQuickAsk("default");
  const voiceMode = useVoiceMode();

  const [speaking, setSpeaking] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Mirror speaker state without stealing its handlers
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = speaker.getAnalyser();
      setAnalyser(a);
      setSpeaking(!!a); // speaking while analyser is active
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleChip = async (label: string) => {
    await askQuick(label);
    remountChat();
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[320px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r bg-white">
        <div className="p-6 flex flex-col items-center gap-4">
          <Avatar
            speaking={speaking}
            analyser={analyser ?? undefined}
            size={96}
          />
          <div className="text-center">
            <h2 className="font-semibold">Mudassir (AI)</h2>
            <p className="text-sm text-muted-foreground">
              Resume Interview Assistant
            </p>
          </div>
          <QuickChips items={CHIPS} onSelect={handleChip} disabled={loading} />

          {/* Voice Mode Controls */}
          <div className="w-full space-y-3">
            {!voiceMode.voiceMode && (
              <button
                onClick={voiceMode.handleStartInterview}
                disabled={!voiceMode.sttSupported}
                className="w-full rounded-2xl px-5 py-3 font-medium shadow ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voiceMode.sttSupported
                  ? "Start Voice Interview"
                  : "Voice Not Supported"}
              </button>
            )}

            {voiceMode.voiceMode && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={voiceMode.toggleMic}
                    aria-pressed={voiceMode.isRecording}
                    className="rounded-full px-4 py-2 font-medium shadow ring-1 ring-zinc-300 hover:bg-zinc-50"
                    title={voiceMode.isRecording ? "Stop" : "Resume"}
                  >
                    {voiceMode.isRecording ? "Stop" : "Resume"}
                  </button>

                  <span className="text-sm opacity-70">
                    {voiceMode.listeningUI ? "Listening…" : "Paused"}
                  </span>
                </div>

                <button
                  onClick={voiceMode.exitVoiceMode}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Exit Voice Mode
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="bg-white">
        <Chat key={chatKey} conversationId="default" />
      </main>
    </div>
  );
}
