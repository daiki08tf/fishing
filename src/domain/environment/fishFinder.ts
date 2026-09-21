import { SeededRandomSource } from '../rng/SeededRandomSource'
import type { FishSpecies } from '../fish/FishSpecies'
import { dateKeyOf, type WorldTime } from '../world/WorldTime'
import type { EnvironmentSnapshot } from './Environment'
import { speciesEnvironmentMultiplier, type SearchSign } from './fishingConditions'

/**
 * 簡易 Fish Finder（Phase 9）。
 *
 * 詳細なソナー画面ではなく「Search Water → 反応の強さ（と魚種の手がかり）」だけを返す。
 * 反応は (地域, Spot, 日付, 時間帯) で決定論的に決まり、条件が良いほど強い反応が出る。
 *
 * Fish Finder を持っていれば反応が一段詳しく（強く、魚種の手がかりも付く）。
 * 持っていなくても Search 自体はできて、釣りもできる。
 */

const SIGNS: readonly SearchSign[] = ['weak', 'moderate', 'strong', 'large']

export type SearchResult = {
  readonly sign: SearchSign
  readonly speciesIds: readonly string[]
  /** Search で得た手がかりの説明（UI にそのまま出す）。 */
  readonly label: string
}

const stepUp = (sign: SearchSign, steps: number): SearchSign => {
  const index = SIGNS.indexOf(sign)

  return SIGNS[Math.min(SIGNS.length - 1, Math.max(0, index + steps))] ?? sign
}

/**
 * 水を探る。
 *
 * @param input.hasFishFinder 所持していれば反応が詳しくなる
 * @param input.species その Spot の候補魚種
 */
export const searchWater = (input: {
  readonly environment: EnvironmentSnapshot
  readonly regionId: string
  readonly spotId: string
  readonly time: WorldTime
  readonly species: readonly FishSpecies[]
  readonly hasFishFinder: boolean
}): SearchResult => {
  const random = new SeededRandomSource(
    `finder:${input.regionId}:${input.spotId}:${dateKeyOf(input.time)}:${input.environment.timeOfDay}`,
  )
  const activity =
    input.species.length === 0
      ? 1
      : input.species.reduce(
          (sum, species) => sum + speciesEnvironmentMultiplier(species, input.environment),
          0,
        ) / input.species.length
  const roll = random.next() * 1.4 * Math.max(0.6, activity)
  const base: SearchSign =
    roll >= 1.5 ? 'large' : roll >= 1.05 ? 'strong' : roll >= 0.6 ? 'moderate' : 'weak'
  const sign = stepUp(base, input.hasFishFinder ? 1 : 0)
  const ranked = input.species
    .map((species) => ({
      id: String(species.id),
      value: speciesEnvironmentMultiplier(species, input.environment),
    }))
    .sort((left, right) => right.value - left.value)
  const speciesIds = input.hasFishFinder
    ? // Fish Finder は条件が渋いときでも候補を絞って見せる（0.8 以上を最大 3 種）。
      ranked
        .filter((entry) => entry.value >= 0.8)
        .slice(0, 3)
        .map((entry) => entry.id)
    : []

  return {
    sign,
    speciesIds,
    label: input.hasFishFinder ? 'Fish Finder: 反応を解析した' : '目視と勘: 反応のおおよそを掴んだ',
  }
}
