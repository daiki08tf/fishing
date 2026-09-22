import { SeededRandomSource } from '../rng/SeededRandomSource'
import type { FishSpecies } from '../fish/FishSpecies'
import type { Range } from '../primitives'
import { dateKeyOf, type WorldTime } from '../world/WorldTime'
import type { FishingZone } from '../world/FishingSpot'
import { knowledgeTierFor } from '../knowledge/spotKnowledge'
import type { EnvironmentSnapshot } from './Environment'
import { SEASON_LABELS, TIME_OF_DAY_LABELS } from './Environment'
import { speciesEnvironmentMultiplier, type SearchSign } from './fishingConditions'

/**
 * Fish Finder（Phase 9 の簡易版 → Phase 17B で水深を読む）。
 *
 * 詳細なソナー画面ではなく「Search Water → 反応の強さ（と魚種の手がかり）」だけを返す。
 * 反応は (地域, Spot, 日付, 時間帯) で決定論的に決まり、条件が良いほど強い反応が出る。
 *
 * Fish Finder を持っていれば反応が一段詳しく（強く、魚種の手がかりも付く）。
 * 持っていなくても Search 自体はできて、釣りもできる。
 *
 * Phase 17B:
 * - `finder`（`detectionDepthM` / `accuracy`）を実際に使う。探知深度を超えた水深は
 *   分からない（Zone ごとの反応から除外し、海底の深さも「不明」のままにする）。
 * - 「Fish Finder が見た物理的な反応」と「Knowledge による解釈」を分ける
 *   （そのまま魚種名を明かさない。既存の Knowledge tier をそのまま使い、新しい
 *   Knowledge ルールは作らない）。
 */

const SIGNS: readonly SearchSign[] = ['weak', 'moderate', 'strong', 'large']

export type FishFinderReading = {
  readonly detectionDepthM: number
  readonly accuracy: number
}

/** 水深帯ごとの反応。Fish Finder と depth-only Zone があるときだけ埋まる。 */
export type DepthSignal = {
  readonly rangeM: Range
  readonly strength: SearchSign
}

export type SearchResult = {
  readonly sign: SearchSign
  readonly speciesIds: readonly string[]
  /** Search で得た手がかりの説明（UI にそのまま出す）。 */
  readonly label: string
  /** Phase 17B: depth-only Zone があり、Fish Finder を持っているときだけ埋まる。 */
  readonly depthSignals: readonly DepthSignal[] | null
  /** Phase 17B: 海底の深さが探知深度内で分かっているか。判断材料が無ければ null。 */
  readonly bottomKnown: boolean | null
  /** Phase 17B: ベイトの活性（Fish Finder があるときだけ）。 */
  readonly baitActivity: SearchSign | null
  /** Phase 17B: Knowledge による解釈（魚種名は明かさない）。 */
  readonly knowledgeHint: string | null
}

const stepUp = (sign: SearchSign, steps: number): SearchSign => {
  const index = SIGNS.indexOf(sign)

  return SIGNS[Math.min(SIGNS.length - 1, Math.max(0, index + steps))] ?? sign
}

const signFor = (roll: number): SearchSign =>
  roll >= 1.5 ? 'large' : roll >= 1.05 ? 'strong' : roll >= 0.6 ? 'moderate' : 'weak'

/** accuracy が低いほど帯をぼかす（精度が低い＝範囲が広くなる）。 */
const blurMFor = (accuracy: number): number => 10 * (1 - Math.max(0, Math.min(1, accuracy)))

const depthSignalsFor = (
  zones: readonly FishingZone[],
  finder: FishFinderReading,
  activity: number,
  random: { next: () => number },
): readonly DepthSignal[] => {
  const blur = blurMFor(finder.accuracy)

  return zones.flatMap((zone) => {
    const range = zone.depthRangeM

    // 探知深度より完全に深い Zone は、反応そのものが取れない。
    if (range === undefined || range.min >= finder.detectionDepthM) {
      return []
    }

    const visibleMaxM = Math.min(range.max, finder.detectionDepthM)
    const roll = random.next() * 1.4 * Math.max(0.6, activity)

    return [
      {
        rangeM: {
          min: Math.max(0, Math.round(range.min - blur)),
          max: Math.round(visibleMaxM + blur),
        },
        strength: signFor(roll),
      },
    ]
  })
}

