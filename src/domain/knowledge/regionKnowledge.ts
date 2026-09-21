import type { KnowledgeState } from './KnowledgeState'
import { KNOWLEDGE_MAX } from './spotKnowledge'

/**
 * Region ごとの Knowledge（DATA_MODEL.md §12 の regions）。
 *
 * Spot ごとの Knowledge とは別に、その水域に通うほど地域の勘が働く。
 * アクセス条件（`{ kind: 'knowledge', scope: 'region' }`）で使う。
 */

export const regionKnowledgeScore = (state: KnowledgeState, regionId: string): number =>
  state.regions[regionId] ?? 0

export const addRegionKnowledge = (
  state: KnowledgeState,
  regionId: string,
  amount: number,
): KnowledgeState => {
  if (amount <= 0) {
    return state
  }

  const current = regionKnowledgeScore(state, regionId)
  const next = Math.min(KNOWLEDGE_MAX, current + amount)

  if (next === current) {
    return state
  }

  return { ...state, regions: { ...state.regions, [regionId]: next } }
}
