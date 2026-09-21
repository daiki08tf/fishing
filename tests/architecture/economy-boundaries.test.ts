import { describe, expect, it } from 'vitest'
import { findForbiddenImports, findForbiddenPatterns } from './sourceScanner'
import { readProjectSources } from './testProjectFiles'

/**
 * Phase 5 の境界。
 *
 * - FishingEngine は Economy / Schedule を知らない
 * - AccessEngine は Angler Level を知らない（Phase 1 からの継続）
 * - 仕事は攻略対象ではない（Career の仕組みを作らない）
 */

const economyPattern = /\b(cash|finance|purchase|paidLeave|travelCost|salaryIncome)\b/
const schedulePattern = /\b(workSchedule|workStart|commute|paidLeave|isAtWork|canStartTrip)\b/

const isFishing = (path: string): boolean =>
  path.startsWith('src/domain/fishing/') && !path.endsWith('.test.ts')

describe('economy boundaries', () => {
  const sources = readProjectSources()

  it('keeps the fishing engine free of economy concepts', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: isFishing,
      pattern: economyPattern,
      reason: 'economy belongs to its own domain',
    })

    expect(violations).toEqual([])
  })

  it('keeps the fishing engine free of work and schedule concepts', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: isFishing,
      pattern: schedulePattern,
      reason: 'schedule belongs to its own domain',
    })

    expect(violations).toEqual([])
  })

  it('detects both kinds of leak when they happen', () => {
    const synthetic = [
      { path: 'src/domain/fishing/Leaky.ts', source: 'export type Leaky = { cash: number }\n' },
      { path: 'src/domain/fishing/Leaky2.ts', source: 'export const x = () => isAtWork()\n' },
    ]

    expect(
      findForbiddenPatterns(synthetic, {
        matches: isFishing,
        pattern: economyPattern,
        reason: 'economy belongs to its own domain',
      }),
    ).toHaveLength(1)

    expect(
      findForbiddenPatterns(synthetic, {
        matches: isFishing,
        pattern: schedulePattern,
        reason: 'schedule belongs to its own domain',
      }),
    ).toHaveLength(1)
  })

  it('keeps the access engine free of the angler level', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/access/') && !path.endsWith('.test.ts'),
      pattern: /\b(anglerLevel|requiredLevel|minLevel|levelRequirement)\b/,
      reason: 'level must not gate access',
    })

    expect(violations).toEqual([])
  })

  it('keeps the access engine free of economy concepts', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: (path) => path.startsWith('src/domain/access/') && !path.endsWith('.test.ts'),
      pattern: /\b(cash|finance|purchase|price|salaryIncome|transaction)\b/,
      reason: 'access is about physical reachability, not money',
    })

    expect(violations).toEqual([])
  })

  it('does not gate access by work schedule', () => {
    const violations = findForbiddenPatterns(sources, {
      matches: (path) =>
        (path.startsWith('src/domain/access/') || path.startsWith('src/domain/world/')) &&
        !path.endsWith('.test.ts'),
      pattern: /\b(isAtWork|workStart|paidLeave|commuteMinutes|freeMinutesUntilWork)\b/,
      reason: 'the work schedule is not a game system',
    })

    expect(violations).toEqual([])
  })

  it('does not build a career or work simulation', () => {
    const violations = findForbiddenPatterns(sources, {
      // CareerState / JobDefinition は DATA_MODEL の契約として残しているだけで、
      // Phase 5 では使わない（仕事は時間の制約だけ）。
      matches: (path) =>
        path.startsWith('src/domain/') &&
        !path.startsWith('src/domain/career/') &&
        !path.endsWith('.test.ts'),
      pattern: /\b(careerXp|crossSkill|performanceReview|jobOffer|promotion)\b/,
      reason: 'the work is a background constraint, not a game system',
    })

    expect(violations).toEqual([])
  })

  it('keeps the economy domain free of UI and infrastructure', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/domain/economy/') && !path.endsWith('.test.ts'),
      isAllowed: (specifier) =>
        !/^(react|react-dom|zustand)(\/|$)/.test(specifier) &&
        !specifier.startsWith('node:') &&
        !specifier.includes('/ui/') &&
        !specifier.includes('/infrastructure/'),
      reason: 'economy is domain logic',
    })

    expect(violations).toEqual([])
  })
})
