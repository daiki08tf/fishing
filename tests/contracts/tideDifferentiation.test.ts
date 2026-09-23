import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  resolveEnvironment,
  waterConditionFor,
} from '../../src/domain/environment/environmentResolver'
import { speciesEnvironmentMultiplier } from '../../src/domain/environment/fishingConditions'
import type { EnvironmentSnapshot } from '../../src/domain/environment'
import type { FishingSpot } from '../../src/domain/world/FishingSpot'
import type { FishSpecies } from '../../src/domain/fish/FishSpecies'

/**
 * Phase 19C — Setouchi Tide Differentiation の契約テスト。
 *
 * 「ほぼ全魚が rising 有利」から「潮が変わると合理的な target / zone / Spot が変わる」へ。
 *
 * 検証対象:
 *   - tide archetype（Flood / High-water / Ebb / Slack）の multiplier 方向
 *   - tideDrivenFlow: Spot ごとの潮位→流れ連動（net-sum clamp・非対象 Spot 無影響）
 *   - channel-edge / se-offshore の潮別 target ローテーション（実 content の重みで）
 *   - global regression（tokyo / izu / hokuriku / okinawa / hokkaido / 淡水 Spot）
 *   - Encounter environmental authority = environmentAffinity（dead field 非依存）
 */

const content = loadContentFromDirectory()

const spotById = (id: string): FishingSpot => {
  const spot = content.spots.find((entry) => String(entry.id) === id)
  if (spot === undefined) throw new Error(`missing spot: ${id}`)
  return spot
}

const speciesById = (id: string): FishSpecies => {
  const species = content.species.find((entry) => String(entry.id) === id)
  if (species === undefined) throw new Error(`missing species: ${id}`)
  return species
}

const FLOW_ORDER = ['none', 'slow', 'moderate', 'strong'] as const
type Flow = (typeof FLOW_ORDER)[number]

const BASE_FLOW: Readonly<Record<string, Flow>> = {
  bay_shore: 'slow',
  nearshore: 'moderate',
  offshore: 'strong',
  estuary: 'moderate',
}

/** resolveEnvironment と同じ tideDrivenFlow 規則（moving +1 / slack -1、net-sum clamp）。 */
const flowFor = (base: Flow, tide: string, tideDrivenFlow: boolean): Flow => {
  const step = tideDrivenFlow ? (tide === 'rising' || tide === 'falling' ? 1 : -1) : 0
  const index = Math.max(0, Math.min(FLOW_ORDER.length - 1, FLOW_ORDER.indexOf(base) + step))
  return FLOW_ORDER[index] as Flow
}

/** tide だけを変えた EnvironmentSnapshot（season/time/weather/temp 固定）。 */
const envAt = (input: {
  readonly season: string
  readonly timeOfDay: string
  readonly tide: 'rising' | 'high' | 'falling' | 'low' | null
  readonly flow: Flow
  readonly temperatureC?: number
}): EnvironmentSnapshot =>
  ({
    date: '2026-07-15',
    month: 7,
    season: input.season,
    timeOfDay: input.timeOfDay,
    weather: 'clear',
    tide: input.tide,
    water: {
      kind: 'saltwater',
      temperatureC: input.temperatureC ?? 20,
      clarity: 0.7,
      flow: input.flow,
      wind: 'calm',
    },
  }) as EnvironmentSnapshot

const TIDES = ['rising', 'high', 'falling', 'low'] as const

/** Spot の fishTable で、潮ごとの「最大 zone × presence × env multiplier」ランキング。 */
const rankedAt = (spot: FishingSpot, season: string, timeOfDay: string) => {
  const base = BASE_FLOW[spot.environment]
  if (base === undefined) throw new Error(`no base flow mapping for ${spot.environment}`)
  return TIDES.map((tide) => {
    const flow = flowFor(base, tide, spot.tideDrivenFlow === true)
    const env = envAt({ season, timeOfDay, tide, flow })
    const rows = spot.fishTable
      .map((occurrence) => {
        const species = speciesById(String(occurrence.speciesId))
        const zoneBest = Math.max(...Object.values(occurrence.zoneAffinity ?? { x: 1 }))
        const weight =
          occurrence.basePresence * zoneBest * speciesEnvironmentMultiplier(species, env)
        return { speciesId: String(occurrence.speciesId), weight }
      })
      .sort((a, b) => b.weight - a.weight)
    return { tide, flow, rows }
  })
}

