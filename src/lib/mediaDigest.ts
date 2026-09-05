const digests = new WeakMap<Blob, Promise<string>>();

/** Blobs are immutable. Reuse their digest, never a pathname or a mutable file. */
export function mediaSha256(blob: Blob): Promise<string> {
  const cached = digests.get(blob);
  if (cached) return cached;
  const task = blob.arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes))
    .then((digest) => [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  digests.set(blob, task);
  void task.catch(() => { if (digests.get(blob) === task) digests.delete(blob); });
  return task;
}
