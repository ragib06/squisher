"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState } from "react";

function fmt(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DownloadCard({
  pdfBlob,
  finalBytes,
  targetBytes,
  onReset,
}: {
  pdfBlob: Blob;
  finalBytes: number;
  targetBytes: number;
  onReset: () => void;
}) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const u = URL.createObjectURL(pdfBlob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pdfBlob]);

  const delta = ((finalBytes - targetBytes) / targetBytes) * 100;
  const within10 = Math.abs(delta) <= 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF ready</CardTitle>
        <CardDescription>
          {fmt(finalBytes)} ({delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}% vs target {fmt(targetBytes)}
          {within10 ? "" : " — outside ±10%"})
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        {url && (
          <a href={url} download="squished.pdf">
            <Button>Download PDF</Button>
          </a>
        )}
        <Button variant="outline" onClick={onReset}>
          Start over
        </Button>
      </CardContent>
    </Card>
  );
}
