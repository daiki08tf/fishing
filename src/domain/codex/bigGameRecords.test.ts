import { describe, expect, it } from 'vitest'
import {
  BIG_GAME_RECORD_MIN_PERCENTILE,
  BIG_GAME_RECORD_MIN_WEIGHT_KG,
  bigGameRecords,
  hasBigGameExperience,
} from './bigGameRecords'
import type { CodexState, FishRecordEntry, SpeciesRecord } from './FishRecord'
import type { FishIndividualId, FishSpeciesId } from '../ids'

const entry = (speciesId: string, weightKg: number, percentile: number): FishRecordEntry => ({
  individualId: `${speciesId}-1` as FishIndividualId,
  speciesId: speciesId as FishSpeciesId,
  lengthCm: weightKg * 10,
  weightKg,
  condition: 1,
  percentile,
  traits: [],
})

const record = (
  speciesId: string,
  weightKg: number,
  percentile: number,
  catchCount = 1,
): SpeciesRecord => ({
  speciesId: speciesId as FishSpeciesId,
  catchCount,
  largestLengthCm: weightKg * 10,
  heaviestWeightKg: weightKg,
  bestPercentile: percentile,
  caughtTraits: [],
  personalBest: entry(speciesId, weightKg, percentile),
})

const state = (records: readonly SpeciesRecord[]): CodexState => ({
  species: Object.fromEntries(records.map((r) => [String(r.speciesId), r])),
})

describe('bigGameRecords', () => {
  it('returns nothing for an empty codex', () => {
    expect(bigGameRecords(state([]))).toEqual([])
    expect(hasBigGameExperience(state([]))).toBe(false)
  })

  it('includes species over the weight threshold', () => {
    const records = bigGameRecords(state([record('gt', 42.3, 99.2)]))

    expect(records).toHaveLength(1)
    expect(records[0]?.speciesId).toBe('gt')
    expect(records[0]?.weightKg).toBe(42.3)
    expect(records[0]?.topPercent).toBeCloseTo(0.8)
    expect(hasBigGameExperience(state([record('gt', 42.3, 99.2)]))).toBe(true)
  })

  it('includes species over the percentile threshold even when lighter', () => {
    const records = bigGameRecords(state([record('rare-small', 12, 95)]))

    expect(records).toHaveLength(1)
  })

  it('excludes ordinary catches', () => {
    const records = bigGameRecords(
      state([
        record('small', BIG_GAME_RECORD_MIN_WEIGHT_KG - 1, BIG_GAME_RECORD_MIN_PERCENTILE - 1),
      ]),
    )

    expect(records).toHaveLength(0)
    expect(hasBigGameExperience(state(records.length === 0 ? [] : []))).toBe(false)
  })

  it('sorts by weight descending', () => {
    const records = bigGameRecords(
      state([record('mid', 30, 91), record('big', 55, 92), record('heavy', 80, 90)]),
    )

    expect(records.map((r) => r.speciesId)).toEqual(['heavy', 'big', 'mid'])
  })
})
