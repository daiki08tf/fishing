/**
 * Knowledge の保持単位。DATA_MODEL.md §12 に対応する。
 *
 * 内部値は 0〜100 等のスコアでよいが、UI で数値をそのまま見せる必要はない。
 * ボウズでも Knowledge は蓄積する（GAME_DESIGN.md §10）。
 */
export type KnowledgeState = {
  readonly fish: Readonly<Record<string, number>>
  readonly spots: Readonly<Record<string, number>>
  readonly regions: Readonly<Record<string, number>>
  readonly methods: Readonly<Record<string, number>>
}
