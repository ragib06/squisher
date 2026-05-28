import type { ImageItem } from "./types";
import type { WorkerInMessage, WorkerOutMessage } from "./worker-impl";
import { compressAll } from "./compress";
import { buildPdf } from "./pdf";

export type JobProgress = (progress: number, message: string) => void;
export type JobResult = { pdfBlob: Blob; finalBytes: number };

function supportsOffscreenCanvas(): boolean {
  if (typeof OffscreenCanvas === "undefined") return false;
  const proto = OffscreenCanvas.prototype as unknown as {
    convertToBlob?: unknown;
  };
  return typeof proto.convertToBlob === "function";
}

export function runJob(
  items: ImageItem[],
  targetBytes: number,
  onProgress: JobProgress,
): { promise: Promise<JobResult>; cancel: () => void } {
  if (supportsOffscreenCanvas() && typeof Worker !== "undefined") {
    const worker = new Worker(new URL("./worker-impl.ts", import.meta.url), {
      type: "module",
    });
    const promise = new Promise<JobResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === "progress") onProgress(msg.progress, msg.message);
        else if (msg.type === "done") {
          worker.terminate();
          resolve({ pdfBlob: msg.pdfBlob, finalBytes: msg.finalBytes });
        } else if (msg.type === "error") {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || "Worker error"));
      };
      const msg: WorkerInMessage = { type: "run", items, targetBytes };
      worker.postMessage(msg);
    });
    return { promise, cancel: () => worker.terminate() };
  }

  let cancelled = false;
  const promise = (async () => {
    const { encoded } = await compressAll(items, targetBytes, (p, m) => {
      if (cancelled) throw new Error("Cancelled");
      onProgress(p, m);
    });
    const pdfBlob = await buildPdf(encoded);
    return { pdfBlob, finalBytes: pdfBlob.size };
  })();
  return { promise, cancel: () => (cancelled = true, undefined) };
}
