import { describe, expect, it } from 'vitest'
import { asPermitId } from '../ids'
import { emptyKnowledgeState } from '../knowledge/KnowledgeState'
import { regionKnowledgeScore } from '../knowledge/regionKnowledge'
import { spotKnowledgeScore } from '../knowledge/spotKnowledge'
import { createTestSpot } from '../../../tests/fixtures/spots'
import { createTestTransportState, TEST_TRANSPORTS } from '../../../tests/fixtures/transports'
import { DEFAULT_WORLD_TUNING } from './WorldTuning'
import { formatWorldTime, isSameDay } from './WorldTime'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
  type WorldContext,
} from './worldSession'

const home = (): WorldContext => ({
  world: createInitialWorld(),
  knowledge: emptyKnowledgeState(),
})

const transportContext = {
  transports: TEST_TRANSPORTS,
  playerTransports: createTestTransportState(),
}

/** 自宅 → 移動 → 到着 まで進める（UI は即時解決する）。 */
const travelTo = (context: WorldContext, spot = createTestSpot()): WorldContext => {
  const left = leaveForSpot({ context, spot, ...transportContext })

  if (!left.ok) {
    throw new Error(left.message)
  }

  const arrived = arriveAtSpot({ context: left.context, spot })

  if (!arrived.ok) {
    throw new Error(arrived.message)
  }

  return arrived.context
}

