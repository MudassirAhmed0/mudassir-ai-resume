"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;

  // STT controls
  sttSupported: boolean;
  sttRecording: boolean;
  onToggleMic: () => void;

  speaking: boolean;
};

export default function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  sttSupported,
  sttRecording,
  onToggleMic,
  speaking,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
        <Button
          type="button"
          variant={sttRecording ? "secondary" : "outline"}
          onClick={onToggleMic}
          disabled={!sttSupported || disabled || speaking}
          aria-pressed={sttRecording}
          title={
            !sttSupported
              ? "Voice input not supported"
              : speaking
              ? "Wait for the bot to finish speaking"
              : sttRecording
              ? "Stop recording"
              : "Start recording"
          }
        >
          {/* Mic icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={sttRecording ? "animate-pulse" : ""}
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 1v11" />
            <rect x="9" y="1" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <path d="M12 19v4" />
          </svg>
        </Button>

        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about my roles, projects, stack…"
          disabled={disabled}
        />

        <Button onClick={onSend} disabled={disabled || !value.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
