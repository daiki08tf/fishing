import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { ContentIndex } from '../../src/content/catalog/summary'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import { createInitialTransportState } from '../../src/domain/access/Transport'
import { asRegionId, asTransportId } from '../../src/domain/ids'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import { resolveEnvironment } from '../../src/domain/environment/environmentResolver'
import { speciesEnvironmentMultiplier } from '../../src/domain/environment/fishingConditions'
import {
  addContactTrust,
  applyCharterTripOutcome,
  claimEligibleRewards,
  createInitialTradeState,
  isContactKnown,
  knownContactIdsOf,
  trustOf,
} from '../../src/domain/trade'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  discoverSpotFromContact,
  isSpotKnown,
  leaveForSpot,
  leaveSpot,
  moveToRegion,
} from '../../src/domain/world/worldSession'

/**
 * Phase 19B — Setouchi Vertical Slice の契約テスト。
 *
 * 「潮を読むFishing」の一本道を、実 content と実 authority で固定する:
 *   本土港 → ferry → 島 → Buyer売却 → Trust → intel → channel-edge発見
 *   → Captain紹介 → Charter → 沖の瀬
 *
 * 新 Species 0・新 system 0・Save v9 不変が前提。
 */

const content = loadContentFromDirectory()

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const index = JSON.parse(
  readFileSync(`${repositoryRoot}src/content/generated/content-index.json`, 'utf8'),
) as ContentIndex

const SETOUCHI_SPOT_IDS = [
  'setouchi-harbor-front',
  'setouchi-tetrapod-bank',
  'setouchi-island-shore',
  'setouchi-hidden-channel-edge',
  'setouchi-hidden-se-offshore',
] as const

const spotById = (id: string) => {
  const spot = content.spots.find((entry) => String(entry.id) === id)
  if (spot === undefined) {
    throw new Error(`missing spot content: ${id}`)
  }
  return spot
}

const speciesById = (id: string) => {
  const species = content.species.find((entry) => String(entry.id) === id)
  if (species === undefined) {
    throw new Error(`missing species content: ${id}`)
  }
  return species
}

const buyerById = (id: string) => {
  const buyer = content.buyers.find((entry) => String(entry.id) === id)
  if (buyer === undefined) {
    throw new Error(`missing buyer content: ${id}`)
  }
  return buyer
}

const contactById = (id: string) => {
  const contact = content.contacts.find((entry) => String(entry.id) === id)
  if (contact === undefined) {
    throw new Error(`missing contact content: ${id}`)
  }
  return contact
}

const setouchi = content.regions.find((region) => String(region.id) === 'setouchi')
if (setouchi === undefined) {
  throw new Error('missing region content: setouchi')
}

describe('Setouchi activation', () => {
  it('promotes setouchi to stage: playable', () => {
    expect(setouchi.stage).toBe('playable')
  })

  it('keeps the other 12 Japan regions definition-only (stage: planned)', () => {
    const planned = content.regions
      .filter((region) => region.stage === 'planned')
      .map((region) => String(region.id))

    expect(planned).not.toContain('setouchi')
    expect(planned).toHaveLength(12)
  })

  it('gives setouchi a region pack in the content index', () => {
    const summary = index.regions.find((entry) => String(entry.id) === 'setouchi')

    expect(summary).toBeDefined()
    expect(summary?.stage).toBe('playable')
    expect(summary?.packKey).not.toBeNull()
  })

  it('registers the rail expedition (journey.kind: rail)', () => {
    const expedition = content.expeditions.find((entry) => String(entry.regionId) === 'setouchi')

    expect(expedition).toBeDefined()
    expect(expedition?.journey.kind).toBe('rail')
    expect(expedition?.journey.oneWayCostYen).toBeGreaterThan(0)
    expect(expedition?.journey.oneWayMinutes).toBeGreaterThan(0)
  })
})