const knowledgeHintFor = (score: number, environment: EnvironmentSnapshot): string => {
  const tier = knowledgeTierFor(score).tier

  if (tier <= 0) {
    return 'この辺りに魚がいそう'
  }

  if (tier === 1) {
    return '反応の中に、見覚えのある魚種が混じっていそう'
  }

  if (tier === 2) {
    return `${TIME_OF_DAY_LABELS[environment.timeOfDay]}は反応が出やすい`
  }

  return `${SEASON_LABELS[environment.season]}のこの水温・地形なら、居着く魚の当たりがつく`
}

/**
 * 水を探る。
 *
 * @param input.finder 所持していれば反応が詳しく・水深帯も分かる（未所持は null）
 * @param input.species その Spot の候補魚種
 * @param input.depthZones depth-only Zone（船の真下など）。岸釣りでは省略でよい
 * @param input.spotDepthRangeM Spot 全体の水深目安（海底が分かるかどうかの判定に使う）
 * @param input.knowledgeScore 省略時は 0（Knowledge 解釈をしない）
 */
export const searchWater = (input: {
  readonly environment: EnvironmentSnapshot
  readonly regionId: string
  readonly spotId: string
  readonly time: WorldTime
  readonly species: readonly FishSpecies[]
  readonly finder: FishFinderReading | null
  readonly depthZones?: readonly FishingZone[]
  readonly spotDepthRangeM?: Range
  readonly knowledgeScore?: number
  /** Phase 17B: Reposition で進める探索位置。省略時は 0（同じ位置での再探索）。 */
  readonly positionIndex?: number
}): SearchResult => {
  const random = new SeededRandomSource(
    `finder:${input.regionId}:${input.spotId}:${dateKeyOf(input.time)}:${input.environment.timeOfDay}:${String(input.positionIndex ?? 0)}`,
  )
  const hasFinder = input.finder !== null
  const activity =
    input.species.length === 0
      ? 1
      : input.species.reduce(
          (sum, species) => sum + speciesEnvironmentMultiplier(species, input.environment),
          0,
        ) / input.species.length
  const roll = random.next() * 1.4 * Math.max(0.6, activity)
  const base = signFor(roll)
  const sign = stepUp(base, hasFinder ? 1 : 0)
  const ranked = input.species
    .map((species) => ({
      id: String(species.id),
      value: speciesEnvironmentMultiplier(species, input.environment),
    }))
    .sort((left, right) => right.value - left.value)
  const speciesIds = hasFinder
    ? // Fish Finder は条件が渋いときでも候補を絞って見せる（0.8 以上を最大 3 種）。
      ranked
        .filter((entry) => entry.value >= 0.8)
        .slice(0, 3)
        .map((entry) => entry.id)
    : []

  const depthZones = input.depthZones ?? []
  const depthSignals =
    input.finder === null || depthZones.length === 0
      ? null
      : depthSignalsFor(depthZones, input.finder, activity, random)

  const bottomKnown =
    input.finder === null || input.spotDepthRangeM === undefined
      ? null
      : input.finder.detectionDepthM >= input.spotDepthRangeM.max

  const baitActivity = input.finder === null ? null : signFor(activity * 1.1)

  const knowledgeHint = knowledgeHintFor(input.knowledgeScore ?? 0, input.environment)

  return {
    sign,
    speciesIds,
    label: hasFinder ? 'Fish Finder: 反応を解析した' : '目視と勘: 反応のおおよそを掴んだ',
    depthSignals,
    bottomKnown,
    baitActivity,
    knowledgeHint,
  }
}
