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
import { estimate, estimateMinBytes } from "@/lib/estimate";
import { runJob } from "@/lib/worker";

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(Math.ceil(bytes / (1024 * 1024 / 10)) / 10).toFixed(1)} MB`;
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const cancelRef = useRef<null | (() => void)>(null);

  const items = state.kind !== "idle" && "items" in state ? state.items : [];
  const targetBytes =
    state.kind !== "idle" && "targetBytes" in state ? state.targetBytes : null;

  const minBytes = useMemo(
    () => (items.length > 0 ? estimateMinBytes(items) : null),
    [items],
  );

  const verdict = useMemo(() => {
    if (items.length === 0 || targetBytes == null || targetBytes <= 0)
      return null;
    return estimate(items, targetBytes);
  }, [items, targetBytes]);

  const canCompress =
    state.kind === "filesAdded" &&
    verdict != null &&
    (verdict.kind === "feasible" || verdict.kind === "no_compression");

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
    dispatch({ type: "START_COMPRESS" });
    const { promise, cancel } = runJob(
      state.items,
      state.targetBytes,
      (progress, message) => dispatch({ type: "PROGRESS", progress, message }),
    );
    cancelRef.current = cancel;
    promise
      .then(({ pdfBlob, finalBytes }) =>
        dispatch({ type: "COMPRESS_DONE", pdfBlob, finalBytes }),
      )
      .catch((e: unknown) =>
        dispatch({
          type: "ERROR",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
  }, [state]);

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
          Minimum achievable PDF size: <span className="font-medium text-foreground">{fmtBytes(minBytes)}</span>
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          <TargetSizeInput
            bytes={targetBytes}
            onChange={setTarget}
            verdict={verdict}
          />
          {state.kind === "filesAdded" && (
            <Button onClick={doCompress} disabled={!canCompress}>
              Compress & build PDF
            </Button>
          )}
        </div>
      )}

      {state.kind === "compressing" && (
        <ProgressView progress={state.progress} message={state.message} />
      )}

      {state.kind === "done" && (
        <DownloadCard
          pdfBlob={state.pdfBlob}
          finalBytes={state.finalBytes}
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
