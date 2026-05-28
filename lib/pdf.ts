import { PDFDocument } from "pdf-lib";
import type { CompressedImage } from "./compress";

const PT_PER_INCH = 72;
const DPI = 96;

export async function buildPdf(encoded: CompressedImage[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (const e of encoded) {
    const img = await doc.embedJpg(e.bytes);
    const wPt = (e.width / DPI) * PT_PER_INCH;
    const hPt = (e.height / DPI) * PT_PER_INCH;
    const page = doc.addPage([wPt, hPt]);
    page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
  }
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
