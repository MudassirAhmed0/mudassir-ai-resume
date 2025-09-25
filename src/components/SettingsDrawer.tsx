"use client";

import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsDrawer() {
  const { settings, update } = useSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <SettingsIcon className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px]">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="voiceId">ElevenLabs voiceId</Label>
            <Input
              id="voiceId"
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              value={settings.voiceId}
              onChange={(e) => update({ voiceId: e.target.value.trim() })}
            />
          </div>

          <div className="space-y-2">
            <Label>Casualness</Label>
            <Select
              value={settings.casualness}
              onValueChange={(v) =>
                update({ casualness: v as typeof settings.casualness })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Light">Light</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="Spicy">Spicy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="fallback">Fallback to browser TTS</Label>
              <p className="text-xs text-muted-foreground">
                If ElevenLabs fails, use local voice.
              </p>
            </div>
            <Switch
              id="fallback"
              checked={settings.fallback}
              onCheckedChange={(b) => update({ fallback: b })}
            />
          </div>

          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Free tier — keep answers short to save credits.
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="secondary" asChild>
            <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">
              Manage voices
            </a>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
