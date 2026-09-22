import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { simulateWorldExpansion } from '../../scripts/simulate-world-expansion'
import { DEFAULT_WORLD_TUNING } from '../../src/domain/world/WorldTuning'

/**
 * Phase 16 — World Expansion I の content 契約。
 *
 * 「データを増やす」だけでなく、Region → Spot → Species → Expedition →
 * Buyer / Contact → Hidden Spot が連動していることを検査する。
 * バランスの細かい数値は simulate:world-expansion の警告として扱う（Hard にしない）。
 */

const content = loadContentFromDirectory()

const PHASE_16_REGIONS = [
  'izu-peninsula',
  'tohoku-pacific',
  'hokuriku-japan-sea',
  'okinawa',
  'norway-fjords',
  'new-zealand',
  'baja-california',
  'thailand',
  'amazon-basin',
] as const

describe('world expansion scale', () => {
  it('reaches the Phase 16 world shape', () => {
    const playable = content.regions.filter((region) => region.stage === 'playable')

    expect(playable).toHaveLength(14)

    for (const regionId of PHASE_16_REGIONS) {
      expect(
        playable.some((region) => String(region.id) === regionId),
        regionId,
      ).toBe(true)
    }

    expect(content.species.length).toBeGreaterThanOrEqual(140)
    expect(content.spots.length).toBeGreaterThanOrEqual(95)
  })

  it('gives every Phase 16 region spots, an expedition and a buyer', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const spots = content.spots.filter((spot) => String(spot.regionId) === regionId)
      const expeditions = content.expeditions.filter((entry) => String(entry.regionId) === regionId)
      const buyers = content.buyers.filter((entry) => String(entry.regionId) === regionId)

      expect(spots.length, `${regionId} spots`).toBeGreaterThanOrEqual(4)
      expect(expeditions.length, `${regionId} expeditions`).toBe(1)
      expect(buyers.length, `${regionId} buyers`).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps the home region out of the expedition list', () => {
    const home = DEFAULT_WORLD_TUNING.homeRegionId
    const homeExpeditions = content.expeditions.filter((entry) => String(entry.regionId) === home)

    expect(homeExpeditions).toEqual([])
  })
})

describe('spot diversity and bycatch', () => {
  it('mixes target fish with bycatch on wild spots', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const wildSpots = content.spots.filter(
        (spot) =>
          String(spot.regionId) === regionId &&
          spot.visibility !== 'hidden' &&
          spot.environment !== 'managed_pond',
      )

      for (const spot of wildSpots) {
        const presences = spot.fishTable.map((occurrence) => occurrence.basePresence)
        const total = presences.reduce((sum, value) => sum + value, 0)

        expect(spot.fishTable.length, String(spot.id)).toBeGreaterThanOrEqual(4)
        expect(total, String(spot.id)).toBeGreaterThan(0)
        // 1 種が全 weight を占めない（外道が普通に混ざる）。
        expect(Math.max(...presences) / total, String(spot.id)).toBeLessThan(0.75)
      }
    }
  })

  it('uses at least three environments per Phase 16 region', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const environments = new Set(
        content.spots
          .filter((spot) => String(spot.regionId) === regionId)
          .map((spot) => spot.environment),
      )

      expect(environments.size, regionId).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('hidden spots and trust chains', () => {
  it('gives every Phase 16 region at least one hidden spot with a discovery path', () => {
    const discoverTargets = new Set(
      content.contactRewards
        .filter((reward) => reward.kind === 'discover_spot')
        .map((reward) => String(reward.targetId)),
    )

    for (const regionId of PHASE_16_REGIONS) {
      const hidden = content.spots.filter(
        (spot) => String(spot.regionId) === regionId && spot.visibility === 'hidden',
      )

      expect(hidden.length, `${regionId} hidden`).toBeGreaterThanOrEqual(1)

      for (const spot of hidden) {
        expect(discoverTargets.has(String(spot.id)), String(spot.id)).toBe(true)
        expect(spot.fishingZones?.length ?? 0, String(spot.id)).toBeGreaterThan(0)
      }
    }
  })

  it('keeps rumors free of exact spot names before discovery', () => {
    const hiddenNames = new Set(
      content.spots.filter((spot) => spot.visibility === 'hidden').map((spot) => spot.name),
    )

    for (const reward of content.contactRewards) {
      if (reward.kind !== 'intel') {
        continue
      }

      for (const name of hiddenNames) {
        // 噂は「場所そのもの」を明かさない（exact discovery は discover_spot 側）。
        expect(reward.message.includes(name), String(reward.id)).toBe(false)
      }
    }
  })
})

describe('species identity', () => {
  it('keeps canonical global species ids (no regional prefixes)', () => {
    for (const species of content.species) {
      for (const prefix of PHASE_16_REGIONS) {
        expect(String(species.id).startsWith(`${prefix}-`), String(species.id)).toBe(false)
      }
    }
  })

  it('reuses one definition per species across regions', () => {
    const ids = content.species.map((species) => String(species.id))

    expect(new Set(ids).size).toBe(ids.length)

    const multiRegion = content.species.filter((species) => species.distribution.length > 1)
    expect(multiRegion.length).toBeGreaterThan(10)
  })

  it('passes the world expansion simulation', () => {
    const result = simulateWorldExpansion()
    const failed = result.checks.filter((check) => !check.ok)

    expect(failed.map((check) => check.label)).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('reports (but does not fail on) legacy scientificName duplicates', () => {
    const result = simulateWorldExpansion()
    const scientificWarnings = result.warnings.filter((warning) =>
      warning.startsWith('scientificName duplicate'),
    )

    // 既知の 1 組（giant-queenfish / queenfish）は Phase 17 で統合する。
    expect(scientificWarnings.length).toBeLessThanOrEqual(1)
  })
})