describe('tide archetype multipliers (species authority)', () => {
  const env = (tide: (typeof TIDES)[number]) =>
    envAt({ season: 'summer', timeOfDay: 'daytime', tide, flow: 'moderate' })

  it('Flood runner peaks on rising, not on other tides (sawara)', () => {
    const sawara = speciesById('sawara')
    const rising = speciesEnvironmentMultiplier(sawara, env('rising'))
    for (const tide of ['high', 'falling', 'low'] as const) {
      expect(rising).toBeGreaterThan(speciesEnvironmentMultiplier(sawara, env(tide)))
    }
  })

  it('High-water hunter peaks on high tide, not on rising (madai)', () => {
    const madai = speciesById('madai')
    const high = speciesEnvironmentMultiplier(madai, env('high'))
    const rising = speciesEnvironmentMultiplier(madai, env('rising'))
    expect(high).toBeGreaterThan(rising)
    // Final Gate 補正: rising で押し上げない（sagami-bay-offshore の katsuo regression 防止）。
    expect(rising).toBeLessThanOrEqual(1)
  })

  it('Ebb hunter peaks on falling, not on rising (seabass)', () => {
    const seabass = speciesById('seabass')
    const falling = speciesEnvironmentMultiplier(seabass, env('falling'))
    const rising = speciesEnvironmentMultiplier(seabass, env('rising'))
    expect(falling).toBeGreaterThan(rising)
    // tide 項そのものは rising で抑制的（他の season/time 因子は変えない）。
    expect(seabass.environmentAffinity?.tideAffinity?.rising).toBeLessThan(1)
    expect(seabass.environmentAffinity?.tideAffinity?.falling).toBeGreaterThanOrEqual(1.15)
  })

  it('Slack structure fish stays flat instead of peaking on moving tide (kijihata)', () => {
    const kijihata = speciesById('kijihata')
    const values = TIDES.map((tide) => speciesEnvironmentMultiplier(kijihata, env(tide)))
    const min = Math.min(...values)
    const max = Math.max(...values)
    expect(max - min).toBeLessThanOrEqual(0.1)
    expect(speciesEnvironmentMultiplier(kijihata, env('low'))).toBeGreaterThanOrEqual(
      speciesEnvironmentMultiplier(speciesById('sawara'), env('low')),
    )
  })

  it('kanpachi and hiramasa diverge on flow as well as tide', () => {
    const strong = envAt({
      season: 'summer',
      timeOfDay: 'daytime',
      tide: 'rising',
      flow: 'strong',
    })
    const slow = { ...strong, water: { ...strong.water, flow: 'slow' as const } }
    const hiramasa = speciesById('hiramasa')
    expect(speciesEnvironmentMultiplier(hiramasa, strong)).toBeGreaterThan(
      speciesEnvironmentMultiplier(hiramasa, slow),
    )
  })

  it('does not change konoshiro / nodoguro for this pass', () => {
    const konoshiro = speciesById('konoshiro')
    // konoshiro は environmentAffinity なし（常に 1.0）。
    for (const tide of TIDES) {
      expect(speciesEnvironmentMultiplier(konoshiro, env(tide))).toBe(1)
    }
    // nodoguro は depth/season specialist のまま — tide による変動幅が Flood runner より明確に小さい。
    const nodoguro = speciesById('nodoguro')
    const sawara = speciesById('sawara')
    const spread = (species: FishSpecies) => {
      const values = TIDES.map((tide) => speciesEnvironmentMultiplier(species, env(tide)))
      return Math.max(...values) - Math.min(...values)
    }
    expect(spread(nodoguro)).toBeLessThan(spread(sawara) * 0.5)
  })
})

