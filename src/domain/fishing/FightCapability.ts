import type {
  HookDefinition,
  LeaderDefinition,
  LineDefinition,
  ReelDefinition,
  RodDefinition,
} from '../gear/Gear'
import { resolveEffectiveLineCapacityM } from '../tackle/lineCapacity'

/**
 * Fight Capability（Phase 18A）。
 *
 * 解決済みタックルから「ファイトで実際に効く能力」を導出する。
 * **Save しない**派生値。Gear の具体 ID ・ブランドは見ない。
 *
 * 強さの権威（maxTensionMultiplier → effectiveMaxTension）は既存のまま。
 * ここは「Big Game で問われる物理量」を 1 か所に集めた診断値であり、
 * 並行する別の強さモデルではない。Battle 側が参照するのは
 * tensionMarginMultiplier（weak link 由来の余裕削り）だけで、
 * 残りは Readiness / 将来の物理ライン管理の入力になる。
 */

export const WEAK_LINK_COMPONENTS = ['line', 'leader', 'hook'] as const
export type WeakLinkComponent = (typeof WEAK_LINK_COMPONENTS)[number]

export const WEAK_LINK_LABELS: Readonly<Record<WeakLinkComponent, string>> = {
  line: 'ライン',
  leader: 'リーダー',
  hook: 'フック',
}

export type FightCapability = {
  /** 実効ライン容量（共有 resolver 由来）。不明なら null。 */
  readonly effectiveLineCapacityM: number | null
  /** ファイト中に「残したい」警告帯として扱うライン量（m）。 */
  readonly reserveLineM: number
  readonly lineStrengthKg: number
  /** リーダー無しなら null。 */
  readonly leaderStrengthKg: number | null
  readonly hookStrengthKg: number
  /** リーダーの耐摩耗性。リーダー無しならラインの値を使う。 */
  readonly leaderAbrasionResistance: number
  /** リールの最大ドラグ（kg）。 */
  readonly dragCapacityKg: number
  /** 巻き上げ能力（0〜1）。トルク・巻取長・操作感から。 */
  readonly retrievePower: number
  /** ロッドの主導権（0〜1）。fightingPower 主体。 */
  readonly rodControl: number
  /** タックルの最弱点。 */
  readonly weakLink: WeakLinkComponent
  readonly weakLinkStrengthKg: number
  /**
   * weak link がラインより弱いときのテンション余裕の削り（0.7〜1）。
   * バランスの取れた構成では 1（Phase 17 と同じ挙動）。
   */
  readonly tensionMarginMultiplier: number
}

export type FightCapabilityTuning = {
  /** ファイト中に残したいライン量の割合（容量の 10%）。 */
  readonly reserveRatioOfCapacity: number
  readonly reserveMinM: number
  readonly reserveMaxM: number
  /** weak link がラインより弱いときに削れる最大 margin。 */
  readonly weakLinkMarginFloor: number
  /** 巻取長（cm/回転）を 0〜1 へ写すレンジ。 */
  readonly retrieveCmRange: { readonly min: number; readonly max: number }
}

/** PROVISIONAL gameplay tuning。 */
export const DEFAULT_FIGHT_CAPABILITY_TUNING: FightCapabilityTuning = {
  reserveRatioOfCapacity: 0.1,
  reserveMinM: 15,
  reserveMaxM: 40,
  weakLinkMarginFloor: 0.7,
  retrieveCmRange: { min: 45, max: 115 },
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
const clamp01 = (value: number): number => clamp(value, 0, 1)

export const resolveFightCapability = (input: {
  readonly rod: RodDefinition
  readonly reel: ReelDefinition
  readonly line: LineDefinition
  readonly leader: LeaderDefinition | null
  readonly hook: HookDefinition
  readonly tuning?: FightCapabilityTuning
}): FightCapability => {
  const tuning = input.tuning ?? DEFAULT_FIGHT_CAPABILITY_TUNING
  const { rod, reel, line, leader, hook } = input

  const effectiveLineCapacityM = resolveEffectiveLineCapacityM(reel, line)
  const reserveLineM =
    effectiveLineCapacityM === null
      ? tuning.reserveMinM
      : Math.round(
          clamp(
            effectiveLineCapacityM * tuning.reserveRatioOfCapacity,
            tuning.reserveMinM,
            tuning.reserveMaxM,
          ),
        )

  /*
   * Weak link: ライン・リーダー・フックの最小強度。
   * ロッド / リールは破断部品ではないため候補に入れない
   * （それらは control / drag として別途効く）。
   * リーダー無しなら「ラインとフック」のみで判定する。
   */
  const candidates: readonly { readonly component: WeakLinkComponent; readonly kg: number }[] = [
    { component: 'line', kg: line.strengthKg },
    ...(leader === null ? [] : [{ component: 'leader' as const, kg: leader.strengthKg }]),
    { component: 'hook', kg: hook.strengthKg },
  ]
  const weakest = candidates.reduce((a, b) => (b.kg < a.kg ? b : a))

  /*
   * weak link がラインより弱いほど、実効テンションの上限を下げる。
   * ラインが最弱点なら 1（既存のライン強度モデルが既に効いている）。
   * 「load > 28kg で即断」のような硬い閾値にはしない（余裕を削るだけ）。
   */
  const weakRatio = clamp01(weakest.kg / Math.max(0.1, line.strengthKg))
  const tensionMarginMultiplier =
    weakest.component === 'line'
      ? 1
      : tuning.weakLinkMarginFloor + (1 - tuning.weakLinkMarginFloor) * weakRatio

  const retrievePower = clamp01(
    0.45 * (reel.windingTorque ?? 0.5) +
      0.35 *
        clamp01(
          (reel.retrieveCmPerTurn - tuning.retrieveCmRange.min) /
            Math.max(1, tuning.retrieveCmRange.max - tuning.retrieveCmRange.min),
        ) +
      0.2 * reel.control,
  )

  return {
    effectiveLineCapacityM,
    reserveLineM,
    lineStrengthKg: line.strengthKg,
    leaderStrengthKg: leader === null ? null : leader.strengthKg,
    hookStrengthKg: hook.strengthKg,
    leaderAbrasionResistance: leader === null ? line.abrasionResistance : leader.abrasionResistance,
    dragCapacityKg: reel.maxDragKg,
    retrievePower,
    rodControl: clamp01(0.6 * rod.fightingPower + 0.4 * rod.control),
    weakLink: weakest.component,
    weakLinkStrengthKg: weakest.kg,
    tensionMarginMultiplier,
  }
}
