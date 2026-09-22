import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import { createInitialTransportState } from '../../src/domain/access/Transport'
import { asTransportId } from '../../src/domain/ids'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
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
} from '../../src/domain/world/worldSession'

/**
 * Phase 17 Final Fix — the Captain Loop proven from a REAL player Save shape.
 *
 * The previous `simulate:offshore` script proved the mechanics existed, but used
 * `fullTransportState(content.transports)`, which grants every Transport up front —
 * including the 5 new charter-boat Transports. That masked a real bug: a normal
 * Save (`createInitialTransportState`) never grants any Transport with an
 * `operatorContactId`, so a Captain could become "known" via `introduce_contact`
 * while the matching Charter stayed permanently unusable.
 *
 * This test starts from the actual initial transport state and never widens it,
 * proving the fix (`AccessEvaluationInput.knownContactIds` deriving Charter
 * availability from `knownContactIdsOf`) end to end.
 */

const content = loadContentFromDirectory()

const spotById = (id: string) => {
  const spot = content.spots.find((entry) => String(entry.id) === id)
  if (spot === undefined) {
    throw new Error(`missing spot content: ${id}`)
  }
  return spot
}

const transportById = (id: string) => {
  const transport = content.transports.find((entry) => String(entry.id) === id)
  if (transport === undefined) {
    throw new Error(`missing transport content: ${id}`)
  }
  return transport
}

