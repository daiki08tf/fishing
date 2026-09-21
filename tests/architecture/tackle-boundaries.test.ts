import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findForbiddenImports, findForbiddenPatterns } from './sourceScanner'
import { projectRoot, readProjectSources } from './testProjectFiles'

/**
 * Phase 6（Tackle Depth）の層の境界。
 *
 * - FishingEngine は装備を知らない（具体的な Gear ID も名前も持たない）
 * - Encounter Engine は具体的な Lure を知らない
 * - Shop / Tackle Domain は Content に依存しない
 * - 装備を足すのに Engine を書き換えなくてよい
 */

const isFishingDomain = (path: string): boolean =>
  path.startsWith('src/domain/fishing/') && !path.endsWith('.test.ts')

const isEncounterDomain = (path: string): boolean =>
  path.startsWith('src/domain/encounter/') && !path.endsWith('.test.ts')

/** 実 Content の Gear ID。Engine に現れたら「装備を知っている」ことになる。 */
const gearIds = (): readonly string[] => {
  const root = join(projectRoot(), 'src/content/data/gear')

  return readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(root, name), 'utf8')) as { id: string })
    .map((item) => item.id)
}

/** offering の種類名。Engine が Lure の種類を知ったら違反。 */
const OFFERING_TYPE_WORDS =
  /\b(minnow|shad|crankbait|vibration|spinner|spoon|soft_plastic|topwater)\b/

describe('tackle boundaries', () => {
  const sources = readProjectSources()

  it('finds the shipped gear content', () => {
    expect(gearIds().length).toBeGreaterThanOrEqual(20)
  })

  it('keeps the fishing engine free of concrete gear ids', () => {
    for (const id of gearIds()) {
      const violations = findForbiddenPatterns(sources, {
        matches: isFishingDomain,
        pattern: new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
        reason: 'the fishing engine must not know concrete gear',
      })

      expect(violations, `gear id ${id} leaked into the fishing engine`).toEqual([])
    }
  })

  it('keeps the fishing engine free of lure type words', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: isFishingDomain,
      pattern: OFFERING_TYPE_WORDS,
      reason: 'the fishing engine must not know lure types',
    })

    expect(violations).toEqual([])
  })

  it('keeps the encounter engine free of concrete gear ids', () => {
    for (const id of gearIds()) {
      const violations = findForbiddenPatterns(sources, {
        matches: isEncounterDomain,
        pattern: new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
        reason: 'encounter must not know concrete gear',
      })

      expect(violations, `gear id ${id} leaked into the encounter engine`).toEqual([])
    }
  })

  it('keeps the encounter engine free of lure type words', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: isEncounterDomain,
      pattern: OFFERING_TYPE_WORDS,
      reason: 'encounter must not know lure types',
    })

    expect(violations).toEqual([])
  })

  it('keeps the tackle domain free of content', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/domain/tackle/') && !path.endsWith('.test.ts'),
      isAllowed: (specifier) => !specifier.includes('content'),
      reason: 'tackle domain must not read content',
    })

    expect(violations).toEqual([])
  })

  it('keeps the shop domain free of gear performance rules', () => {
    // Shop は「買えるか」だけを見る。ドラッグやライン強度の解釈は Tackle の仕事。
    const violations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/shop/') && !path.endsWith('.test.ts'),
      pattern: /\b(maxDragKg|strengthKg|abrasionResistance|fightingPower|lureWeightG)\b/,
      reason: 'shop must not interpret gear specs',
    })

    expect(violations).toEqual([])
  })

  it('detects a leaked gear id when one exists', () => {
    // 検査そのものが機能することの確認（偽陰性が無いこと）。
    const synthetic = [
      {
        path: 'src/domain/fishing/Leaky.ts',
        source: "export const rod = 'starter-rod'\n",
      },
      {
        path: 'src/domain/encounter/Leaky.ts',
        source: 'export const lure = () => lure-minnow-light\n',
      },
    ]

    expect(
      findForbiddenPatterns(synthetic, {
        matches: isFishingDomain,
        pattern: /\bstarter-rod\b/,
        reason: 'must not know concrete gear',
      }),
    ).toHaveLength(1)

    expect(
      findForbiddenPatterns(synthetic, {
        matches: isEncounterDomain,
        pattern: /\blure-minnow-light\b/,
        reason: 'must not know concrete gear',
      }),
    ).toHaveLength(1)
  })
})
