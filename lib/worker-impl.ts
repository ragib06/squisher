/// <reference lib="webworker" />
import { compressAll } from "./compress";
import { buildPdf } from "./pdf";
import type { CompressOutput, ImageItem } from "./types";

export type WorkerInMessage = {
  type: "run";
  parts: ImageItem[][];
  targetBytes: number;
};

export type WorkerOutMessage =
  | { type: "progress"; progress: number; message: string }
  | { type: "done"; outputs: CompressOutput[] }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  if (msg.type !== "run") return;
  try {
    const outputs: CompressOutput[] = [];
    const total = msg.parts.length;
    for (let i = 0; i < total; i++) {
      const part = msg.parts[i];
      const label = total > 1 ? `Part ${i + 1}/${total}: ` : "";
      const { encoded } = await compressAll(
        part,
        msg.targetBytes,
        (progress, message) => {
          const out: WorkerOutMessage = {
            type: "progress",
            progress: (i + progress) / total,
            message: label + message,
          };
          self.postMessage(out);
        },
      );
      const pdfBlob = await buildPdf(encoded);
      outputs.push({
        blob: pdfBlob,
        finalBytes: pdfBlob.size,
        name: total > 1 ? `squished-part${i + 1}.pdf` : "squished.pdf",
      });
    }
    const out: WorkerOutMessage = { type: "done", outputs };
    self.postMessage(out);
  } catch (err) {
    const out: WorkerOutMessage = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(out);
  }
};
