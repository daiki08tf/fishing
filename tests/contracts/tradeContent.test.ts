import { describe, expect, it } from 'vitest'
import { validateContentReferences } from '../../src/content/catalog/references'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { BuiltInContent } from '../../src/content/catalog/assembleContent'
import type { BuyerDefinition } from '../../src/domain/trade/Buyer'
import type { ContactReward } from '../../src/domain/trade/ContactReward'
import type { SpeciesTradeProfile } from '../../src/domain/trade/SpeciesTradeProfile'
import { TRADE_TAGS } from '../../src/domain/trade/TradeTag'
import { asContactRewardId, asRegionId } from '../../src/domain/ids'

/**
 * Phase 13.1 — Content 検証の契約。
 *
 * 「runtime の Content が壊れていないこと」と「壊れた Content を検出できること」
 * （偽陰性が無いこと）を両方確認する。
 */

const content: BuiltInContent = loadContentFromDirectory()

const referencesOf = (overrides: {
  readonly buyers?: readonly BuyerDefinition[]
  readonly speciesTradeProfiles?: readonly SpeciesTradeProfile[]
  readonly contactRewards?: readonly ContactReward[]
}): ReturnType<typeof validateContentReferences> =>
  validateContentReferences({
    species: content.species,
    spots: content.spots,
    shopItems: content.shopItems,
    gear: content.gear,
    methods: content.methods,
    brands: content.brands,
    gearSeries: content.gearSeries,
    transports: content.transports,
    countries: content.countries,
    regions: content.regions,
    expeditions: content.expeditions,
    buyers: overrides.buyers ?? content.buyers,
    speciesTradeProfiles: overrides.speciesTradeProfiles ?? content.speciesTradeProfiles,
    contactRewards: overrides.contactRewards ?? content.contactRewards,
  })

describe('runtime trade content', () => {
  it('passes every reference and trade validation', () => {
    expect(referencesOf({})).toEqual([])
  })

  it('gives every runtime species a trade profile', () => {
    const missing = content.species.filter(
      (species) => content.speciesTradeProfileBySpeciesId[String(species.id)] === undefined,
    )

    expect(missing).toEqual([])
    expect(content.speciesTradeProfiles).toHaveLength(144)
  })

  it('gives every tradable profile at least one known tradeTag', () => {
    const known = new Set<string>(TRADE_TAGS)
    const untagged = content.speciesTradeProfiles.filter(
      (profile) => profile.tradeStatus === 'tradable' && profile.tradeTags.length === 0,
    )
    const unknown = content.speciesTradeProfiles.flatMap((profile) =>
      profile.tradeTags.filter((tag) => !known.has(tag)),
    )

    expect(untagged).toEqual([])
    expect(unknown).toEqual([])
    // 全 runtime species に妥当な tradeTags が入っている。
    expect(content.speciesTradeProfiles.every((profile) => profile.tradeTags.length > 0)).toBe(true)
  })

  it('points every buyer at a real region with known preferredTags', () => {
    const known = new Set<string>(TRADE_TAGS)
    const regionIds = new Set(content.regions.map((region) => String(region.id)))

    for (const buyer of content.buyers) {
      expect(regionIds.has(String(buyer.regionId))).toBe(true)
      expect(buyer.preferences.preferredTags.length).toBeGreaterThan(0)

      for (const tag of [...buyer.preferences.preferredTags, ...buyer.preferences.neutralTags]) {
        expect(known.has(tag)).toBe(true)
      }

      const overlap = buyer.preferences.preferredTags.filter((tag) =>
        buyer.preferences.neutralTags.includes(tag),
      )
      expect(overlap).toEqual([])
    }
  })

  it('gives every hidden spot a discovery path through a contact reward', () => {
    const hidden = content.spots.filter((spot) => spot.visibility === 'hidden')
    const discoverTargets = new Set(
      content.contactRewards
        .filter((reward) => reward.kind === 'discover_spot')
        .map((reward) => String(reward.targetId)),
    )

    expect(hidden.length).toBeGreaterThan(0)

    for (const spot of hidden) {
      expect(discoverTargets.has(String(spot.id))).toBe(true)
    }
  })

  it('does not ship any introduce_contact reward (reserved, would be a silent no-op)', () => {
    expect(content.contactRewards.filter((reward) => reward.kind === 'introduce_contact')).toEqual(
      [],
    )
  })
})