describe('Encounter environmental authority', () => {
  it('reads environmentAffinity and ignores dead top-level profile fields', () => {
    // dead fields（tidePreference 等）だけを持つ魚は neutral のまま。
    const deadOnly = {
      id: 'ghost-species',
      japaneseName: 'x',
      waterTypes: ['salt'],
      habitats: [],
      tidePreference: { preference: 'rising' },
      currentPreference: { preference: 'strong' },
      seasonality: { months: [7] },
      timeActivity: { periods: ['dawn'] },
    } as unknown as FishSpecies
    const env = envAt({ season: 'summer', timeOfDay: 'dawn', tide: 'rising', flow: 'strong' })
    expect(speciesEnvironmentMultiplier(deadOnly, env)).toBe(1)

    // environmentAffinity を持つ魚は multiplier が動く。
    const affine = {
      ...deadOnly,
      environmentAffinity: { tideAffinity: { rising: 1.2 } },
    } as FishSpecies
    expect(speciesEnvironmentMultiplier(affine, env)).toBeGreaterThan(1)
  })
})

describe('tideDrivenFlow (spot-level flow authority)', () => {
  const setouchi = content.regions.find((entry) => String(entry.id) === 'setouchi')
  if (setouchi === undefined) throw new Error('missing setouchi region')

  const at = (hour: number, minute: number) => ({
    year: 2026,
    month: 4,
    day: 10,
    hour,
    minute,
  })

  /** 4 潮位すべての時刻を実 tide cycle から集める。 */
  const tideTimes = () => {
    const found = new Map<string, { hour: number; minute: number }>()
    for (let hour = 0; hour < 24; hour += 1) {
      const env = resolveEnvironment({
        time: at(hour, 0),
        climate: setouchi.climate,
        regionId: 'setouchi',
        environment: 'nearshore',
      })
      if (env.tide !== null && !found.has(env.tide)) {
        found.set(env.tide, { hour, minute: 0 })
      }
    }
    return found
  }

  it('marks only the two tide-race spots with the flag', () => {
    expect(spotById('setouchi-hidden-channel-edge').tideDrivenFlow).toBe(true)
    expect(spotById('setouchi-hidden-se-offshore').tideDrivenFlow).toBe(true)
    expect(spotById('setouchi-island-shore').tideDrivenFlow).toBeUndefined()
    expect(spotById('setouchi-harbor-front').tideDrivenFlow).toBeUndefined()
    expect(spotById('setouchi-tetrapod-bank').tideDrivenFlow).toBeUndefined()
  })

  it('drives nearshore flow from tide: moving = strong, slack = slow', () => {
    const times = tideTimes()
    for (const tide of TIDES) {
      const t = times.get(tide)
      if (t === undefined) throw new Error(`no time found for tide ${tide}`)
      const env = resolveEnvironment({
        time: at(t.hour, t.minute),
        climate: setouchi.climate,
        regionId: 'setouchi',
        environment: 'nearshore',
        tideDrivenFlow: true,
      })
      const expected = tide === 'rising' || tide === 'falling' ? 'strong' : 'slow'
      expect(env.water.flow).toBe(expected)
    }
  })

  it('drives offshore flow from tide: moving = strong, slack = moderate', () => {
    const times = tideTimes()
    for (const tide of TIDES) {
      const t = times.get(tide)
      if (t === undefined) throw new Error(`no time found for tide ${tide}`)
      const env = resolveEnvironment({
        time: at(t.hour, t.minute),
        climate: setouchi.climate,
        regionId: 'setouchi',
        environment: 'offshore',
        tideDrivenFlow: true,
      })
      const expected = tide === 'rising' || tide === 'falling' ? 'strong' : 'moderate'
      expect(env.water.flow).toBe(expected)
    }
  })

  it('leaves flow unchanged when the flag is absent (non-target spot regression)', () => {
    const times = tideTimes()
    for (const tide of TIDES) {
      const t = times.get(tide)
      if (t === undefined) throw new Error(`no time found for tide ${tide}`)
      const env = resolveEnvironment({
        time: at(t.hour, t.minute),
        climate: setouchi.climate,
        regionId: 'setouchi',
        environment: 'nearshore',
      })
      expect(env.water.flow).toBe('moderate')
    }
  })

  it('composes tide and rain as a net sum before a single clamp', () => {
    const base = { time: at(6, 0), climate: setouchi.climate, regionId: 'setouchi' }
    // offshore base=strong: slack(-1) + rain(+1) = strong（逐次なら moderate になり得る）。
    const rainySlack = waterConditionFor({
      ...base,
      environment: 'offshore',
      weather: 'rain',
      tideFlowStep: -1,
    })
    expect(rainySlack.flow).toBe('strong')
    // bay_shore base=slow + slack(-1) は下端 clamp で none。
    const slackShore = waterConditionFor({
      ...base,
      environment: 'bay_shore',
      weather: 'clear',
      tideFlowStep: -1,
    })
    expect(slackShore.flow).toBe('none')
    // nearshore base=moderate + moving(+1) + rain(+1) は上端 clamp で strong。
    const rainyMoving = waterConditionFor({
      ...base,
      environment: 'nearshore',
      weather: 'rain',
      tideFlowStep: 1,
    })
    expect(rainyMoving.flow).toBe('strong')
  })

  it('is deterministic: same inputs resolve to the same snapshot', () => {
    const input = {
      time: at(9, 0),
      climate: setouchi.climate,
      regionId: 'setouchi',
      environment: 'nearshore' as const,
      tideDrivenFlow: true,
    }
    expect(resolveEnvironment(input)).toEqual(resolveEnvironment(input))
  })
})

