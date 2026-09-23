import { describe, expect, it } from 'vitest'
import type { FightCapability } from './FightCapability'
import { BIG_GAME_REFERENCE_DEMAND_KG, resolveFightReadiness } from './fightReadiness'
import type { FightDemand } from './FightDemand'

const capability = (over: Partial<FightCapability> = {}): FightCapability => ({
  effectiveLineCapacityM: 300,
  reserveLineM: 30,
  lineStrengthKg: 30,
  leaderStrengthKg: 40,
  hookStrengthKg: 40,
  leaderAbrasionResistance: 0.8,
  dragCapacityKg: 20,
  retrievePower: 0.7,
  rodControl: 0.7,
  weakLink: 'line',
  weakLinkStrengthKg: 30,
  tensionMarginMultiplier: 1,
  ...over,
})

const demand = (demandKg: number, runPotential = 0.75): FightDemand => ({
  massLoad: 1,
  burstLoad: 1,
  enduranceLoad: 1,
  runPotential,
  divePressure: 0.5,
  demandKg,
  total: demandKg,
})

describe('resolveFightReadiness', () => {
  it('marks a strong heavy-tackle setup ready for the big game reference', () => {
    const readiness = resolveFightReadiness({
      capability: capability({
        weakLinkStrengthKg: 40,
        dragCapacityKg: 25,
        leaderStrengthKg: 50,
        hookStrengthKg: 50,
      }),
      revealExpectation: true,
    })

    expect(readiness.marks.line_capacity).toBe('ok')
    expect(readiness.marks.drag).toBe('ok')
    expect(readiness.marks.retrieve).toBe('ok')
    expect(readiness.marks.weak_link).toBe('ok')
    expect(readiness.marks.abrasion).toBe('ok')
    expect(readiness.challenge).not.toBeNull()
    expect(readiness.notes).toContain('大型魚に挑める構成')
  })

  it('flags a light setup as not ready for big game', () => {
    const readiness = resolveFightReadiness({
      capability: capability({
        effectiveLineCapacityM: 120,
        weakLinkStrengthKg: 8,
        dragCapacityKg: 6,
        retrievePower: 0.4,
        leaderAbrasionResistance: 0.2,
        weakLink: 'leader',
      }),
      revealExpectation: true,
    })

    expect(readiness.marks.line_capacity).toBe('poor')
    expect(readiness.marks.weak_link).toBe('poor')
    expect(readiness.marks.drag).toBe('poor')
    expect(readiness.notes.some((note) => note.includes('最弱点'))).toBe(true)
    expect(readiness.challenge).toBe('extreme')
  })

  it('hides the challenge outlook when expectation is not revealed (knowledge masking)', () => {
    const readiness = resolveFightReadiness({
      capability: capability(),
      revealExpectation: false,
    })

    expect(readiness.masked).toBe(true)
    expect(readiness.challenge).toBeNull()
    // 項目マークは見せてよい（見通しだけを隠す）
    expect(readiness.marks.weak_link).toBe('fair')
  })

  it('uses a concrete demand when supplied', () => {
    const readiness = resolveFightReadiness({
      capability: capability({ weakLinkStrengthKg: 50 }),
      demand: demand(20),
      revealExpectation: true,
    })

    expect(readiness.marks.weak_link).toBe('ok')
    expect(readiness.challenge).not.toBeNull()
  })

  it('treats unknown capacity as fair and reports it', () => {
    const readiness = resolveFightReadiness({
      capability: capability({ effectiveLineCapacityM: null, reserveLineM: 15 }),
      revealExpectation: true,
    })

    expect(readiness.marks.line_capacity).toBe('fair')
    expect(readiness.details.line_capacity).toBe('容量不明')
  })

  it('requires more line when the expected line-out is deep', () => {
    const shallow = resolveFightReadiness({
      capability: capability({ effectiveLineCapacityM: 300 }),
      expectedLineOutM: 60,
      revealExpectation: true,
    })
    const deep = resolveFightReadiness({
      capability: capability({ effectiveLineCapacityM: 300 }),
      expectedLineOutM: 400,
      revealExpectation: true,
    })

    expect(shallow.marks.line_capacity).not.toBe('poor')
    expect(deep.marks.line_capacity).toBe('poor')
  })

  it('exposes the big game reference demand', () => {
    expect(BIG_GAME_REFERENCE_DEMAND_KG).toBeGreaterThan(0)
  })
})
