import { describe, expect, it } from 'vitest'
import { resolveCatch } from '../../src/domain/catch'
import { emptyCodexState } from '../../src/domain/codex'
import { FishingEngine, isTerminalPhase } from '../../src/domain/fishing'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import { spotKnowledgeScore } from '../../src/domain/knowledge/spotKnowledge'
import { createInitialProgression } from '../../src/domain/progression'
import type { FishingSpot } from '../../src/domain/world/FishingSpot'
import {
  createInitialWorld,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
  arriveAtSpot,
  arriveHome,
} from '../../src/domain/world/worldSession'
import { asFishSpeciesId, asFishingSpotId, asRegionId } from '../../src/domain/ids'
import { createTestSpot } from '../fixtures/spots'
import { createTestSpecies } from '../fixtures/species'
import { runFightToTerminal } from '../fixtures/fishingPolicies'
import { createTestTransportState, TEST_TRANSPORTS } from '../fixtures/transports'

/**
 * Spot を選ぶ → 釣る → 帰る までを 1 本通す。
 *
 * ここで確かめたいのは「Spot の fishTable が Encounter に渡り、
 * その結果が Codex / Progression / World へ流れる」こと。
 * FishingEngine は Spot を知らない。
 */

const species = createTestSpecies()
const transportContext = {
  transports: TEST_TRANSPORTS,
  playerTransports: createTestTransportState(),
}

const spotWithSpecies = (overrides: Partial<FishingSpot> = {}): FishingSpot =>
  createTestSpot({
    fishTable: [{ speciesId: species.id, basePresence: 1 }],
    ...overrides,
  })

describe('world loop', () => {
  it('feeds the selected spot fish table into the encounter', () => {
    const spot = spotWithSpecies()
    const engine = new FishingEngine({
      encounters: [{ species, presence: spot.fishTable[0]?.basePresence ?? 1 }],
      seed: 'spot-encounter',
      spotId: spot.id,
    })

    const outcome = runFightToTerminal(engine)
    const individual = engine.snapshot().fish?.individual

    expect(outcome.phase).toBe('LANDED')
    expect(individual?.speciesId).toBe(species.id)
    expect(individual?.spotId).toBe(spot.id)
  })

  it('runs home → spot → fishing → home with time, xp, knowledge and records', () => {
    const spot = spotWithSpecies()
    let world = createInitialWorld()
    let knowledge = emptyKnowledgeState()
    let codex = emptyCodexState()
    let progression = createInitialProgression()

    const startedAt = world.time
    const left = leaveForSpot({ context: { world, knowledge }, spot, ...transportContext })

    expect(left.ok).toBe(true)
    if (!left.ok) {
      return
    }

    const arrived = arriveAtSpot({ context: left.context, spot })
    expect(arrived.ok).toBe(true)
    if (!arrived.ok) {
      return
    }

    world = arrived.context.world
    knowledge = arrived.context.knowledge
    expect(spotKnowledgeScore(knowledge, String(spot.id))).toBeGreaterThan(0)

    // 釣りを 2 回行う。
    for (let index = 0; index < 2; index += 1) {
      const engine = new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: `loop-${String(index)}`,
        spotId: spot.id,
      })
      const outcome = runFightToTerminal(engine)
      const individual = engine.snapshot().fish?.individual

      expect(outcome.phase).toBe('LANDED')

      if (individual === null || individual === undefined) {
        throw new Error('no individual was generated')
      }

      const resolution = resolveCatch({
        individual,
        species,
        codex,
        progression,
        spotId: String(spot.id),
      })
      codex = resolution.codex
      progression = resolution.progression

      const recorded = recordFishingAttempt({
        context: { world, knowledge },
        spot,
        outcome: 'landed',
        xpGained: resolution.xp.total,
        caughtLengthCm: individual.lengthCm,
      })

      if (!recorded.ok) {
        throw new Error(recorded.message)
      }

      world = recorded.context.world
      knowledge = recorded.context.knowledge
    }

    const leftSpot = leaveSpot({ context: { world, knowledge }, spot, ...transportContext })
    expect(leftSpot.ok).toBe(true)
    if (!leftSpot.ok) {
      return
    }

    const home = arriveHome({ context: leftSpot.context })
    expect(home.ok).toBe(true)
    if (!home.ok) {
      return
    }

    world = home.context.world

    // 世界: 帰宅していて、時間が進み、釣行の記録が残っている。
    expect(world.phase).toBe('HOME')
    expect(world.currentSpotId).toBeNull()
    expect(world.time.hour * 60 + world.time.minute).toBeGreaterThan(
      startedAt.hour * 60 + startedAt.minute,
    )
    expect(world.trip?.attempts).toBe(2)
    expect(world.trip?.catches).toBe(2)

    // 成長と記録: XP が入り、Codex に 2 匹記録されている。
    expect(progression.totalXp).toBeGreaterThan(0)
    expect(codex.species[String(species.id)]?.catchCount).toBe(2)
    expect(knowledge.spots[String(spot.id)]).toBeGreaterThan(0)
  })

  it('handles a spot added at runtime without touching the engine', () => {
    // content に存在しない魚種・釣り場をその場で作っても、同じループが回る。
    const inventedSpecies = createTestSpecies({
      id: asFishSpeciesId('invented-species'),
      japaneseName: 'その場で作った魚',
    })
    const inventedSpot = createTestSpot({
      id: asFishingSpotId('invented-spot'),
      name: 'その場で作った釣り場',
      regionId: asRegionId('invented-region'),
      access: [{ kind: 'capability', capability: 'public_transport' }],
      travelOptions: [
        {
          id: 'invented-train-route',
          transportTypes: ['train'],
          requiredCapabilities: ['public_transport'],
          features: [],
          baseMinutes: 12,
          distanceKm: 8,
          baseOneWayCost: 420,
        },
      ],
      fishTable: [{ speciesId: inventedSpecies.id, basePresence: 1 }],
    })

    const left = leaveForSpot({
      // Phase 8: 今いる地域と一致していれば、Content に無い Spot にも行ける。
      context: {
        world: { ...createInitialWorld(), currentRegionId: asRegionId('invented-region') },
        knowledge: emptyKnowledgeState(),
      },
      spot: inventedSpot,
      ...transportContext,
    })

    expect(left.ok).toBe(true)
    if (!left.ok) {
      return
    }

    const arrived = arriveAtSpot({ context: left.context, spot: inventedSpot })
    expect(arrived.ok).toBe(true)
    if (!arrived.ok) {
      return
    }

    expect(arrived.context.world.time.minute).toBe(12)

    const engine = new FishingEngine({
      encounters: [{ species: inventedSpecies, presence: 1 }],
      seed: 'invented-spot',
      spotId: inventedSpot.id,
    })
    const outcome = runFightToTerminal(engine)

    expect(outcome.phase).toBe('LANDED')
    expect(engine.snapshot().fish?.individual.speciesId).toBe(inventedSpecies.id)
    expect(isTerminalPhase(engine.snapshot().phase)).toBe(true)
  })
})
