import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { ContentIndex } from '../../src/content/catalog/summary'

/**
 * Phase 19A — planned Region skeleton の契約テスト。
 *
 * Japan World Design Bible Rev.3 §15 Gate 1 の結論を機械的に固定する:
 * `stage:'planned'` の Region は definition-only であり、
 * Spot / Expedition / Contact / Buyer / Species distribution を持たない。
 * これにより UI の全 Surface（Map / Expedition / Spot / Codex）で非表示になる。
 */

const content = loadContentFromDirectory()

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const index = JSON.parse(
  readFileSync(`${repositoryRoot}src/content/generated/content-index.json`, 'utf8'),
) as ContentIndex

/** Phase 19B: setouchi は playable に昇格済み（残り 12 が definition-only）。 */
const JAPAN_PLANNED_REGIONS = [
  'sanin',
  'oki-islands',
  'kii-peninsula',
  'shikoku',
  'izu-islands',
  'kyushu-north',
  'kyushu-south',
  'goto-iki',
  'tsushima',
  'amami',
  'sakishima',
  'ogasawara',
] as const

const plannedIds = new Set(
  content.regions.filter((region) => region.stage === 'planned').map((region) => String(region.id)),
)

describe('planned Region skeleton', () => {
  it('registers the 12 remaining Japan regions as stage: planned', () => {
    for (const id of JAPAN_PLANNED_REGIONS) {
      expect(plannedIds.has(id), id).toBe(true)
    }
  })

  it('gives every planned region a base inside its own areas and a climate', () => {
    for (const region of content.regions.filter((entry) => entry.stage === 'planned')) {
      expect(region.areas.length, String(region.id)).toBeGreaterThanOrEqual(1)
      expect(
        region.areas.some((area) => String(area.id) === String(region.base.areaId)),
        String(region.id),
      ).toBe(true)
      expect(region.climate.annualMeanWaterC).toBeGreaterThan(0)
    }
  })

  it('keeps planned regions definition-only (no Spot / Expedition / Contact / Buyer)', () => {
    for (const spot of content.spots) {
      expect(plannedIds.has(String(spot.regionId)), `spot ${String(spot.id)}`).toBe(false)
    }
    for (const expedition of content.expeditions) {
      expect(
        plannedIds.has(String(expedition.regionId)),
        `expedition ${String(expedition.id)}`,
      ).toBe(false)
    }
    for (const contact of content.contacts) {
      expect(plannedIds.has(String(contact.regionId)), `contact ${String(contact.id)}`).toBe(false)
    }
    for (const buyer of content.buyers) {
      expect(plannedIds.has(String(buyer.regionId)), `buyer ${String(buyer.id)}`).toBe(false)
    }
  })

  it('does not reference planned regions in species.distribution', () => {
    for (const species of content.species) {
      for (const regionRef of species.distribution) {
        expect(
          plannedIds.has(String(regionRef)),
          `species ${String(species.id)} -> ${String(regionRef)}`,
        ).toBe(false)
      }
    }
  })

  it('gives planned regions no region pack in the content index (not loadable => not shown)', () => {
    for (const id of plannedIds) {
      const summary = index.regions.find((entry) => String(entry.id) === id)

      expect(summary, id).toBeDefined()
      expect(summary?.packKey, id).toBeNull()
      expect(summary?.stage, id).toBe('planned')
    }
  })
})
