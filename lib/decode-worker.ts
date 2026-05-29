/// <reference lib="webworker" />
import { isHeic } from "./decode";

export type DecodeInMessage = { type: "decode"; file: File };

export type DecodeOutMessage =
  | {
      type: "decoded";
      width: number;
      height: number;
      // Small JPEG used for the preview grid. Null only when OffscreenCanvas
      // is unavailable; the main thread then falls back to a full-size blob.
      thumbBlob: Blob | null;
      // Set only for HEIC: the converted JPEG. Used as preview fallback when
      // no thumbnail was produced. For other formats the main thread reuses
      // the original file blob.
      convertedBlob: Blob | null;
    }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

const THUMB_MAX_EDGE = 512;

function hasOffscreenCanvas(): boolean {
  if (typeof OffscreenCanvas === "undefined") return false;
  const proto = OffscreenCanvas.prototype as unknown as {
    convertToBlob?: unknown;
  };
  return typeof proto.convertToBlob === "function";
}

async function makeThumb(bitmap: ImageBitmap): Promise<Blob | null> {
  if (!hasOffscreenCanvas()) return null;
  const scale = Math.min(
    1,
    THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.drawImage(bitmap, 0, 0, w, h);
  return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
}

self.onmessage = async (e: MessageEvent<DecodeInMessage>) => {
  const msg = e.data;
  if (msg.type !== "decode") return;
  try {
    let bitmap: ImageBitmap;
    let convertedBlob: Blob | null = null;
    if (isHeic(msg.file)) {
      const mod = await import("heic2any");
      const heic2any = mod.default;
      const out = (await heic2any({
        blob: msg.file,
        toType: "image/jpeg",
        quality: 0.92,
      })) as Blob | Blob[];
      convertedBlob = Array.isArray(out) ? out[0] : out;
      bitmap = await createImageBitmap(convertedBlob);
    } else {
      bitmap = await createImageBitmap(msg.file);
    }
    const thumbBlob = await makeThumb(bitmap);
    const res: DecodeOutMessage = {
      type: "decoded",
      width: bitmap.width,
      height: bitmap.height,
      thumbBlob,
      convertedBlob,
    };
    bitmap.close();
    self.postMessage(res);
  } catch (err) {
    const res: DecodeOutMessage = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};
