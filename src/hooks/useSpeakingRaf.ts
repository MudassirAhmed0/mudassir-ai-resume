import { useEffect, useState } from "react";
import { isSpeaking } from "@/lib/speech";

export function useSpeakingRaf() {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setSpeaking(isSpeaking());
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return speaking;
}
