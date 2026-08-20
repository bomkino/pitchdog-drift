const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

export function hash32(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function mixSeed(...values: readonly number[]): number {
  let result = 0x9e3779b9;
  for (const value of values) {
    result = hash32(result ^ hash32(value));
  }
  return result >>> 0;
}

export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = hash32(seed) || 0x6d2b79f5;
  }

  uint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  unit(): number {
    return this.uint32() / UINT32_MAX_PLUS_ONE;
  }

  bipolar(): number {
    return this.unit() * 2 - 1;
  }
}
