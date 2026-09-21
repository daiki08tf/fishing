import type { GearTuning } from '../gear/GearTuning'

/**
 * フックサイズと魚の大きさの適合（Phase 9 / 9.1）。
 *
 * `hookSizeRank` は「大きい針ほど大きい値」。魚の大きさから期待される rank を
 * テーブル補間で求め、ズレ（gap）を数値へ写す。具体 ID では分岐しない。
 *
 * 値は PROVISIONAL（ゲーム調整値）。
 */

const EXPECTED_HOOK_RANK: readonly { readonly cm: number; readonly rank: number }[] = [
  { cm: 15, rank: -9 },
  { cm: 25, rank: -6 },
  { cm: 40, rank: -1 },
  { cm: 60, rank: 3 },
  { cm: 90, rank: 6 },
  { cm: 120, rank: 9 },
]

export const expectedHookRankFor = (medianCm: number): number => {
  const first = EXPECTED_HOOK_RANK[0] as { readonly cm: number; readonly rank: number }
  const last = EXPECTED_HOOK_RANK[EXPECTED_HOOK_RANK.length - 1] as {
    readonly cm: number
    readonly rank: number
  }

  if (medianCm <= first.cm) {
    return first.rank
  }

  if (medianCm >= last.cm) {
    return last.rank
  }

  for (let index = 0; index < EXPECTED_HOOK_RANK.length - 1; index += 1) {
    const left = EXPECTED_HOOK_RANK[index] as { readonly cm: number; readonly rank: number }
    const right = EXPECTED_HOOK_RANK[index + 1] as { readonly cm: number; readonly rank: number }

    if (medianCm >= left.cm && medianCm <= right.cm) {
      const ratio = (medianCm - left.cm) / (right.cm - left.cm)
      return left.rank + (right.rank - left.rank) * ratio
    }
  }

  return last.rank
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export type HookSizeFit = {
  /** rank のズレ（正 = 魚に対して大きすぎる / 負 = 小さすぎる）。 */
  readonly gap: number
  /** 掛かり（アワセ猶予）への加算値。0 が標準。 */
  readonly success: number
  /** アワセ猶予の倍率。 */
  readonly hookWindow: number
  /** 保持（糸が緩んでも外れにくい）の倍率。 */
  readonly holding: number
  /** 物理的に口へ入らないレベル（Bite / Hook = 0 を許可する唯一の条件）。 */
  readonly impossible: boolean
}

/**
 * フックの物理適合。
 *
 * - 大きすぎる針は掛かり・保持を落とし、口に入らないレベルなら impossible
 * - 小さすぎる針も保持は落ちるが、impossible にはしない（大魚 × 小針は可能）
 */
export const hookSizeFitFor = (input: {
  readonly hookRank: number
  readonly medianCm: number
  readonly tuning: GearTuning
}): HookSizeFit => {
  const gap = input.hookRank - expectedHookRankFor(input.medianCm)
  const oversized = Math.max(0, gap - 2)
  const undersized = Math.max(0, -gap - 2)
  const oversizeSeverity = clamp(oversized / 12, 0, 1)
  const undersizeSeverity = clamp(undersized / 12, 0, 1)
  const impossible = gap > input.tuning.hookSizeImpossibleGap

  return {
    gap,
    success:
      -input.tuning.hookSizeMismatchStrength * oversizeSeverity -
      input.tuning.hookUndersizeStrength * undersizeSeverity,
    hookWindow: clamp(
      1 -
        input.tuning.hookSizeMismatchWindowStrength * oversizeSeverity -
        input.tuning.hookUndersizeWindowStrength * undersizeSeverity,
      0.55,
      1,
    ),
    holding: clamp(
      1 -
        input.tuning.hookSizeMismatchHoldingStrength * oversizeSeverity -
        input.tuning.hookUndersizeHoldingStrength * undersizeSeverity,
      0.4,
      1,
    ),
    impossible,
  }
}
