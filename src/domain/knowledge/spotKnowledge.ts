import type { FishingSpot } from '../world/FishingSpot'
import type { KnowledgeState } from './KnowledgeState'

/**
 * Spot ごとの Knowledge（GAME_DESIGN.md §10 / PROGRESSION.md §11）。
 *
 * - 0〜100 の内部値。UI では割合として見せる。
 * - 釣行、観察、初訪問で増える。**ボウズでも増える**（完全な無駄にしない）。
 * - 増えると Spot の情報が段階的に開示される。
 */

export const KNOWLEDGE_MIN = 0
export const KNOWLEDGE_MAX = 100

export const spotKnowledgeScore = (state: KnowledgeState, spotId: string): number =>
  state.spots[spotId] ?? KNOWLEDGE_MIN

/** Spot の Knowledge を加算する（上限で頭打ち）。 */
export const addSpotKnowledge = (
  state: KnowledgeState,
  spotId: string,
  amount: number,
): KnowledgeState => {
  if (amount <= 0) {
    return state
  }

  const current = spotKnowledgeScore(state, spotId)
  const next = Math.min(KNOWLEDGE_MAX, current + amount)

  if (next === current) {
    return state
  }

  return { ...state, spots: { ...state.spots, [spotId]: next } }
}

/**
 * 現在の Knowledge で見えている情報。
 * Spot の knowledgeConfig に「どの項目が何%から見えるか」を書いておく。
 */
export const revealedFields = (spot: FishingSpot, score: number): readonly string[] =>
  spot.knowledgeConfig.reveals
    .filter((reveal) => score >= reveal.minKnowledge)
    .map((reveal) => reveal.field)

export type KnowledgeTier = {
  readonly tier: number
  readonly label: string
  readonly minKnowledge: number
}

/**
 * 段階表示のための区分（PROVISIONAL）。
 * GAME_DESIGN.md §10 の「Knowledgeが増えると表示される情報」に対応する。
 */
export const KNOWLEDGE_TIERS: readonly KnowledgeTier[] = [
  { tier: 0, label: 'ほとんど分からない', minKnowledge: 0 },
  { tier: 1, label: '魚種の一部が分かる', minKnowledge: 20 },
  { tier: 2, label: '時間帯の傾向が分かる', minKnowledge: 40 },
  { tier: 3, label: '地形・ベイトが分かる', minKnowledge: 60 },
  { tier: 4, label: '季節パターンまで分かる', minKnowledge: 80 },
]

export const knowledgeTierFor = (score: number): KnowledgeTier => {
  let current = KNOWLEDGE_TIERS[0] as KnowledgeTier

  for (const tier of KNOWLEDGE_TIERS) {
    if (score >= tier.minKnowledge) {
      current = tier
    }
  }

  return current
}

/** 人間向けの表現。例: 「18%」 */
export const formatKnowledge = (score: number): string => `${String(Math.round(score))}%`
