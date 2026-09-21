import { DEFAULT_PROGRESSION_TUNING, type ProgressionTuning } from './ProgressionTuning'

/**
 * 反復 XP 減衰（PROGRESSION.md §7）。
 *
 * 同じ魚を大量に釣るだけで Lv100 にならないようにする。
 * ただし「自己記録・Trophy・高百分位・初魚種・新しい Spot・新しい釣法」は
 * 減衰の対象外または緩和とする（同じ魚を釣る楽しさを潰さないため）。
 *
 * 将来は spotId / methodId 単位でも数えられるよう、キーを分けて持つ。
 */

export type RepetitionState = {
  readonly species: Readonly<Record<string, number>>
  readonly spots: Readonly<Record<string, number>>
  readonly methods: Readonly<Record<string, number>>
}

export const emptyRepetitionState = (): RepetitionState => ({
  species: {},
  spots: {},
  methods: {},
})

export const repetitionCountForSpecies = (state: RepetitionState, speciesId: string): number =>
  state.species[speciesId] ?? 0

/** 減衰を無視・緩和する条件。 */
export type DecayRelief = {
  readonly firstCatch: boolean
  readonly personalRecord: boolean
  readonly trophy: boolean
  readonly highPercentile: boolean
  readonly newSpot: boolean
  readonly newMethod: boolean
}

export const NO_DECAY_RELIEF: DecayRelief = {
  firstCatch: false,
  personalRecord: false,
  trophy: false,
  highPercentile: false,
  newSpot: false,
  newMethod: false,
}

/**
 * 通算捕獲数に対する減衰倍率。
 * count は「今回を含めた」その魚種の捕獲数。
 */
export const decayMultiplierForCount = (
  count: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  const safeCount = Math.max(1, Math.trunc(count))

  for (const band of tuning.decayBands) {
    if (safeCount <= band.upTo) {
      return band.multiplier
    }
  }

  return 1
}

/** 特別な捕獲かどうかを考慮した最終的な減衰倍率。 */
export const decayMultiplier = (options: {
  readonly count: number
  readonly relief: DecayRelief
  readonly tuning?: ProgressionTuning
}): number => {
  const tuning = options.tuning ?? DEFAULT_PROGRESSION_TUNING
  const { relief } = options

  if (
    relief.firstCatch ||
    relief.personalRecord ||
    relief.trophy ||
    relief.highPercentile ||
    relief.newSpot ||
    relief.newMethod
  ) {
    return 1
  }

  return decayMultiplierForCount(options.count, tuning)
}

/** 捕獲を 1 件記録する（キーごとに独立して数える）。 */
export const incrementRepetition = (
  state: RepetitionState,
  keys: {
    readonly speciesId: string
    readonly spotId?: string
    readonly methodId?: string
  },
): RepetitionState => {
  const species = {
    ...state.species,
    [keys.speciesId]: (state.species[keys.speciesId] ?? 0) + 1,
  }
  const spots =
    keys.spotId === undefined
      ? state.spots
      : { ...state.spots, [keys.spotId]: (state.spots[keys.spotId] ?? 0) + 1 }
  const methods =
    keys.methodId === undefined
      ? state.methods
      : { ...state.methods, [keys.methodId]: (state.methods[keys.methodId] ?? 0) + 1 }

  return { species, spots, methods }
}
