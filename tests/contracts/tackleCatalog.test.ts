import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { validateContentReferences } from '../../src/content/catalog/references'
import { gearItemSchema, gearSeriesSchema } from '../../src/content/schema'
import { asBrandId, asGearId } from '../../src/domain/ids'
import {
  ROD_SERIES_CATEGORIES,
  REEL_SIZE_CLASSES,
  REEL_VARIANTS,
  formatHookSize,
  hookSizeRank,
} from '../../src/domain/gear/Gear'
import { resolveTackle, STARTER_GEAR_IDS } from '../../src/domain/tackle'
import { buildPlans, resolveBuild, simulateCatalog } from '../../scripts/simulate-catalog'

/**
 * Phase 6.5 — Tackle Catalog Expansion。
 *
 * 「数が増えた」ことより「同じ番手・同じ価格帯でも中身が違う」ことを検証する。
 * 差がブランド ID の分岐ではなく、**個別 Gear の spec の結果**として出ていることを見る。
 */

const content = loadContentFromDirectory()

const references = () =>
  validateContentReferences({
    species: content.species,
    spots: content.spots,
    shopItems: content.shopItems,
    gear: content.gear,
    methods: content.methods,
    brands: content.brands,
    gearSeries: content.gearSeries,
    transports: content.transports,
  })

const ofCategory = (category: string) => content.gear.filter((item) => item.category === category)
const reels = ofCategory('reel')
const rods = ofCategory('rod')
const lures = ofCategory('lure')

describe('catalog volume', () => {
  const counts = {
    reel: reels.length,
    rod: rods.length,
    line: ofCategory('line').length,
    leader: ofCategory('leader').length,
    hook: ofCategory('hook').length,
    lure: lures.length,
    bait: ofCategory('bait').length,
  }

  it('ships a catalog, not a sample', () => {
    expect(content.brands.length).toBeGreaterThanOrEqual(8)
    expect(content.brands.length).toBeLessThanOrEqual(12)
    expect(counts.reel).toBeGreaterThanOrEqual(80)
    expect(counts.rod).toBeGreaterThanOrEqual(80)
    expect(counts.line).toBeGreaterThanOrEqual(25)
    expect(counts.leader).toBeGreaterThanOrEqual(20)
    expect(counts.hook).toBeGreaterThanOrEqual(30)
    expect(counts.lure).toBeGreaterThanOrEqual(100)
    expect(counts.bait).toBeGreaterThanOrEqual(10)
  })

  it('keeps every category inside the intended range', () => {
    expect(counts.reel).toBeLessThanOrEqual(150)
    expect(counts.rod).toBeLessThanOrEqual(150)
    expect(counts.line).toBeLessThanOrEqual(50)
    expect(counts.leader).toBeLessThanOrEqual(40)
    expect(counts.hook).toBeLessThanOrEqual(60)
    expect(counts.lure).toBeLessThanOrEqual(200)
    expect(counts.bait).toBeLessThanOrEqual(20)
  })

  it('has no broken references and no duplicate ids', () => {
    expect(references()).toEqual([])
  })
})

describe('coverage', () => {
  it('covers every reel size class', () => {
    const covered = new Set(reels.map((item) => (item.category === 'reel' ? item.sizeClass : null)))

    for (const size of REEL_SIZE_CLASSES) {
      expect(covered.has(size), `sizeClass ${String(size)}`).toBe(true)
    }
  })

  it('uses every reel variant', () => {
    const used = new Set(reels.map((item) => (item.category === 'reel' ? item.variant : null)))

    for (const variant of REEL_VARIANTS) {
      expect(used.has(variant), `variant ${variant}`).toBe(true)
    }
  })

  it('covers every rod use class', () => {
    const covered = new Set<string>(
      rods.map((item) => String(item.category === 'rod' ? item.seriesCategory : '')),
    )

    for (const use of ROD_SERIES_CATEGORIES) {
      expect(covered.has(use), `useClass ${use}`).toBe(true)
    }
  })

  it('covers every lure type the design asks for', () => {
    const types = new Set<string>(
      lures.map((item) => String(item.category === 'lure' ? item.lureType : '')),
    )

    for (const type of [
      'minnow',
      'vibration',
      'topwater',
      'shad',
      'crankbait',
      'jerkbait',
      'soft_plastic',
      'spinner',
      'spoon',
      'jig',
      'metal_vibration',
      'egi',
      'popper',
      'stickbait',
    ]) {
      expect(types.has(type), `lureType ${type}`).toBe(true)
    }
  })

  it('covers every hook shape', () => {
    const types = new Set<string>(
      ofCategory('hook').map((item) => String(item.category === 'hook' ? item.hookType : '')),
    )

    for (const type of ['single', 'treble', 'offset', 'circle', 'assist', 'jighead']) {
      expect(types.has(type), `hookType ${type}`).toBe(true)
    }
  })
})

