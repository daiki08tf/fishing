import { describe, expect, it } from 'vitest'
import { ACCESS_REQUIREMENT_KINDS } from '../../src/domain/access/AccessRequirement'
import { findForbiddenPatterns } from './sourceScanner'
import { readProjectSources } from './testProjectFiles'

/**
 * DECISIONS.md §6 / PROGRESSION.md §12 の
 * 「Levelをlocation hard lockに使わない」を機械的に検査する。
 *
 * これは意味論的なレビューの代替ではない。
 * 「Level をアクセス条件として持ち込むための典型的な型・名前が存在しない」ことのみを保証する。
 */

describe('level is not a location hard lock', () => {
  it('defines exactly the documented access requirement kinds', () => {
    expect(ACCESS_REQUIREMENT_KINDS).toEqual([
      'transport',
      'knowledge',
      'reputation',
      'permit',
      'relationship',
      'season',
    ])
  })

  it('does not offer a level based access requirement', () => {
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('level')
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('anglerLevel')
  })

  it('has no level-gate fields in domain or content types', () => {
    const sources = readProjectSources()
    const pattern = /\b(requiredLevel|requiredAnglerLevel|minLevel|levelRequirement|levelLock)\b/

    const domainViolations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/') && !path.endsWith('.test.ts'),
      pattern,
      reason: 'level must not gate access',
    })

    const contentViolations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/content/schema/'),
      pattern,
      reason: 'level must not gate access',
    })

    expect(domainViolations).toEqual([])
    expect(contentViolations).toEqual([])
  })

  it('detects a level gate when one is introduced', () => {
    const synthetic = [
      {
        path: 'src/domain/access/FakeSpot.ts',
        source: 'export type Spot = { requiredLevel: number }\n',
      },
    ]

    const violations = findForbiddenPatterns(synthetic, {
      matches: (path) => path.startsWith('src/domain/'),
      pattern: /\b(requiredLevel|requiredAnglerLevel|minLevel|levelRequirement|levelLock)\b/,
      reason: 'level must not gate access',
    })

    expect(violations).toHaveLength(1)
  })
})