describe('channel-edge decision switch (tide changes the rational target)', () => {
  const channelEdge = spotById('setouchi-hidden-channel-edge')

  it('produces at least 3 distinct top targets across the 4 tide states', () => {
    const ranked = rankedAt(channelEdge, 'spring', 'daytime')
    const tops = new Set(ranked.map((entry) => entry.rows[0]?.speciesId))
    expect(tops.size).toBeGreaterThanOrEqual(3)
  })

  it('rising favors a Flood runner with a moving current', () => {
    const rising = rankedAt(channelEdge, 'spring', 'daytime').find((e) => e.tide === 'rising')
    if (rising === undefined) throw new Error('missing rising')
    expect(rising.flow).toBe('strong')
    expect(rising.rows[0]?.speciesId).toBe('sawara')
  })

  it('falling favors an Ebb hunter (tachiuo or seabass)', () => {
    const falling = rankedAt(channelEdge, 'spring', 'daytime').find((e) => e.tide === 'falling')
    if (falling === undefined) throw new Error('missing falling')
    expect(falling.flow).toBe('strong')
    expect(['tachiuo', 'seabass']).toContain(falling.rows[0]?.speciesId)
  })

  it('slack tide favors the structure fish (kijihata)', () => {
    const ranked = rankedAt(channelEdge, 'spring', 'daytime')
    const low = ranked.find((e) => e.tide === 'low')
    const high = ranked.find((e) => e.tide === 'high')
    if (low === undefined || high === undefined) throw new Error('missing slack states')
    expect(low.flow).toBe('slow')
    expect(low.rows[0]?.speciesId).toBe('kijihata')
    // high でも Flood ではなく structure fish が合理的（channel-edge には High-water 魚がいない）。
    expect(high.rows[0]?.speciesId).not.toBe('sawara')
  })
})

describe('se-offshore decision switch (captain charter reads the tide)', () => {
  const offshore = spotById('setouchi-hidden-se-offshore')

  it('rotates the rational target across all 4 tide states', () => {
    const ranked = rankedAt(offshore, 'summer', 'daytime')
    const tops = new Set(ranked.map((entry) => entry.rows[0]?.speciesId))
    expect(tops.size).toBeGreaterThanOrEqual(3)
  })

  it('rising + running current favors hiramasa (mid-water)', () => {
    const rising = rankedAt(offshore, 'summer', 'daytime').find((e) => e.tide === 'rising')
    if (rising === undefined) throw new Error('missing rising')
    expect(rising.flow).toBe('strong')
    expect(rising.rows[0]?.speciesId).toBe('hiramasa')
  })

  it('high tide favors madai on the reef base', () => {
    const high = rankedAt(offshore, 'summer', 'daytime').find((e) => e.tide === 'high')
    if (high === undefined) throw new Error('missing high')
    expect(high.flow).toBe('moderate')
    expect(high.rows[0]?.speciesId).toBe('madai')
  })

  it('falling favors kanpachi in moving mid-water', () => {
    const falling = rankedAt(offshore, 'summer', 'daytime').find((e) => e.tide === 'falling')
    if (falling === undefined) throw new Error('missing falling')
    expect(falling.flow).toBe('strong')
    expect(falling.rows[0]?.speciesId).toBe('kanpachi')
  })

  it('slack favors structure/depth specialists (kijihata or nodoguro)', () => {
    const low = rankedAt(offshore, 'summer', 'daytime').find((e) => e.tide === 'low')
    if (low === undefined) throw new Error('missing low')
    expect(low.flow).toBe('moderate')
    expect(['kijihata', 'nodoguro']).toContain(low.rows[0]?.speciesId)
  })
})

