import { describe, expect, it } from 'vitest'
import { findForbiddenPatterns } from './sourceScanner'
import { readProjectSources } from './testProjectFiles'

describe('Phase 7A architecture boundaries', () => {
  const sources = readProjectSources()

  it('keeps concrete transport content out of AccessEngine', () => {
    const concreteIds =
      /\b(city-bicycle|standard-motorcycle|used-compact-car|four-wheel-drive-suv|rental-car|recreational-kayak|rental-boat|owned-boat)\b/

    expect(
      findForbiddenPatterns(sources, {
        matches: (path) => path === 'src/domain/access/accessEngine.ts',
        pattern: concreteIds,
        reason: 'AccessEngine must resolve data, not concrete transport ids',
      }),
    ).toEqual([])
  })

  it('keeps transport and content dependencies out of FishingEngine', () => {
    expect(
      findForbiddenPatterns(sources, {
        matches: (path) => path === 'src/domain/fishing/FishingEngine.ts',
        pattern: /\b(Transport|AccessEngine|FishingSpot|ShopItem|compact_car|owned_boat)\b/,
        reason: 'FishingEngine must not own travel or concrete content',
      }),
    ).toEqual([])
  })

  it('keeps Angler Level out of physical access resolution', () => {
    expect(
      findForbiddenPatterns(sources, {
        matches: (path) => path.startsWith('src/domain/access/') && !path.endsWith('.test.ts'),
        pattern: /\b(anglerLevel|requiredLevel|minLevel)\b/,
        reason: 'physical access cannot be unlocked by Angler Level',
      }),
    ).toEqual([])
  })
})
