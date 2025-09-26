"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onRun: (prompt: string, meta?: Record<string, string>) => void;
};

export default function QAPanel({ onRun }: Props) {
  const [open, setOpen] = useState(false);

  // Toggle with Cmd/Ctrl + Alt + Q
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mac = navigator.platform.toLowerCase().includes("mac");
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      className={`fixed z-50 bottom-3 left-3 transition-all ${
        open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="rounded-lg border bg-white shadow-lg p-3 w-[320px]">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">
          QA Panel (Cmd/Ctrl+Alt+Q)
        </div>

        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full justify-start"
            variant="secondary"
            onClick={() =>
              onRun("Tell me about your cinema booking app.", {
                CASUALNESS_HINT: "Normal",
              })
            }
          >
            1) Cinema booking app
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Expect: “Short version—… [pause-300]”, seat lock explained.
          </div>

          <Button
            size="sm"
            className="w-full justify-start"
            variant="secondary"
            onClick={() =>
              onRun("What did you do at Tensor?", {
                CASUALNESS_HINT: "Light",
                LEVEL_HINT: "junior",
              })
            }
          >
            2) Tensor (junior tone)
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Expect: junior tone; 2–4 short, casual lines.
          </div>

          <Button
            size="sm"
            className="w-full justify-start"
            variant="secondary"
            onClick={() =>
              onRun("How would you build our MVP chat?", {
                CASUALNESS_HINT: "Light",
              })
            }
          >
            3) Build MVP chat
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Expect: concise plan; simple words; offers deeper dive.
          </div>

          <Button
            size="sm"
            className="w-full justify-start"
            variant="secondary"
            onClick={() => onRun("What do you think about LGBTQ")}
          >
            4) Off-scope boundary
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Expect: polite boundary in say + show, still conversational.
          </div>

          <Button
            size="sm"
            className="w-full justify-start"
            variant="secondary"
            onClick={() =>
              onRun("Give me the whole Brackets SEO and realtime story.", {
                CASUALNESS_HINT: "Normal",
                CAP_POLICY: "cap+invite", // ask client to cap & add invite
              })
            }
          >
            5) Long answer stress
          </Button>
          <div className="text-[11px] text-muted-foreground">
            Expect: say trimmed to ~12s with “Want the longer version?”.
          </div>
        </div>
      </div>
    </div>
  );
}