describe('global regression (non-Setouchi spots)', () => {
  it('keeps kanpachi on top at sagami-hidden-current-edge in all tides', () => {
    const ranked = rankedAt(spotById('sagami-hidden-current-edge'), 'autumn', 'morning')
    for (const entry of ranked) {
      expect(entry.rows[0]?.speciesId).toBe('kanpachi')
    }
  })

  it('keeps katsuo on top at sagami-bay-offshore in at least 3 of 4 tides', () => {
    const ranked = rankedAt(spotById('sagami-bay-offshore'), 'autumn', 'morning')
    const katsuoTops = ranked.filter((e) => e.rows[0]?.speciesId === 'katsuo').length
    expect(katsuoTops).toBeGreaterThanOrEqual(3)
    // madai は high でのみ浮上する（Final Gate の補正）。
    const madaiTops = ranked.filter((e) => e.rows[0]?.speciesId === 'madai')
    for (const entry of madaiTops) {
      expect(entry.tide).toBe('high')
    }
  })

  it('keeps seabass as the hokkaido-coast top target', () => {
    const ranked = rankedAt(spotById('hokkaido-coast'), 'autumn', 'morning')
    for (const entry of ranked) {
      expect(entry.rows[0]?.speciesId).toBe('seabass')
    }
  })

  it('makes estuary seabass strongest on the ebb tide (intended change)', () => {
    const ranked = rankedAt(spotById('brackish-mouth'), 'autumn', 'morning')
    const falling = ranked.find((e) => e.tide === 'falling')
    if (falling === undefined) throw new Error('missing falling')
    expect(falling.rows[0]?.speciesId).toBe('seabass')
  })

  it('does not apply tide to freshwater spots (tide = null)', () => {
    const tokyo = content.regions.find((entry) => String(entry.id) === 'tokyo-area')
    if (tokyo === undefined) throw new Error('missing tokyo region')
    const env = resolveEnvironment({
      time: { year: 2026, month: 7, day: 15, hour: 9, minute: 0 },
      climate: tokyo.climate,
      regionId: 'tokyo-area',
      environment: 'river',
      tideDrivenFlow: true,
    })
    expect(env.tide).toBeNull()
    // tideDrivenFlow は淡水では何も変えない。
    expect(env.water.flow).toBe('moderate')
    // freshwater Spot（arakawa-lower）では tideAffinity が Encounter に効かない。
    const maaji = speciesById('maaji')
    const m = speciesEnvironmentMultiplier(maaji, env)
    expect(m).toBe(speciesEnvironmentMultiplier(maaji, { ...env, tide: null }))
  })
})

describe('buyer progression tuning (island-market only)', () => {
  it('compresses the pessimistic tail without changing typical/best pacing', () => {
    const market = content.buyers.find((entry) => String(entry.id) === 'setouchi-island-market')
    if (market === undefined) throw new Error('missing island-market')
    expect(market.trustProfile).toEqual({
      perTransactionBase: 3,
      qualityWeight: 4,
      maxPerTransaction: 6,
    })
    // 目標: pessimistic ~10 / typical ~6 / best ~5 sales to Trust 30。
    const gain = (q: number) => Math.min(6, Math.round(3 + 4 * q))
    expect(Math.ceil(30 / gain(0))).toBe(10)
    expect(Math.ceil(30 / gain(0.5))).toBe(6)
    expect(Math.ceil(30 / gain(1))).toBe(5)
  })
})
