import type { TravelCostComponent } from '../access/Transport'
import type { CountryId, ExpeditionId, PermitId, RegionId } from '../ids'
import type { WorldDataStatus } from '../world/Region'
import { MINUTES_PER_DAY, toMinutes, type WorldTime } from '../world/WorldTime'

/**
 * 遠征（Phase 8）。
 *
 * 日帰りの釣行（World session の 1 往復）と違い、遠征は「数日単位で地域を移り、
 * 現地の拠点から釣りをする」まとまりである。
 *
 * 実装しないもの（意図的）: 空港チェックイン、手荷物、パスポート、座席、
 * 航空会社、為替、実際の予約、現地法規の詳細。
 *
 * 費用は既存 Economy の円だけを使う（新通貨を作らない）。
 */

/**
 * 遠征の移動手段の種別。便名・航路・乗継までは持たない。
 * Phase 19A: flight 固定から最小の journey へ一般化（Japan World Design Bible §8.1）。
 * 長時間フェリー等は kind を増やさず oneWayMinutes で表現する。
 * 複数 leg の乗継 journey は作らない（1 leg のみ）。
 */
export const JOURNEY_KINDS = [
  'domestic_flight',
  'international_flight',
  'ferry',
  'rail',
  'drive',
] as const
export type JourneyKind = (typeof JOURNEY_KINDS)[number]

export type ExpeditionJourney = {
  readonly kind: JourneyKind
  readonly name: string
  /** 片道。往復分は計画時に 2 倍する。 */
  readonly oneWayCostYen: number
  readonly oneWayMinutes: number
}

/** journey kind ごとの TravelCostComponent kind（内訳表示用。料金計算には影響しない）。 */
const JOURNEY_COST_KINDS: Record<JourneyKind, TravelCostComponent['kind']> = {
  domestic_flight: 'flight',
  international_flight: 'flight',
  ferry: 'ferry',
  rail: 'fare',
  drive: 'running_cost',
}

export type ExpeditionLodging = {
  readonly id: string
  readonly name: string
  readonly nightlyCostYen: number
}

export type ExpeditionNights = {
  readonly default: number
  readonly min: number
  readonly max: number
}

export type ExpeditionPermit = {
  readonly permitId: PermitId
  readonly name: string
  readonly costYen: number
}

/** Content から渡される遠征定義（Phase 7A の TransportDefinition と同じ立場）。 */
export type ExpeditionDefinition = {
  readonly id: ExpeditionId
  readonly regionId: RegionId
  readonly name: string
  readonly dataStatus: WorldDataStatus
  readonly journey: ExpeditionJourney
  readonly nights: ExpeditionNights
  readonly lodgings: readonly ExpeditionLodging[]
  readonly permit?: ExpeditionPermit
}

/** 出発前に確定する計画（予約内容）。UI はこれを表示して開始する。 */
export type ExpeditionPlan = {
  readonly definitionId: ExpeditionId
  readonly regionId: RegionId
  readonly countryId: CountryId
  readonly regionName: string
  readonly countryName: string
  readonly name: string
  readonly domestic: boolean
  readonly baseId: string
  readonly baseName: string
  readonly lodging: ExpeditionLodging
  readonly nights: number
  readonly totalCostYen: number
  readonly costComponents: readonly TravelCostComponent[]
  /** 往路 / 復路 / 滞在の合計（ゲーム内分）。 */
  readonly outboundMinutes: number
  readonly returnMinutes: number
  readonly totalMinutes: number
  readonly permitId: PermitId | null
  readonly permitName: string | null
}

/** 進行中の遠征。Save に載る。 */
export type ActiveExpedition = {
  readonly definitionId: ExpeditionId
  readonly regionId: RegionId
  readonly countryId: CountryId
  readonly regionName: string
  readonly baseId: string
  readonly baseName: string
  readonly startedAt: WorldTime
  readonly arriveAt: WorldTime
  readonly plannedReturnAt: WorldTime
  /** 復路の航空移動（ゲーム内分）。 */
  readonly returnMinutes: number
  readonly nights: number
  readonly lodgingName: string
  readonly totalCostYen: number
}

