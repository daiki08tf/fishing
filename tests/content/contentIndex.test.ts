import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateContentScale } from '../../src/content/catalog/scaleCheck'
import {
  SPECIES_SUMMARY_KEYS,
  FORBIDDEN_SPECIES_PREFIXES,
} from '../../src/content/catalog/scaleCheck'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { ContentIndex } from '../../src/content/catalog/summary'
import {
  browserContentIndex,
  buildContentIndex,
  serializeContentIndex,
} from '../../scripts/build-content-index'
import { knownPackModuleKeys } from '../../src/content/runtime/packModules'
import { CURRENT_SAVE_SCHEMA_VERSION } from '../../src/domain/save/SaveGame'
import { projectRoot } from '../architecture/testProjectFiles'

/**
 * Phase 15 — 軽量カタログ / Content Pack manifest の整合。
 *
 * 「Content を増やしても壊れない」ための構造検査。
 */

const root = projectRoot()
const content = loadContentFromDirectory()
const index = JSON.parse(
  readFileSync(resolve(root, 'src/content/generated/content-index.json'), 'utf8'),
) as ContentIndex
const ownership = JSON.parse(
  readFileSync(resolve(root, 'src/content/generated/content-ownership.json'), 'utf8'),
) as Record<string, string>

describe('lightweight catalog', () => {
  it('covers every runtime species and playable region', () => {
    const summaryIds = new Set(index.species.map((summary) => String(summary.id)))

    for (const species of content.species) {
      expect(summaryIds.has(String(species.id)), String(species.id)).toBe(true)
    }

    for (const region of content.regions.filter((entry) => entry.stage === 'playable')) {
      const summary = index.regions.find((entry) => String(entry.id) === String(region.id))

      expect(summary?.packKey, String(region.id)).not.toBeNull()
    }
  })

  it('stays lightweight (no biology / trade detail in the index)', () => {
    const forbiddenKeys = [
      'lengthModel',
      'weightModel',
      'fightProfile',
      'environmentAffinity',
      'seasonality',
      'baseYenPerKg',
      'tradeTags',
      'fishTable',
      'access',
      'travelOptions',
    ]

    for (const summary of index.species) {
      for (const key of Object.keys(summary)) {
        expect(SPECIES_SUMMARY_KEYS, `unexpected key ${key}`).toContain(key)
        expect(forbiddenKeys).not.toContain(key)
      }
    }
  })

  it('keeps species ids global (no regional prefixes)', () => {
    for (const species of content.species) {
      for (const prefix of FORBIDDEN_SPECIES_PREFIXES) {
        expect(String(species.id).startsWith(prefix), `${String(species.id)} has ${prefix}`).toBe(
          false,
        )
      }
    }
  })

  it('is fresh (regenerating produces the same file)', () => {
    const regenerated = serializeContentIndex(
      browserContentIndex(buildContentIndex('src/content/data', { cwd: root })),
    )

    expect(regenerated).toBe(
      readFileSync(resolve(root, 'src/content/generated/content-index.json'), 'utf8'),
    )
  })
})

describe('content packs', () => {
  it('has a generated pack module for every manifest entry', () => {
    const manifestKeys = index.packs.map((pack) => pack.key).sort()

    expect(manifestKeys).toEqual([...knownPackModuleKeys()].sort())
  })

  it('owns every content file exactly once (no orphan content)', () => {
    const kinds = [
      'fish-species',
      'fishing-spots',
      'buyers',
      'contact-rewards',
      'expeditions',
      'species-trade-profiles',
      'gear',
      'gear-series',
      'brands',
      'methods',
      'shop-items',
      'regions',
      'countries',
      'transports',
    ]
    const onDisk: string[] = []

    for (const kind of kinds) {
      const directory = resolve(root, 'src/content/data', kind)

      for (const file of readdirSync(directory)) {
        if (file.endsWith('.json')) {
          onDisk.push(`${kind}/${file}`)
        }
      }
    }

    // orphan なし: ディスク上の全ファイルがちょうど 1 つの pack に属する。
    expect(Object.keys(ownership).sort()).toEqual([...onDisk].sort())

    for (const kind of kinds) {
      const owners = new Set(
        onDisk.filter((key) => key.startsWith(`${kind}/`)).map((key) => ownership[key]),
      )

      expect(owners.size, `${kind} should be owned`).toBeGreaterThan(0)
    }
  })

  it('assigns regional content to the pack of its own region', () => {
    for (const spot of content.spots) {
      const file = `${String(spot.id)}.json`
      const owner = ownership[`fishing-spots/${file}`]

      expect(owner, String(spot.id)).toBe(`region:${String(spot.regionId)}`)
    }

    for (const buyer of content.buyers) {
      const file = `${String(buyer.id)}.json`

      expect(ownership[`buyers/${file}`]).toBe(`region:${String(buyer.regionId)}`)
    }

    for (const reward of content.contactRewards) {
      const buyer = content.buyers.find((entry) => String(entry.id) === String(reward.contactId))
      const file = `${String(reward.id)}.json`

      expect(ownership[`contact-rewards/${file}`]).toBe(`region:${String(buyer?.regionId)}`)
    }
  })

  it('passes the content scale validation for runtime content', () => {
    const issues = validateContentScale({
      species: content.species,
      spots: content.spots,
      regions: content.regions,
      buyers: content.buyers,
      contactRewards: content.contactRewards,
      expeditions: content.expeditions,
      speciesTradeProfiles: content.speciesTradeProfiles,
      index,
      ownership,
      filesByKind: {},
      packModuleKeys: knownPackModuleKeys(),
    })

    expect(issues).toEqual([])
  })
})

describe('save compatibility', () => {
  it('keeps Save v9 and stores no architecture details', () => {
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(9)

    const saveSource = readFileSync(resolve(root, 'src/domain/save/SaveGame.ts'), 'utf8')

    for (const forbidden of ['packKey', 'chunkName', 'modulePath', 'packPath']) {
      expect(saveSource).not.toContain(forbidden)
    }
  })
})

describe('ownership file', () => {
  it('is generated next to the index and covers every kind directory', () => {
    const kinds = new Set(Object.keys(ownership).map((key) => key.split('/')[0]))

    expect(kinds.has('fish-species')).toBe(true)
    expect(kinds.has('fishing-spots')).toBe(true)
    expect(kinds.has('gear')).toBe(true)
    expect(relative(root, resolve(root, 'src/content/generated/content-ownership.json'))).toBe(
      'src/content/generated/content-ownership.json',
    )
  })
})
