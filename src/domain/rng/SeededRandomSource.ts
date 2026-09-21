import { EmptyPickError, InvalidRandomRangeError } from './RandomError'
import type { RandomSource } from './RandomSource'

const UINT32_RANGE = 4294967296

/**
 * 文字列 Seed を 32bit 整数へ変換する（FNV-1a）。
 * 文字列 Seed を許可することで、テストやバグ報告で扱いやすくする。
 */
const hashSeed = (seed: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const normalizeSeed = (seed: number): number => {
  if (!Number.isFinite(seed)) {
    throw new InvalidRandomRangeError(seed, seed)
  }
  return Math.trunc(seed) >>> 0
}

/**
 * 決定論的な擬似乱数生成器（mulberry32）。
 *
 * - 同じ Seed → 同じ系列
 * - 異なる Seed → 異なる系列
 * - 系列は Uint32 の状態のみに依存し、プラットフォーム差の影響を受けない
 *
 * アルゴリズムは意図的に小さく保つ。将来差し替えられるよう RandomSource 経由で利用する。
 */
export class SeededRandomSource implements RandomSource {
  /** 正規化後の Seed。再現調査のために保持する。 */
  readonly seed: number

  private state: number

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : normalizeSeed(seed)
    this.state = this.seed
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (
      !Number.isInteger(minInclusive) ||
      !Number.isInteger(maxInclusive) ||
      minInclusive > maxInclusive
    ) {
      throw new InvalidRandomRangeError(minInclusive, maxInclusive)
    }

    const span = maxInclusive - minInclusive + 1
    return minInclusive + Math.floor(this.next() * span)
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new EmptyPickError()
    }
    const index = this.int(0, items.length - 1)
    return items[index] as T
  }
}
