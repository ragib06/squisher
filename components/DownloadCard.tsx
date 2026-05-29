"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useMemo } from "react";
import type { CompressOutput } from "@/lib/types";

function fmt(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DownloadCard({
  outputs,
  targetBytes,
  onReset,
}: {
  outputs: CompressOutput[];
  targetBytes: number;
  onReset: () => void;
}) {
  const urls = useMemo(
    () => outputs.map((o) => URL.createObjectURL(o.blob)),
    [outputs],
  );

  useEffect(() => {
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [urls]);

  const multi = outputs.length > 1;
  const totalBytes = outputs.reduce((a, o) => a + o.finalBytes, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{multi ? `${outputs.length} PDFs ready` : "PDF ready"}</CardTitle>
        <CardDescription>
          {multi
            ? `Total ${fmt(totalBytes)} across ${outputs.length} files (target ${fmt(targetBytes)} per part).`
            : (() => {
                const delta = ((outputs[0].finalBytes - targetBytes) / targetBytes) * 100;
                const within10 = Math.abs(delta) <= 10;
                return `${fmt(outputs[0].finalBytes)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs target ${fmt(targetBytes)}${within10 ? "" : " — outside ±10%"})`;
              })()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {urls.length === outputs.length && (
          <ul className="flex flex-col gap-2">
            {outputs.map((o, i) => {
              const delta = ((o.finalBytes - targetBytes) / targetBytes) * 100;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(o.finalBytes)} ({delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}% vs target)
                    </p>
                  </div>
                  <a href={urls[i]} download={o.name}>
                    <Button size="sm">Download</Button>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onReset}>
            Start over
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