describe('Charter progression loop (real Save shape, no fullTransportState)', () => {
  const buyer = content.buyers.find((entry) => String(entry.id) === 'fish-wholesaler')
  const captain = content.contacts.find((entry) => String(entry.id) === 'captain-taro')
  const offshoreSpot = spotById('sagami-bay-offshore')
  const hiddenSpot = spotById('sagami-hidden-current-edge')
  const charterBoat = transportById('charter-boat')

  if (buyer === undefined || captain === undefined) {
    throw new Error('fixture content missing (fish-wholesaler / captain-taro)')
  }

  it('never grants charter-boat by default (a fresh Save cannot use it)', () => {
    const playerTransports = createInitialTransportState(asTransportId)

    expect(playerTransports.availableTransportIds).not.toContain(charterBoat.id)

    const access = evaluateAccess({
      spot: offshoreSpot,
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      // knownContactIds omitted entirely — nothing is known yet.
    })

    expect(
      access.travelOptions.some((option) => String(option.transportId) === 'charter-boat'),
    ).toBe(false)
  })

  it('keeps charter-boat unusable even once the region is otherwise accessible, until the Captain is known', () => {
    const playerTransports = createInitialTransportState(asTransportId)
    // Still-empty knownContactIds, explicitly passed (not omitted) this time.
    const access = evaluateAccess({
      spot: offshoreSpot,
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds: [],
    })

    // rental-boat has no operatorContactId, so it must remain unaffected by this change.
    expect(
      access.travelOptions.some((option) => String(option.transportId) === 'rental-boat'),
    ).toBe(true)
    expect(
      access.travelOptions.some((option) => String(option.transportId) === 'charter-boat'),
    ).toBe(false)
  })

  it('drives the full loop: introduce -> charter becomes usable -> trip -> return -> Trust -> discover -> access split', () => {
    const playerTransports = createInitialTransportState(asTransportId)

    // 1. Captain is not known yet.
    expect(isContactKnown(captain, content.contactRewards, [])).toBe(false)

    // 2. Buyer Trust reaches the introduce_contact threshold and it is claimed.
    let trade = createInitialTradeState()
    trade = addContactTrust(trade, buyer.id, 30)
    const introClaim = claimEligibleRewards(trade, buyer.id, content.contactRewards)
    trade = introClaim.trade
    expect(introClaim.newlyClaimed.some((reward) => reward.kind === 'introduce_contact')).toBe(true)
    expect(isContactKnown(captain, content.contactRewards, trade.claimedRewardIds)).toBe(true)

    // 3. Charter becomes selectable now that the Captain is known — derived, no new Save field.
    const knownContactIds = knownContactIdsOf(
      content.buyers,
      content.contacts,
      content.contactRewards,
      trade.claimedRewardIds,
    )
    expect(knownContactIds.has(String(captain.id))).toBe(true)

    let world = createInitialWorld()
    const knowledge = emptyKnowledgeState()

    const left = leaveForSpot({
      context: { world, knowledge },
      spot: offshoreSpot,
      transports: content.transports,
      playerTransports,
      transportId: charterBoat.id,
      knownContactIds,
    })

    expect(left.ok).toBe(true)
    if (!left.ok) return
    expect(left.context.world.trip?.transportId).toBe(charterBoat.id)
    world = left.context.world

    // 4. Arrive, complete the trip (a couple of trips, mixing a skunk and a catch).
    const arrived = arriveAtSpot({
      context: { world, knowledge: left.context.knowledge },
      spot: offshoreSpot,
    })
    expect(arrived.ok).toBe(true)
    if (!arrived.ok) return
    world = arrived.context.world

    // 5. Return home using the SAME charter (outbound transport carries over).
    const returned = leaveSpot({
      context: { world, knowledge: arrived.context.knowledge },
      spot: offshoreSpot,
      transports: content.transports,
      playerTransports,
      knownContactIds,
    })
    expect(returned.ok).toBe(true)
    if (!returned.ok) return

    const home = arriveHome({ context: returned.context })
    expect(home.ok).toBe(true)
    if (!home.ok) return
    world = home.context.world

    // 6. Captain Trust accrues on trip completion, even on a skunk trip.
    let outcome = applyCharterTripOutcome(trade, charterBoat, 0)
    trade = outcome.trade
    expect(outcome.trustGain).toBeGreaterThan(0)
    expect(trustOf(trade, captain.id)).toBeGreaterThan(0)

    // 7. Repeat enough trips (mixing skunk and catches) to cross the discover_spot threshold.
    let discovered = false
    for (let trip = 0; trip < 12 && !discovered; trip += 1) {
      outcome = applyCharterTripOutcome(trade, charterBoat, trip % 2 === 0 ? 0 : 2)
      trade = outcome.trade

      const claim = claimEligibleRewards(trade, captain.id, content.contactRewards)
      trade = claim.trade

      for (const reward of claim.newlyClaimed) {
        if (reward.kind === 'discover_spot' && String(reward.targetId) === String(hiddenSpot.id)) {
          world = discoverSpotFromContact(world, hiddenSpot.id)
          discovered = true
        }
      }
    }

    expect(discovered).toBe(true)
    expect(isSpotKnown(world, hiddenSpot)).toBe(true)

    // 8. Discovery != Access: knowing the spot is not enough without the relationship Trust.
    const lowTrustKnownContactIds = knownContactIdsOf(
      content.buyers,
      content.contacts,
      content.contactRewards,
      trade.claimedRewardIds,
    )
    const accessAtDiscoverTrust = evaluateAccess({
      spot: hiddenSpot,
      transports: content.transports,
      playerTransports,
      knowledge,
      permitsEnabled: true,
      knownContactIds: lowTrustKnownContactIds,
      contactTrust: { [String(captain.id)]: trustOf(trade, captain.id) },
    })

    // 9. Push Trust further until the relationship access requirement is met.
    let accessible = accessAtDiscoverTrust.accessible
    for (let trip = 0; trip < 10 && !accessible; trip += 1) {
      outcome = applyCharterTripOutcome(trade, charterBoat, 1)
      trade = outcome.trade

      const check = evaluateAccess({
        spot: hiddenSpot,
        transports: content.transports,
        playerTransports,
        knowledge,
        permitsEnabled: true,
        knownContactIds: lowTrustKnownContactIds,
        contactTrust: { [String(captain.id)]: trustOf(trade, captain.id) },
      })
      accessible = check.accessible
    }

    expect(accessible).toBe(true)

    // 10. Once accessible, the same charter can be used outbound and back for the hidden Spot.
    const outboundToHidden = leaveForSpot({
      context: { world, knowledge },
      spot: hiddenSpot,
      transports: content.transports,
      playerTransports,
      transportId: charterBoat.id,
      knownContactIds: lowTrustKnownContactIds,
      contactTrust: { [String(captain.id)]: trustOf(trade, captain.id) },
    })
    expect(outboundToHidden.ok).toBe(true)
    if (!outboundToHidden.ok) return
    expect(outboundToHidden.context.world.trip?.transportId).toBe(charterBoat.id)

    const arrivedHidden = arriveAtSpot({
      context: outboundToHidden.context,
      spot: hiddenSpot,
    })
    expect(arrivedHidden.ok).toBe(true)
    if (!arrivedHidden.ok) return

    const returnFromHidden = leaveSpot({
      context: arrivedHidden.context,
      spot: hiddenSpot,
      transports: content.transports,
      playerTransports,
      knownContactIds: lowTrustKnownContactIds,
    })
    expect(returnFromHidden.ok).toBe(true)
  })
})

