import { evaluateAccess, fastestTravelOption } from '../access/accessEngine'
import type { PlayerTransportState, TransportDefinition } from '../access/Transport'
import type { FishingSpotId, TransportId } from '../ids'
import type { KnowledgeState } from '../knowledge/KnowledgeState'
import { addRegionKnowledge } from '../knowledge/regionKnowledge'
import { addSpotKnowledge } from '../knowledge/spotKnowledge'
import type { FishingSpot } from './FishingSpot'
import { advanceMinutes, type WorldTime } from './WorldTime'
import { DEFAULT_WORLD_TUNING, type WorldTuning } from './WorldTuning'

/**
 * 世界（釣行 1 回）の状態機械。
 *
 *   HOME → TRAVELLING → AT_SPOT → RETURNING_HOME → HOME
 *
 * FishingEngine とは分離する。釣りそのものは FishingEngine が担当し、
 * 世界側は「時間が進む」「Knowledge が増える」ことだけを扱う。
 * FishingEngine の内部状態を直接いじらない。
 *
 * 移動は即時解決でよい（Phase 4）。ただし状態としては TRAVELLING /
 * RETURNING_HOME を持つので、UI が演出を足す余地を残している。
 */

export const WORLD_PHASES = ['HOME', 'TRAVELLING', 'AT_SPOT', 'RETURNING_HOME'] as const
export type WorldPhase = (typeof WORLD_PHASES)[number]

/** 1 回の釣行の記録（帰宅時に見せる）。 */
export type TripSummary = {
  readonly spotId: FishingSpotId
  readonly spotName: string
  readonly startedAt: WorldTime
  readonly arrivedAt: WorldTime
  readonly attempts: number
  readonly catches: number
  readonly xpGained: number
  readonly knowledgeGained: number
  readonly largestLengthCm: number | null
  /** v5 以前の進行中 Trip を移行した場合だけ null。 */
  readonly transportId: TransportId | null
}

export type WorldState = {
  readonly time: WorldTime
  readonly phase: WorldPhase
  readonly homeLocationId: string
  readonly currentSpotId: FishingSpotId | null
  /** 到着予定（TRAVELLING / RETURNING_HOME のとき）。 */
  readonly arrivalTime: WorldTime | null
  readonly trip: TripSummary | null
  readonly discoveredSpotIds: readonly FishingSpotId[]
}

export type WorldContext = {
  readonly world: WorldState
  readonly knowledge: KnowledgeState
}

export const WORLD_EVENTS = [
  'LEFT_HOME',
  'ARRIVED_AT_SPOT',
  'SPOT_DISCOVERED',
  'FISHING_ATTEMPT',
  'LEFT_SPOT',
  'RETURNED_HOME',
] as const

export type WorldEvent = (typeof WORLD_EVENTS)[number]

export type WorldFailureReason = 'not_at_home' | 'not_at_spot' | 'inaccessible' | 'no_travel_option'

export type WorldActionResult =
  | {
      readonly ok: true
      readonly context: WorldContext
      readonly events: readonly WorldEvent[]
    }
  | {
      readonly ok: false
      readonly reason: WorldFailureReason
      readonly message: string
    }

export const createInitialWorld = (tuning: WorldTuning = DEFAULT_WORLD_TUNING): WorldState => ({
  time: tuning.startTime,
  phase: 'HOME',
  homeLocationId: tuning.homeLocationId,
  currentSpotId: null,
  arrivalTime: null,
  trip: null,
  discoveredSpotIds: [],
})

const rememberSpot = (
  discovered: readonly FishingSpotId[],
  spotId: FishingSpotId,
): readonly FishingSpotId[] => (discovered.includes(spotId) ? discovered : [...discovered, spotId])

/**
 * 自宅を出て Spot へ向かう。所要時間をゲーム内時間へ加算する。
 * アクセス条件を満たさない場合は失敗する（Level は条件に存在しない）。
 */
