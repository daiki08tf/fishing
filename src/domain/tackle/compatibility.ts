import type { FishSpecies } from '../fish/FishSpecies'
import type { FishingMethod } from '../method/FishingMethod'
import { methodAcceptsOffering } from '../method/FishingMethod'
import {
  hookSizeRank,
  isHook,
  isLeader,
  isLine,
  isReel,
  isRod,
  type GearItem,
  type HookDefinition,
  type LeaderDefinition,
  type LineDefinition,
  type OfferingDefinition,
  type ReelDefinition,
  type RodDefinition,
} from '../gear/Gear'
import type { Loadout } from './Loadout'

/**
 * タックルの互換性。独立した Domain として扱う。
 *
 * 重要（Phase 6）:
 * **完全に理想でない組み合わせを装備禁止にしない。** 現実でも多少外れた構成は使える。
 * fatal / warning / suboptimal / good / excellent を区別し、
 * 致命的なもの（ロッドの限界を大きく超えるルアーなど）だけを拒否する。
 */

export const COMPATIBILITY_LEVELS = ['fatal', 'warning', 'suboptimal', 'good', 'excellent'] as const
export type CompatibilityLevel = (typeof COMPATIBILITY_LEVELS)[number]

export const COMPATIBILITY_LABELS: Readonly<Record<CompatibilityLevel, string>> = {
  fatal: '使用不可',
  warning: '注意',
  suboptimal: 'やや不利',
  good: '相性良好',
  excellent: '最適',
}

export type CompatibilityIssue = {
  readonly level: CompatibilityLevel
  readonly message: string
}

export type CompatibilityReport = {
  /** 最も重い問題のレベル。 */
  readonly level: CompatibilityLevel
  /** 0〜1.5 の総合評価（UI と Encounter に使う）。 */
  readonly score: number
  readonly issues: readonly CompatibilityIssue[]
  /** 装備できない組み合わせ。 */
  readonly fatal: boolean
}

type Resolved = {
  readonly rod: RodDefinition
  readonly reel: ReelDefinition
  readonly line: LineDefinition
  readonly leader: LeaderDefinition | null
  readonly hook: HookDefinition
  readonly offering: OfferingDefinition
}

export const resolveGearForLoadout = (
  loadout: Loadout,
  gear: readonly GearItem[],
): Resolved | null => {
  const rod = gear.find((item) => item.id === loadout.rodId)
  const reel = gear.find((item) => item.id === loadout.reelId)
  const line = gear.find((item) => item.id === loadout.lineId)
  const leader =
    loadout.leaderId === null ? null : gear.find((item) => item.id === loadout.leaderId)
  const hook = gear.find((item) => item.id === loadout.hookId)
  const offering = gear.find((item) => item.id === loadout.offeringId)

  if (
    rod === undefined ||
    reel === undefined ||
    line === undefined ||
    hook === undefined ||
    offering === undefined ||
    (loadout.leaderId !== null && leader === undefined)
  ) {
    return null
  }

  if (!isRod(rod) || !isReel(reel) || !isLine(line) || !isHook(hook)) {
    return null
  }

  if (offering.category !== 'lure' && offering.category !== 'bait') {
    return null
  }

  if (leader !== undefined && leader !== null && !isLeader(leader)) {
    return null
  }

  return {
    rod,
    reel,
    line,
    leader: leader === undefined || leader === null ? null : leader,
    hook,
    offering,
  }
}

const worstLevel = (issues: readonly CompatibilityIssue[]): CompatibilityLevel => {
  const order = ['fatal', 'warning', 'suboptimal', 'good', 'excellent'] as const

  for (const level of order) {
    if (issues.some((issue) => issue.level === level)) {
      return level
    }
  }

  return 'good'
}

const scoreOf = (issues: readonly CompatibilityIssue[]): number => {
  let score = 1

  for (const issue of issues) {
    switch (issue.level) {
      case 'fatal':
        return 0
      case 'warning':
        score -= 0.2
        break
      case 'suboptimal':
        score -= 0.1
        break
      case 'excellent':
        score += 0.15
        break
      default:
        break
    }
  }

  return Math.min(1.5, Math.max(0, score))
}

