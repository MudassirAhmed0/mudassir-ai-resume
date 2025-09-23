import { cn } from "@/lib/utils";

interface AvatarProps {
  speaking?: boolean;
}

export default function Avatar({ speaking }: AvatarProps) {
  return (
    <div
      className={cn(
        "w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold",
        speaking && "animate-pulse"
      )}
    >
      AI
    </div>
  );
}