/**
 * Phase 17 Final Fix — a Charter is a local service, not a nationwide one.
 *
 * Every charter shares `transportType: "charter_boat"`, so knowing one Captain
 * used to satisfy every charter route in the game. Availability is now scoped by
 * the Transport's declared `serviceRegionIds` (data, not Domain branches), so a
 * Captain only carries the player inside the regions their service actually covers.
 */
describe('Charter service regions (cross-region leakage)', () => {
  const tokyoOffshore = spotById('sagami-bay-offshore')
  const izuOffshore = spotById('izu-offshore-grounds')

  const optionIds = (spot: ReturnType<typeof spotById>, knownContactIds: readonly string[]) =>
    evaluateAccess({
      spot,
      transports: content.transports,
      playerTransports: createInitialTransportState(asTransportId),
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds,
    }).travelOptions.map((option) => String(option.transportId))

  it('keeps a known Tokyo Captain out of every other region', () => {
    const tokyo = optionIds(tokyoOffshore, ['captain-taro'])
    const izu = optionIds(izuOffshore, ['captain-taro'])

    expect(tokyo).toContain('charter-boat')
    expect(izu).not.toContain('charter-boat')
    expect(izu).not.toContain('charter-boat-izu')
  })

  it('exposes the Izu charter only to the Izu Captain, in Izu', () => {
    const izu = optionIds(izuOffshore, ['captain-ryo'])
    const tokyo = optionIds(tokyoOffshore, ['captain-ryo'])

    expect(izu).toContain('charter-boat-izu')
    expect(izu).not.toContain('charter-boat')
    expect(tokyo).not.toContain('charter-boat-izu')
    expect(tokyo).not.toContain('charter-boat')
  })

  it('leaves unoperated transports (rental / owned) region-agnostic', () => {
    expect(optionIds(izuOffshore, [])).toContain('rental-boat')
    expect(optionIds(tokyoOffshore, [])).toContain('rental-boat')
  })

  it('declares a service region for every operated Transport', () => {
    for (const transport of content.transports) {
      if (transport.operatorContactId !== undefined) {
        expect(transport.serviceRegionIds?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})

describe('initiallyKnown Captain (no Buyer to introduce through)', () => {
  const captain = content.contacts.find((entry) => String(entry.id) === 'captain-daisuke')
  const charterBoat = transportById('charter-boat-hokkaido')
  const offshoreSpot = spotById('hokkaido-offshore')

  if (captain === undefined) {
    throw new Error('fixture content missing (captain-daisuke)')
  }

  it('makes its charter usable immediately, with an empty claimedRewardIds and a fresh Save transport state', () => {
    expect(captain.initiallyKnown).toBe(true)

    const playerTransports = createInitialTransportState(asTransportId)
    const knownContactIds = knownContactIdsOf(
      content.buyers,
      content.contacts,
      content.contactRewards,
      [],
    )

    expect(knownContactIds.has(String(captain.id))).toBe(true)

    const access = evaluateAccess({
      spot: offshoreSpot,
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
      permitsEnabled: true,
      knownContactIds,
    })

    expect(
      access.travelOptions.some((option) => String(option.transportId) === String(charterBoat.id)),
    ).toBe(true)
  })
})
