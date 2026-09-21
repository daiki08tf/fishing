import { describe, expect, it } from 'vitest'
import { findForbiddenImports, findForbiddenPatterns } from './sourceScanner'
import { readProjectSources } from './testProjectFiles'

/**
 * 成長（Progression）と釣り（Fishing）の境界の検査。
 *
 * 守るもの:
 * - FishingEngine は XP / Level / Skill Point / Codex を持たない。
 * - Progression は FishingEngine に依存しない（Engine の上位にいる）。
 * - Level をアクセス条件に持ち込まない（DECISIONS.md §6。no-level-gate と対）。
 */

describe('progression boundaries', () => {
  const sources = readProjectSources()

  it('keeps the fishing engine free of progression concepts', () => {
    const pattern = /\b(anglerLevel|anglerXp|skillPoints|unlockedPerks|xpGained|codex)\b/

    const violations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/fishing/') && !path.endsWith('.test.ts'),
      pattern,
      reason: 'progression belongs to its own domain, not to the fishing engine',
    })

    expect(violations).toEqual([])
  })

  it('detects progression leaking into the engine when it happens', () => {
    const synthetic = [
      {
        path: 'src/domain/fishing/Leaky.ts',
        source: 'export type Leaky = { anglerLevel: number }\n',
      },
    ]

    const violations = findForbiddenPatterns(synthetic, {
      matches: (path) => path.startsWith('src/domain/fishing/') && !path.endsWith('.test.ts'),
      pattern: /\b(anglerLevel|anglerXp|skillPoints|unlockedPerks|xpGained|codex)\b/,
      reason: 'progression belongs to its own domain',
    })

    expect(violations).toHaveLength(1)
  })

  it('does not let the progression domain depend on the fishing engine', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/domain/progression/') && !path.endsWith('.test.ts'),
      isAllowed: (specifier) => !specifier.includes('FishingEngine'),
      reason: 'progression must not drive the fishing engine implementation',
    })

    expect(violations).toEqual([])
  })

  it('does not let the access requirement gain a level gate', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/access/'),
      pattern: /\b(anglerLevel|requiredLevel|minLevel|levelRequirement)\b/,
      reason: 'level must not gate access',
    })

    expect(violations).toEqual([])
  })

  it('keeps the progression domain free of UI and storage', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/domain/progression/') && !path.endsWith('.test.ts'),
      isAllowed: (specifier) =>
        !/^(react|react-dom|zustand)(\/|$)/.test(specifier) &&
        !specifier.startsWith('node:') &&
        !specifier.includes('/ui/') &&
        !specifier.includes('/infrastructure/'),
      reason: 'progression is domain logic',
    })

    expect(violations).toEqual([])
  })
})
