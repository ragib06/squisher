import type { ImageItem } from "./types";

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export function isHeic(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const mod = await import("heic2any");
  const heic2any = mod.default;
  const out = (await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  })) as Blob | Blob[];
  return Array.isArray(out) ? out[0] : out;
}

export async function decodeFile(
  file: File,
): Promise<{ bitmap: ImageBitmap; blob: Blob; type: string }> {
  if (isHeic(file)) {
    const blob = await heicToJpegBlob(file);
    const bitmap = await createImageBitmap(blob);
    return { bitmap, blob, type: "image/jpeg" };
  }
  const bitmap = await createImageBitmap(file);
  return { bitmap, blob: file, type: file.type || "image/jpeg" };
}

const THUMB_MAX_EDGE = 512;

async function makeThumbBlob(bitmap: ImageBitmap): Promise<Blob | null> {
  const scale = Math.min(
    1,
    THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
  );
}

export async function fileToImageItem(file: File): Promise<ImageItem> {
  const { bitmap, blob } = await decodeFile(file);
  const thumb = await makeThumbBlob(bitmap);
  const previewUrl = URL.createObjectURL(thumb ?? blob);
  const item: ImageItem = {
    id: makeId(),
    file,
    name: file.name,
    type: file.type || "image/jpeg",
    originalSize: file.size,
    width: bitmap.width,
    height: bitmap.height,
    previewUrl,
  };
  bitmap.close();
  return item;
}
