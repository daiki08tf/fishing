import { describe, expect, it } from 'vitest'
import { NEUTRAL_FISHING_MODIFIERS } from '../fishing/PlayerFishingModifiers'
import { emptyAnglerSkills } from './AnglerSkill'
import { describeFishingModifiers, resolveFishingModifiers } from './playerFishingModifiers'

const skillsWith = (overrides: Partial<ReturnType<typeof emptyAnglerSkills>>) => ({
  ...emptyAnglerSkills(),
  ...overrides,
})

describe('player fishing modifiers', () => {
  it('is neutral without skills or perks', () => {
    expect(resolveFishingModifiers({ skills: emptyAnglerSkills(), perks: [] })).toEqual(
      NEUTRAL_FISHING_MODIFIERS,
    )
  })

  it('lets Line Control reduce tension gain and improve give', () => {
    const modifiers = resolveFishingModifiers({
      skills: skillsWith({ lineControl: 100 }),
      perks: [],
    })

    expect(modifiers.tensionGainMultiplier).toBeLessThan(1)
    expect(modifiers.giveEfficiencyMultiplier).toBeGreaterThan(1)
  })

  it('lets Fighting improve the reel efficiency', () => {
    const modifiers = resolveFishingModifiers({
      skills: skillsWith({ fighting: 100 }),
      perks: [],
    })

    expect(modifiers.reelEfficiencyMultiplier).toBeCloseTo(1.3, 5)
  })

  it('lets Hooking widen the hook window', () => {
    const modifiers = resolveFishingModifiers({
      skills: skillsWith({ hooking: 100 }),
      perks: [],
    })

    expect(modifiers.hookWindowMultiplier).toBeCloseTo(1.5, 5)
    // hookSuccessModifier は倍率ではなく加算値。
    expect(modifiers.hookSuccessModifier).toBeCloseTo(0.1, 5)
  })

  it('lets Detection improve how the bite is perceived', () => {
    const modifiers = resolveFishingModifiers({
      skills: skillsWith({ detection: 100 }),
      perks: [],
    })

    expect(modifiers.detectionClarityMultiplier).toBeCloseTo(1.4, 5)
  })

  it('grows monotonically with the skill value', () => {
    const low = resolveFishingModifiers({ skills: skillsWith({ fighting: 20 }), perks: [] })
    const high = resolveFishingModifiers({ skills: skillsWith({ fighting: 80 }), perks: [] })

    expect(high.reelEfficiencyMultiplier).toBeGreaterThan(low.reelEfficiencyMultiplier)
  })

  it('adds the perk effects on top of the skills', () => {
    const withoutPerk = resolveFishingModifiers({
      skills: skillsWith({ lineControl: 50 }),
      perks: [],
    })
    const withPerk = resolveFishingModifiers({
      skills: skillsWith({ lineControl: 50 }),
      perks: ['drag_control'],
    })

    expect(withPerk.tensionGainMultiplier).toBeLessThan(withoutPerk.tensionGainMultiplier)
  })

  it('never lets a multiplier drop below a safe floor', () => {
    const modifiers = resolveFishingModifiers({
      skills: skillsWith({ lineControl: 100 }),
      perks: ['drag_control'],
    })

    expect(modifiers.tensionGainMultiplier).toBeGreaterThan(0)
    expect(modifiers.tensionGainMultiplier).toBeGreaterThanOrEqual(0.1)
  })

  it('summarises the changes for the UI', () => {
    const none = describeFishingModifiers(NEUTRAL_FISHING_MODIFIERS)
    expect(none).toEqual([])

    const some = describeFishingModifiers(
      resolveFishingModifiers({ skills: skillsWith({ fighting: 100 }), perks: [] }),
    )
    expect(some.length).toBeGreaterThan(0)
  })
})