describe('world session', () => {
  it('starts at home', () => {
    const world = createInitialWorld()

    expect(world.phase).toBe('HOME')
    expect(world.time).toEqual(DEFAULT_WORLD_TUNING.startTime)
    expect(world.currentSpotId).toBeNull()
    expect(world).not.toHaveProperty('availableTransports')
  })

  it('consumes time when travelling', () => {
    const context = home()
    const left = leaveForSpot({ context, spot: createTestSpot(), ...transportContext })

    expect(left.ok).toBe(true)

    if (!left.ok) {
      return
    }

    expect(left.events).toContain('LEFT_HOME')
    expect(left.context.world.phase).toBe('TRAVELLING')
    expect(left.context.world.time.hour).toBe(6)
    expect(left.context.world.time.minute).toBe(20)
    expect(left.context.world.trip?.startedAt).toEqual(DEFAULT_WORLD_TUNING.startTime)
  })

  it('adds first visit knowledge on arrival', () => {
    const context = travelTo(home())

    expect(context.world.phase).toBe('AT_SPOT')
    expect(context.world.currentSpotId).toBe('test-spot')
    expect(spotKnowledgeScore(context.knowledge, 'test-spot')).toBe(
      DEFAULT_WORLD_TUNING.firstVisitKnowledge,
    )
    expect(regionKnowledgeScore(context.knowledge, 'test-region')).toBe(
      DEFAULT_WORLD_TUNING.firstVisitRegionKnowledge,
    )
    expect(context.world.discoveredSpotIds).toEqual(['test-spot'])
    expect(context.world.trip?.knowledgeGained).toBe(
      DEFAULT_WORLD_TUNING.firstVisitKnowledge + DEFAULT_WORLD_TUNING.firstVisitRegionKnowledge,
    )
  })

  it('does not add first visit knowledge on the second visit', () => {
    const first = travelTo(home())
    const back = leaveSpot({ context: first, spot: createTestSpot(), ...transportContext })

    if (!back.ok) {
      throw new Error(back.message)
    }

    const atHome = arriveHome({ context: back.context })

    if (!atHome.ok) {
      throw new Error(atHome.message)
    }

    const second = travelTo(atHome.context)

    expect(spotKnowledgeScore(second.knowledge, 'test-spot')).toBe(
      DEFAULT_WORLD_TUNING.firstVisitKnowledge,
    )
  })

  it('refuses to travel from somewhere other than home', () => {
    const context = travelTo(home())
    const result = leaveForSpot({ context, spot: createTestSpot(), ...transportContext })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('not_at_home')
    }
  })

  it('refuses to travel to an inaccessible spot', () => {
    const carOnly = createTestSpot({
      id: 'car-only-spot' as never,
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [
        {
          id: 'car-route',
          transportTypes: ['compact_car'],
          requiredCapabilities: ['road_access'],
          features: [],
          baseMinutes: 190,
          distanceKm: 75,
          baseOneWayCost: 900,
        },
      ],
    })

    const result = leaveForSpot({ context: home(), spot: carOnly, ...transportContext })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('inaccessible')
      // 車を持っていないことが理由であり、capability 不足ではない。
      expect(result.message).toContain('所有')
    }
  })

  it('refuses a permitted spot while the permit system is unimplemented', () => {
    const permitted = createTestSpot({
      access: [
        { kind: 'capability', capability: 'public_transport' },
        { kind: 'permit', permitId: asPermitId('fee-fishing-ticket') },
      ],
      travelOptions: [
        {
          id: 'bus-route',
          transportTypes: ['bus'],
          requiredCapabilities: ['public_transport'],
          features: [],
          baseMinutes: 70,
          distanceKm: 35,
          baseOneWayCost: 520,
        },
      ],
    })

    const result = leaveForSpot({ context: home(), spot: permitted, ...transportContext })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('inaccessible')
    }
  })

  it('consumes time on every fishing attempt, landed or not', () => {
    const atSpot = travelTo(home())
    const spot = createTestSpot()

    const caught = recordFishingAttempt({
      context: atSpot,
      spot,
      outcome: 'landed',
      xpGained: 120,
      caughtLengthCm: 28.5,
    })
    const missed = recordFishingAttempt({
      context: atSpot,
      spot,
      outcome: 'failed',
      xpGained: 0,
    })

    expect(caught.ok && missed.ok).toBe(true)

    if (!caught.ok || !missed.ok) {
      return
    }

    expect(caught.context.world.time.minute - atSpot.world.time.minute).toBe(
      DEFAULT_WORLD_TUNING.fishingAttemptMinutes,
    )
    expect(missed.context.world.time.minute - atSpot.world.time.minute).toBe(
      DEFAULT_WORLD_TUNING.fishingAttemptMinutes,
    )
  })

  it('gives knowledge even when nothing is caught', () => {
    const atSpot = travelTo(home())
    const before = spotKnowledgeScore(atSpot.knowledge, 'test-spot')

    const missed = recordFishingAttempt({
      context: atSpot,
      spot: createTestSpot(),
      outcome: 'failed',
      xpGained: 0,
    })

    if (!missed.ok) {
      throw new Error(missed.message)
    }

    expect(spotKnowledgeScore(missed.context.knowledge, 'test-spot')).toBe(
      before + DEFAULT_WORLD_TUNING.fishingAttemptKnowledge,
    )
  })

  it('gives extra knowledge when a fish is caught', () => {
    const atSpot = travelTo(home())
    const before = spotKnowledgeScore(atSpot.knowledge, 'test-spot')

    const caught = recordFishingAttempt({
      context: atSpot,
      spot: createTestSpot(),
      outcome: 'landed',
      xpGained: 100,
      caughtLengthCm: 30,
    })

    if (!caught.ok) {
      throw new Error(caught.message)
    }

    expect(spotKnowledgeScore(caught.context.knowledge, 'test-spot')).toBe(
      before + DEFAULT_WORLD_TUNING.fishingAttemptKnowledge + DEFAULT_WORLD_TUNING.catchKnowledge,
    )
    expect(caught.context.world.trip?.catches).toBe(1)
    expect(caught.context.world.trip?.largestLengthCm).toBe(30)
  })

  it('allows several fishing attempts without forcing a return', () => {
    let context = travelTo(home())
    const spot = createTestSpot()

    for (let index = 0; index < 4; index += 1) {
      const result = recordFishingAttempt({
        context,
        spot,
        outcome: 'landed',
        xpGained: 50,
        caughtLengthCm: 20 + index,
      })

      if (!result.ok) {
        throw new Error(result.message)
      }

      context = result.context
      expect(context.world.phase).toBe('AT_SPOT')
    }

    expect(context.world.trip?.attempts).toBe(4)
    expect(context.world.trip?.catches).toBe(4)
    expect(context.world.trip?.xpGained).toBe(200)
    expect(context.world.trip?.largestLengthCm).toBe(23)
  })

  it('consumes time when returning home', () => {
    const atSpot = travelTo(home())
    const left = leaveSpot({ context: atSpot, spot: createTestSpot(), ...transportContext })

    expect(left.ok).toBe(true)

    if (!left.ok) {
      return
    }

    expect(left.context.world.phase).toBe('RETURNING_HOME')
    expect(left.context.world.time.minute).toBe(atSpot.world.time.minute + 20)

    const homeAgain = arriveHome({ context: left.context })

    if (!homeAgain.ok) {
      throw new Error(homeAgain.message)
    }

    expect(homeAgain.context.world.phase).toBe('HOME')
    expect(homeAgain.context.world.currentSpotId).toBeNull()
    // 釣行の記録は結果表示のために残す。
    expect(homeAgain.context.world.trip?.spotName).toBe('テスト釣り場')
  })

  it('refuses to return from somewhere other than a spot', () => {
    const result = leaveSpot({ context: home(), spot: createTestSpot(), ...transportContext })

    expect(result.ok).toBe(false)
  })

  it('only returns from the spot the player is actually at', () => {
    const atSpot = travelTo(home())
    const other = createTestSpot({ id: 'other-spot' as never, name: '別の釣り場' })

    expect(leaveSpot({ context: atSpot, spot: other, ...transportContext }).ok).toBe(false)
  })

  it('crosses into the next day when fishing late', () => {
    const late = createInitialWorld({
      ...DEFAULT_WORLD_TUNING,
      startTime: { year: 2026, month: 5, day: 2, hour: 23, minute: 40 },
    })
    const context: WorldContext = { world: late, knowledge: emptyKnowledgeState() }
    const spot = createTestSpot({
      travelOptions: [
        {
          id: 'long-walk',
          transportTypes: ['walk'],
          requiredCapabilities: ['reachable_on_foot'],
          features: [],
          baseMinutes: 30,
          distanceKm: 2,
          baseOneWayCost: 0,
        },
      ],
    })
    const atSpot = travelTo(context, spot)
    const afterAttempt = recordFishingAttempt({
      context: atSpot,
      spot,
      outcome: 'failed',
      xpGained: 0,
    })

    if (!afterAttempt.ok) {
      throw new Error(afterAttempt.message)
    }

    expect(formatWorldTime(afterAttempt.context.world.time)).toBe('2026-05-03 (日) 00:30')
    expect(isSameDay(afterAttempt.context.world.time, late.time)).toBe(false)
  })
})
