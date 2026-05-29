import type { FeasibilityVerdict, ImageItem, SplitVerdict } from "./types";

export const PDF_OVERHEAD_BASE = 2048;
export const PDF_OVERHEAD_PER_PAGE = 600;

export const BPP_TABLE: { q: number; bpp: number }[] = [
  { q: 0.3, bpp: 0.1 },
  { q: 0.5, bpp: 0.18 },
  { q: 0.75, bpp: 0.28 },
  { q: 0.9, bpp: 0.55 },
];

const MIN_BPP = 0.08;

export function pdfOverhead(pageCount: number): number {
  return PDF_OVERHEAD_BASE + PDF_OVERHEAD_PER_PAGE * pageCount;
}

export function totalPixels(items: ImageItem[]): number {
  let total = 0;
  for (const it of items) total += it.width * it.height;
  return total;
}

export function totalOriginalBytes(items: ImageItem[]): number {
  let total = 0;
  for (const it of items) total += it.originalSize;
  return total;
}

export function estimateMinBytes(items: ImageItem[]): number {
  let sum = 0;
  for (const it of items) {
    const halfPixels = (it.width / 2) * (it.height / 2);
    sum += halfPixels * MIN_BPP;
  }
  return Math.round(sum + pdfOverhead(items.length));
}

export function estimateMaxBytes(items: ImageItem[]): number {
  return totalOriginalBytes(items) + pdfOverhead(items.length);
}

export function qualityForTarget(
  targetBytes: number,
  items: ImageItem[],
): number {
  const overhead = pdfOverhead(items.length);
  const budget = Math.max(targetBytes - overhead, 1);
  const px = Math.max(totalPixels(items), 1);
  const bppNeeded = (budget * 8) / (px * 8);
  let q = 0.75;
  for (let i = BPP_TABLE.length - 1; i >= 0; i--) {
    if (BPP_TABLE[i].bpp <= bppNeeded) {
      q = BPP_TABLE[i].q;
      break;
    }
  }
  if (bppNeeded < BPP_TABLE[0].bpp) q = BPP_TABLE[0].q;
  if (bppNeeded > BPP_TABLE[BPP_TABLE.length - 1].bpp)
    q = BPP_TABLE[BPP_TABLE.length - 1].q;
  return q;
}

function itemMinContribution(item: ImageItem): number {
  return (item.width / 2) * (item.height / 2) * MIN_BPP + PDF_OVERHEAD_PER_PAGE;
}

export function planParts(
  items: ImageItem[],
  targetBytes: number,
): SplitVerdict {
  for (const it of items) {
    const single = PDF_OVERHEAD_BASE + itemMinContribution(it);
    if (single > targetBytes) {
      return {
        kind: "infeasibleSplit",
        oversizedItem: it,
        minSinglePartBytes: Math.round(single),
      };
    }
  }
  const parts: ImageItem[][] = [[]];
  const partMins: number[] = [PDF_OVERHEAD_BASE];
  for (const it of items) {
    const m = itemMinContribution(it);
    const lastIdx = parts.length - 1;
    if (partMins[lastIdx] + m > targetBytes && parts[lastIdx].length > 0) {
      parts.push([]);
      partMins.push(PDF_OVERHEAD_BASE);
    }
    parts[parts.length - 1].push(it);
    partMins[partMins.length - 1] += m;
  }
  return {
    kind: "feasibleSplit",
    plan: {
      parts,
      partsCount: parts.length,
      partMinBytes: partMins.map((v) => Math.round(v)),
    },
  };
}

export function estimate(
  items: ImageItem[],
  targetBytes: number,
): FeasibilityVerdict {
  const minBytes = estimateMinBytes(items);
  const maxBytes = estimateMaxBytes(items);
  if (targetBytes < minBytes)
    return { kind: "infeasible", minBytes, maxBytes };
  if (targetBytes >= totalOriginalBytes(items))
    return { kind: "no_compression", maxBytes };
  return { kind: "feasible", minBytes, maxBytes };
}
