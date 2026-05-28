# Squisher

## Context

Greenfield web app. User uploads N images, gives a target final PDF size, app compresses/resizes the images and assembles them into one PDF whose size lands within target. Must estimate feasibility up front and refuse impossible targets with a useful error (e.g. "min achievable is 800 KB; lower image count or raise target"). Per-image upload cap: 25 MB. All processing client-side — no server, no DB, no auth — so the tool is zero-infra to operate and fully private. Stack: Next.js 16 App Router + TypeScript + Tailwind + shadcn/ui. Audience: friends + family, low traffic.

Deployment must stay portable across three targets: Vercel (initial), Cloudflare Pages, and self-hosted NAS. Achieved by shipping pure static output — same `out/` directory works on all three.

## Library Choices

| Concern | Pick | Why |
|---|---|---|
| PDF assembly | `pdf-lib` | Browser-native, embeds JPEG/PNG without re-encoding, full page-size control. |
| Image compression | Canvas `toBlob('image/jpeg', q)` | Direct quality + dimension control, zero extra bundle. |
| HEIC decode | `heic2any` (lazy-loaded) | Only paid for when an `.heic`/`.heif` is dropped (~500 KB). |
| Drag-drop | `react-dropzone` | File-type filter, paste, multi-file, a11y. |
| State | `useReducer` | 5-state flow doesn't need xstate/zustand. |

## Size Estimation (`lib/estimate.ts`)

1. Decode each file to `ImageBitmap`; record `(w, h)` and original byte size.
2. Empirical JPEG bpp constants: q=0.3 → ~0.10 bpp, q=0.5 → ~0.18, q=0.75 → ~0.28, q=0.9 → ~0.55.
3. PDF overhead: ~2 KB fixed + ~600 B per page; pdf-lib embeds JPEGs unchanged.
4. Envelope:
   - `min = Σ (w·h · 0.08 bpp, dims ÷ 2) + overhead`
   - `max = Σ original_size + overhead`
5. Verdict:
   - `target < min` → infeasible. Show "min ≈ X MB. Drop K largest or raise target."
   - `target > Σ original` → "no compression needed."
   - Else feasible.

## Compression Strategy (`lib/compress.ts`)

Global-quality iteration:

1. Initial q from bpp table given `target / Σ pixels`.
2. Encode all at q.
3. Within ±10% of target → done.
4. Adjust q by `(target / actual)^0.7`. Max 3 iterations.
5. Still over → downscale all by `sqrt(target/actual)`, re-run once.

Per-image budgeting deferred to v2.

## File Layout

```
app/
  layout.tsx          root + Tailwind
  page.tsx            single-page UI, wires reducer + components
  globals.css
components/
  Dropzone.tsx
  FileList.tsx        thumbnails, sizes, remove
  TargetSizeInput.tsx numeric + unit (KB/MB)
  FeasibilityBanner.tsx
  ProgressView.tsx
  DownloadCard.tsx
  ui/                 shadcn primitives (button, card, input, progress)
lib/
  types.ts            ImageItem, Verdict, FlowState, Action
  decode.ts           File → ImageBitmap (+ HEIC branch)
  estimate.ts
  compress.ts
  pdf.ts              pdf-lib assembly, one page per image
  flow.ts             reducer + state machine
  worker.ts           OffscreenCanvas worker (compress + assemble)
```

Web Worker required — encoding a 25 MB JPEG on the main thread freezes UI for seconds. Use `OffscreenCanvas`; fall back to main thread if missing (Safari < 16.4).

## State Machine (`lib/flow.ts`)

```
idle → filesAdded → estimating → feasibilityShown
                                   ├─ infeasible → filesAdded
                                   └─ feasible → compressing → done
                                                        └─ error → filesAdded
```

`useReducer` with discriminated-union `Action`.

## Critical Tradeoffs

- **JPEG-only output** simplifies the PDF path; PNGs re-encode to JPEG (transparency lost). Document; PNG-passthrough is a later option.
- **Empirical bpp constants** are ~20% off worst case. If iteration count > 2, run a one-image calibration pass and retry.
- **Global q** can over-degrade small images. Acceptable v1; per-image fallback deferred.
- **`OffscreenCanvas` on Safari** shipped 16.4 (2023). Main-thread path covers older.

## Implementation Order

