/**
 * src/game/rng.ts
 * Generador de números pseudoaleatorios determinista (mulberry32).
 * Se usa una semilla para poder reproducir generaciones (anti-exploit y debug).
 */

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number | string) {
    this.s = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** float [0,1) */
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Distribución normal truncada */
  gauss(mean: number, sd: number, min = -Infinity, max = Infinity): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, mean + n * sd));
  }

  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((acc, e) => acc + e[1], 0);
    let r = this.next() * total;
    for (const [value, weight] of entries) {
      r -= weight;
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** ID corto único (client-side). Los IDs sensibles los genera el backend. */
export function uid(prefix = "id"): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${t}${r}`;
}

export const clamp = (v: number, min = 1, max = 99) => Math.max(min, Math.min(max, Math.round(v)));