describe('Setouchi spot slice', () => {
  it('defines exactly the 5 approved spots', () => {
    const setouchiSpots = content.spots.filter((spot) => String(spot.regionId) === 'setouchi')

    expect(setouchiSpots.map((spot) => String(spot.id)).sort()).toEqual(
      [...SETOUCHI_SPOT_IDS].sort(),
    )
  })

  it('marks the two progression spots hidden and the three entry spots public', () => {
    expect(spotById('setouchi-harbor-front').visibility ?? 'public').toBe('public')
    expect(spotById('setouchi-tetrapod-bank').visibility ?? 'public').toBe('public')
    expect(spotById('setouchi-island-shore').visibility ?? 'public').toBe('public')
    expect(spotById('setouchi-hidden-channel-edge').visibility).toBe('hidden')
    expect(spotById('setouchi-hidden-se-offshore').visibility).toBe('hidden')
  })

  it('never uses the dead FishOccurrence tide/season/time fields', () => {
    for (const spot of content.spots.filter((entry) => String(entry.regionId) === 'setouchi')) {
      for (const occurrence of spot.fishTable) {
        const raw = occurrence as Record<string, unknown>
        expect(raw['tide'], `${String(spot.id)} tide`).toBeUndefined()
        expect(raw['season'], `${String(spot.id)} season`).toBeUndefined()
        expect(raw['time'], `${String(spot.id)} time`).toBeUndefined()
      }
    }
  })

  it('references only existing species and keeps the runtime species count at 229', () => {
    expect(content.species).toHaveLength(229)

    for (const spotId of SETOUCHI_SPOT_IDS) {
      for (const occurrence of spotById(spotId).fishTable) {
        expect(() => speciesById(String(occurrence.speciesId))).not.toThrow()
        expect(speciesById(String(occurrence.speciesId)).distribution).toContain('setouchi')
      }
    }
  })
})

describe('ferry access (Phase 19A handoff)', () => {
  const playerTransports = createInitialTransportState(asTransportId)

  it('makes island-ferry usable on a fresh Save without list membership', () => {
    expect(playerTransports.availableTransportIds).not.toContain('island-ferry')

    const evaluation = evaluateAccess({
      spot: spotById('setouchi-island-shore'),
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
    })

    expect(evaluation.accessible).toBe(true)
    expect(
      evaluation.travelOptions.some((option) => String(option.transportId) === 'island-ferry'),
    ).toBe(true)
  })

  it('reaches mainland public spots without ferry (public_transport only)', () => {
    for (const spotId of ['setouchi-harbor-front', 'setouchi-tetrapod-bank'] as const) {
      const evaluation = evaluateAccess({
        spot: spotById(spotId),
        transports: content.transports,
        playerTransports,
        knowledge: emptyKnowledgeState(),
        permitsEnabled: true,
      })

      expect(evaluation.accessible, spotId).toBe(true)
      expect(
        evaluation.travelOptions.every((option) => option.transportType !== 'ferry'),
        spotId,
      ).toBe(true)
    }
  })

  it('requires island_access for the island spot (ferry satisfies it)', () => {
    const islandShore = spotById('setouchi-island-shore')
    const islandAccess = islandShore.access.find(
      (requirement) =>
        requirement.kind === 'capability' && requirement.capability === 'island_access',
    )
    expect(islandAccess).toBeDefined()

    const evaluation = evaluateAccess({
      spot: islandShore,
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
    })
    expect(
      evaluation.travelOptions.some(
        (option) =>
          option.transportType === 'ferry' && String(option.transportId) === 'island-ferry',
      ),
    ).toBe(true)
  })

  it('never reaches the offshore spot by ferry alone (no offshore/boat_required capability)', () => {
    const ferry = content.transports.find((entry) => String(entry.id) === 'island-ferry')
    expect(ferry?.capabilities).toContain('island_access')
    expect(ferry?.capabilities).toContain('public_transport')
    expect(ferry?.capabilities).not.toContain('boat_required')
    expect(ferry?.capabilities).not.toContain('offshore')

    const offshore = spotById('setouchi-hidden-se-offshore')
    expect(offshore.travelOptions.every((option) => !option.transportTypes.includes('ferry'))).toBe(
      true,
    )

    const evaluation = evaluateAccess({
      spot: offshore,
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds: ['captain-setouchi'],
      contactTrust: { 'captain-setouchi': 100 },
    })
    // 人脈が揃っていても ferry は offshore option として出てこない。
    expect(evaluation.travelOptions.every((option) => option.transportType !== 'ferry')).toBe(true)
  })
})

