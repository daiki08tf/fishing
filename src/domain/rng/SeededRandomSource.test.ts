import { describe, expect, it } from 'vitest'
import { EmptyPickError, InvalidRandomRangeError } from './RandomError'
import { SeededRandomSource } from './SeededRandomSource'

const sequence = (seed: number | string, count: number): readonly number[] => {
  const random = new SeededRandomSource(seed)
  return Array.from({ length: count }, () => random.next())
}

describe('SeededRandomSource', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sequence(42, 20)).toEqual(sequence(42, 20))
    expect(sequence('fixture-seed', 20)).toEqual(sequence('fixture-seed', 20))
  })

  it('produces different sequences for different seeds', () => {
    expect(sequence(42, 8)).not.toEqual(sequence(43, 8))
    expect(sequence('alpha', 8)).not.toEqual(sequence('beta', 8))
  })

  it('normalises equivalent numeric seeds', () => {
    // 32bit へ切り詰めるため、負値と巨大値でも決定的である。
    expect(sequence(-1, 4)).toEqual(sequence(0xffffffff, 4))
  })

  it('keeps next() inside [0, 1)', () => {
    const random = new SeededRandomSource(7)

    for (let index = 0; index < 1000; index += 1) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('keeps int() inside the inclusive bounds', () => {
    const random = new SeededRandomSource('bounds')
    const seen = new Set<number>()

    for (let index = 0; index < 500; index += 1) {
      const value = random.int(5, 10)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(5)
      expect(value).toBeLessThanOrEqual(10)
      seen.add(value)
    }

    // 上限・下限の両方が到達可能であること（off-by-one の検出）。
    expect(seen.has(5)).toBe(true)
    expect(seen.has(10)).toBe(true)
  })

  it('supports single-value ranges', () => {
    const random = new SeededRandomSource(1)
    expect(random.int(3, 3)).toBe(3)
  })

  it('rejects invalid ranges clearly', () => {
    const random = new SeededRandomSource(1)

    expect(() => random.int(10, 5)).toThrow(InvalidRandomRangeError)
    expect(() => random.int(1.5, 3)).toThrow(InvalidRandomRangeError)
    expect(() => random.int(1, 3.5)).toThrow(InvalidRandomRangeError)
    expect(() => random.int(Number.NaN, 3)).toThrow(InvalidRandomRangeError)
  })

  it('rejects non-finite seeds clearly', () => {
    expect(() => new SeededRandomSource(Number.NaN)).toThrow(InvalidRandomRangeError)
  })

  it('rejects pick() on an empty collection', () => {
    const random = new SeededRandomSource(1)
    expect(() => random.pick([])).toThrow(EmptyPickError)
  })

  it('picks an element of the collection deterministically', () => {
    const items = ['a', 'b', 'c', 'd'] as const
    const first = new SeededRandomSource('pick').pick(items)
    const second = new SeededRandomSource('pick').pick(items)

    expect(items).toContain(first)
    expect(first).toBe(second)
  })

  it('keeps a stable reference sequence', () => {
    /*
     * Golden test。
     * アルゴリズムを意図的に変更するとここが落ちる。
     * バランス検証とバグ再現のため、系列を固定しておく価値がある。
     * 変更する場合は、理由を記録してこの値を更新する。
     */
    const first = sequence(42, 4)

    expect(first).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
    ])
  })
})
