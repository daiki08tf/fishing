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
  /**
   * Phase 11: 実着水距離をファイト開始距離へ写す割合。
   * 小魚が 60m 先で掛かっただけで 60m 分の単調な巻き取りにならないよう圧縮する。
   */
  readonly castDistanceToFightDistanceMultiplier?: number
  /** 魚の重さから sizeFactor を作る（0.3〜5.0 に丸める）。 */
  readonly sizeFactorReferenceKg: number
  readonly sizeFactorMin: number
  readonly sizeFactorMax: number
  /**
   * Phase 18A: knee（referenceKg × sizeFactorMax kg）を超える魚の
   * ファイト距離を圧縮する係数。距離 = max + log1p((sf-max)/max) × この値。
   */
  readonly bigGameDistanceLogFactor: number
  /**
   * Phase 18A: 魚の引きがテンションを押し上げるサイズ項の上限。
   * Phase 17 までは実質 1.0 固定（中型魚で飽和）だった。大型魚は 1.0 を超えて
   * より強く引ける（ただし線形ではなく頭打ち）。
   */
  readonly fishPullSizeScaleMax: number

  /** 「寄せ切った」と見なす距離（m）。ここで LANDING に移る。 */
  readonly landingDistanceM: number

  /** 1 step あたりの基本値。 */
  readonly reelDistanceM: number
  readonly reelStaminaDrain: number
  readonly reelTensionGain: number
  readonly powerReelDistanceMultiplier: number
  readonly powerReelStaminaMultiplier: number
  readonly powerReelTensionMultiplier: number
  /**
   * 「魚の重さで巻き取れなさ」の幅。
   * 小さいほど大型魚でも素直に寄り、大きいほど大型魚が寄らない（ファイトが長い）。
   */
  readonly reelPullMin: number
  readonly reelPullMax: number
  readonly holdDistanceMultiplier: number
  readonly holdStaminaMultiplier: number
  readonly holdTensionGain: number
  readonly giveTensionRelief: number
  /**
   * 走っている魚がラインを引く分（1 step あたり）。
   * 同じ引きでも、耐えられるテンション（maxTension）が低いタックルほど
   * 「上限に対する割合」が大きく上がる。これが Light の break リスクになる。
   */
  readonly fishPullTensionGain: number
  /** 走り中は送っても負荷が抜けきらない（GIVE の効き）。 */
  readonly runGiveReliefMultiplier: number
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

  // ── Phase 18B: PUMP ───────────────────────────────────────────
  /**
   * PUMP（ロッドで魚を浮かせる）の距離効率（REEL 基準の倍率）。
   * 大型魚に効く代わりにテンションコストが高い。
   */
  readonly pumpDistanceMultiplier: number
  /** 走っている魚への PUMP は効率が落ちる（危険な選択）。 */
  readonly pumpRunPenalty: number
  /** PUMP のテンション上昇率（REEL 基準）。 */
  readonly pumpTensionGainMultiplier: number
  /** PUMP 1 回の魚スタミナ消費（竿で体を起こさせる負荷）。 */
  readonly pumpStaminaDrain: number
  /** sizeFactor 1 あたりの PUMP 効率ボーナス。大型魚ほど PUMP が効く。 */
  readonly pumpSizeBonusPer: number
  readonly pumpSizeBonusMin: number
  readonly pumpSizeBonusMax: number

  // ── Phase 18B: 物理ライン ──────────────────────────────────────
  /**
   * 走りで出ていく物理ライン量（gameplay 距離増分に対する倍率）。
   * 1.4 = 魚が走ると gameplay 距離より多くラインが出る。
   */
  readonly runLineOutMultiplier: number
  /** GIVE で出す物理ライン量の倍率（gameplay 距離増分に対して）。 */
  readonly giveLineOutMultiplier: number
  /** LOOSEN_DRAG 1 回でスプールから出る基礎ライン量（m）。 */
  readonly dragPeelPerStepM: number
  /** 根ズレ（dive / head_shake / surge）時のリーダー integrity 減少率。 */
  readonly abrasionIntegrityLossRate: number
  /**
   * 擦れたリーダーが耐えられるテンション下限（integrity=0 で
   * 実効 maxTension がこの倍率まで落ちる）。
   */
  readonly leaderIntegrityMinTensionFactor: number
}

export const DEFAULT_BATTLE_TUNING: BattleTuning = {
  initialTensionRatio: 0.35,
  initialDistanceBaseM: 6,
  initialDistancePerSizeM: 10,
  castDistanceToFightDistanceMultiplier: 0.35,
  sizeFactorReferenceKg: 2.5,
  sizeFactorMin: 0.3,
  sizeFactorMax: 5,
  bigGameDistanceLogFactor: 5,
  fishPullSizeScaleMax: 1.35,

  landingDistanceM: 6,

  reelDistanceM: 5.5,
  reelStaminaDrain: 0.018,
  reelTensionGain: 0.06,
  powerReelDistanceMultiplier: 1.8,
  powerReelStaminaMultiplier: 2.3,
  powerReelTensionMultiplier: 4.2,
  reelPullMin: 0.55,
  reelPullMax: 2.6,
  holdDistanceMultiplier: 0.25,
  holdStaminaMultiplier: 0.35,
  holdTensionGain: 0.012,
  giveTensionRelief: 0.13,
  fishPullTensionGain: 0.12,
  runGiveReliefMultiplier: 0.75,
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

  // ── Phase 18B ──
  pumpDistanceMultiplier: 1.4,
  pumpRunPenalty: 0.35,
  pumpTensionGainMultiplier: 1.35,
  pumpStaminaDrain: 0.07,
  pumpSizeBonusPer: 0.08,
  pumpSizeBonusMin: 0.75,
  pumpSizeBonusMax: 1.6,

  runLineOutMultiplier: 1.4,
  giveLineOutMultiplier: 1.4,
  dragPeelPerStepM: 2.5,
  abrasionIntegrityLossRate: 0.09,
  leaderIntegrityMinTensionFactor: 0.55,
}
