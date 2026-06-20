/**
 * Tiny round-robin worker pool. Tracks per-worker "busy" state and
 * dispatches tasks to the first idle worker; queues when all workers
 * are busy. Resolves the task promise when the worker posts a
 * matching `id` reply.
 *
 * Hosts that want OffscreenCanvas-backed rendering pair this with
 * `transferCanvasToWorker` — one worker per scene layer or per canvas
 * pane, depending on workload partition strategy.
 */
export class WorkerPool {
  private readonly workers: readonly Worker[];
  private readonly busy: boolean[];
  private readonly queue: {
    readonly task: (worker: Worker) => Promise<unknown>;
    readonly resolve: (value: unknown) => void;
    readonly reject: (err: unknown) => void;
  }[] = [];

  constructor(workers: readonly Worker[]) {
    if (workers.length === 0) throw new Error("WorkerPool needs at least one worker");
    this.workers = workers;
    this.busy = workers.map(() => false);
  }

  /** Number of workers in the pool. */
  get size(): number {
    return this.workers.length;
  }

  /** Number of workers currently executing a task. */
  get busyCount(): number {
    return this.busy.filter(Boolean).length;
  }

  /**
   * Submit a task. `fn` is invoked with the assigned worker; resolve
   * the returned promise when the work is done. The pool re-marks the
   * worker idle whether `fn` resolves or rejects.
   */
  submit<T>(fn: (worker: Worker) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const work = {
        task: fn as (w: Worker) => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      };
      const idle = this.busy.indexOf(false);
      if (idle === -1) {
        this.queue.push(work);
      } else {
        this.run(idle, work);
      }
    });
  }

  /** Terminate every worker. The pool is unusable afterwards. */
  terminate(): void {
    for (const w of this.workers) w.terminate();
  }

  private run(
    index: number,
    work: {
      task: (w: Worker) => Promise<unknown>;
      resolve: (v: unknown) => void;
      reject: (err: unknown) => void;
    },
  ): void {
    this.busy[index] = true;
    const worker = this.workers[index];
    if (worker === undefined) throw new Error("packages/renderer-workers: index out of range");
    work.task(worker).then(
      (value) => {
        this.busy[index] = false;
        const next = this.queue.shift();
        if (next) this.run(index, next);
        work.resolve(value);
      },
      (err: unknown) => {
        this.busy[index] = false;
        const next = this.queue.shift();
        if (next) this.run(index, next);
        work.reject(err);
      },
    );
  }
}
