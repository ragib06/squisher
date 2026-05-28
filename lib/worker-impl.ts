/// <reference lib="webworker" />
import { compressAll } from "./compress";
import { buildPdf } from "./pdf";
import type { ImageItem } from "./types";

export type WorkerInMessage = {
  type: "run";
  items: ImageItem[];
  targetBytes: number;
};

export type WorkerOutMessage =
  | { type: "progress"; progress: number; message: string }
  | { type: "done"; pdfBlob: Blob; finalBytes: number }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  if (msg.type !== "run") return;
  try {
    const { encoded } = await compressAll(
      msg.items,
      msg.targetBytes,
      (progress, message) => {
        const out: WorkerOutMessage = { type: "progress", progress, message };
        self.postMessage(out);
      },
    );
    const pdfBlob = await buildPdf(encoded);
    const out: WorkerOutMessage = {
      type: "done",
      pdfBlob,
      finalBytes: pdfBlob.size,
    };
    self.postMessage(out);
  } catch (err) {
    const out: WorkerOutMessage = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(out);
  }
};
