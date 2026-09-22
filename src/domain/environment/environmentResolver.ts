import type { RandomSource } from '../rng/RandomSource'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { dateKeyOf, type WorldTime } from '../world/WorldTime'
import {
  seasonOf,
  seasonalFactor,
  timeOfDayOf,
  waterKindOf,
  type ClimateProfile,
  type EnvironmentSnapshot,
  type Tide,
  type WaterFlow,
  type WaterKind,
  type Weather,
  type WindLevel,
  WEATHERS,
} from './Environment'

/**
 * Environment の解決（Phase 9）。
 *
 *   WorldTime + region の ClimateProfile + spot の environment
 *     ↓
 *   EnvironmentSnapshot
 *
 * 同じ (日付, 地域, spot の環境) なら常に同じ結果になる。
 * 外部 API も Math.random も使わない。
 */

/** 潮位サイクルの周期（分）。12 時間 25 分 ≒ 745 分（半日周潮の目安）。 */
const TIDE_PERIOD_MINUTES = 745

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const round1 = (value: number): number => Math.round(value * 10) / 10

/** 重み付き抽選（0 以下の重みは無視する）。 */
const pickWeighted = <T extends string>(
  weights: Readonly<Record<T, number>>,
  keys: readonly T[],
  random: RandomSource,
): T => {
  const total = keys.reduce((sum, key) => sum + Math.max(0, weights[key] ?? 0), 0)

  if (total <= 0) {
    return keys[0] as T
  }

  let roll = random.next() * total

  for (const key of keys) {
    roll -= Math.max(0, weights[key] ?? 0)

    if (roll <= 0) {
      return key
    }
  }

  return keys[keys.length - 1] as T
}

/** その日の天候。日付と地域で決まる（同じ日は同じ天候）。 */
export const weatherFor = (input: {
  readonly time: WorldTime
  readonly climate: ClimateProfile
  readonly regionId: string
}): Weather =>
  pickWeighted(
    input.climate.weatherWeights,
    WEATHERS,
    new SeededRandomSource(`weather:${input.regionId}:${dateKeyOf(input.time)}`),
  )

/** 潮位サイクル。淡水では null。 */
export const tideFor = (input: {
  readonly time: WorldTime
  readonly climate: ClimateProfile
  readonly kind: WaterKind
}): Tide | null => {
  if (input.kind === 'freshwater') {
    return null
  }

  const minutes = input.time.hour * 60 + input.time.minute
  // 日付が変わっても連続するように、通日も含めて位相を進める。
  const dayIndex = (input.time.month - 1) * 31 + input.time.day
  const phase =
    ((dayIndex * 24 * 60 + minutes + input.climate.tidePhaseOffset * TIDE_PERIOD_MINUTES) /
      TIDE_PERIOD_MINUTES) %
    1
  const quarter = Math.floor(phase * 4) % 4

  return (['low', 'rising', 'high', 'falling'] as const)[quarter] ?? 'low'
}

const baseFlowOf = (environment: string): WaterFlow => {
  switch (environment) {
    case 'river':
      return 'moderate'
    case 'canal':
      return 'slow'
    case 'estuary':
      return 'moderate'
    case 'bay_shore':
      return 'slow'
    case 'nearshore':
      return 'moderate'
    case 'offshore':
      return 'strong'
    default:
      return 'none'
  }
}

const flowStep = (flow: WaterFlow, steps: number): WaterFlow => {
  const order: readonly WaterFlow[] = ['none', 'slow', 'moderate', 'strong']
  const index = order.indexOf(flow)

  return order[clamp(index + steps, 0, order.length - 1)] ?? flow
}

const baseClarityOf = (environment: string): number => {
  switch (environment) {
    case 'lake':
    case 'managed_pond':
      return 0.75
    case 'offshore':
    case 'nearshore':
      return 0.7
    case 'bay_shore':
      return 0.6
    case 'river':
      return 0.55
    case 'canal':
      return 0.45
    default:
      return 0.6
  }
}

const windOf = (weather: Weather): WindLevel =>
  weather === 'windy' ? 'strong' : weather === 'light_rain' ? 'breezy' : 'calm'

/**
 * 水の状態（水温 / 濁り / 流れ / 風）。
 *
 * 雨 → 流れ ↑・濁り ↑、強風 → 風 ↑・濁り ↑ 程度の分かりやすい関係だけを持つ。
 * 物理シミュレーションはしない。
 */
export const waterConditionFor = (input: {
  readonly time: WorldTime
  readonly climate: ClimateProfile
  readonly regionId: string
  readonly environment: string
  readonly weather: Weather
}): EnvironmentSnapshot['water'] => {
  const kind = waterKindOf(input.environment)
  const random = new SeededRandomSource(
    `water:${input.regionId}:${dateKeyOf(input.time)}:${input.environment}`,
  )
  const dailyNoise = (random.next() - 0.5) * 1.2
  const weatherCooling =
    input.weather === 'rain'
      ? -1.2
      : input.weather === 'light_rain'
        ? -0.6
        : input.weather === 'clear'
          ? 0.4
          : 0
  // 淡水は 0.5℃、海水は -1.5℃ を下限にする（氷点下の「水」を作らない）。
  const temperatureFloor = kind === 'freshwater' ? 0.5 : -1.5
  const temperatureC = Math.max(
    temperatureFloor,
    round1(
      input.climate.annualMeanWaterC +
        input.climate.seasonalSwingC * seasonalFactor(input.time.month, input.climate.hemisphere) +
        dailyNoise +
        weatherCooling,
    ),
  )
  const rainPenalty = input.weather === 'rain' ? 0.22 : input.weather === 'light_rain' ? 0.1 : 0
  const windPenalty = input.weather === 'windy' ? 0.08 : 0
  const clarity = round1(
    clamp(baseClarityOf(input.environment) - rainPenalty - windPenalty, 0.15, 0.95),
  )
  // 雨のときだけ流れが一段強くなる（小雨では変わらない）。
  const flowSteps = input.weather === 'rain' ? 1 : 0
  const flow = flowStep(baseFlowOf(input.environment), flowSteps)

  return { kind, temperatureC, clarity, flow, wind: windOf(input.weather) }
}

/**
 * その時点の Environment を解決する。
 *
 * @param input.time ゲーム内時刻（WorldTime が SSOT）
 * @param input.climate 地域の気候プロファイル（Content）
 * @param input.regionId 地域 ID（seed に使う）
 * @param input.environment Spot の environment（淡水 / 汽水 / 海水の判定）
 */
export const resolveEnvironment = (input: {
  readonly time: WorldTime
  readonly climate: ClimateProfile
  readonly regionId: string
  readonly environment: string
}): EnvironmentSnapshot => {
  const weather = weatherFor(input)
  const water = waterConditionFor({ ...input, weather })

  return {
    date: dateKeyOf(input.time),
    month: input.time.month,
    season: seasonOf(input.time.month, input.climate.hemisphere),
    timeOfDay: timeOfDayOf(input.time),
    weather,
    tide: tideFor({ time: input.time, climate: input.climate, kind: water.kind }),
    water,
  }
}
