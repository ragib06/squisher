"use client";

import { Progress } from "@/components/ui/progress";

export function ProgressView({
  progress,
  message,
}: {
  progress: number;
  message: string;
}) {
  const pct = Math.round(progress * 100);
  return (
    <div className="space-y-2">
      <Progress value={pct} />
      <p className="text-xs text-muted-foreground">
        {message} · {pct}%
      </p>
    </div>
  );
}
