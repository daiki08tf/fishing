/**
 * PROVISIONAL — Text Fishing Battle のゲーム調整値（Phase 10）。
 *
 * ここにあるのは現実の数値ではなく、「判断が効くテキストバトル」にするための調整値。
 * 魚種名・Gear ID は一切出てこない（すべて generic な数値）。
 */

export type BattleTuning = {
  /** ファイト開始時のテンション比（maxTension に対する割合）。 */
  readonly initialTensionRatio: number
  /** 初期距離（m）: base + scale * sizeFactor。 */
  readonly initialDistanceBaseM: number
  readonly initialDistancePerSizeM: number
  /** 魚の重さから sizeFactor を作る（0.3〜5.0 に丸める）。 */
  readonly sizeFactorReferenceKg: number
  readonly sizeFactorMin: number
  readonly sizeFactorMax: number

  /** 「寄せ切った」と見なす距離（m）。ここで LANDING に移る。 */
  readonly landingDistanceM: number

  /** 1 step あたりの基本値。 */
  readonly reelDistanceM: number
  readonly reelStaminaDrain: number
  readonly reelTensionGain: number
  readonly powerReelDistanceMultiplier: number
  readonly powerReelStaminaMultiplier: number
  readonly powerReelTensionMultiplier: number
  readonly holdDistanceMultiplier: number
  readonly holdStaminaMultiplier: number
  readonly holdTensionGain: number
  readonly giveTensionRelief: number
  readonly giveDistanceM: number
  readonly giveStaminaRecovery: number

  /** ドラグ。0.5 が標準。 */
  readonly dragDefault: number
  readonly dragStep: number
  readonly dragMin: number
  readonly dragMax: number
  /** ドラグが硬いほどテンションが上がりやすく、柔らかいほどラインが出る。 */
  readonly dragTensionGainAtTight: number
  readonly dragTensionGainAtLoose: number
  readonly dragDistanceGainAtLoose: number

  /** フック保持。 */
  readonly hookHoldInitial: number
  readonly hookHoldLossPerStep: number
  readonly hookHoldLossOnSlack: number
  /** 保持が回復するのは REST のときだけ（わずか）。 */
  readonly hookHoldRecoveryOnRest: number

  /** スラック（緩み）判定。 */
  readonly slackTensionThreshold: number
  readonly slackStepsBeforeEscape: number

  /** 取り込み。 */
  readonly landingSuccessBase: number
  readonly landingStaminaFactor: number
  readonly landingHookHoldFactor: number
  readonly landingAttemptFailurePenaltyM: number
  readonly landingAttemptHookHoldLoss: number
}

export const DEFAULT_BATTLE_TUNING: BattleTuning = {
  initialTensionRatio: 0.35,
  initialDistanceBaseM: 6,
  initialDistancePerSizeM: 10,
  sizeFactorReferenceKg: 2.5,
  sizeFactorMin: 0.3,
  sizeFactorMax: 5,

  landingDistanceM: 6,

  reelDistanceM: 4.2,
  reelStaminaDrain: 0.018,
  reelTensionGain: 0.06,
  powerReelDistanceMultiplier: 1.8,
  powerReelStaminaMultiplier: 2.3,
  powerReelTensionMultiplier: 2.5,
  holdDistanceMultiplier: 0.25,
  holdStaminaMultiplier: 0.35,
  holdTensionGain: 0.012,
  giveTensionRelief: 0.13,
  giveDistanceM: 1,
  giveStaminaRecovery: 0.003,

  dragDefault: 0.5,
  dragStep: 0.15,
  dragMin: 0,
  dragMax: 1,
  dragTensionGainAtTight: 1.3,
  dragTensionGainAtLoose: 0.75,
  dragDistanceGainAtLoose: 0.6,

  hookHoldInitial: 1,
  hookHoldLossPerStep: 0.004,
  hookHoldLossOnSlack: 0.08,
  hookHoldRecoveryOnRest: 0.01,

  slackTensionThreshold: 0.12,
  slackStepsBeforeEscape: 3,

  landingSuccessBase: 0.45,
  landingStaminaFactor: 0.4,
  landingHookHoldFactor: 0.3,
  landingAttemptFailurePenaltyM: 6,
  landingAttemptHookHoldLoss: 0.12,
}
