"use client";

import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { isSpeaking } from "@/lib/speech";

type Props = {
  speaking: boolean;
  resumeHref?: string;
};

export default function ChatHeader({
  speaking,
  resumeHref = "/resume.pdf",
}: Props) {
  return (
    <div className="border-b px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar speaking={speaking && isSpeaking()} />
          <div className="text-sm">
            <div className="font-semibold">Mudassir (AI)</div>
            <div className="text-muted-foreground">
              Resume Interview Assistant
            </div>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href={resumeHref} target="_blank" rel="noopener noreferrer">
            Download Resume (PDF)
          </a>
        </Button>
      </div>
    </div>
  );
}
