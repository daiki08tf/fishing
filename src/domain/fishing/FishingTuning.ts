/**
 * PROVISIONAL — ゲーム調整値（Game tuned）。
 *
 * DATA_MODEL.md §12 の分離に従い、現実データ（Content）と調整値を混ぜない。
 * ここにあるのは「ゲームとして面白くなるように決めた数値」であり、
 * 現実の魚の観測値ではない。
 *
 * 値は Phase 1 の操作感を作るための初期案であり、
 * プレイテストで調整する前提である。
 */

export type FishingTuning = {
  /** UI が tick を刻む想定間隔（ms）。Domain は時間の単位を持たず、tick 数で扱う。 */
  readonly tickMs: number

  readonly castTicks: number
  readonly minWaitTicks: number
  readonly maxWaitTicks: number
  /** 実効出現度を Bite の pressure に変換する係数（最終確率は飽和カーブで解決）。 */
  readonly biteChancePerPresence: number
  readonly biteTicks: number
  readonly hookWindowTicks: number
  readonly hookedTicks: number
  readonly landingTicks: number

  readonly maxTension: number
  /** 毎 tick の自然なテンション抜け。 */
  readonly passiveTensionDecay: number
  readonly reelTensionGain: number
  readonly reelStaminaDrain: number
  readonly giveTensionRelief: number
  /** GIVE 中のわずかな回復。連続 GIVE を最適解にしないための値でもある。 */
  readonly giveStaminaRecovery: number

  /** これを下回るテンションは「糸が緩んでいる」とみなす。 */
  readonly slackTensionThreshold: number
  /** 緩んだままこの tick 数を超えるとフックが外れる。 */
  readonly slackTicksBeforeEscape: number

  /** テンションが最も効率よく効く帯。 */
  readonly optimalTensionMin: number
  readonly optimalTensionMax: number
  /** 緩みすぎているときの REEL 効率。 */
  readonly slackReelEfficiency: number

  readonly runChancePerTick: number
  readonly minRunTicks: number
  readonly maxRunTicks: number
  readonly runTensionGainMultiplier: number
  readonly runReelEfficiencyMultiplier: number
  readonly runExertionMultiplier: number
  /**
   * run 中は魚が引くため、毎 tick テンションが加わる。
   * 「走られたら竿を立てて待つ」が成立し、GIVE しても糸が緩みっぱなしにならない。
   */
  readonly runPullTensionGain: number
  /** run 中は魚が引いているため、GIVE で抜けるテンションは小さくなる。 */
  readonly runGiveTensionReliefMultiplier: number

  /** 魚が自力で消耗する分（毎 tick）。 */
  readonly fishExertionStaminaDrain: number

  /** 個体差の振れ幅（±）。 */
  readonly individualVariance: number

  /*
   * Phase 9: 大型個体の引き。
   *
   * 基準サイズ（体長分布の中央値）の魚を 1.0 とし、大きい個体ほど強く引く。
   * 「軽いタックルでも理論上は獲れるが、ラインブレイク / フックアウトが増える」を作る。
   */
  readonly bigFishPullStrength: number
  readonly bigFishEnduranceStrength: number
  readonly bigFishPullMin: number
  readonly bigFishPullMax: number

  /**
   * Detection（アタリの見え方）がこの倍率以上なら、
   * UI に「アタリまでの残り tick」を開示する。
   */
  readonly detectionForecastThreshold: number
}

export const DEFAULT_FISHING_TUNING: FishingTuning = {
  tickMs: 120,

  castTicks: 6,
  minWaitTicks: 10,
  maxWaitTicks: 34,
  biteChancePerPresence: 0.85,
  biteTicks: 3,
  hookWindowTicks: 7,
  hookedTicks: 3,
  landingTicks: 5,

  maxTension: 1,
  passiveTensionDecay: 0.012,
  reelTensionGain: 0.055,
  reelStaminaDrain: 0.0075,
  giveTensionRelief: 0.11,
  giveStaminaRecovery: 0.0015,

  slackTensionThreshold: 0.12,
  slackTicksBeforeEscape: 22,

  optimalTensionMin: 0.4,
  optimalTensionMax: 0.85,
  slackReelEfficiency: 0.35,

  runChancePerTick: 0.07,
  minRunTicks: 5,
  maxRunTicks: 14,
  runTensionGainMultiplier: 2.3,
  runReelEfficiencyMultiplier: 0.35,
  runExertionMultiplier: 2.2,
  runPullTensionGain: 0.03,
  runGiveTensionReliefMultiplier: 0.35,

  fishExertionStaminaDrain: 0.0016,

  individualVariance: 0.15,

  bigFishPullStrength: 2,
  bigFishEnduranceStrength: 0.7,
  bigFishPullMin: 0.75,
  bigFishPullMax: 3,

  detectionForecastThreshold: 1.2,
}
