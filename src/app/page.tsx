"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="flex flex-col items-center justify-center gap-6 p-8">
          <h1 className="text-2xl font-bold text-center">
            Mudassir AI Resume Interview
          </h1>
          <div className="flex flex-col gap-3 w-full">
            <Button onClick={() => router.push("/interview")}>
              Start Interview
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/voice-chat")}
            >
              Voice Chat Mode
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
