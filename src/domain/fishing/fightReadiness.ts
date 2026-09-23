import { resolveFightChallenge, type FightChallenge } from './fightChallenge'
import { WEAK_LINK_LABELS, type FightCapability } from './FightCapability'
import type { FightDemand } from './FightDemand'

/**
 * Fight Readiness（Phase 18C）。
 *
 * 「大型魚に挑む準備ができているか」を FightCapability vs FightDemand
 * （または汎用の reference demand）から derive する表示用ビュー。
 * Save しない。別のレーティング系統は作らない — すべて
 * capability / demand の既存の物理量から評価する。
 *
 * Knowledge masking: `revealExpectation === false` のときはチャレンジ帯
 * （「どれくらい厳しいか」の見通し）を隠し、汎用の警告だけを返す。
 * まだ知らない魚・水域の具体的な要求を漏らさない。
 */

export const READINESS_MARKS = ['ok', 'fair', 'poor'] as const
export type ReadinessMark = (typeof READINESS_MARKS)[number]

export const READINESS_MARK_SYMBOLS: Readonly<Record<ReadinessMark, string>> = {
  ok: '○',
  fair: '△',
  poor: '×',
}

export const READINESS_ASPECTS = [
  'line_capacity',
  'drag',
  'retrieve',
  'weak_link',
  'abrasion',
] as const
export type ReadinessAspect = (typeof READINESS_ASPECTS)[number]

export const READINESS_ASPECT_LABELS: Readonly<Record<ReadinessAspect, string>> = {
  line_capacity: 'ライン容量',
  drag: 'ドラグ',
  retrieve: '巻き上げ',
  weak_link: '最弱点',
  abrasion: '耐摩耗',
}

/**
 * PROVISIONAL: 「本格的な大型魚」の代表 demandKg。
 * 特定の魚種ではなく「40kg 級の強い走る魚」相当の汎用参照。
 */
export const BIG_GAME_REFERENCE_DEMAND_KG = 36

export type FightReadiness = {
  readonly marks: Readonly<Record<ReadinessAspect, ReadinessMark>>
  /** 各項目の説明値（表示用に整形済み）。 */
  readonly details: Readonly<Record<ReadinessAspect, string>>
  /** revealExpectation === false なら null（見通しを隠す）。 */
  readonly challenge: FightChallenge | null
  /** 見通しを隠しているか。 */
  readonly masked: boolean
  /** 汎用の警告・評価。魚種名は出さない。 */
  readonly notes: readonly string[]
}

export const resolveFightReadiness = (input: {
  readonly capability: FightCapability
  /** 具体的な需要（掛かった魚）。無ければ reference demand で評価する。 */
  readonly demand?: FightDemand | null
  /** demand が無いときの参照負荷（kg）。 */
  readonly referenceDemandKg?: number
  /** 狙う水深 / 距離（m）。分かれば必要ライン量の精度が上がる。 */
  readonly expectedLineOutM?: number
  /**
   * Knowledge masking: false なら「どれくらい厳しいか」の見通しを隠す。
   * （大型魚の経験・水域の Knowledge が浅いとき）。
   */
  readonly revealExpectation?: boolean
}): FightReadiness => {
  const capability = input.capability
  const demandKg = input.demand?.demandKg ?? input.referenceDemandKg ?? BIG_GAME_REFERENCE_DEMAND_KG
  const masked = input.revealExpectation === false

  /*
   * 必要ライン量の推定: 初期 line-out + 走りで出る余裕分。
   * runPotential が高い魚ほど余裕が要る（demand 不明なら保守的に 0.75）。
   */
  const runPotential = input.demand?.runPotential ?? 0.75
  const neededLineM = (input.expectedLineOutM ?? 60) + 60 + 160 * runPotential

  const lineCapacityMark: ReadinessMark =
    capability.effectiveLineCapacityM === null
      ? 'fair'
      : capability.effectiveLineCapacityM >= neededLineM * 1.2
        ? 'ok'
        : capability.effectiveLineCapacityM >= neededLineM
          ? 'fair'
          : 'poor'

  const dragMark: ReadinessMark =
    capability.dragCapacityKg >= demandKg * 0.5
      ? 'ok'
      : capability.dragCapacityKg >= demandKg * 0.3
        ? 'fair'
        : 'poor'

  const retrieveMark: ReadinessMark =
    capability.retrievePower >= 0.65 ? 'ok' : capability.retrievePower >= 0.45 ? 'fair' : 'poor'

  const weakLinkMark: ReadinessMark =
    capability.weakLinkStrengthKg >= demandKg
      ? 'ok'
      : capability.weakLinkStrengthKg >= demandKg * 0.5
        ? 'fair'
        : 'poor'

  const abrasionMark: ReadinessMark =
    capability.leaderAbrasionResistance >= 0.6
      ? 'ok'
      : capability.leaderAbrasionResistance >= 0.35
        ? 'fair'
        : 'poor'

  const marks: Readonly<Record<ReadinessAspect, ReadinessMark>> = {
    line_capacity: lineCapacityMark,
    drag: dragMark,
    retrieve: retrieveMark,
    weak_link: weakLinkMark,
    abrasion: abrasionMark,
  }

  const details: Readonly<Record<ReadinessAspect, string>> = {
    line_capacity:
      capability.effectiveLineCapacityM === null
        ? '容量不明'
        : `${String(capability.effectiveLineCapacityM)}m`,
    drag: `${String(capability.dragCapacityKg)}kg`,
    retrieve: `${String(Math.round(capability.retrievePower * 100))}%`,
    weak_link: `${WEAK_LINK_LABELS[capability.weakLink]}（${String(capability.weakLinkStrengthKg)}kg）`,
    abrasion: `${String(Math.round(capability.leaderAbrasionResistance * 100))}%`,
  }

  const challenge = resolveFightChallenge(
    {
      massLoad: 0,
      burstLoad: 0,
      enduranceLoad: 0,
      runPotential,
      divePressure: 0,
      demandKg,
      total: 0,
    },
    capability,
  )

  const notes: string[] = []
  if (marks.line_capacity === 'poor') {
    notes.push('大型魚への備え: ライン容量が少ない')
  }
  if (marks.weak_link === 'poor') {
    notes.push(`最弱点（${WEAK_LINK_LABELS[capability.weakLink]}）がネックになる`)
  } else if (marks.weak_link === 'fair') {
    notes.push(`最弱点（${WEAK_LINK_LABELS[capability.weakLink]}）に余裕がない`)
  }
  if (marks.drag === 'poor') {
    notes.push('ドラグ容量が心もとない')
  }
  if (marks.retrieve === 'poor') {
    notes.push('巻き上げ力が不足気味')
  }
  if (marks.abrasion === 'poor') {
    notes.push('根ズレへの耐性が低い')
  }
  if (notes.length === 0) {
    notes.push('大型魚に挑める構成')
  }

  return {
    marks,
    details,
    challenge: masked ? null : challenge,
    masked,
    notes,
  }
}
