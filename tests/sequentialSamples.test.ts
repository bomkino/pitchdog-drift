import { describe, expect, it } from 'vitest';
import { SequentialSamples } from '../src/core/media/sequentialSamples';
import { runMediaTask } from '../src/lib/mediaWork';

function fixture() {
  const opened: number[] = [], closed: number[] = [];
  const cursor = new SequentialSamples((time: number) => {
    opened.push(time);
    let index = Math.floor(time * 24);
    return { next: async () => {
      const n = index++;
      return { done: false as const, value: { timestamp: n / 24, duration: 1 / 24, close: () => closed.push(n) } };
    }, return: async () => ({ done: true as const, value: undefined }) };
  });
  return { cursor, opened, closed };
}

describe('bounded sequential source decoding', () => {
  it('reuses a 24 fps source frame at 60 fps output without another decode', async () => {
    const { cursor, opened, closed } = fixture();
    const first = await cursor.read(0);
    expect(await cursor.read(1 / 60)).toBe(first);
    expect(await cursor.read(2 / 60)).toBe(first);
    expect((await cursor.read(3 / 60)).timestamp).toBeCloseTo(1 / 24);
    expect(opened).toEqual([0]);
    expect(closed).toEqual([0]);
    cursor.reset();
    expect(closed).toEqual([0, 1]);
  });
  it('seeks on a loop or sparse jump, rather than walking the entire movie', async () => {
    const { cursor, opened } = fixture();
    await cursor.read(0.25); await cursor.read(0.3); await cursor.read(0.1); await cursor.read(180);
    expect(opened).toEqual([0.25, 0.1, 180]);
    cursor.reset();
  });
  it('closes a sample delivered after cancellation', async () => {
    let resolve!: (result: IteratorResult<{ timestamp: number; duration: number; close(): void }>) => void;
    let closed = 0;
    const cursor = new SequentialSamples(() => ({ next: () => new Promise<IteratorResult<{ timestamp: number; duration: number; close(): void }>>(r => { resolve = r; }) }));
    const result = cursor.read(0);
    cursor.reset();
    resolve({ done: false, value: { timestamp: 0, duration: 1, close: () => closed++ } });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(closed).toBe(1);
  });
  it('rejects a gap instead of silently supplying a future frame', async () => {
    const cursor = new SequentialSamples(() => ({ next: async () => ({ done: false, value: { timestamp: 1, duration: 1, close() {} } }) }));
    await expect(cursor.read(0)).rejects.toThrow('covers'); cursor.reset();
  });
});

describe('cancellation before and during media preparation', () => {
  it('does not start an already cancelled operation', async () => {
    const abort = new AbortController(); abort.abort(); let started = false;
    await expect(runMediaTask(async () => { started = true; }, { signal: abort.signal, label: 'decode', cancel() {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toBe(false);
  });
  it('settles promptly and disposes a late result exactly once', async () => {
    const abort = new AbortController(); let deliver!: (value: number) => void;
    let cancelled = 0, closed = 0;
    const result = runMediaTask(() => new Promise<number>(r => { deliver = r; }), { signal: abort.signal, label: 'decode', cancel: () => cancelled++, disposeLate: () => closed++ });
    await Promise.resolve(); abort.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    deliver(7); await new Promise(r => setTimeout(r, 0));
    expect(cancelled).toBe(1); expect(closed).toBe(1);
  });
  it('a stalled decoder has a deadline and relinquishes ownership', async () => {
    let cancelled = 0;
    await expect(runMediaTask(() => new Promise<never>(() => {}), { timeoutMs: 5, label: 'clip', cancel: () => cancelled++ })).rejects.toThrow('clip timed out');
    expect(cancelled).toBe(1);
  });
});
