# Squisher

Web app that turns a batch of images into a single PDF whose final size fits a user-chosen target (e.g. "make it under 5 MB"). The app figures out compression and resizing automatically, and tells the user up front when a target is impossible to reach instead of failing silently.

## What it does

- Accept many images at once via drag-and-drop or file picker (JPEG, PNG, WebP, HEIC/HEIF).
- After upload, app shows the minimum achievable PDF size and pre-fills the target input with that value.
- As the user edits the target, a live status text below the input turns green (feasible) or red (below minimum); no separate "check" step.
- The Compress button is always visible but only enabled when the target is feasible.
- **Split into multiple PDFs.** A checkbox reinterprets the target as a *per-part* cap: the app packs the images across as many PDFs as needed (preserving order) so each one lands under the target. The preview shows each part's predicted size (≈ the smaller of the target and the part's uncompressed size). Useful for upload limits or when no single PDF can hit a very small target.
- Output PDF(s) download directly from the browser — one Download button per file.
- Per-image upload limit: 25 MB.
- Sizes use **decimal MB** (1 MB = 1,000,000 bytes), matching phone/laptop file managers and upload limits — what the app shows equals what the OS shows.

## Design highlights

- **Fully client-side.** No uploads. Images never leave the browser. No server, no database, no accounts.
- **Portable static build.** Pure `next export` output — the same `out/` directory deploys to Vercel, Cloudflare Pages, or a self-hosted NAS.
- **Web Worker for heavy work.** Compression and PDF assembly run off the main thread so the UI stays responsive on large batches. Falls back to the main thread on browsers without `OffscreenCanvas` (Safari < 16.4).
- **Pooled decode on upload.** Image decode (incl. HEIC conversion) runs in a pool of up to 4 web workers — off the main thread, with bounded concurrency so peak memory stays flat regardless of batch size. Keeps large drops (50+ photos, 200+ MB) from freezing the UI or OOM-ing low-RAM phones. Falls back to a concurrency-limited main-thread path when workers are unavailable.
- **Downscaled previews.** The file grid renders ≤512px JPEG thumbnails (generated at decode time), not the full-resolution originals — a few MB of previews instead of hundreds. Originals are kept untouched for compression.
- **Lazy HEIC support.** The HEIC decoder is only fetched when an iPhone photo is dropped.
- **Insecure-context fallback.** Works on plain HTTP LAN deployments — `crypto.randomUUID` is feature-detected with a `Math.random`-based fallback.

## Stack

Next.js 16 (App Router, webpack build) · TypeScript · Tailwind CSS v4 · shadcn/ui (radix-nova) · pdf-lib · react-dropzone · heic2any

## Build & run

```bash
pnpm install
pnpm build          # → out/ (static export)
pnpm dlx serve out  # local preview, http://localhost:3000
```

The build script uses `next build --webpack` instead of the default Turbopack build. Turbopack's workspace-root inference fails on this repo's pnpm + sibling-Next-projects layout; webpack handles the static export cleanly.

### HTTPS preview

`OffscreenCanvas` and `URL.createObjectURL` work over HTTP, but some browsers prefer HTTPS for full feature support. Two paths:

```bash
# Self-signed (browser warning):
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 365 -subj "/CN=squisher.local"
pnpm dlx serve out --ssl-cert cert.pem --ssl-key key.pem -l 3000

# mkcert (trusted locally, no warning):
mkcert -install
mkcert squisher.local localhost 192.168.x.x
pnpm dlx serve out --ssl-cert squisher.local+2.pem --ssl-key squisher.local+2-key.pem -l 3000
```

## Status

Shipped v1 + multi-PDF split. See `plan.md` for the full design rationale, library choices, size-estimation algorithm, compression strategy, split bin-packing, deployment options, and verification steps.
