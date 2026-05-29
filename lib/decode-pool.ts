import type { ImageItem } from "./types";
import { fileToImageItem, makeId } from "./decode";
import type { DecodeInMessage, DecodeOutMessage } from "./decode-worker";

const MAX_WORKERS = 4;

function poolSize(fileCount: number): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  return Math.max(1, Math.min(MAX_WORKERS, cores, fileCount));
}

function itemFromDecoded(
  file: File,
  width: number,
  height: number,
  thumbBlob: Blob | null,
  convertedBlob: Blob | null,
): ImageItem {
  const blob = thumbBlob ?? convertedBlob ?? file;
  return {
    id: makeId(),
    file,
    name: file.name,
    type: file.type || "image/jpeg",
    originalSize: file.size,
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}

// Decode many files concurrently using a pool of web workers. Heavy work
// (HEIC conversion + createImageBitmap) runs off the main thread, and at most
// `poolSize` files decode at once to cap peak memory on low-RAM devices.
export async function decodeFiles(
  files: File[],
  onItem?: (item: ImageItem) => void,
): Promise<ImageItem[]> {
  if (files.length === 0) return [];
  if (typeof Worker === "undefined") return decodeFilesFallback(files, onItem);

  const results: ImageItem[] = new Array(files.length);
  const workers: Worker[] = [];
  let next = 0;

  const runWorker = () =>
    new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL("./decode-worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);

      const pump = () => {
        if (next >= files.length) {
          worker.terminate();
          resolve();
          return;
        }
        const idx = next++;
        const file = files[idx];
        worker.onmessage = (e: MessageEvent<DecodeOutMessage>) => {
          const m = e.data;
          if (m.type === "error") {
            worker.terminate();
            reject(new Error(m.message));
            return;
          }
          const item = itemFromDecoded(
            file,
            m.width,
            m.height,
            m.thumbBlob,
            m.convertedBlob,
          );
          results[idx] = item;
          onItem?.(item);
          pump();
        };
        const inMsg: DecodeInMessage = { type: "decode", file };
        worker.postMessage(inMsg);
      };

      worker.onerror = (ev) => {
        worker.terminate();
        reject(new Error(ev.message || "Decode worker error"));
      };

      pump();
    });

  try {
    await Promise.all(
      Array.from({ length: poolSize(files.length) }, runWorker),
    );
  } catch (e) {
    workers.forEach((w) => w.terminate());
    throw e;
  }
  return results;
}

// No-worker fallback: still bounds concurrency instead of decoding all at once.
async function decodeFilesFallback(
  files: File[],
  onItem?: (item: ImageItem) => void,
): Promise<ImageItem[]> {
  const results: ImageItem[] = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const idx = next++;
      const item = await fileToImageItem(files[idx]);
      results[idx] = item;
      onItem?.(item);
    }
  };
  await Promise.all(Array.from({ length: poolSize(files.length) }, worker));
  return results;
}