/** 遠征の player state（Save の独立ブロック）。 */
export type ExpeditionState = {
  readonly current: ActiveExpedition | null
  /** 訪れたことのある地域（home region を含む）。 */
  readonly visitedRegionIds: readonly RegionId[]
  /** 所持している許可（遊漁券など）。 */
  readonly permits: readonly PermitId[]
}

export const createInitialExpeditionState = (homeRegionId: RegionId): ExpeditionState => ({
  current: null,
  visitedRegionIds: [homeRegionId],
  permits: [],
})

export const ownsPermit = (state: ExpeditionState, permitId: PermitId): boolean =>
  state.permits.includes(permitId)

/** AccessEngine へ渡す permit 一覧。 */
export const permitIdsForAccess = (state: ExpeditionState): readonly string[] =>
  state.permits.map((permitId) => String(permitId))

const clampNights = (nights: number, range: ExpeditionNights): number =>
  Math.min(range.max, Math.max(range.min, Math.round(nights)))

/**
 * 遠征計画を組み立てる。遠征の規則はここだけに置き、UI は結果を表示する。
 * 所持金の判定は Economy の責務なのでここでは行わない。
 */
export const planExpedition = (input: {
  readonly definition: ExpeditionDefinition
  readonly countryId: CountryId
  readonly countryName: string
  readonly regionName: string
  readonly baseId: string
  readonly baseName: string
  readonly domestic: boolean
  readonly nights?: number
  readonly lodgingId?: string
}): ExpeditionPlan | null => {
  const { definition } = input
  const nights = clampNights(input.nights ?? definition.nights.default, definition.nights)
  const lodging =
    definition.lodgings.find((entry) => entry.id === input.lodgingId) ?? definition.lodgings[0]

  if (lodging === undefined) {
    return null
  }

  const journeyYen = definition.journey.oneWayCostYen * 2
  const lodgingYen = lodging.nightlyCostYen * nights
  const permitYen = definition.permit?.costYen ?? 0
  const components: TravelCostComponent[] = [
    {
      kind: JOURNEY_COST_KINDS[definition.journey.kind],
      label: `${definition.journey.name}（往復）`,
      amount: journeyYen,
      charge: 'per_trip',
    },
    {
      kind: 'lodging',
      label: `宿泊 ${lodging.name}（${String(nights)}泊）`,
      amount: lodgingYen,
      charge: 'per_trip',
    },
  ]

  if (definition.permit !== undefined && permitYen > 0) {
    components.push({
      kind: 'permit',
      label: definition.permit.name,
      amount: permitYen,
      charge: 'per_trip',
    })
  }

  const totalCostYen = components.reduce((total, component) => total + component.amount, 0)

  return {
    definitionId: definition.id,
    regionId: definition.regionId,
    countryId: input.countryId,
    regionName: input.regionName,
    countryName: input.countryName,
    name: definition.name,
    domestic: input.domestic,
    baseId: input.baseId,
    baseName: input.baseName,
    lodging,
    nights,
    totalCostYen,
    costComponents: components,
    outboundMinutes: definition.journey.oneWayMinutes,
    returnMinutes: definition.journey.oneWayMinutes,
    totalMinutes: definition.journey.oneWayMinutes * 2 + nights * MINUTES_PER_DAY,
    permitId: definition.permit?.permitId ?? null,
    permitName: definition.permit?.name ?? null,
  }
}

/** 遠征中に残っている日数（切り上げ）。予定を過ぎていたら 0。 */
export const remainingExpeditionDays = (current: ActiveExpedition, now: WorldTime): number => {
  const minutes = toMinutes(current.plannedReturnAt) - toMinutes(now)

  return minutes <= 0 ? 0 : Math.ceil(minutes / MINUTES_PER_DAY)
}
