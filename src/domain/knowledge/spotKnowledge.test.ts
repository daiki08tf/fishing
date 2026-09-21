import { describe, expect, it } from 'vitest'
import { emptyKnowledgeState } from './KnowledgeState'
import { addRegionKnowledge, regionKnowledgeScore } from './regionKnowledge'
import {
  addSpotKnowledge,
  KNOWLEDGE_MAX,
  knowledgeTierFor,
  revealedFields,
  spotKnowledgeScore,
} from './spotKnowledge'
import { createTestSpot } from '../../../tests/fixtures/spots'

describe('spot knowledge', () => {
  it('starts unknown', () => {
    expect(spotKnowledgeScore(emptyKnowledgeState(), 'test-spot')).toBe(0)
  })

  it('accumulates and caps at the maximum', () => {
    let knowledge = emptyKnowledgeState()
    knowledge = addSpotKnowledge(knowledge, 'test-spot', 15)
    knowledge = addSpotKnowledge(knowledge, 'test-spot', 3)

    expect(spotKnowledgeScore(knowledge, 'test-spot')).toBe(18)

    knowledge = addSpotKnowledge(knowledge, 'test-spot', 500)
    expect(spotKnowledgeScore(knowledge, 'test-spot')).toBe(KNOWLEDGE_MAX)
  })

  it('ignores non-positive amounts', () => {
    const knowledge = emptyKnowledgeState()

    expect(addSpotKnowledge(knowledge, 'test-spot', 0)).toBe(knowledge)
    expect(addSpotKnowledge(knowledge, 'test-spot', -5)).toBe(knowledge)
  })

  it('does not mutate the previous state', () => {
    const knowledge = emptyKnowledgeState()
    const next = addSpotKnowledge(knowledge, 'test-spot', 10)

    expect(spotKnowledgeScore(knowledge, 'test-spot')).toBe(0)
    expect(spotKnowledgeScore(next, 'test-spot')).toBe(10)
  })

  it('reveals information in stages', () => {
    const spot = createTestSpot()

    expect(revealedFields(spot, 0)).toEqual([])
    expect(revealedFields(spot, 20)).toEqual(['main_species'])
    expect(revealedFields(spot, 45)).toEqual(['main_species', 'time_pattern'])
  })

  it('maps scores to tiers', () => {
    expect(knowledgeTierFor(0).tier).toBe(0)
    expect(knowledgeTierFor(25).tier).toBe(1)
    expect(knowledgeTierFor(85).tier).toBe(4)
  })

  it('tracks region knowledge separately', () => {
    let knowledge = emptyKnowledgeState()
    knowledge = addRegionKnowledge(knowledge, 'test-region', 5)
    knowledge = addSpotKnowledge(knowledge, 'test-spot', 30)

    expect(regionKnowledgeScore(knowledge, 'test-region')).toBe(5)
    expect(spotKnowledgeScore(knowledge, 'test-spot')).toBe(30)
    expect(regionKnowledgeScore(knowledge, 'other-region')).toBe(0)
  })
})
