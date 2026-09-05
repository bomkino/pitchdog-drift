export interface TimedSample {
  readonly timestamp: number;
  readonly duration: number;
  close(): void;
}

/** Owns one displayed sample and a bounded decoder iterator, not a movie in RAM. */
export class SequentialSamples<T extends TimedSample> {
  private iterator: AsyncIterator<T> | null = null;
  private current: T | null = null;
  private requested = -Infinity;
  private generation = 0;
  private reading = false;

  constructor(private readonly open: (time: number) => AsyncIterator<T>) {}

  async read(time: number): Promise<T> {
    if (!Number.isFinite(time) || time < 0) throw new TypeError("Invalid sample time.");
    if (this.reading) throw new Error("Concurrent reads must use separate source clocks.");
    this.reading = true;
    try {
      // A loop/backward seek or sparse jump starts at its nearest keyframe.
      // Adjacent output frames retain the forward decoder and may reuse a source frame.
      if (time < this.requested - 1e-9 || time > this.requested + 0.5) this.reset();
      this.requested = time;
      const generation = this.generation;
      this.iterator ??= this.open(time);
      while (!this.current || time >= this.current.timestamp + this.current.duration - 1e-9) {
        const result = await this.iterator.next();
        if (generation !== this.generation) {
          if (!result.done) result.value.close();
          throw new DOMException("Source decoding was cancelled.", "AbortError");
        }
        if (result.done) throw new Error("Video ended before the requested frame.");
        this.current?.close();
        this.current = result.value;
        if (!Number.isFinite(this.current.timestamp) || !Number.isFinite(this.current.duration) || this.current.duration <= 0) {
          throw new Error("Video has invalid frame timing.");
        }
        if (this.current.timestamp > time + 1e-6) throw new Error("No video frame covers the requested time.");
      }
      return this.current;
    } finally { this.reading = false; }
  }

  reset(): void {
    this.generation++;
    this.current?.close();
    this.current = null;
    const previous = this.iterator;
    this.iterator = null;
    this.requested = -Infinity;
    // Iterator return must not strand Cancel behind a stalled decoder.
    if (previous?.return) void previous.return().catch(() => undefined);
  }
}