describe('trade content validation catches broken content', () => {
  it('rejects an unknown tradeTag on a species profile', () => {
    const broken = content.speciesTradeProfiles.map((profile, index) =>
      index === 0
        ? {
            ...profile,
            tradeTags: ['not_a_real_tag'] as unknown as SpeciesTradeProfile['tradeTags'],
          }
        : profile,
    )
    const issues = referencesOf({ speciesTradeProfiles: broken })

    expect(issues.some((issue) => issue.message.includes('unknown tradeTag'))).toBe(true)
  })

  it('rejects a tradable profile without tradeTags', () => {
    const broken = content.speciesTradeProfiles.map((profile, index) =>
      index === 0 ? { ...profile, tradeTags: [] } : profile,
    )
    const issues = referencesOf({ speciesTradeProfiles: broken })

    expect(issues.some((issue) => issue.message.includes('at least one tradeTag'))).toBe(true)
  })

  it('rejects an unknown preferredTag on a buyer', () => {
    const [first] = content.buyers

    if (first === undefined) {
      throw new Error('no buyers')
    }

    const broken: BuyerDefinition = {
      ...first,
      preferences: {
        ...first.preferences,
        preferredTags: [
          'not_a_real_tag',
        ] as unknown as BuyerDefinition['preferences']['preferredTags'],
      },
    }
    const issues = referencesOf({ buyers: [broken] })

    expect(issues.some((issue) => issue.message.includes('unknown tradeTag'))).toBe(true)
  })

  it('rejects a buyer whose region is unknown', () => {
    const [first] = content.buyers

    if (first === undefined) {
      throw new Error('no buyers')
    }

    const issues = referencesOf({
      buyers: [{ ...first, regionId: asRegionId('atlantis') }],
    })

    expect(issues.some((issue) => issue.message.includes('unknown regionId'))).toBe(true)
  })

  it('rejects an introduce_contact reward (reserved / not yet supported)', () => {
    const [first] = content.buyers

    if (first === undefined) {
      throw new Error('no buyers')
    }

    const reserved: ContactReward = {
      id: asContactRewardId('future-introduction'),
      contactId: first.id,
      minTrust: 50,
      kind: 'introduce_contact',
      message: '知り合いを紹介する（未実装）',
      targetId: first.id,
    }
    const issues = referencesOf({ contactRewards: [...content.contactRewards, reserved] })

    expect(issues.some((issue) => issue.message.includes('reserved'))).toBe(true)
  })

  it('rejects a hidden spot with no discover_spot reward', () => {
    const hidden = content.spots.find((spot) => spot.visibility === 'hidden')

    if (hidden === undefined) {
      throw new Error('no hidden spot')
    }

    const without = content.contactRewards.filter(
      (reward) =>
        !(reward.kind === 'discover_spot' && String(reward.targetId) === String(hidden.id)),
    )
    const issues = referencesOf({ contactRewards: without })

    expect(issues.some((issue) => issue.message.includes('unreachable via discovery'))).toBe(true)
  })

  it('rejects a discover_spot reward pointing at a missing spot', () => {
    const [first] = content.buyers

    if (first === undefined) {
      throw new Error('no buyers')
    }

    const broken: ContactReward = {
      id: asContactRewardId('broken-spot'),
      contactId: first.id,
      minTrust: 10,
      kind: 'discover_spot',
      message: '存在しない釣り場',
      targetId: 'no-such-spot' as never,
    }
    const issues = referencesOf({ contactRewards: [...content.contactRewards, broken] })

    expect(issues.some((issue) => issue.message.includes('unknown targetId'))).toBe(true)
  })
})
