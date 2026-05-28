import type { ImageItem } from "./types";
import {
  estimateMaxBytes,
  pdfOverhead,
  qualityForTarget,
  totalPixels,
} from "./estimate";

export type CompressedImage = {
  item: ImageItem;
  bytes: Uint8Array;
  width: number;
  height: number;
};

type EncodeContext = {
  scale: number;
  quality: number;
};

async function decodeBitmap(file: Blob | File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  ctx: EncodeContext,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const width = Math.max(1, Math.round(bitmap.width * ctx.scale));
  const height = Math.max(1, Math.round(bitmap.height * ctx.scale));

  const hasOffscreen =
    typeof OffscreenCanvas !== "undefined" &&
    typeof (OffscreenCanvas.prototype as unknown as { convertToBlob?: unknown })
      .convertToBlob === "function";

  let blob: Blob;
  if (hasOffscreen) {
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext("2d");
    if (!g) throw new Error("2d context unavailable");
    g.drawImage(bitmap, 0, 0, width, height);
    blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: ctx.quality,
    });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("2d context unavailable");
    g.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        ctx.quality,
      );
    });
  }
  const ab = await blob.arrayBuffer();
  return { bytes: new Uint8Array(ab), width, height };
}

export type CompressProgress = (frac: number, message: string) => void;

export async function compressAll(
  items: ImageItem[],
  targetBytes: number,
  onProgress: CompressProgress,
): Promise<{ encoded: CompressedImage[]; scale: number; quality: number }> {
  const overhead = pdfOverhead(items.length);
  const targetForImages = Math.max(targetBytes - overhead, 1024);

  const maxBytes = estimateMaxBytes(items);
  if (targetBytes >= maxBytes) {
    const encoded: CompressedImage[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      onProgress(i / items.length, `Encoding ${i + 1}/${items.length}`);
      const bm = await decodeBitmap(it.file);
      const out = await encodeJpeg(bm, { scale: 1, quality: 0.95 });
      bm.close();
      encoded.push({ item: it, ...out });
    }
    return { encoded, scale: 1, quality: 0.95 };
  }

  let scale = 1;
  let quality = qualityForTarget(targetForImages, items);

  const encodePass = async (
    s: number,
    q: number,
    label: string,
  ): Promise<CompressedImage[]> => {
    const out: CompressedImage[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      onProgress(
        i / items.length,
        `${label} ${i + 1}/${items.length} (q=${q.toFixed(2)}, scale=${s.toFixed(2)})`,
      );
      const bm = await decodeBitmap(it.file);
      const enc = await encodeJpeg(bm, { scale: s, quality: q });
      bm.close();
      out.push({ item: it, ...enc });
    }
    return out;
  };

  const sumBytes = (arr: CompressedImage[]): number => {
    let s = 0;
    for (const c of arr) s += c.bytes.byteLength;
    return s;
  };

  let encoded = await encodePass(scale, quality, "Encoding");
  let actual = sumBytes(encoded) + overhead;

  for (let iter = 0; iter < 3; iter++) {
    const ratio = actual / targetBytes;
    if (ratio <= 1.1 && ratio >= 0.9) break;
    const adj = Math.pow(targetBytes / actual, 0.7);
    quality = Math.min(0.95, Math.max(0.2, quality * adj));
    encoded = await encodePass(scale, quality, `Retry ${iter + 1}`);
    actual = sumBytes(encoded) + overhead;
  }

  if (actual > targetBytes * 1.1) {
    const px = totalPixels(items);
    const reductionPx = Math.max(0.1, targetBytes / actual);
    scale = Math.sqrt(reductionPx);
    encoded = await encodePass(scale, quality, "Downscale");
    actual = sumBytes(encoded) + overhead;
    void px;
  }

  onProgress(1, `Compressed (${(actual / 1024).toFixed(0)} KB)`);
  return { encoded, scale, quality };
}
