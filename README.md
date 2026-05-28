# Squisher

Web app that turns a batch of images into a single PDF whose final size fits a user-chosen target (e.g. "make it under 5 MB"). The app figures out compression and resizing automatically, and tells the user up front when a target is impossible to reach instead of failing silently.

## What it does

- Accept many images at once via drag-and-drop or file picker (JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF).
- User enters a target PDF size in KB or MB.
- App estimates whether the target is feasible. If not, it explains the minimum reachable size and what to change (drop largest images, raise target).
- If feasible, the app compresses and resizes images, assembles them into one PDF, and lets the user download it.
- Per-image upload limit: 25 MB.

## Design highlights

- **Fully client-side.** No uploads. Images never leave the browser. No server, no database, no accounts.
- **Portable static build.** Pure `next export` output — the same `out/` directory deploys to Vercel, Cloudflare Pages, or a self-hosted NAS.
- **Web Worker for heavy work.** Compression and PDF assembly run off the main thread so the UI stays responsive on large batches.
- **Lazy HEIC support.** The HEIC decoder is only fetched when an iPhone photo is dropped.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · pdf-lib · react-dropzone · heic2any

## Status

Greenfield — planning complete. See `plan.md` for the full implementation plan, library choices, size-estimation algorithm, compression strategy, deployment options, and verification steps.

## Audience

Built for friends and family use. Low traffic by design. Sized to fit comfortably in free tiers of any of the three hosting targets.