describe('brand differentiation (spec, not brand multipliers)', () => {
  const class3000 = reels.filter((item) => item.category === 'reel' && item.sizeClass === 3000)

  const bestBrands = (
    key: 'smoothness' | 'response' | 'rigidity' | 'windingTorque' | 'dragStartup',
  ) => {
    const values = class3000.map((item) =>
      item.category === 'reel' ? (key === 'smoothness' ? item.smoothness : (item[key] ?? 0)) : 0,
    )
    const best = Math.max(...values)

    return [
      ...new Set(
        class3000
          .filter((item) => {
            const value =
              item.category === 'reel'
                ? key === 'smoothness'
                  ? item.smoothness
                  : (item[key] ?? 0)
                : 0
            return Math.abs(value - best) < 1e-9
          })
          .map((item) => String(item.brandId)),
      ),
    ]
  }

  it('has several brands competing in the 3000 class', () => {
    expect(class3000.length).toBeGreaterThanOrEqual(6)
    expect(new Set(class3000.map((item) => String(item.brandId))).size).toBeGreaterThanOrEqual(4)
  })

  it('splits the "best" spec across brands', () => {
    const smooth = bestBrands('smoothness')
    const response = bestBrands('response')
    const rigidity = bestBrands('rigidity')

    // 同じブランドが全部を持っていない（＝ブランドごとに性格が違う）。
    expect(new Set([...smooth, ...response, ...rigidity]).size).toBeGreaterThanOrEqual(3)
    expect(smooth).not.toEqual(response)
  })

  it('gives the 3000 class different resolved modifiers, not one winner', () => {
    const base = content.gear.find((item) => String(item.id) === STARTER_GEAR_IDS.rodId)

    expect(base).toBeDefined()

    const signatures = new Set(
      class3000.map((item) => {
        const setup = resolveTackle({
          loadout: {
            rodId: content.gear.find((entry) => String(entry.id) === STARTER_GEAR_IDS.rodId)?.id,
            reelId: item.id,
            lineId: content.gear.find((entry) => String(entry.id) === STARTER_GEAR_IDS.lineId)?.id,
            leaderId: null,
            hookId: content.gear.find((entry) => String(entry.id) === STARTER_GEAR_IDS.hookId)?.id,
            offeringId: content.gear.find((entry) => String(entry.id) === STARTER_GEAR_IDS.lureId)
              ?.id,
            methodId: 'lure',
          } as never,
          gear: content.gear,
          methods: content.methods,
        })

        return JSON.stringify(setup?.playerModifiers ?? null)
      }),
    )

    // 番手が同じでも、modifier が全員一致しない。
    expect(signatures.size).toBeGreaterThan(1)
  })

  it('keeps brands free of performance multipliers', () => {
    for (const brand of content.brands) {
      for (const value of Object.values(brand)) {
        expect(typeof value).not.toBe('number')
      }
    }
  })
})

describe('series catalog', () => {
  it('resolves every referenced series to the same brand and category', () => {
    const seriesById = new Map(content.gearSeries.map((entry) => [entry.id, entry]))
    const withSeries = content.gear.filter((item) => item.seriesId !== undefined)

    expect(withSeries.length).toBeGreaterThan(300)

    for (const item of withSeries) {
      const series = seriesById.get(item.seriesId ?? '')

      expect(series, `series ${String(item.seriesId)}`).toBeDefined()
      expect(series?.brandId).toBe(item.brandId)
      expect(series?.category).toBe(item.category)
    }
  })

  it('gives every brand at least one series', () => {
    for (const brand of content.brands) {
      const owned = content.gearSeries.filter((entry) => entry.brandId === brand.id)
      expect(owned.length, `brand ${String(brand.id)}`).toBeGreaterThan(0)
    }
  })

  it('detects an unknown series and a mismatched one', () => {
    const rod = rods.find((item) => item.category === 'rod')

    if (rod === undefined) {
      throw new Error('no rod')
    }

    const unknown = validateContentReferences({
      species: content.species,
      spots: content.spots,
      shopItems: content.shopItems,
      gear: [{ ...rod, seriesId: 'no-such-series' }],
      methods: content.methods,
      brands: content.brands,
      gearSeries: content.gearSeries,
    })

    expect(unknown.some((issue) => issue.message.includes('unknown seriesId'))).toBe(true)

    const reelSeries = content.gearSeries.find((entry) => entry.category === 'reel')

    if (reelSeries === undefined) {
      throw new Error('no reel series')
    }

    const mismatch = validateContentReferences({
      species: content.species,
      spots: content.spots,
      shopItems: content.shopItems,
      gear: [{ ...rod, seriesId: reelSeries.id }],
      methods: content.methods,
      brands: content.brands,
      gearSeries: content.gearSeries,
    })

    expect(mismatch.some((issue) => issue.message.includes('is for reel'))).toBe(true)
  })
})

