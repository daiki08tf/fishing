import type { FishingPhase, WeakLinkComponent } from '../../domain/fishing'
import { WEAK_LINK_LABELS } from '../../domain/fishing'
import type { BattleBehaviour } from '../../domain/fishing/battle'

/**
 * Phase 18.5A: Big Game ファイトの表示ロジック。
 *
 * FishingSnapshot / battle の値を「釣り人が読める言葉」に変換するだけ。
 * 新しいゲームルールは作らない — しきい値はすべて既存の domain 値
 * （reserveLineM / leaderIntegrity / behaviour）から derive する。
 */

/* ── 物理ライン ─────────────────────────────────────────────── */

export type LineStatus = 'normal' | 'reserve' | 'critical'

/**
 * 残りラインの状態。domain の reserveLineM をそのまま使う:
 * - critical（スプール危険）: 残り <= reserve
 * - reserve（残量注意）:      残り <= reserve × 2（suggestCommand の
 *   spoolWarning と同じ幅 — 第二の閾値系を作らない）
 */
export const lineStatusOf = (lineRemainingM: number | null, reserveLineM: number): LineStatus => {
  if (lineRemainingM === null) {
    return 'normal'
  }
  if (lineRemainingM <= reserveLineM) {
    return 'critical'
  }
  if (lineRemainingM <= reserveLineM * 2) {
    return 'reserve'
  }
  return 'normal'
}

export const lineRemainingText = (lineRemainingM: number, status: LineStatus): string => {
  switch (status) {
    case 'critical':
      return `残り ${String(lineRemainingM)}m — スプール危険`
    case 'reserve':
      return `残り ${String(lineRemainingM)}m — 残量注意`
    case 'normal':
      return `残り ${String(lineRemainingM)}m`
  }
}

/* ── リーダー ───────────────────────────────────────────────── */

export type LeaderCondition = 'good' | 'worn' | 'danger'

export const leaderConditionOf = (leaderIntegrity: number): LeaderCondition => {
  if (leaderIntegrity >= 0.75) {
    return 'good'
  }
  if (leaderIntegrity >= 0.4) {
    return 'worn'
  }
  return 'danger'
}

export const LEADER_CONDITION_LABELS: Readonly<Record<LeaderCondition, string>> = {
  good: '良好',
  worn: '摩耗',
  danger: '危険',
}

/* ── ドラグ ─────────────────────────────────────────────────── */

export const dragLabel = (drag: number): string => {
  if (drag <= 0.35) {
    return '緩め'
  }
  if (drag >= 0.7) {
    return '強め'
  }
  return '標準'
}

/* ── コンテキストヒント ─────────────────────────────────────── */

const RUNNING_BEHAVIOURS: readonly BattleBehaviour[] = ['run', 'surge', 'second_run']
/** suggestCommand の struggling と同じ集合（取り込みを待つべき暴れ方）。 */
const STRUGGLING_BEHAVIOURS: readonly BattleBehaviour[] = [
  'run',
  'surge',
  'second_run',
  'head_shake',
]

/**
 * ファイト中の一文ヒント。最も切迫したものを 1 つだけ返す。
 * AUTO でも正解表示でもない — プレイヤーの判断材料。
 */
export const fightHint = (input: {
  readonly phase: FishingPhase
  readonly behaviour: BattleBehaviour | null
  readonly lineRemainingM: number | null
  readonly reserveLineM: number
  readonly leaderIntegrity: number
  /** 大型魚で PUMP が効きやすいか（UI 側の pumpUseful と同じ基準）。 */
  readonly pumpUseful: boolean
}): string | null => {
  if (input.phase !== 'FIGHTING' && input.phase !== 'LANDING') {
    return null
  }

  if (lineStatusOf(input.lineRemainingM, input.reserveLineM) !== 'normal') {
    return 'ライン残量が少ない。走らせすぎない'
  }

  if (leaderConditionOf(input.leaderIntegrity) === 'danger') {
    return 'リーダーが傷んでいる。高テンションに注意'
  }

  if (input.phase === 'LANDING') {
    return input.behaviour !== null && STRUGGLING_BEHAVIOURS.includes(input.behaviour)
      ? 'まだ暴れている。落ち着くまで取り込まない'
      : null
  }

  if (input.behaviour !== null && RUNNING_BEHAVIOURS.includes(input.behaviour)) {
    return '走っている。無理に巻くと危険'
  }

  if (input.behaviour === 'rest' && input.pumpUseful) {
    return '今なら PUMP が効きそう'
  }

  return null
}

/* ── 終端フェーズの失敗説明 ────────────────────────────────── */

export type FailureExplanation = {
  readonly title: string
  readonly detail: string
  /** battle 由来の補足（弱点 / 容量 / 保持）。無ければ null。 */
  readonly state: string | null
}

/**
 * SPOOLED / LINE_BREAK / HOOK_ESCAPE の「何が起きたか」を
 * 終了時の battle state から説明する。証明できない原因は断定しない。
 */
export const failureExplanation = (input: {
  readonly phase: FishingPhase
  readonly weakLink: WeakLinkComponent | null
  readonly lineCapacityM: number | null
  readonly hookHold: number | null
}): FailureExplanation | null => {
  switch (input.phase) {
    case 'SPOOLED':
      return {
        title: 'ラインをすべて引き出された',
        detail: '魚の走りにラインを出し尽くした。走りを早めに止めるか、容量の大きいリールを。',
        state:
          input.lineCapacityM === null
            ? null
            : `スプール容量 ${String(input.lineCapacityM)}m を出し尽くした`,
      }
    case 'LINE_BREAK':
      return {
        title: '負荷に耐えきれずライン系統が破断した',
        detail: 'テンションを上げすぎた。走っている魚は送る・ドラグを緩める。',
        state:
          input.weakLink === null
            ? null
            : `弱点だった${WEAK_LINK_LABELS[input.weakLink]}が限界に達した`,
      }
    case 'HOOK_ESCAPE':
      return {
        title: 'テンションまたはフック保持を失い、魚が外れた',
        detail: '糸を緩めすぎた。ラインを送ったあとは早めにテンションを戻す。',
        state:
          input.hookHold === null
            ? null
            : `最後のフック保持 ${String(Math.round(input.hookHold * 100))}%`,
      }
    default:
      return null
  }
}
