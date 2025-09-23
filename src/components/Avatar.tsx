"use client";

import Image from "next/image";

type AvatarProps = {
  /** When true, shows a subtle pulsating box-shadow */
  speaking?: boolean;
  /** Pixel size (width & height). Default 48 */
  size?: number;
  className?: string;
};

export default function Avatar({
  speaking,
  size = 48,
  className,
}: AvatarProps) {
  return (
    <div
      className={[
        "relative inline-flex items-center justify-center rounded-full",
        speaking ? "avatar-shadow-pulse" : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-live="polite"
      aria-busy={speaking ? "true" : "false"}
    >
      <Image
        src="/mudassir.jpeg" // place file at /public/mudassir.jpg
        alt="Mudassir"
        fill
        sizes={`${size}px`}
        className="rounded-full object-cover"
        priority={false}
      />
    </div>
  );
}
