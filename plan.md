# Squisher

## Context

Web app. User uploads N images, gives a target final PDF size, app compresses/resizes the images and assembles them into one PDF whose size lands within target. Estimates feasibility live as the user types and refuses impossible targets with a useful status message (e.g. "Too small — minimum is 800 KB"). Per-image upload cap: 25 MB. All processing client-side — no server, no DB, no auth — so the tool is zero-infra to operate and fully private. Stack: Next.js 16 App Router + TypeScript + Tailwind v4 + shadcn/ui. Audience: friends + family, low traffic.

Deployment stays portable across three targets: Vercel, Cloudflare Pages, and self-hosted NAS. Achieved by shipping pure static output — same `out/` directory works on all three.

## Library Choices

| Concern | Pick | Why |
|---|---|---|
| PDF assembly | `pdf-lib` | Browser-native, embeds JPEG without re-encoding, full page-size control. |
| Image compression | Canvas `toBlob('image/jpeg', q)` (OffscreenCanvas in worker) | Direct quality + dimension control, zero extra bundle. |
| HEIC decode | `heic2any` (lazy-loaded) | Only paid for when an `.heic`/`.heif` is dropped (~500 KB). |
| Drag-drop | `react-dropzone` | File-type filter, multi-file, a11y. |
| State | `useReducer` | Small flow doesn't need xstate/zustand. |

## Size Estimation (`lib/estimate.ts`)

1. Decode each file to `ImageBitmap`; record `(w, h)` and original byte size.
2. Empirical JPEG bpp constants: q=0.3 → ~0.10 bpp, q=0.5 → ~0.18, q=0.75 → ~0.28, q=0.9 → ~0.55.
3. PDF overhead: ~2 KB fixed + ~600 B per page; pdf-lib embeds JPEGs unchanged.
4. Envelope:
   - `min = Σ (w·h · 0.08 bpp, dims ÷ 2) + overhead`
   - `max = Σ original_size + overhead`
5. Verdict (computed live on every target change):
   - `target < min` → `infeasible`. Status: "Too small — minimum is X."
   - `target ≥ Σ original` → `no_compression`. Status: "Target above original size."
   - Else `feasible`.

## Compression Strategy (`lib/compress.ts`)

Global-quality iteration:

1. Initial q from bpp table given `target / Σ pixels`.
2. Encode all at q.
3. Within ±10% of target → done.
4. Adjust q by `(target / actual)^0.7`. Max 3 iterations.
5. Still over → downscale all by `sqrt(target/actual)`, re-run once.

Per-image budgeting deferred to v2.

## Multi-PDF Split (`planParts` in `lib/estimate.ts`)

When the target is too small for a single PDF — or the user just wants smaller files — a "Split into multiple PDFs" checkbox reinterprets the target as a **per-part** cap. The app packs the images across N PDFs, each ≤ target.

1. **Feasibility per image.** If any single image's minimum contribution (`(w/2)·(h/2)·MIN_BPP + per-page overhead`) plus base overhead exceeds the target, the split is `infeasibleSplit` — that one image can never fit any part. Status names the offending image and its minimum.
2. **Greedy bin-pack.** Walk images in order, accumulating estimated *minimum* bytes into the current part. When adding the next image would push the part's min over the target (and the part is non-empty), start a new part. Returns `feasibleSplit` with `{ parts, partsCount, partMinBytes }`.
3. Packing uses the optimistic `min` envelope, not `max`. Each part still runs the full compression iteration to land within ±10% of the per-part target, so a part may end below its min estimate but never far above target.

Greedy (first-fit by input order) keeps page order intact across parts — important for documents. No bin-packing optimization to minimize part count; order preservation wins over tightest pack.

## File Layout

