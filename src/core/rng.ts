import type { RngState } from './types';

export function mix(seed: number, cursor: number): number {
  let z = (seed + Math.imul(cursor, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

export function rollD100(rng: RngState): { roll: number; rng: RngState } {
  const roll = (mix(rng.seed, rng.cursor) % 100) + 1;
  return { roll, rng: { seed: rng.seed, cursor: rng.cursor + 1 } };
}