export const evaluateCompatibility = (options: {
  readonly loadout: Loadout
  readonly gear: readonly GearItem[]
  readonly method: FishingMethod
  readonly species?: FishSpecies
}): CompatibilityReport => {
  const resolved = resolveGearForLoadout(options.loadout, options.gear)
  const issues: CompatibilityIssue[] = []

  if (resolved === null) {
    return {
      level: 'fatal',
      score: 0,
      fatal: true,
      issues: [{ level: 'fatal', message: '装備が揃っていない' }],
    }
  }

  const { rod, reel, line, leader, hook, offering } = resolved

  // 釣法 × offering
  if (!methodAcceptsOffering(options.method, offering)) {
    issues.push({
      level: 'fatal',
      message: `${options.method.name} では ${offering.name} を使えない`,
    })
  }

  // ロッド × ルアー重量
  if (offering.category === 'lure') {
    const weight = offering.weightG

    if (weight > rod.maxLureWeightG * 1.3) {
      issues.push({
        level: 'fatal',
        message: `${offering.name}（${String(weight)}g）はロッドの上限（${String(
          rod.maxLureWeightG,
        )}g）を大きく超えている`,
      })
    } else if (weight > rod.maxLureWeightG) {
      issues.push({
        level: 'warning',
        message: `${offering.name} はロッドの推奨重量より重い（無理に振ると危険）`,
      })
    } else if (weight < rod.minLureWeightG * 0.5) {
      issues.push({
        level: 'warning',
        message: `${offering.name} はロッドに対して軽すぎる（飛距離が出しにくい）`,
      })
    } else if (weight < rod.minLureWeightG) {
      issues.push({
        level: 'suboptimal',
        message: `${offering.name} はロッドの推奨重量をやや下回る`,
      })
    } else {
      issues.push({ level: 'excellent', message: 'ルアー重量がロッドの推奨域に収まっている' })
    }
  }

  // ロッド推奨ライン × ライン強度
  if (line.strengthKg > rod.recommendedLineMaxKg * 1.5) {
    issues.push({
      level: 'warning',
      message: `${line.name} はロッドの推奨ラインよりかなり強い`,
    })
  } else if (line.strengthKg < rod.recommendedLineMinKg * 0.6) {
    issues.push({
      level: 'warning',
      message: `${line.name} はロッドの推奨ラインよりかなり細い`,
    })
  }

  // リールのドラッグ × ライン強度
  if (line.strengthKg > reel.maxDragKg * 2) {
    issues.push({
      level: 'warning',
      message: `リールのドラッグ性能に対してラインが強すぎる（ラインの強さを使い切れない）`,
    })
  } else if (reel.maxDragKg > line.strengthKg * 1.5) {
    issues.push({
      level: 'warning',
      message: `ラインに対してドラッグが強すぎる（高設定にすると切れやすい）`,
    })
  }

  // リールの糸巻き量 × ラインの太さ
  const thickest = reel.lineCapacity.reduce((max, entry) => Math.max(max, entry.lineStrengthKg), 0)
  /*
   * 「このリールに対して太い」の判定。
   * 絶対値（0.3mm など）で見ると大型番手の太糸まで警告になってしまうため、
   * リールの定格（巻ける最も強いライン）から見た相対で判断する。
   */
  const ratedDiameterMm = 0.1 + thickest * 0.03

  if (line.strengthKg > thickest * 1.2 || line.diameterMm > ratedDiameterMm * 1.25) {
    issues.push({
      level: 'warning',
      message: `${line.name} はこのリールには太い（巻ける長さが減る）`,
    })
  }

  // リーダー
  if (leader !== null) {
    if (leader.strengthKg < line.strengthKg * 0.6) {
      issues.push({
        level: 'warning',
        message: 'リーダーがラインより弱い（リーダーから切れる）',
      })
    } else if (leader.abrasionResistance >= 0.75) {
      issues.push({ level: 'excellent', message: 'リーダーの耐摩耗性が高い（根ズレに強い）' })
    }
  }

  // フック × 対象魚（サイズが分かっているときだけ）
  const meanLength = options.species?.lengthModel
    ? 'meanCm' in options.species.lengthModel
      ? options.species.lengthModel.meanCm
      : options.species.lengthModel.medianCm
    : null

  if (meanLength !== null) {
    /*
     * フックの大小は hookSizeRank で見る（大きいほど大きい針）。
     * 大型向けの魚に小さい針では伸ばされ、小型の魚に大きい針では吸い込まない。
     */
    const rank = hookSizeRank(hook)

    if (meanLength >= 40 && rank <= -4) {
      issues.push({
        level: 'warning',
        message: `大型向けの魚に対してフックが小さい（伸ばされやすい）`,
      })
    } else if (meanLength <= 20 && rank > -2) {
      issues.push({
        level: 'warning',
        message: `小型の魚に対してフックが大きすぎる（吸い込まない）`,
      })
    }
  }

  const level = worstLevel(issues)

  return { level, score: scoreOf(issues), fatal: level === 'fatal', issues }
}