```
app/
  layout.tsx          root + Tailwind
  page.tsx            single-page UI, wires reducer + components, derives verdict
  globals.css         shadcn theme tokens (light + dark)
components/
  Dropzone.tsx
  FileList.tsx        thumbnails, sizes, remove
  TargetSizeInput.tsx numeric + KB/MB toggle, live status text
  ProgressView.tsx
  DownloadCard.tsx
  ui/                 shadcn primitives (button, card, input, progress, alert)
lib/
  types.ts            ImageItem, Verdict, SplitVerdict/SplitPlan, CompressOutput, FlowState, Action
  decode.ts           File → ImageBitmap (+ HEIC branch, randomUUID fallback)
  estimate.ts
  compress.ts
  pdf.ts              pdf-lib assembly, one page per image
  flow.ts             reducer + state machine
  worker.ts           OffscreenCanvas worker bootstrap (+ main-thread fallback); takes parts[][], returns CompressOutput[]
  worker-impl.ts      DedicatedWorker message handler; loops parts, scales progress (i+p)/total
```

Web Worker required — encoding a 25 MB JPEG on the main thread freezes UI for seconds. Uses `OffscreenCanvas`; falls back to main thread if missing (Safari < 16.4). The worker takes `parts: ImageItem[][]` (one entry = one PDF; single-PDF mode passes `[items]`), compresses + assembles each part in turn, and returns `CompressOutput[]` (`{ blob, finalBytes, name }`). Progress is scaled `(i + partProgress) / totalParts` with a `Part i/N:` label prefix when N > 1.

## State Machine (`lib/flow.ts`)

```
idle → filesAdded ⇄ (live verdict derived in page.tsx)
         └─ START_COMPRESS → compressing → done
                                  └─ error → filesAdded
```

`useReducer` with discriminated-union `Action`. No explicit `estimating`/`feasibilityShown` states — the verdict is a `useMemo` derived from `(items, targetBytes)` in `app/page.tsx`, recomputed on every input change. A `splitEnabled` boolean rides through every non-idle state (set via `SET_SPLIT`); when on, page.tsx derives a second `splitVerdict` from `planParts` and feeds the worker `splitVerdict.plan.parts` instead of `[items]`. `done` carries `outputs: CompressOutput[]` (one or many PDFs) rather than a single blob. On first `ADD_FILES`, the reducer pre-fills `targetBytes` with `defaultTargetBytes(estimateMinBytes(items))` — ceiled to whole KB or 0.1 MB so the input display round-trips ≥ min and the user lands in a feasible state by default.

## UX Decisions

- No "Check feasibility" button. Verdict updates live below the target input — green for feasible/no_compression, red for infeasible.
- Compress button is always rendered but disabled when verdict is `infeasible` or absent.
- "Minimum achievable PDF size" surfaced above the target input as soon as files are added.
- Target input defaults to the minimum feasible value rounded up to a clean display unit so the form opens in a runnable state.
- **Split checkbox** below the target input. When checked, the single-PDF verdict text is hidden and replaced by a split preview: part count, per-part image count, and per-part min estimate — or a red "X alone needs ≥ Y" message when infeasible. Compress button label flips to "Compress & build N PDFs".
- **DownloadCard** renders one row per output with its own size + ±% vs target and a Download button; multi-part shows a total-bytes summary. Object URLs created in `useMemo`, revoked on unmount.

## Critical Tradeoffs

- **JPEG-only output** simplifies the PDF path; PNGs re-encode to JPEG (transparency lost). Document; PNG-passthrough is a later option.
- **Empirical bpp constants** are ~20% off worst case. If iteration count > 2, run a one-image calibration pass and retry.
- **Global q** can over-degrade small images. Acceptable v1; per-image fallback deferred.
- **`OffscreenCanvas` on Safari** shipped 16.4 (2023). Main-thread path covers older.
- **`crypto.randomUUID` requires a secure context.** Detected at runtime with a `Date.now() + Math.random()` fallback so HTTP LAN deployments still work.

## Build

```bash
pnpm install
pnpm build          # → out/   (uses next build --webpack)
pnpm dlx serve out  # local preview
```

`pnpm build` is wired to `next build --webpack`. Turbopack's workspace-root inference fails when the repo lives next to sibling Next projects under a shared parent (`/mnt/nas/projects/*`) and `node_modules/next` is a pnpm symlink — it walks up from `app/` and can't resolve `next/package.json`. Setting `turbopack.root` in `next.config.ts` did not override this. The webpack build path skips the issue entirely and produces the same `out/` directory.

