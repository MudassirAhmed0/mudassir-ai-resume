"use client";

import { Button } from "@/components/ui/button";

type Props = {
  items: string[];
  onSelect: (label: string) => void;
  disabled?: boolean;
};

export default function QuickChips({ items, onSelect, disabled }: Props) {
  return (
    <div className="mt-4 w-full flex flex-wrap gap-2">
      {items.map((label) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => onSelect(label)}
          disabled={disabled}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
