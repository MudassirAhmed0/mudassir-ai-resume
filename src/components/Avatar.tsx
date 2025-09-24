"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  size?: number;
  speaking?: boolean;
  analyser?: AnalyserNode | null;
  className?: string;
};

export default function Avatar({
  size = 80,
  speaking = false,
  analyser,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Uint8Array | null>(null);

  // idle blink
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let stop = false;
    const loop = () => {
      if (stop) return;
      const delay = 2500 + Math.random() * 2500;
      const t = setTimeout(() => {
        if (stop) return;
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
        loop();
      }, delay);
      return () => clearTimeout(t);
    };
    const cancel = loop();
    return () => {
      stop = true;
      cancel && cancel();
    };
  }, []);

  // analyser → CSS var --vu (0..1). When no analyser, decay to 0.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let running = true;
    let last = 0;

    const tick = () => {
      if (!running) return;

      let vu = 0;
      if (speaking && analyser) {
        if (!bufRef.current) {
          bufRef.current = new Uint8Array(
            analyser.fftSize
          ) as Uint8Array<ArrayBuffer>;
        }
        const buf = bufRef.current!;
        analyser.getByteTimeDomainData(
          buf as unknown as Uint8Array<ArrayBuffer>
        );

        // RMS of time-domain around 128 center
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length); // ~0..1
        // small noise gate + gain
        vu = Math.min(1, Math.max(0, (rms - 0.02) * 3.2));
      } else {
        // gentle decay
        const now = performance.now();
        const dt = Math.min(50, now - last);
        const current =
          parseFloat(getComputedStyle(el).getPropertyValue("--vu") || "0") || 0;
        vu = Math.max(0, current - dt / 600); // ~0.6s to drop to 0
        last = now;
      }

      el.style.setProperty("--vu", vu.toFixed(3));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [speaking, analyser]);

  // classes
  const ringShadow =
    "0 0 0 calc(6px + (var(--vu,0) * 16px)) rgba(59,130,246,0.45)";

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex items-center justify-center rounded-full ${
        className ?? ""
      }`}
      style={{
        width: size,
        height: size,
        boxShadow: ringShadow,
        transition: speaking
          ? "box-shadow 60ms linear"
          : "box-shadow 300ms ease",
        // seed
        // @ts-expect-error custom prop
        ["--vu"]: 0,
      }}
      aria-live="polite"
      aria-label={speaking ? "speaking" : "idle"}
    >
      <div
        className={`relative overflow-hidden rounded-full ring-1 ring-gray-200 ${
          speaking ? "" : "avatar-breathe"
        }`}
        style={{ width: size, height: size }}
      >
        <Image
          src="/mudassir.jpeg"
          alt="Mudassir"
          fill
          sizes={`${size}px`}
          className="object-cover select-none"
          priority
        />
        {/* eyelid overlay for blink */}
        <div
          className={`pointer-events-none absolute inset-0 origin-top bg-black/40 ${
            blink ? "scale-y-100" : "scale-y-0"
          }`}
          style={{ transition: "transform 120ms ease", transform: "scaleY(0)" }}
        />
      </div>

      <style jsx>{`
        @keyframes breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }
        .avatar-breathe {
          animation: breathe 3.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
