import type { FishingCommand, FishingPhase } from '../FishingPhase'
import type { BattleBehaviour } from './BattleBehaviour'

/**
 * 判断のヒント（AUTO / シミュレーションの Reactive 戦略）。
 *
 * 「常に同じコマンド」ではなく、魚の行動とテンションを見て選ぶ。
 * これは最適解の保証ではない（プレイヤーが読んで選ぶ余地を残す）。
 *
 * Phase 18B: スプール残量と PUMP を理解する。
 * ラインが尽きそうならテンションを多少上げても走りを止める
 * （切られるより「出し尽くされる」方が早い負け筋になる）。
 */
export const suggestBattleCommand = (input: {
  readonly phase: FishingPhase
  readonly tension: number
  readonly maxTension: number
  readonly behaviour: BattleBehaviour | null
  readonly hookHold: number
  /** スプールの残りライン（m）。容量不明なら null / 省略。 */
  readonly lineRemainingM?: number | null
  /** 警告帯として残したいライン量（m）。 */
  readonly reserveLineM?: number
  /** 大型魚で PUMP が効く状況か（rest / workable で true 推奨）。 */
  readonly pumpUseful?: boolean
}): FishingCommand => {
  const tensionRatio = input.maxTension <= 0 ? 0 : input.tension / input.maxTension
  const lineRemaining = input.lineRemainingM ?? null
  const reserve = input.reserveLineM ?? 0
  const spoolCritical = lineRemaining !== null && lineRemaining <= reserve
  const spoolWarning = lineRemaining !== null && lineRemaining <= reserve * 2

  if (input.phase === 'LANDING') {
    /*
     * まだ暴れている（走り / 突進 / 再加速 / 首振り）なら待つ。
     * 落ち着いていて、保持とテンションに余裕があれば取り込む。
     */
    const struggling =
      input.behaviour === 'run' ||
      input.behaviour === 'surge' ||
      input.behaviour === 'second_run' ||
      input.behaviour === 'head_shake'

    if (struggling) {
      return 'wait'
    }

    return input.hookHold > 0.35 && tensionRatio < 0.85 ? 'land' : 'wait'
  }

  if (input.phase !== 'FIGHTING') {
    return 'reel'
  }

  /*
   * テンション限界 → まず逃がす。ただしラインが尽きかけているなら
   * 送る（GIVE）も緩める（LOOSEN_DRAG）もラインを失うだけ — 切られる
   * リスクを取ってでも止めにいく（出尽くす方が確定の負け筋）。
   */
  if (tensionRatio > 0.8) {
    return spoolCritical ? 'hold' : 'give'
  }

  /*
   * 残りラインが危ないのに魚が走っている → ドラグを締めて
   * 走りを止めにいく（HOLD）。ラインが残っていれば従来どおり
   * テンション次第で逃がす。
   */
  const running =
    input.behaviour === 'run' || input.behaviour === 'surge' || input.behaviour === 'second_run'

  if (running && (spoolCritical || spoolWarning)) {
    return tensionRatio > 0.7 ? 'hold' : 'tighten_drag'
  }

  if (input.behaviour === 'rest' && input.pumpUseful === true) {
    return 'pump'
  }

  if (tensionRatio < 0.25) {
    return 'reel'
  }

  switch (input.behaviour) {
    case 'run':
    case 'surge':
    case 'second_run':
    case 'head_shake':
    case 'dive':
      return 'hold'
    case 'come_toward':
      return 'reel'
    case 'rest':
      return 'power_reel'
    default:
      return 'reel'
  }
}
