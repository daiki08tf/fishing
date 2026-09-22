import type { WorldTime } from '../world/WorldTime'

/**
 * Environment（Phase 9）。
 *
 * 「同じ釣り場でも、季節・時間・天候・潮・水の状態で釣れ方が変わる」ための
 * 軽量な Domain。商用の気象・潮汐シミュレーションではなく、
 * 決定論的で説明可能な PROVISIONAL な近似である。
 *
 * WorldTime を SSOT とし、日付・地域・seed から再生成できる。
 * 外部 API も Math.random も使わない（既存の SeededRandomSource を使う）。
 */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const SEASON_LABELS: Readonly<Record<Season, string>> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

export const TIME_OF_DAY = ['dawn', 'morning', 'daytime', 'evening', 'night'] as const
export type TimeOfDay = (typeof TIME_OF_DAY)[number]

export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDay, string>> = {
  dawn: '朝まずめ',
  morning: '朝',
  daytime: '日中',
  evening: '夕まずめ',
  night: '夜',
}

export const WEATHERS = ['clear', 'cloudy', 'light_rain', 'rain', 'windy'] as const
export type Weather = (typeof WEATHERS)[number]

export const WEATHER_LABELS: Readonly<Record<Weather, string>> = {
  clear: '晴れ',
  cloudy: '曇り',
  light_rain: '小雨',
  rain: '雨',
  windy: '強風',
}

export const TIDES = ['low', 'rising', 'high', 'falling'] as const
export type Tide = (typeof TIDES)[number]

export const TIDE_LABELS: Readonly<Record<Tide, string>> = {
  low: '干潮',
  rising: '上げ潮',
  high: '満潮',
  falling: '下げ潮',
}

/** 水の種類。淡水は潮の影響を受けない（tide = null）。 */
export const WATER_KINDS = ['freshwater', 'brackish', 'saltwater'] as const
export type WaterKind = (typeof WATER_KINDS)[number]

export const WATER_KIND_LABELS: Readonly<Record<WaterKind, string>> = {
  freshwater: '淡水',
  brackish: '汽水',
  saltwater: '海水',
}

export const WATER_FLOWS = ['none', 'slow', 'moderate', 'strong'] as const
export type WaterFlow = (typeof WATER_FLOWS)[number]

export const WATER_FLOW_LABELS: Readonly<Record<WaterFlow, string>> = {
  none: '流れなし',
  slow: 'ゆるい',
  moderate: '普通',
  strong: '強い',
}

export type WindLevel = 'calm' | 'breezy' | 'strong'

export const WIND_LEVEL_LABELS: Readonly<Record<WindLevel, string>> = {
  calm: '穏やか',
  breezy: 'やや風',
  strong: '強い風',
}

/**
 * 地域の気候プロファイル（Content）。
 * 地域ごとの違いはここだけに置き、Resolver に地域固有の分岐を書かない。
 */
/**
 * 季節の半球（Phase 16 Part 2b）。
 *
 * 南半球では暦月と季節・水温の位相が半年ずれる（1 月が夏）。
 * Region ID で分岐せず、ClimateProfile のデータとして扱う。
 */
export const HEMISPHERES = ['north', 'south'] as const
export type Hemisphere = (typeof HEMISPHERES)[number]

export type ClimateProfile = {
  /** 季節の半球。省略時は 'north'（Content 側の既定）。 */
  readonly hemisphere: Hemisphere
  /** 年平均の水温（℃）。 */
  readonly annualMeanWaterC: number
  /** 夏 + / 冬 − の振れ幅（℃）。 */
  readonly seasonalSwingC: number
  /** 天候の出やすさ（重み。合計は問わない）。 */
  readonly weatherWeights: Readonly<Record<Weather, number>>
  /** 潮位サイクルの位相（0〜1）。地域ごとに満潮時刻をずらす。 */
  readonly tidePhaseOffset: number
  readonly tideRange: 'small' | 'moderate' | 'large'
}

export type WaterCondition = {
  readonly kind: WaterKind
  readonly temperatureC: number
  /** 0（濁り）〜 1（澄んでいる）。 */
  readonly clarity: number
  readonly flow: WaterFlow
  readonly wind: WindLevel
}

/** その時点の環境（決定論的に再生成できる）。 */
export type EnvironmentSnapshot = {
  /** YYYY-MM-DD。 */
  readonly date: string
  readonly month: number
  readonly season: Season
  readonly timeOfDay: TimeOfDay
  readonly weather: Weather
  /** 淡水では null（潮の影響なし）。 */
  readonly tide: Tide | null
  readonly water: WaterCondition
}

/** 月 → 季節（北半球の暦）。 */
const seasonOfNorth = (month: number): Season => {
  if (month >= 3 && month <= 5) {
    return 'spring'
  }

  if (month >= 6 && month <= 8) {
    return 'summer'
  }

  if (month >= 9 && month <= 11) {
    return 'autumn'
  }

  return 'winter'
}

/**
 * 月 → 季節。hemisphere を渡すと南半球の暦になる（1 月 = 夏 / 7 月 = 冬）。
 * 省略時は 'north'（既存の呼び出しは挙動が変わらない）。
 */
export const seasonOf = (month: number, hemisphere: Hemisphere = 'north'): Season => {
  if (hemisphere === 'north') {
    return seasonOfNorth(month)
  }

  // 南半球は 6 か月ずらす（暦月のみで決まる。Region ID では分岐しない）。
  const shifted = ((month - 1 + 6) % 12) + 1

  return seasonOfNorth(shifted)
}

/** 時刻 → 時間帯。 */
export const timeOfDayOf = (time: WorldTime): TimeOfDay => {
  const minutes = time.hour * 60 + time.minute

  if (minutes < 5 * 60) {
    return 'night'
  }

  if (minutes < 8 * 60) {
    return 'dawn'
  }

  if (minutes < 14 * 60) {
    return 'morning'
  }

  if (minutes < 17 * 60) {
    return 'daytime'
  }

  if (minutes < 20 * 60) {
    return 'evening'
  }

  return 'night'
}

/**
 * Spot の `environment`（Content の自由語彙）から水の種類を決める。
 * 未知の環境は淡水として扱う（新しい環境を足しても Resolver は壊れない）。
 */
export const waterKindOf = (environment: string): WaterKind => {
  switch (environment) {
    case 'estuary':
      return 'brackish'
    case 'bay_shore':
    case 'nearshore':
    case 'offshore':
      return 'saltwater'
    default:
      return 'freshwater'
  }
}

/**
 * 季節の進行度（その半球の夏 +1 / 冬 −1 / 春・秋 0）。水温の推定に使う。
 * 北半球は 8 月、南半球は 2 月がピーク。
 */
export const seasonalFactor = (month: number, hemisphere: Hemisphere = 'north'): number => {
  const peakMonth = hemisphere === 'south' ? 2 : 8

  return Math.cos(((month - peakMonth) / 12) * Math.PI * 2)
}

/**
 * 地域の代表 Environment（HOME の「今日の条件」用）。
 * 海 → 汽水 → 淡水 の順に選ぶ（潮を見せられる場所を優先する）。
 */
export const pickSummaryEnvironment = <T extends { readonly environment: string }>(
  items: readonly T[],
): T | undefined =>
  items.find((item) => waterKindOf(item.environment) === 'saltwater') ??
  items.find((item) => waterKindOf(item.environment) === 'brackish') ??
  items[0]