describe('geometry and schema guards', () => {
  it('rejects an unknown reel sizeClass', () => {
    const reel = reels.find((item) => item.category === 'reel')

    if (reel === undefined) {
      throw new Error('no reel')
    }

    expect(gearItemSchema.safeParse({ ...reel, sizeClass: 12345 }).success).toBe(false)
  })

  it('rejects an unknown reel variant', () => {
    const reel = reels.find((item) => item.category === 'reel')

    if (reel === undefined) {
      throw new Error('no reel')
    }

    expect(gearItemSchema.safeParse({ ...reel, variant: 'XXL' }).success).toBe(false)
  })

  it('rejects a rod whose lure range is inverted', () => {
    const rod = rods.find((item) => item.category === 'rod')

    if (rod === undefined) {
      throw new Error('no rod')
    }

    expect(
      gearItemSchema.safeParse({ ...rod, minLureWeightG: 30, maxLureWeightG: 5 }).success,
    ).toBe(false)
  })

  it('rejects a negative spec value', () => {
    const lure = lures.find((item) => item.category === 'lure')

    if (lure === undefined) {
      throw new Error('no lure')
    }

    expect(gearItemSchema.safeParse({ ...lure, weightG: -1 }).success).toBe(false)
  })

  it('rejects a series with an unknown tier', () => {
    const series = content.gearSeries[0]

    if (series === undefined) {
      throw new Error('no series')
    }

    expect(gearSeriesSchema.safeParse({ ...series, tier: 'legendary' }).success).toBe(false)
  })

  it('detects duplicate ids', () => {
    const rod = rods[0]
    const reel = reels[0]

    if (rod === undefined || reel === undefined) {
      throw new Error('no gear')
    }

    const issues = validateContentReferences({
      species: content.species,
      spots: content.spots,
      shopItems: content.shopItems,
      gear: [...content.gear, { ...reel, id: rod.id }],
      methods: content.methods,
      brands: content.brands,
      gearSeries: content.gearSeries,
    })

    expect(issues.some((issue) => issue.message.includes('duplicate id'))).toBe(true)
  })

  it('detects a duplicate brand id', () => {
    const brand = content.brands[0]

    if (brand === undefined) {
      throw new Error('no brand')
    }

    const issues = validateContentReferences({
      species: content.species,
      spots: content.spots,
      shopItems: content.shopItems,
      gear: content.gear,
      methods: content.methods,
      brands: [...content.brands, { ...brand }],
      gearSeries: content.gearSeries,
    })

    expect(issues.some((issue) => issue.message.includes('duplicate id'))).toBe(true)
  })
})

describe('hook size convention', () => {
  it('treats positive sizes as #N and negative sizes as N/0', () => {
    expect(formatHookSize(6)).toBe('6番')
    expect(formatHookSize(-2)).toBe('2/0号')
    expect(hookSizeRank({ size: 6 } as never)).toBe(-6)
    expect(hookSizeRank({ size: -2 } as never)).toBe(2)
  })

  it('ships both size systems', () => {
    const sizes = ofCategory('hook').map((item) => (item.category === 'hook' ? item.size : 0))

    expect(sizes.some((size) => size > 0)).toBe(true)
    expect(sizes.some((size) => size < 0)).toBe(true)
  })
})

describe('shop and loadout still work with the bigger catalog', () => {
  it('keeps the starter loadout valid', () => {
    const setup = resolveTackle({
      loadout: {
        rodId: asGearId(STARTER_GEAR_IDS.rodId),
        reelId: asGearId(STARTER_GEAR_IDS.reelId),
        lineId: asGearId(STARTER_GEAR_IDS.lineId),
        leaderId: asGearId(STARTER_GEAR_IDS.leaderId),
        hookId: asGearId(STARTER_GEAR_IDS.hookId),
        offeringId: asGearId(STARTER_GEAR_IDS.lureId),
        methodId: 'lure',
      },
      gear: content.gear,
      methods: content.methods,
    })

    expect(setup).not.toBeNull()
    expect(setup?.compatibility.fatal).toBe(false)
  })

  it('has gear for sale in every category', () => {
    for (const category of ['rod', 'reel', 'line', 'leader', 'hook', 'lure', 'bait']) {
      const forSale = content.gear.filter((item) => item.category === category && item.price > 0)
      expect(forSale.length, category).toBeGreaterThan(0)
    }
  })

  it('points every series at a real brand', () => {
    const brandIds = new Set(content.brands.map((brand) => String(brand.id)))

    for (const series of content.gearSeries) {
      expect(brandIds.has(String(series.brandId))).toBe(true)
    }
  })

  it('has no brand-less gear except the starter set', () => {
    const orphan = content.gear.filter(
      (item) => item.brandId === undefined && !String(item.id).startsWith('starter-'),
    )

    expect(orphan).toEqual([])
  })
})

describe('simulate:catalog', () => {
  const result = simulateCatalog()

  it('passes every check', () => {
    expect(result.checks.filter((check) => !check.ok).map((check) => check.label)).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('builds every representative build', () => {
    for (const plan of buildPlans) {
      expect(resolveBuild(content, plan), plan.id).not.toBeNull()
    }
  })

  it('is reproducible', () => {
    expect(simulateCatalog().lines).toEqual(result.lines)
  })
})

describe('brand ids used by gear exist', () => {
  it('never references an unknown brand', () => {
    const brandIds = new Set(content.brands.map((brand) => String(brand.id)))

    for (const item of content.gear) {
      if (item.brandId !== undefined) {
        expect(brandIds.has(String(item.brandId)), String(item.id)).toBe(true)
      }
    }

    expect(asBrandId('shimara')).toBe('shimara')
  })
})
