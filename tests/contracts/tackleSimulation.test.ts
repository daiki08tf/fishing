import { describe, expect, it } from 'vitest'
import { simulateTackle, tackleBuilds } from '../../scripts/simulate-tackle'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { resolveTackle } from '../../src/domain/tackle'

/**
 * 装備でプレイ感が変わること（Phase 6 の simulation）。
 *
 * 決定論的なので、CI でも flaky にならない。
 */

describe('simulate:tackle', () => {
  const result = simulateTackle()

  it('passes every check', () => {
    const failed = result.checks.filter((check) => !check.ok).map((check) => check.label)

    expect(failed).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('covers the four intended builds', () => {
    expect(tackleBuilds().map((build) => build.id)).toEqual([
      'starter',
      'finesse',
      'balanced',
      'power',
    ])
  })

  it('reports a finesse and a power advantage in the output', () => {
    const text = result.lines.join('\n')

    expect(text).toContain('Finesse')
    expect(text).toContain('Power')
    expect(text).toContain('LINE_BREAK')
  })

  it('is reproducible', () => {
    const again = simulateTackle()

    expect(again.lines).toEqual(result.lines)
  })
})

describe('builds are distinct, not a single best set', () => {
  const content = loadContentFromDirectory()
  const setups = tackleBuilds().map((build) =>
    resolveTackle({ loadout: build.loadout, gear: content.gear, methods: content.methods }),
  )

  it('resolves every build', () => {
    expect(setups.every((setup) => setup !== null)).toBe(true)
  })

  it('does not make one build best at everything', () => {
    const finesse = setups.find((setup) => setup?.loadout.offeringId === 'lure-minnow-light')
    const power = setups.find((setup) => setup?.loadout.offeringId === 'lure-jig-big')

    expect(finesse).toBeDefined()
    expect(power).toBeDefined()

    if (finesse === undefined || finesse === null || power === undefined || power === null) {
      return
    }

    // 繊細さは Finesse、パワーは Power。どちらか一方が全部で勝つわけではない。
    expect(finesse.ratings.finesse).toBeGreaterThan(power.ratings.finesse)
    expect(power.ratings.power).toBeGreaterThan(finesse.ratings.power)
    expect(power.playerModifiers.maxTensionMultiplier).toBeGreaterThan(
      finesse.playerModifiers.maxTensionMultiplier,
    )
  })
})
