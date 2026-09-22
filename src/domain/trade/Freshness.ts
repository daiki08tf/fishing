import { toMinutes, type WorldTime } from '../world/WorldTime'

/**
 * 鮮度（Phase 13）。
 *
 * 冷蔵庫・氷・クーラーボックスの詳細な耐久管理は作らない（Phase 13 の非目標）。
 * `caughtAt` + 現在の WorldTime + storage modifier から deterministic に解決する
 * （mutable な counter を毎 tick 保存しない）。
 *
 * 時間経過で即ゴミになる punitive design にはしない（floor を設ける）。
 */

export const FRESHNESS_FLOOR = 0.5
const DECAY_PER_HOUR = 0.01

/** Phase 13 では固定 1.0（将来、氷 / クーラーボックスで変える余地を残す）。 */
export const DEFAULT_STORAGE_MODIFIER = 1.0

export const resolveFreshness = (
  caughtAt: WorldTime,
  now: WorldTime,
  storageModifier: number = DEFAULT_STORAGE_MODIFIER,
): number => {
  const elapsedHours = Math.max(0, (toMinutes(now) - toMinutes(caughtAt)) / 60) * storageModifier
  const freshness = 1 - elapsedHours * DECAY_PER_HOUR

  return Math.min(1, Math.max(FRESHNESS_FLOOR, freshness))
}
