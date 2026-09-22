import type { CurrentProfile } from '../fish/profiles'

/**
 * Drift（Phase 17B）。
 *
 * 詳細な流向・流速ベクトル物理は作らない。既存の Spot.current
 * （CurrentProfile.preference）から、深場の狙いにどれだけ影響するかだけを
 * 3 段階の抽象値に落とす。Region ID では分岐しない。
 */
export const DRIFT_STRENGTHS = ['slow', 'moderate', 'fast'] as const
export type DriftStrength = (typeof DRIFT_STRENGTHS)[number]

export const DRIFT_STRENGTH_LABELS: Readonly<Record<DriftStrength, string>> = {
  slow: '穏やか',
  moderate: '流れあり',
  fast: '速い',
}

/**
 * `Spot.current`（省略可）から Drift の強さを derive する。
 * 省略時（潮流データが無い Spot）は 'slow' として扱う。
 */
export const resolveDriftStrength = (current: CurrentProfile | undefined): DriftStrength => {
  if (current === undefined) {
    return 'slow'
  }

  switch (current.preference) {
    case 'none':
    case 'slow':
      return 'slow'
    case 'moderate':
    case 'any':
      return 'moderate'
    case 'strong':
      return 'fast'
    default:
      return 'slow'
  }
}
