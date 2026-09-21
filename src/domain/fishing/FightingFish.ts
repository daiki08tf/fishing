import type { FishIndividual } from '../fish/FishIndividual'
import type { TraitModifiers } from '../fish/fishTraits'
import type { FishBehavior } from './FishBehavior'

/**
 * ファイト対象としての魚。
 *
 * 「個体」（サイズ・体重・コンディション・Trait・百分位）と
 * 「その個体がどう戦うか」（power / speed / stamina / 倍率）を分けて持つ。
 * 前者は FishIndividual、後者は個体と Trait から導出される。
 */
export type FightingFish = {
  /** 生成された個体。FishIndividualGenerator の出力。 */
  readonly individual: FishIndividual
  /** 表示用の魚種名。 */
  readonly speciesName: string
  /** 引きの強さ（0〜1）。テンションの上がり方に効く。 */
  readonly power: number
  /** 行動の切り替わりやすさ（0〜1）。 */
  readonly speed: number
  /** 最大スタミナ（0〜1 の相対値）。0 になれば取り込める。 */
  readonly staminaMax: number
  /**
   * Trait から合成済みの倍率。
   * Engine は Trait 名を一切知らず、この倍率だけを見る。
   * これにより Trait 追加で Engine を書き換えずに済む。
   */
  readonly modifiers: TraitModifiers
}

/** ファイト中の可変状態。 */
export type FightingFishState = {
  readonly fish: FightingFish
  readonly stamina: number
  readonly behavior: FishBehavior
  readonly behaviorRunTicksRemaining: number
  /** 糸が緩んでいた連続 tick 数。 */
  readonly slackTicks: number
}
