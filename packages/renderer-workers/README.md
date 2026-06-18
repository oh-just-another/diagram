# @oh-just-another/renderer-workers

L1 worker-pool primitives for off-thread rendering: layer-pinned dispatch plus a generic round-robin pool. Depends only on `@oh-just-another/types`.

The kernel ships no worker script — hosts supply their own `Worker[]` (e.g. `renderer-canvas`'s `render-worker.ts`) and feed it to the pools here.

## Install

```bash
pnpm add @oh-just-another/renderer-workers
```

## Usage

```ts
import { WorkerPool, LayerWorkerPool } from "@oh-just-another/renderer-workers";
import { layerId } from "@oh-just-another/types";

const workers = [
  /* … */
]; // Worker[] spawned by the host

// Round-robin fan-out — any worker can pick up any task:
const pool = new WorkerPool(workers);
const result = await pool.submit((worker) => postAndAwait(worker, msg));

// Layer-pinned — each layer's OffscreenCanvas lives on one worker:
const layers = new LayerWorkerPool(workers);
await layers.submitForLayer(layerId("layer-1"), (worker) => renderFrame(worker, frame));
layers.releaseLayer(layerId("layer-1")); // un-pin when the layer is destroyed
```

## API

**`WorkerPool`** — round-robin dispatch; first idle worker wins, tasks queue when all are busy.

- `submit(fn)` — run `fn(worker)`, resolving/rejecting with its result; the worker is freed either way.
- `terminate()` — kill every worker.
- Read-only `size` / `busyCount`.

**`LayerWorkerPool`** — pins each `LayerId` to one worker for its lifetime (required when a layer owns a transferred `OffscreenCanvas`).

- `submitForLayer(layerId, fn)` — run on the layer's pinned worker (assigns the least-loaded worker on first sight).
- `submitAny(fn)` — round-robin an unpinned task via the underlying `WorkerPool`.
- `workerFor(layerId)` / `releaseLayer(layerId)` / `terminate()`.
- Read-only `size` / `assignedLayerCount`.

## Exports

| Name              | Kind  | Notes                                         |
| ----------------- | ----- | --------------------------------------------- |
| `WorkerPool`      | class | Generic round-robin pool.                     |
| `LayerWorkerPool` | class | Layer-pinned dispatch on top of `WorkerPool`. |
