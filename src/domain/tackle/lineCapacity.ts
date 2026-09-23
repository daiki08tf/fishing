import type { LineDefinition, ReelDefinition } from '../gear/Gear'

/**
 * 実効ライン容量（m）の共有 resolver（Phase 18A）。
 *
 * 「今の Reel に今の Line を巻いたとき、実際に何 m 使えるか」を
 * ただ 1 か所で解決する。Depth（到達水深の上限）と Fight（スプール残量）は
 * どちらもこの値を使い、別々の容量ロジックを持たない。
 *
 * 方式: Reel.lineCapacity の中から「選択した Line の強度（kg）に最も近い
 * エントリ」の容量を採用する（Phase 17 まで Casting / DepthCapability が
 * それぞれ持っていた `closestLineCapacityM` と同じ semantics）。
 *
 * 容量テーブルが無い／合うエントリが無い場合は null を返す。
 * null は「無限」ではなく「不明」なので、呼び出し側で上限扱いしない。
 */
export const resolveEffectiveLineCapacityM = (
  reel: ReelDefinition,
  line: LineDefinition,
): number | null => {
  let best: { readonly delta: number; readonly capacityM: number } | null = null

  for (const entry of reel.lineCapacity) {
    const delta = Math.abs(entry.lineStrengthKg - line.strengthKg)

    if (best === null || delta < best.delta) {
      best = { delta, capacityM: entry.capacityM }
    }
  }

  return best === null ? null : best.capacityM
}
