/**
 * 個体差としての Trait。DATA_MODEL.md §4 の初期候補。
 *
 * ファンタジー能力ではなく、現実の個体差として説明できるものに限定する（GAME_DESIGN.md §6）。
 */
export const FISH_TRAITS = [
  'trophy',
  'old',
  'strong_runner',
  'heavy',
  'scarred',
  'aggressive',
] as const

export type FishTrait = (typeof FISH_TRAITS)[number]
