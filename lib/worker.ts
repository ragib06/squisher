import type { CompressOutput, ImageItem } from "./types";
import type { WorkerInMessage, WorkerOutMessage } from "./worker-impl";
import { compressAll } from "./compress";
import { buildPdf } from "./pdf";

export type JobProgress = (progress: number, message: string) => void;
export type JobResult = { outputs: CompressOutput[] };

function supportsOffscreenCanvas(): boolean {
  if (typeof OffscreenCanvas === "undefined") return false;
  const proto = OffscreenCanvas.prototype as unknown as {
    convertToBlob?: unknown;
  };
  return typeof proto.convertToBlob === "function";
}

export function runJob(
  parts: ImageItem[][],
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
          resolve({ outputs: msg.outputs });
        } else if (msg.type === "error") {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || "Worker error"));
      };
      const msg: WorkerInMessage = { type: "run", parts, targetBytes };
      worker.postMessage(msg);
    });
    return { promise, cancel: () => worker.terminate() };
  }

  let cancelled = false;
  const promise = (async () => {
    const outputs: CompressOutput[] = [];
    const total = parts.length;
    for (let i = 0; i < total; i++) {
      const part = parts[i];
      const label = total > 1 ? `Part ${i + 1}/${total}: ` : "";
      const { encoded } = await compressAll(part, targetBytes, (p, m) => {
        if (cancelled) throw new Error("Cancelled");
        onProgress((i + p) / total, label + m);
      });
      const pdfBlob = await buildPdf(encoded);
      outputs.push({
        blob: pdfBlob,
        finalBytes: pdfBlob.size,
        name: total > 1 ? `squished-part${i + 1}.pdf` : "squished.pdf",
      });
    }
    return { outputs };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}
