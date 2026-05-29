"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import type { FeasibilityVerdict } from "@/lib/types";

type Unit = "KB" | "MB";

function toBytes(value: number, unit: Unit): number {
  return unit === "MB" ? value * 1000 * 1000 : value * 1000;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / 1000 / 1000).toFixed(2)} MB`;
}

function fmtMinBytes(bytes: number): string {
  if (bytes < 1000 * 1000) return `${Math.ceil(bytes / 1000)} KB`;
  return `${(Math.ceil(bytes / (1000 * 1000 / 10)) / 10).toFixed(1)} MB`;
}

function pickUnit(bytes: number): Unit {
  return bytes >= 1000 * 1000 ? "MB" : "KB";
}

function formatForUnit(bytes: number, unit: Unit): string {
  if (unit === "MB") return (bytes / 1000 / 1000).toFixed(1);
  return (bytes / 1000).toFixed(0);
}

export function TargetSizeInput({
  bytes,
  onChange,
  verdict,
}: {
  bytes: number | null;
  onChange: (b: number | null) => void;
  verdict: FeasibilityVerdict | null;
}) {
  const [unit, setUnit] = useState<Unit>(() =>
    bytes != null ? pickUnit(bytes) : "MB",
  );
  const [text, setText] = useState<string>(() =>
    bytes != null ? formatForUnit(bytes, pickUnit(bytes)) : "",
  );
  const lastEmittedBytes = useRef<number | null>(bytes);

  // Sync external bytes -> text when the parent changes them (e.g. initial default).
  useEffect(() => {
    if (bytes == null) return;
    if (bytes === lastEmittedBytes.current) return;
    const u = pickUnit(bytes);
    setUnit(u);
    setText(formatForUnit(bytes, u));
    lastEmittedBytes.current = bytes;
  }, [bytes]);

  useEffect(() => {
    const n = parseFloat(text);
    if (!isFinite(n) || n <= 0) {
      lastEmittedBytes.current = null;
      onChange(null);
      return;
    }
    const next = Math.round(toBytes(n, unit));
    lastEmittedBytes.current = next;
    onChange(next);
  }, [text, unit, onChange]);

  const status = (() => {
    if (!verdict) return null;
    if (verdict.kind === "infeasible") {
      return {
        color: "text-red-600 dark:text-red-400",
        text: `Too small — minimum is ${fmtMinBytes(verdict.minBytes)}.`,
      };
    }
    if (verdict.kind === "no_compression") {
      return {
        color: "text-green-600 dark:text-green-400",
        text: `Target above original size — PDF will be at most ${fmtBytes(verdict.maxBytes)}.`,
      };
    }
    return {
      color: "text-green-600 dark:text-green-400",
      text: `Feasible (min ${fmtMinBytes(verdict.minBytes)}).`,
    };
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium" htmlFor="target-size">
          Target size
        </label>
        <Input
          id="target-size"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.1"
          placeholder="e.g. 2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-32"
        />
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            size="sm"
            variant={unit === "KB" ? "secondary" : "ghost"}
            onClick={() => setUnit("KB")}
          >
            KB
          </Button>
          <Button
            size="sm"
            variant={unit === "MB" ? "secondary" : "ghost"}
            onClick={() => setUnit("MB")}
          >
            MB
          </Button>
        </div>
      </div>
      {status && <p className={`text-xs ${status.color}`}>{status.text}</p>}
    </div>
  );
}