describe('hidden spot visibility', () => {
  it('keeps hidden spots unknown on a fresh world', () => {
    const world = createInitialWorld()

    expect(isSpotKnown(world, spotById('setouchi-hidden-channel-edge'))).toBe(false)
    expect(isSpotKnown(world, spotById('setouchi-hidden-se-offshore'))).toBe(false)
    expect(isSpotKnown(world, spotById('setouchi-harbor-front'))).toBe(true)
  })

  it('refuses travel to an undiscovered hidden spot even when access would pass', () => {
    let world = createInitialWorld()
    const moved = moveToRegion({
      context: { world, knowledge: emptyKnowledgeState() },
      regionId: asRegionId('setouchi'),
      minutes: 200,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    world = moved.context.world

    const denied = leaveForSpot({
      context: { world, knowledge: moved.context.knowledge },
      spot: spotById('setouchi-hidden-channel-edge'),
      transports: content.transports,
      playerTransports: createInitialTransportState(asTransportId),
    })

    expect(denied.ok).toBe(false)
    if (denied.ok) return
    expect(denied.reason).toBe('undiscovered')
  })
})

describe('tide / flow gameplay (existing systems only)', () => {
  const region = setouchi
  const day = (hour: number, minute: number) => ({
    year: 2026,
    month: 4,
    day: 10,
    hour,
    minute,
  })

  it('resolves a deterministic tide cycle for setouchi (saltwater, no Math.random)', () => {
    const envA = resolveEnvironment({
      time: day(6, 0),
      climate: region.climate,
      regionId: 'setouchi',
      environment: 'nearshore',
    })
    const envB = resolveEnvironment({
      time: day(6, 0),
      climate: region.climate,
      regionId: 'setouchi',
      environment: 'nearshore',
    })
    const envLater = resolveEnvironment({
      time: day(12, 0),
      climate: region.climate,
      regionId: 'setouchi',
      environment: 'nearshore',
    })

    expect(envA.tide).not.toBeNull()
    expect(envA).toEqual(envB)
    expect(envLater.tide).not.toBeNull()
  })

  it('changes encounter weight with tide for a tide-affine Setouchi species (sawara)', () => {
    const sawara = speciesById('sawara')
    const baseEnv = resolveEnvironment({
      time: day(6, 0),
      climate: region.climate,
      regionId: 'setouchi',
      environment: 'nearshore',
    })

    const rising = speciesEnvironmentMultiplier(sawara, { ...baseEnv, tide: 'rising' })
    const low = speciesEnvironmentMultiplier(sawara, { ...baseEnv, tide: 'low' })

    expect(rising).toBeGreaterThan(low)
  })

  it('changes encounter weight with flow for a flow-affine species (kijihata)', () => {
    const kijihata = speciesById('kijihata')
    const baseEnv = resolveEnvironment({
      time: day(6, 0),
      climate: region.climate,
      regionId: 'setouchi',
      environment: 'nearshore',
    })

    const moderate = speciesEnvironmentMultiplier(kijihata, {
      ...baseEnv,
      water: { ...baseEnv.water, flow: 'moderate' },
    })
    const none = speciesEnvironmentMultiplier(kijihata, {
      ...baseEnv,
      water: { ...baseEnv.water, flow: 'none' },
    })

    expect(moderate).toBeGreaterThan(none)
  })

  it('exposes current on the tide-reading spots (drives Drift)', () => {
    expect(spotById('setouchi-hidden-channel-edge').current?.preference).toBe('strong')
    expect(spotById('setouchi-hidden-se-offshore').current?.preference).toBe('strong')
  })
})

describe('Setouchi progression loop (Trust -> intel -> Discovery -> Captain -> Charter -> offshore)', () => {
  const islandMarket = buyerById('setouchi-island-market')
  const harborCoop = buyerById('setouchi-harbor-coop')
  const captain = contactById('captain-setouchi')
  const channelEdge = spotById('setouchi-hidden-channel-edge')
  const offshore = spotById('setouchi-hidden-se-offshore')
  const charter = content.transports.find((entry) => String(entry.id) === 'charter-boat-setouchi')
  if (charter === undefined) {
    throw new Error('missing transport content: charter-boat-setouchi')
  }

  it('scopes the charter to setouchi via the captain', () => {
    expect(charter.operatorContactId).toBe('captain-setouchi')
    expect(charter.serviceRegionIds?.map(String)).toContain('setouchi')
    expect(charter.transportType).toBe('charter_boat')
    expect(charter.capabilities).toEqual(
      expect.arrayContaining(['boat_required', 'offshore', 'island_access']),
    )
    expect(captain.initiallyKnown).toBe(false)
  })

  it('drives the full loop on a real initial Save shape', () => {
    const playerTransports = createInitialTransportState(asTransportId)
    const knowledge = emptyKnowledgeState()
    let trade = createInitialTradeState()
    let world = createInitialWorld()

    // 0. Setouchi へ遠征（rail）。
    const moved = moveToRegion({
      context: { world, knowledge },
      regionId: asRegionId('setouchi'),
      minutes: 200,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    world = moved.context.world

    // 1. 本土 public Spot は ferry なしで行ける。
    const toHarbor = leaveForSpot({
      context: { world, knowledge },
      spot: spotById('setouchi-harbor-front'),
      transports: content.transports,
      playerTransports,
    })
    expect(toHarbor.ok).toBe(true)
    if (!toHarbor.ok) return

    const arrivedHarbor = arriveAtSpot({
      context: toHarbor.context,
      spot: spotById('setouchi-harbor-front'),
    })
    expect(arrivedHarbor.ok).toBe(true)
    if (!arrivedHarbor.ok) return

    const home = arriveHome({
      context: (() => {
        const leaving = leaveSpot({
          context: arrivedHarbor.context,
          spot: spotById('setouchi-harbor-front'),
          transports: content.transports,
          playerTransports,
        })
        expect(leaving.ok).toBe(true)
        if (!leaving.ok) throw new Error('leaveSpot failed')
        return leaving.context
      })(),
    })
    expect(home.ok).toBe(true)
    if (!home.ok) return
    world = home.context.world

    // 2. ferry で島の public Spot へ（island-ferry は list 未登録でも使える）。
    const toIsland = leaveForSpot({
      context: { world, knowledge },
      spot: spotById('setouchi-island-shore'),
      transports: content.transports,
      playerTransports,
      transportId: asTransportId('island-ferry'),
    })
    expect(toIsland.ok).toBe(true)
    if (!toIsland.ok) return
    expect(toIsland.context.world.trip?.transportId).toBe('island-ferry')
    const arrivedIsland = arriveAtSpot({
      context: toIsland.context,
      spot: spotById('setouchi-island-shore'),
    })
    expect(arrivedIsland.ok).toBe(true)
    if (!arrivedIsland.ok) return
    world = arrivedIsland.context.world

    const back = leaveSpot({
      context: { world, knowledge: arrivedIsland.context.knowledge },
      spot: spotById('setouchi-island-shore'),
      transports: content.transports,
      playerTransports,
    })
    expect(back.ok).toBe(true)
    if (!back.ok) return
    const backHome = arriveHome({ context: back.context })
    expect(backHome.ok).toBe(true)
    if (!backHome.ok) return
    world = backHome.context.world

    // 3. 島の Buyer へ売却 → Trust。channel-edge はまだ知らない。
    expect(isContactKnown(captain, content.contactRewards, trade.claimedRewardIds)).toBe(false)
    expect(isSpotKnown(world, channelEdge)).toBe(false)

    let claimed: string[] = []
    for (let sale = 0; sale < 20 && claimed.length === 0; sale += 1) {
      trade = addContactTrust(trade, islandMarket.id, 5)
      const claim = claimEligibleRewards(trade, islandMarket.id, content.contactRewards)
      trade = claim.trade
      claimed = claim.newlyClaimed.map((reward) => String(reward.id))
    }
    expect(claimed).toContain('setouchi-island-market-intel-tide')

    // 4. Trust 15 で channel-edge を発見。
    while (trustOf(trade, islandMarket.id) < 15) {
      trade = addContactTrust(trade, islandMarket.id, 5)
    }
    const discoverClaim = claimEligibleRewards(trade, islandMarket.id, content.contactRewards)
    trade = discoverClaim.trade
    const spotReward = discoverClaim.newlyClaimed.find((reward) => reward.kind === 'discover_spot')
    expect(spotReward).toBeDefined()
    expect(String(spotReward?.targetId)).toBe(String(channelEdge.id))
    world = discoverSpotFromContact(world, channelEdge.id)
    expect(isSpotKnown(world, channelEdge)).toBe(true)

    // 5. 発見した channel-edge へ ferry で行ける（島側 Spot）。
    const toChannel = leaveForSpot({
      context: { world, knowledge },
      spot: channelEdge,
      transports: content.transports,
      playerTransports,
      transportId: asTransportId('island-ferry'),
    })
    expect(toChannel.ok).toBe(true)
    if (!toChannel.ok) return
    const arrivedChannel = arriveAtSpot({ context: toChannel.context, spot: channelEdge })
    expect(arrivedChannel.ok).toBe(true)
    if (!arrivedChannel.ok) return
    world = arrivedChannel.context.world
    const channelBack = leaveSpot({
      context: { world, knowledge: arrivedChannel.context.knowledge },
      spot: channelEdge,
      transports: content.transports,
      playerTransports,
    })
    expect(channelBack.ok).toBe(true)
    if (!channelBack.ok) return
    const channelHome = arriveHome({ context: channelBack.context })
    expect(channelHome.ok).toBe(true)
    if (!channelHome.ok) return
    world = channelHome.context.world

    // 6. Trust 30 で Captain を紹介される → Charter が使えるようになる。
    while (trustOf(trade, islandMarket.id) < 30) {
      trade = addContactTrust(trade, islandMarket.id, 5)
    }
    const introClaim = claimEligibleRewards(trade, islandMarket.id, content.contactRewards)
    trade = introClaim.trade
    expect(
      introClaim.newlyClaimed.some(
        (reward) => reward.kind === 'introduce_contact' && reward.targetId === 'captain-setouchi',
      ),
    ).toBe(true)
    expect(isContactKnown(captain, content.contactRewards, trade.claimedRewardIds)).toBe(true)

    const knownContactIds = knownContactIdsOf(
      content.buyers,
      content.contacts,
      content.contactRewards,
      trade.claimedRewardIds,
    )
    expect(knownContactIds.has('captain-setouchi')).toBe(true)

    /*
     * 7. Captain Trust は「実釣行」でのみ上がる（playerStore.returnHome と同じ経路）:
     *    leaveForSpot(charter) → arriveAtSpot → leaveSpot → arriveHome →
     *    実際に使った trip transport の operatorContactId へ Trust 加算。
     *    釣行先は、発見済みの channel-edge（船長が水道へ船を出す）。
     */
    const captainTrustMap = () => ({
      'captain-setouchi': trustOf(trade, captain.id),
    })
    const runCharterTrip = (spot: typeof channelEdge) => {
      const left = leaveForSpot({
        context: { world, knowledge },
        spot,
        transports: content.transports,
        playerTransports,
        transportId: charter.id,
        knownContactIds,
        contactTrust: captainTrustMap(),
      })
      expect(left.ok, `charter to ${String(spot.id)}`).toBe(true)
      if (!left.ok) throw new Error('charter leaveForSpot failed')
      expect(left.context.world.trip?.transportId).toBe(charter.id)

      const arrived = arriveAtSpot({ context: left.context, spot })
      expect(arrived.ok).toBe(true)
      if (!arrived.ok) throw new Error('charter arriveAtSpot failed')

      // playerStore.returnHome と同じ: 帰宅時に trip の transport から Trust を確定する。
      const tripTransport =
        content.transports.find((entry) => entry.id === arrived.context.world.trip?.transportId) ??
        null
      const catches = arrived.context.world.trip?.catches ?? 0

      const leaving = leaveSpot({
        context: arrived.context,
        spot,
        transports: content.transports,
        playerTransports,
        knownContactIds,
      })
      expect(leaving.ok).toBe(true)
      if (!leaving.ok) throw new Error('charter leaveSpot failed')

      const home = arriveHome({ context: leaving.context })
      expect(home.ok).toBe(true)
      if (!home.ok) throw new Error('arriveHome failed')
      world = home.context.world

      const outcome = applyCharterTripOutcome(trade, tripTransport, catches)
      expect(outcome.contactId).toBe(captain.id)
      expect(outcome.trustGain).toBeGreaterThan(0)
      trade = outcome.trade

      const claim = claimEligibleRewards(trade, captain.id, content.contactRewards)
      trade = claim.trade
      for (const reward of claim.newlyClaimed) {
        if (reward.kind === 'discover_spot' && String(reward.targetId) === String(offshore.id)) {
          world = discoverSpotFromContact(world, offshore.id)
        }
      }
    }

    // Captain Trust 0 → 15 まで channel-edge への Charter 釣行を繰り返す（ボウズでも Base は入る）。
    for (let trip = 0; trip < 10 && trustOf(trade, captain.id) < 15; trip += 1) {
      runCharterTrip(channelEdge)
    }
    expect(trustOf(trade, captain.id)).toBeGreaterThanOrEqual(15)

    // Trust 15 で沖の瀬を発見（「場所を知る」）。
    expect(isSpotKnown(world, offshore)).toBe(true)

    // 知っていても Trust 20 未満では連れて行ってもらえない（「行ける」の分離）。
    const knownButLowTrust = evaluateAccess({
      spot: offshore,
      transports: content.transports,
      playerTransports,
      knowledge,
      permitsEnabled: true,
      knownContactIds,
      contactTrust: captainTrustMap(),
    })
    if (trustOf(trade, captain.id) < 20) {
      expect(knownButLowTrust.accessible).toBe(false)
      expect(knownButLowTrust.blockedReasons.some((reason) => reason.kind === 'relationship')).toBe(
        true,
      )
    }

    // 8. Trust 20 まで釣行を続け、沖の瀬へ実際に Charter で出る。
    for (let trip = 0; trip < 10 && trustOf(trade, captain.id) < 20; trip += 1) {
      runCharterTrip(channelEdge)
    }
    expect(trustOf(trade, captain.id)).toBeGreaterThanOrEqual(20)

    const toOffshore = leaveForSpot({
      context: { world, knowledge },
      spot: offshore,
      transports: content.transports,
      playerTransports,
      transportId: charter.id,
      knownContactIds,
      contactTrust: captainTrustMap(),
    })
    expect(toOffshore.ok).toBe(true)
    if (!toOffshore.ok) return
    expect(toOffshore.context.world.trip?.transportId).toBe(charter.id)

    const arrivedOffshore = arriveAtSpot({ context: toOffshore.context, spot: offshore })
    expect(arrivedOffshore.ok).toBe(true)
    if (!arrivedOffshore.ok) return

    const offshoreBack = leaveSpot({
      context: arrivedOffshore.context,
      spot: offshore,
      transports: content.transports,
      playerTransports,
      knownContactIds,
    })
    expect(offshoreBack.ok).toBe(true)
  })

  it('gates the channel-edge charter route behind the Captain introduction', () => {
    const playerTransports = createInitialTransportState(asTransportId)
    const channelEdge = spotById('setouchi-hidden-channel-edge')

    const optionTypes = (knownContactIds: string[]) =>
      evaluateAccess({
        spot: channelEdge,
        transports: content.transports,
        playerTransports,
        knowledge: emptyKnowledgeState(),
        permitsEnabled: true,
        knownContactIds,
      }).travelOptions.map((option) => option.transportType)

    // 紹介前: ferry のみ。
    expect(optionTypes([])).toEqual(['ferry'])

    // 紹介後: ferry + charter_boat の複数 route。
    expect(optionTypes(['captain-setouchi'])).toEqual(
      expect.arrayContaining(['ferry', 'charter_boat']),
    )
  })

  it('keeps the offshore spot unreachable before the Captain is known', () => {
    const access = evaluateAccess({
      spot: offshore,
      transports: content.transports,
      playerTransports: createInitialTransportState(asTransportId),
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds: [],
      contactTrust: { 'captain-setouchi': 100 },
    })

    expect(
      access.travelOptions.some((option) => String(option.transportId) === 'charter-boat-setouchi'),
    ).toBe(false)
  })

  it('blocks the offshore spot below the relationship Trust even once known', () => {
    const access = evaluateAccess({
      spot: offshore,
      transports: content.transports,
      playerTransports: createInitialTransportState(asTransportId),
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds: ['captain-setouchi'],
      contactTrust: { 'captain-setouchi': 5 },
    })

    expect(access.accessible).toBe(false)
    expect(access.blockedReasons.some((reason) => reason.kind === 'relationship')).toBe(true)
  })

  it('never grants trust shortcuts: harbor coop rewards stop at intel', () => {
    const coopRewards = content.contactRewards.filter(
      (reward) => String(reward.contactId) === String(harborCoop.id),
    )
    expect(coopRewards.every((reward) => reward.kind === 'intel')).toBe(true)
  })
})