export const leaveForSpot = (input: {
  readonly context: WorldContext
  readonly spot: FishingSpot
  readonly transports: readonly TransportDefinition[]
  readonly playerTransports: PlayerTransportState
  readonly transportId?: TransportId
  readonly tuning?: WorldTuning
}): WorldActionResult => {
  const { world, knowledge } = input.context

  if (world.phase !== 'HOME') {
    return { ok: false, reason: 'not_at_home', message: '自宅にいないため出発できない' }
  }

  const access = evaluateAccess({
    spot: input.spot,
    transports: input.transports,
    playerTransports: input.playerTransports,
    knowledge,
  })

  if (!access.accessible) {
    return {
      ok: false,
      reason: 'inaccessible',
      message: access.blockedReasons.map((reason) => reason.label).join(' / '),
    }
  }

  const option =
    input.transportId === undefined
      ? fastestTravelOption(access.travelOptions)
      : (access.travelOptions.find((candidate) => candidate.transportId === input.transportId) ??
        null)

  if (option === null) {
    return { ok: false, reason: 'no_travel_option', message: 'その移動手段では行けない' }
  }

  const arrival = advanceMinutes(world.time, option.minutes)

  return {
    ok: true,
    events: ['LEFT_HOME'],
    context: {
      knowledge,
      world: {
        ...world,
        time: arrival,
        phase: 'TRAVELLING',
        currentSpotId: input.spot.id,
        arrivalTime: arrival,
        trip: {
          spotId: input.spot.id,
          spotName: input.spot.name,
          startedAt: world.time,
          arrivedAt: arrival,
          attempts: 0,
          catches: 0,
          xpGained: 0,
          knowledgeGained: 0,
          largestLengthCm: null,
          transportId: option.transportId,
        },
      },
    },
  }
}

/** Spot へ到着する。初訪問なら Knowledge が増える。 */
export const arriveAtSpot = (input: {
  readonly context: WorldContext
  readonly spot: FishingSpot
  readonly tuning?: WorldTuning
}): WorldActionResult => {
  const tuning = input.tuning ?? DEFAULT_WORLD_TUNING
  const { world, knowledge } = input.context

  if (world.phase !== 'TRAVELLING') {
    return { ok: false, reason: 'not_at_home', message: '移動中ではない' }
  }

  const spotId = input.spot.id
  const firstVisit = !world.discoveredSpotIds.includes(spotId)
  const withSpot = firstVisit
    ? addSpotKnowledge(knowledge, String(spotId), tuning.firstVisitKnowledge)
    : knowledge
  // 初訪問はその水域の Knowledge も少し増える（地域の勘）。
  const nextKnowledge = firstVisit
    ? addRegionKnowledge(withSpot, String(input.spot.regionId), tuning.firstVisitRegionKnowledge)
    : withSpot
  const gained = firstVisit ? tuning.firstVisitKnowledge + tuning.firstVisitRegionKnowledge : 0

  return {
    ok: true,
    events: firstVisit ? ['ARRIVED_AT_SPOT', 'SPOT_DISCOVERED'] : ['ARRIVED_AT_SPOT'],
    context: {
      knowledge: nextKnowledge,
      world: {
        ...world,
        phase: 'AT_SPOT',
        arrivalTime: null,
        discoveredSpotIds: rememberSpot(world.discoveredSpotIds, spotId),
        trip:
          world.trip === null
            ? null
            : {
                ...world.trip,
                knowledgeGained: world.trip.knowledgeGained + gained,
              },
      },
    },
  }
}

/**
 * 釣り 1 回分の結果を世界へ反映する。
 * 成功でも失敗でも時間は進み、Knowledge も増える（ボウズを無駄にしない）。
 */
