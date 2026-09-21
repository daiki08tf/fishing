/**
 * プレイヤーの技量がファイトへ与える倍率。
 *
 * FishingEngine は Skill や Level を知らない。
 * 上位の Domain（Progression）が解決したこの値だけを受け取る。
 * これにより、Skill や Perk が増えても Engine は変わらない。
 *
 * 倍率はすべて 1.0 が「効果なし」。
 * 例外は hookSuccessModifier で、これは 0 が「効果なし」の加算値。
 */

export const FISHING_MODIFIER_KEYS = [
  'reelEfficiencyMultiplier',
  'tensionGainMultiplier',
  'giveEfficiencyMultiplier',
  'hookWindowMultiplier',
  'hookSuccessModifier',
  'castingPrecisionMultiplier',
  'landingStabilityMultiplier',
  'detectionClarityMultiplier',
  'riggingEfficiencyMultiplier',
  /** ライン・ロッドが耐えられるテンションの倍率。 */
  'maxTensionMultiplier',
  /** フックの保持力（糸が緩んでも外れにくい）。 */
  'slackToleranceMultiplier',
] as const

export type FishingModifierKey = (typeof FISHING_MODIFIER_KEYS)[number]

export type PlayerFishingModifiers = {
  readonly [Key in FishingModifierKey]: number
}

/** 倍率ではなく加算で扱うキー。 */
export const ADDITIVE_MODIFIER_KEYS: readonly FishingModifierKey[] = ['hookSuccessModifier']

export const NEUTRAL_FISHING_MODIFIERS: PlayerFishingModifiers = {
  reelEfficiencyMultiplier: 1,
  tensionGainMultiplier: 1,
  giveEfficiencyMultiplier: 1,
  hookWindowMultiplier: 1,
  hookSuccessModifier: 0,
  castingPrecisionMultiplier: 1,
  landingStabilityMultiplier: 1,
  detectionClarityMultiplier: 1,
  riggingEfficiencyMultiplier: 1,
  maxTensionMultiplier: 1,
  slackToleranceMultiplier: 1,
}