## Deployment — Portable Static Build

Target Vercel first; Cloudflare Pages and NAS stay one-command swaps. All three serve the same `out/` directory produced by `next build` with `output: 'export'`.

### Constraints (enforced in code)

- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }`, `trailingSlash: true` (better for NAS path resolution).
- No `app/api/*`, no `middleware.ts`, no `'use server'`. Adding any of these breaks `next export` — fail fast.
- User-uploaded images rendered with `<img src={URL.createObjectURL(file)}>`, never `next/image` with a remote loader.
- Lazy-load `heic2any` only on HEIC drop.
- Tested locally with plain static server: `pnpm build && pnpm dlx serve out`.

### Option 1 — Vercel

- `vercel.ts`: `framework: 'nextjs'`, `buildCommand: 'pnpm build'`. Vercel auto-detects `output: 'export'` and serves `out/` from CDN.
- No env vars, no functions provisioned.
- Bandwidth-only usage. For friends/family scale, well under the free tier.
- Deploy: push to GitHub → auto-deploy, or `vercel deploy --prod`.

### Option 2 — Cloudflare Pages

- Build command: `pnpm build`. Output directory: `out`.
- Cloudflare Pages free: unlimited bandwidth, 500 builds/mo.
- Switch: push to GitHub, connect repo in Cloudflare dashboard, set build command + output dir + Node 24.

### Option 3 — Self-hosted NAS

- Two sub-options:
  - **(a) Static files via reverse proxy** (Caddy / nginx / Synology Web Station):
    1. `pnpm build` locally → `out/`.
    2. `rsync -av out/ nas:/srv/squisher/`.
    3. Point nginx/Caddy site root at `/srv/squisher`. Single try-files rule: `try_files $uri $uri/ /index.html;`.
    4. Serve over HTTPS. Required for full feature support across browsers. Two paths:
       - **mkcert** for trusted local CA: `mkcert -install`, `mkcert nas.local 192.168.x.x`, then `serve --ssl-cert ... --ssl-key ...`. Trust must be installed on each client device.
       - **Caddy auto-TLS** with a real domain via Let's Encrypt.
  - **(b) Docker on NAS**:
    - `Dockerfile`: `FROM nginx:alpine`, `COPY out /usr/share/nginx/html`.
    - `docker compose up -d`.
- No backend, no database. Resource cost: a few MB RAM for nginx.
- Reachability for friends/family: Tailscale, Cloudflare Tunnel, or port-forward 443 with dynamic DNS.

### Switching Between Targets

Same `out/` artifact deploys everywhere. Push to GitHub triggers Vercel and/or Cloudflare; `rsync` to NAS. Update DNS at the registrar to point the domain at the chosen host. Pause Vercel project to fully migrate off.

## Verification

1. `pnpm dev` (Turbopack dev server is fine), open `localhost:3000`.
2. Drop 3 JPEGs (~2 MB each), target pre-fills to min → green status, output ~min ±10%, opens in Chrome PDF viewer.
3. Lower target below min → red "Too small — minimum is X" status, Compress button disabled.
4. Drop 1 HEIC → lazy `heic2any` load, conversion succeeds.
5. Drop 30 MB file → rejected at dropzone with toast.
6. Target above original total → green "Target above original size — PDF will be at most X" status.
7. Check "Split into multiple PDFs" with a target below the single-PDF min → preview lists N parts, each ≤ target; Compress produces N downloadable PDFs, each within ±10% of the per-part target.
8. Set split target below the largest single image's minimum → red "X alone needs ≥ Y" message, Compress disabled.
9. DevTools 4× CPU throttle → UI responsive during compress (proves worker).
10. `pnpm build && pnpm dlx serve out` → app works fully against plain static server. Proves Cloudflare/NAS portability.
11. Serve over HTTP from LAN IP → image upload still works (proves `crypto.randomUUID` fallback).
