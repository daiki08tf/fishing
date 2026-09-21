/**
 * Domain が乱数にアクセスするための唯一の窓口。
 *
 * 設計方針（ARCHITECTURE.md §10 / DATA_MODEL.md §16）:
 * - Domain 内に Math.random() を散在させない。
 * - テストでは固定 Seed を使い、同じ Seed から同じ結果を再現できるようにする。
 * - UI コンポーネントから直接乱数を生成しない。
 *
 * 暗号学的強度は不要。ゲームプレイ用のシミュレーション乱数である。
 */
export interface RandomSource {
  /** [0, 1) の一様乱数。 */
  next(): number

  /** [minInclusive, maxInclusive] の整数。 */
  int(minInclusive: number, maxInclusive: number): number

  /** 配列から一様に1件選ぶ。空配列はエラー。 */
  pick<T>(items: readonly T[]): T
}
