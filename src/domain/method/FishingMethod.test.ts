import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESENTATION,
  methodAcceptsOffering,
  methodSupportsPlatform,
  presentationOf,
  type FishingMethod,
} from './FishingMethod'

const legacyMethod: FishingMethod = {
  id: 'lure',
  name: 'ルアー',
  description: 'legacy method without presentation',
  requiresOffering: 'lure',
  offeringTags: [],
}

const verticalJigging: FishingMethod = {
  id: 'vertical_jigging',
  name: 'バーチカルジギング',
  description: '船から真下へジグを落とす',
  requiresOffering: 'lure',
  offeringTags: ['jig'],
  presentation: {
    mode: 'vertical',
    supportedPlatforms: ['kayak', 'nearshore_boat', 'offshore_boat'],
  },
}

const trolling: FishingMethod = {
  id: 'trolling',
  name: 'トローリング',
  description: '船を走らせて曳く',
  requiresOffering: 'lure',
  offeringTags: ['minnow'],
  presentation: {
    mode: 'troll',
    supportedPlatforms: ['nearshore_boat', 'offshore_boat'],
  },
}

describe('FishingMethod presentation (Phase 17B)', () => {
  it('treats a method without presentation as cast with no platform restriction', () => {
    expect(presentationOf(legacyMethod)).toEqual(DEFAULT_PRESENTATION)
    expect(methodSupportsPlatform(legacyMethod, 'shore')).toBe(true)
    expect(methodSupportsPlatform(legacyMethod, 'offshore_boat')).toBe(true)
  })

  it('does not support platforms outside supportedPlatforms', () => {
    expect(methodSupportsPlatform(verticalJigging, 'shore')).toBe(false)
    expect(methodSupportsPlatform(verticalJigging, 'kayak')).toBe(true)
    expect(methodSupportsPlatform(verticalJigging, 'offshore_boat')).toBe(true)
  })

  it('trolling requires a boat, not a kayak or shore', () => {
    expect(methodSupportsPlatform(trolling, 'shore')).toBe(false)
    expect(methodSupportsPlatform(trolling, 'kayak')).toBe(false)
    expect(methodSupportsPlatform(trolling, 'nearshore_boat')).toBe(true)
    expect(methodSupportsPlatform(trolling, 'offshore_boat')).toBe(true)
  })

  it('still resolves offering compatibility exactly as before (no Engine changes needed)', () => {
    expect(methodAcceptsOffering(verticalJigging, { category: 'lure', lureType: 'jig' })).toBe(true)
    expect(methodAcceptsOffering(verticalJigging, { category: 'lure', lureType: 'popper' })).toBe(
      false,
    )
  })
})
