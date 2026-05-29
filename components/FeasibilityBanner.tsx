"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FeasibilityVerdict } from "@/lib/types";

function fmt(bytes: number): string {
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / 1000 / 1000).toFixed(2)} MB`;
}

export function FeasibilityBanner({
  verdict,
  onProceed,
  onAdjust,
}: {
  verdict: FeasibilityVerdict;
  onProceed: () => void;
  onAdjust: () => void;
}) {
  if (verdict.kind === "infeasible") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Target too small</AlertTitle>
        <AlertDescription>
          <p>
            Minimum achievable ≈ <strong>{fmt(verdict.minBytes)}</strong>. Drop
            the largest images or raise the target.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={onAdjust}>
              Adjust
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (verdict.kind === "no_compression") {
    return (
      <Alert>
        <AlertTitle>No compression needed</AlertTitle>
        <AlertDescription>
          <p>
            Source ≈ <strong>{fmt(verdict.maxBytes)}</strong> already under your
            target. Will package as-is.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={onProceed}>
              Build PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onAdjust}>
              Adjust
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertTitle>Feasible</AlertTitle>
      <AlertDescription>
        <p>
          Range ≈ <strong>{fmt(verdict.minBytes)}</strong> –{" "}
          <strong>{fmt(verdict.maxBytes)}</strong>. Target within range.
        </p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={onProceed}>
            Compress &amp; build PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onAdjust}>
            Adjust
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
