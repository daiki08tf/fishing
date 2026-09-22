import type { MarineReadinessResult } from '../../domain/depth'

/**
 * CAST（内部的には vertical / drift / troll も含む「投入」コマンド）を
 * 今始められるかどうかの唯一の authority（Phase 17 Final Fix）。
 *
 * MarineReadiness は以前から計算・表示だけされていて、実際のゲームプレイに
 * 効いていなかった（bug）。ここへ一本化し、`useFishingSession` の `send`
 * （dispatch のガード）と `FishingScreen` の CAST ボタンの `disabled` の両方が
 * 同じ結果を見るようにする — 有効なのに押しても何も起きないボタンを作らない。
 *
 * AccessEngine（Spot へ物理的・制度的に行けるか）とは別の軸のまま保つ:
 * ここは「今日の海況がこの Platform に妥当か」だけを見る。
 */
export const resolveCanCast = (input: {
  readonly methodPlatformOk: boolean
  readonly marineReadiness: MarineReadinessResult | null
  readonly isDepthTargetZone: boolean
  readonly resolvedCast: { readonly reachable: boolean } | null
  readonly resolvedDeployment: { readonly reachable: boolean } | null
}): boolean => {
  const marineReadinessOk = input.marineReadiness === null || input.marineReadiness.ok
  const reachable = input.isDepthTargetZone
    ? input.resolvedDeployment?.reachable === true
    : input.resolvedCast?.reachable === true

  return input.methodPlatformOk && marineReadinessOk && reachable
}
