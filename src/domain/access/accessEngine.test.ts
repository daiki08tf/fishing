import { describe, expect, it } from 'vitest'
import { emptyKnowledgeState } from '../knowledge/KnowledgeState'
import { addRegionKnowledge } from '../knowledge/regionKnowledge'
import { addSpotKnowledge } from '../knowledge/spotKnowledge'
import { asPermitId } from '../ids'
import { createTestSpot } from '../../../tests/fixtures/spots'
import { ACCESS_REQUIREMENT_KINDS } from './AccessRequirement'
import { evaluateAccess, fastestTravelOption } from './accessEngine'

const base = {
  availableTransports: ['walk', 'train', 'bus'] as const,
  knowledge: emptyKnowledgeState(),
}

describe('access engine', () => {
  it('accepts a spot whose requirements are met', () => {
    const evaluation = evaluateAccess({
      ...base,
      spot: createTestSpot(),
    })

    expect(evaluation.accessible).toBe(true)
    expect(evaluation.blockedReasons).toEqual([])
    expect(evaluation.travelOptions).toEqual([{ transport: 'walk', minutes: 20, cost: 0 }])
  })

  it('rejects a spot that needs a transport the player does not have', () => {
    const spot = createTestSpot({
      access: [{ kind: 'transport', tag: 'car' }],
      travelOptions: [{ transport: 'car', minutes: 95, cost: 900 }],
    })

    const evaluation = evaluateAccess({ ...base, spot })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toContain('transport')
    expect(evaluation.blockedReasons[0]?.label).toContain('車')
    expect(evaluation.travelOptions).toEqual([])
  })

  it('rejects a spot that needs a permit', () => {
    const spot = createTestSpot({
      access: [
        { kind: 'transport', tag: 'bus' },
        { kind: 'permit', permitId: asPermitId('fee-fishing-ticket') },
      ],
      travelOptions: [{ transport: 'bus', minutes: 70, cost: 520 }],
    })

    const evaluation = evaluateAccess({ ...base, spot })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toContain('permit')
    expect(evaluation.blockedReasons[0]?.label).toContain('遊漁券')
  })

  it('rejects a spot until the player knows that spot', () => {
    const spot = createTestSpot({
      access: [{ kind: 'knowledge', minimum: 20 }],
    })

    const unknown = evaluateAccess({ ...base, spot })
    expect(unknown.accessible).toBe(false)
    expect(unknown.blockedReasons[0]?.required).toBe(20)
    expect(unknown.blockedReasons[0]?.current).toBe(0)

    const known = evaluateAccess({
      ...base,
      spot,
      knowledge: addSpotKnowledge(emptyKnowledgeState(), 'test-spot', 25),
    })
    expect(known.accessible).toBe(true)
  })

  it('rejects a spot until the player knows the region', () => {
    const spot = createTestSpot({
      access: [{ kind: 'knowledge', minimum: 20, scope: 'region' }],
    })

    expect(evaluateAccess({ ...base, spot }).accessible).toBe(false)

    const known = evaluateAccess({
      ...base,
      spot,
      knowledge: addRegionKnowledge(emptyKnowledgeState(), 'test-region', 20),
    })

    expect(known.accessible).toBe(true)
  })

  it('only offers travel options the player can actually use', () => {
    const spot = createTestSpot({
      access: [{ kind: 'transport', tag: 'train' }],
      travelOptions: [
        { transport: 'train', minutes: 38, cost: 420 },
        { transport: 'car', minutes: 25, cost: 900 },
      ],
    })

    const evaluation = evaluateAccess({ ...base, spot })

    expect(evaluation.travelOptions).toEqual([{ transport: 'train', minutes: 38, cost: 420 }])
    expect(fastestTravelOption(evaluation.travelOptions)?.minutes).toBe(38)
  })

  it('never uses the angler level as an access condition', () => {
    // アクセス条件の種類に Level が存在しない（DECISIONS.md §5 / §6）。
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('level')
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('anglerLevel')

    // 入力にも Level が無いので、同じ入力なら常に同じ判定になる。
    const spot = createTestSpot()
    const first = evaluateAccess({ ...base, spot })
    const second = evaluateAccess({ ...base, spot, reputation: 999 })

    expect(first.accessible).toBe(second.accessible)
  })
})