1. `pnpm create next-app` (App Router, TS, Tailwind, no src/). `pnpm dlx shadcn init` then add `button card input progress alert`.
2. `pnpm add pdf-lib react-dropzone heic2any`.
3. Lock down to static export — see Deployment section. No API routes, no middleware, no server actions.
4. `lib/types.ts` + `lib/decode.ts` + `lib/estimate.ts` (pure, unit-testable).
5. `lib/compress.ts` + `lib/pdf.ts` (pure).
6. `lib/worker.ts` wrapping compress + pdf for off-main-thread.
7. `lib/flow.ts` reducer.
8. Components, then `app/page.tsx` wiring.
9. Manual verification.

## Deployment — Portable Static Build

Target Vercel first; Cloudflare Pages and NAS stay one-command swaps. All three serve the same `out/` directory produced by `next build` with `output: 'export'`.

### Constraints (enforced in code)

- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }`, `trailingSlash: true` (better for NAS path resolution).
- No `app/api/*`, no `middleware.ts`, no `'use server'`. Adding any of these breaks `next export` — fail fast.
- User-uploaded images rendered with `<img src={URL.createObjectURL(file)}>`, never `next/image` with a remote loader.
- Lazy-load `heic2any` only on HEIC drop.
- Tested locally with plain static server: `pnpm build && pnpm dlx serve out`.

### Option 1 — Vercel (initial)

- `vercel.ts`: `framework: 'nextjs'`, `buildCommand: 'next build'`. Vercel auto-detects `output: 'export'` and serves `out/` from CDN.
- No env vars, no functions provisioned.
- Bandwidth-only usage. ~500 KB initial bundle + lazy HEIC chunk. For friends/family scale (≤ hundreds visits/month) negligible — well under 100 GB/mo free tier shared with Gronthee.
- Deploy: push to GitHub → auto-deploy, or `vercel deploy --prod`.

### Option 2 — Cloudflare Pages

- Build command: `pnpm build`. Output directory: `out`.
- Cloudflare Pages free: unlimited bandwidth, 500 builds/mo. Fully isolated from Vercel quotas.
- Switch steps:
  1. Push repo to GitHub (already required for Vercel anyway).
  2. Cloudflare dashboard → Pages → Connect to Git → pick repo.
  3. Set build command `pnpm build`, output dir `out`, Node 24.
  4. (Optional) Add custom domain.
  5. Disable / pause Vercel project to stop double-deploy.

### Option 3 — Self-hosted NAS

- Two sub-options:
  - **(a) Static files via existing reverse proxy** (Caddy / nginx / Synology Web Station):
    1. `pnpm build` locally or in CI → `out/` directory.
    2. `rsync -av out/ nas:/srv/squisher/`.
    3. Point nginx/Caddy site root to `/srv/pdf-bundler`. Single try-files rule: `try_files $uri $uri/ /index.html;` (or Caddy `file_server` + `try_files`).
    4. Serve over HTTPS (Caddy auto-TLS or Let's Encrypt). HTTPS required — `OffscreenCanvas`, `URL.createObjectURL`, clipboard paste all need secure context.
  - **(b) Docker on NAS** for one-shot setup:
    - `Dockerfile`: `FROM nginx:alpine`, `COPY out /usr/share/nginx/html`, `COPY nginx.conf /etc/nginx/conf.d/default.conf`.
    - `docker compose up -d` on NAS.
- No backend, no database — NAS only serves static files. Resource cost: a few MB RAM for nginx.
- Reachability options for friends/family: Tailscale, Cloudflare Tunnel, or port-forward 443 with dynamic DNS.

### Switching Between Targets

Same artifact (`out/`) deploys everywhere. Switch checklist:

1. Run `pnpm build` and confirm `out/` exists and `out/index.html` loads via `pnpm dlx serve out` locally.
2. Pick host: push triggers Vercel; push triggers Cloudflare Pages (if connected); `rsync` to NAS.
3. Update DNS / CNAME at the registrar to point the domain at the chosen host.
4. To fully migrate off Vercel: pause the Vercel project (dashboard → Settings → General → Pause) so it stops rebuilding and consuming any quota.

## Verification

1. `pnpm dev`, open `localhost:3000`.
2. Drop 3 JPEGs (~2 MB each), target 1 MB → feasible, output ~1 MB ±10%, opens in Chrome PDF viewer.
3. Drop 10 PNGs, target 100 KB → red infeasibility banner with min estimate.
4. Drop 1 HEIC → lazy `heic2any` load, conversion succeeds.
5. Drop 30 MB file → rejected at dropzone with toast.
6. Target 50 MB, inputs 2 MB total → "no compression needed" path.
7. DevTools 4× CPU throttle → UI responsive during compress (proves worker).
8. `pnpm build && pnpm dlx serve out` → app works fully against plain static server. Proves Cloudflare/NAS portability before touching either.
