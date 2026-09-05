/** Order-preserving, bounded work. A failed item never erases successful originals. */
export async function mapMediaSettled<T, R>(items: readonly T[], task: (item: T) => Promise<R>, concurrency = 2): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new TypeError("Invalid media concurrency.");
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await task(items[index]!) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}

export function abortMedia(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Media operation cancelled.", "AbortError");
}

/** Event waits have one terminal outcome and remove listeners on every path. */
export function waitForVideo(video: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked", signal?: AbortSignal, timeoutMs = 15000): Promise<void> {
  abortMedia(signal);
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", cancelled);
      error ? reject(error) : resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("Video could not be decoded. Use a supported MP4, MOV, or WebM file."));
    const cancelled = () => finish(signal?.reason ?? new DOMException("Media operation cancelled.", "AbortError"));
    const timer = setTimeout(() => finish(new Error(`Video ${event === "seeked" ? "seeking" : "loading"} timed out.`)), timeoutMs);
    video.addEventListener(event, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) cancelled();
  });
}

/** A cancellable/deadlined media operation. Late results never regain ownership. */
export function runMediaTask<T>(run: () => Promise<T>, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  label: string;
  cancel: () => void;
  disposeLate?: (value: T) => void;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    const stop = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { options.cancel(); }
      catch (cleanupError) { reject(new AggregateError([reason, cleanupError], "Media stopped, but decoder cleanup failed.")); return; }
      reject(reason);
    };
    const abort = () => stop(options.signal?.reason ?? new DOMException("Media operation cancelled.", "AbortError"));
    const timer = setTimeout(() => stop(new Error(`${options.label} timed out.`)), options.timeoutMs ?? 15000);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) { abort(); return; }
    Promise.resolve().then(() => settled ? undefined : run()).then((value) => {
      if (settled) { if (value !== undefined) options.disposeLate?.(value); return; }
      settled = true;
      cleanup();
      resolve(value as T);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}
