"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { FileList } from "@/components/FileList";
import { TargetSizeInput } from "@/components/TargetSizeInput";
import { ProgressView } from "@/components/ProgressView";
import { DownloadCard } from "@/components/DownloadCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { initialState, reducer } from "@/lib/flow";
import { fileToImageItem } from "@/lib/decode";
import { estimate, estimateMinBytes, planParts } from "@/lib/estimate";
import { runJob } from "@/lib/worker";
import type { ImageItem } from "@/lib/types";

const EMPTY_ITEMS: ImageItem[] = [];

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(Math.ceil(bytes / (1024 * 1024 / 10)) / 10).toFixed(1)} MB`;
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const cancelRef = useRef<null | (() => void)>(null);

  const items = useMemo(
    () => (state.kind !== "idle" && "items" in state ? state.items : EMPTY_ITEMS),
    [state],
  );
  const targetBytes =
    state.kind !== "idle" && "targetBytes" in state ? state.targetBytes : null;
  const splitEnabled =
    state.kind !== "idle" && "splitEnabled" in state ? state.splitEnabled : false;

  const minBytes = useMemo(
    () => (items.length > 0 ? estimateMinBytes(items) : null),
    [items],
  );

  const singleVerdict = useMemo(() => {
    if (items.length === 0 || targetBytes == null || targetBytes <= 0)
      return null;
    return estimate(items, targetBytes);
  }, [items, targetBytes]);

  const splitVerdict = useMemo(() => {
    if (!splitEnabled) return null;
    if (items.length === 0 || targetBytes == null || targetBytes <= 0)
      return null;
    return planParts(items, targetBytes);
  }, [items, targetBytes, splitEnabled]);

  const verdictForInput = splitEnabled ? null : singleVerdict;

  const canCompress =
    state.kind === "filesAdded" &&
    (splitEnabled
      ? splitVerdict?.kind === "feasibleSplit"
      : singleVerdict != null &&
        (singleVerdict.kind === "feasible" ||
          singleVerdict.kind === "no_compression"));

  const handleFiles = useCallback(async (files: File[]) => {
    setDecoding(true);
    try {
      const newItems = await Promise.all(files.map(fileToImageItem));
      dispatch({ type: "ADD_FILES", items: newItems });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to read files");
    } finally {
      setDecoding(false);
    }
  }, []);

  const setTarget = useCallback((bytes: number | null) => {
    dispatch({ type: "SET_TARGET", bytes });
  }, []);

  const doCompress = useCallback(() => {
    if (state.kind !== "filesAdded" || state.targetBytes == null) return;
    const parts: typeof state.items[] =
      splitEnabled && splitVerdict?.kind === "feasibleSplit"
        ? splitVerdict.plan.parts
        : [state.items];
    dispatch({ type: "START_COMPRESS" });
    const { promise, cancel } = runJob(
      parts,
      state.targetBytes,
      (progress, message) => dispatch({ type: "PROGRESS", progress, message }),
    );
    cancelRef.current = cancel;
    promise
      .then(({ outputs }) => dispatch({ type: "COMPRESS_DONE", outputs }))
      .catch((e: unknown) =>
        dispatch({
          type: "ERROR",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
  }, [state, splitEnabled, splitVerdict]);

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Squisher</h1>
        <p className="text-sm text-muted-foreground">
          Squish images into a target-size PDF, locally in your browser.
        </p>
      </header>

      {toast && (
        <Alert variant="destructive">
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            <p>{toast}</p>
            <div className="mt-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setToast(null)}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Dropzone onFiles={handleFiles} onReject={setToast} />

      {decoding && (
        <p className="text-xs text-muted-foreground">Reading images…</p>
      )}

      <FileList
        items={items}
        onRemove={(id) => dispatch({ type: "REMOVE_FILE", id })}
        onClear={() => dispatch({ type: "CLEAR_FILES" })}
      />

      {items.length > 0 && minBytes != null && (
        <p className="text-xs text-muted-foreground">
          Minimum achievable PDF size:{" "}
          <span className="font-medium text-foreground">{fmtBytes(minBytes)}</span>
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          <TargetSizeInput
            bytes={targetBytes}
            onChange={setTarget}
            verdict={verdictForInput}
          />

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={splitEnabled}
              onChange={(e) =>
                dispatch({ type: "SET_SPLIT", enabled: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-border accent-foreground"
            />
            <span>
              Split into multiple PDFs — target size applies to{" "}
              <span className="font-medium">each part</span>.
            </span>
          </label>

          {splitEnabled && splitVerdict && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              {splitVerdict.kind === "feasibleSplit" ? (
                <>
                  <p>
                    Will produce{" "}
                    <span className="font-medium">
                      {splitVerdict.plan.partsCount}{" "}
                      {splitVerdict.plan.partsCount === 1 ? "PDF" : "PDFs"}
                    </span>{" "}
                    of ≤ {fmtBytes(targetBytes!)} each.
                  </p>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {splitVerdict.plan.parts.map((p, i) => (
                      <li key={i}>
                        Part {i + 1}: {p.length}{" "}
                        {p.length === 1 ? "image" : "images"} (min ≈{" "}
                        {fmtBytes(splitVerdict.plan.partMinBytes[i])})
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-red-600 dark:text-red-400">
                  &ldquo;{splitVerdict.oversizedItem.name}&rdquo; alone needs ≥{" "}
                  {fmtBytes(splitVerdict.minSinglePartBytes)}. Raise target or
                  remove it.
                </p>
              )}
            </div>
          )}

          {state.kind === "filesAdded" && (
            <Button onClick={doCompress} disabled={!canCompress}>
              {splitEnabled &&
              splitVerdict?.kind === "feasibleSplit" &&
              splitVerdict.plan.partsCount > 1
                ? `Compress & build ${splitVerdict.plan.partsCount} PDFs`
                : "Compress & build PDF"}
            </Button>
          )}
        </div>
      )}

      {state.kind === "compressing" && (
        <ProgressView progress={state.progress} message={state.message} />
      )}

      {state.kind === "done" && (
        <DownloadCard
          outputs={state.outputs}
          targetBytes={state.targetBytes}
          onReset={() => dispatch({ type: "RESET" })}
        />
      )}

      {state.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Compression failed</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: "RESET" })}
              >
                Start over
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
