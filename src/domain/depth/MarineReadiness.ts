import type { FishingPlatform } from './FishingPlatform'
import type { SeaState } from './SeaState'

export type MarineReadinessResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * Marine Readiness（Phase 17A）。
 *
 * AccessEngine（物理的・制度的に Spot へ行けるか）とは別の軸として保つ:
 * 「今日の海況が、このプラットフォームにとって妥当か」。
 * 実際の海事安全基準・法令ではなく、ゲーム上の抽象的な目安（PROVISIONAL）。
 * Transport ID では分岐せず、既に capability から導出済みの FishingPlatform だけを見る。
 */
export const resolveMarineReadiness = (
  platform: FishingPlatform,
  seaState: SeaState,
): MarineReadinessResult => {
  if (platform === 'shore') {
    return { ok: true }
  }

  if (platform === 'kayak' && seaState !== 'calm') {
    return { ok: false, reason: '海況が穏やかでないため、カヤックでの出艇を見合わせたほうがよい' }
  }

  if (platform === 'nearshore_boat' && seaState === 'rough') {
    return { ok: false, reason: '海況が荒れており、この船では出るのが厳しい' }
  }

  return { ok: true }
}