export const recordFishingAttempt = (input: {
  readonly context: WorldContext
  readonly spot: FishingSpot
  readonly outcome: 'landed' | 'failed'
  readonly xpGained: number
  readonly caughtLengthCm?: number
  readonly tuning?: WorldTuning
}): WorldActionResult => {
  const tuning = input.tuning ?? DEFAULT_WORLD_TUNING
  const { world, knowledge } = input.context

  if (world.phase !== 'AT_SPOT') {
    return { ok: false, reason: 'not_at_spot', message: '釣り場にいない' }
  }

  if (world.currentSpotId !== input.spot.id) {
    return { ok: false, reason: 'not_at_spot', message: '今いる釣り場と違う' }
  }

  const gained =
    tuning.fishingAttemptKnowledge + (input.outcome === 'landed' ? tuning.catchKnowledge : 0)
  const withSpot = addSpotKnowledge(knowledge, String(input.spot.id), gained)
  const nextKnowledge = addRegionKnowledge(
    withSpot,
    String(input.spot.regionId),
    tuning.fishingAttemptRegionKnowledge,
  )
  const nextTime = advanceMinutes(world.time, tuning.fishingAttemptMinutes)
  const caught = input.caughtLengthCm ?? null

  return {
    ok: true,
    events: ['FISHING_ATTEMPT'],
    context: {
      knowledge: nextKnowledge,
      world: {
        ...world,
        time: nextTime,
        trip:
          world.trip === null
            ? null
            : {
                ...world.trip,
                attempts: world.trip.attempts + 1,
                catches: world.trip.catches + (input.outcome === 'landed' ? 1 : 0),
                xpGained: world.trip.xpGained + input.xpGained,
                knowledgeGained: world.trip.knowledgeGained + gained,
                largestLengthCm:
                  caught === null
                    ? world.trip.largestLengthCm
                    : Math.max(world.trip.largestLengthCm ?? 0, caught),
              },
      },
    },
  }
}

/** Spot を出て自宅へ向かう。帰路の時間も加算する。 */
export const leaveSpot = (input: {
  readonly context: WorldContext
  readonly spot: FishingSpot
  readonly transports: readonly TransportDefinition[]
  readonly playerTransports: PlayerTransportState
  readonly tuning?: WorldTuning
}): WorldActionResult => {
  const { world, knowledge } = input.context

  if (world.phase !== 'AT_SPOT') {
    return { ok: false, reason: 'not_at_spot', message: '釣り場にいない' }
  }

  if (world.currentSpotId !== input.spot.id) {
    return { ok: false, reason: 'not_at_spot', message: '今いる釣り場と違う' }
  }

  const access = evaluateAccess({
    spot: input.spot,
    transports: input.transports,
    playerTransports: input.playerTransports,
    knowledge,
  })
  const outboundTransportId = world.trip?.transportId ?? null
  const option =
    outboundTransportId === null
      ? fastestTravelOption(access.travelOptions)
      : (access.travelOptions.find((candidate) => candidate.transportId === outboundTransportId) ??
        fastestTravelOption(access.travelOptions))

  if (option === null) {
    return { ok: false, reason: 'no_travel_option', message: '帰る手段がない' }
  }

  const arrival = advanceMinutes(world.time, option.minutes)

  return {
    ok: true,
    events: ['LEFT_SPOT'],
    context: {
      knowledge,
      world: {
        ...world,
        time: arrival,
        phase: 'RETURNING_HOME',
        arrivalTime: arrival,
      },
    },
  }
}

/** 自宅へ到着する。釣行の記録は残す（結果画面で見せる）。 */
export const arriveHome = (input: {
  readonly context: WorldContext
  readonly tuning?: WorldTuning
}): WorldActionResult => {
  const { world, knowledge } = input.context

  if (world.phase !== 'RETURNING_HOME') {
    return { ok: false, reason: 'not_at_home', message: '帰宅中ではない' }
  }

  return {
    ok: true,
    events: ['RETURNED_HOME'],
    context: {
      knowledge,
      world: {
        ...world,
        phase: 'HOME',
        currentSpotId: null,
        arrivalTime: null,
      },
    },
  }
}
