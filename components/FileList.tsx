"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageItem } from "@/lib/types";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function FileList({
  items,
  onRemove,
  onClear,
}: {
  items: ImageItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((a, b) => a + b.originalSize, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "image" : "images"} ·{" "}
          {fmtSize(total)} total
        </p>
        <Button size="xs" variant="ghost" onClick={onClear}>
          Clear all
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((it) => (
          <li
            key={it.id}
            className="group relative overflow-hidden rounded-lg ring-1 ring-foreground/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.previewUrl}
              alt={it.name}
              className="h-32 w-full object-cover"
            />
            <div className="bg-background/80 px-2 py-1 text-xs">
              <p className="truncate font-medium">{it.name}</p>
              <p className="text-muted-foreground">
                {it.width}×{it.height} · {fmtSize(it.originalSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              aria-label={`Remove ${it.name}`}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/10 transition hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
