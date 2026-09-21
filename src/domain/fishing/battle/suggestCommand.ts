import type { FishingCommand, FishingPhase } from '../FishingPhase'
import type { BattleBehaviour } from './BattleBehaviour'

/**
 * 判断のヒント（AUTO / シミュレーションの Reactive 戦略）。
 *
 * 「常に同じコマンド」ではなく、魚の行動とテンションを見て選ぶ。
 * これは最適解の保証ではない（プレイヤーが読んで選ぶ余地を残す）。
 */
export const suggestBattleCommand = (input: {
  readonly phase: FishingPhase
  readonly tension: number
  readonly maxTension: number
  readonly behaviour: BattleBehaviour | null
  readonly hookHold: number
}): FishingCommand => {
  const tensionRatio = input.maxTension <= 0 ? 0 : input.tension / input.maxTension

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

  if (tensionRatio > 0.8) {
    return 'give'
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
