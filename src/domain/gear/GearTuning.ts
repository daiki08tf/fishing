/**
 * PROVISIONAL — タックルの**ゲーム調整値**。
 *
 * DATA_MODEL.md §12 の分離に従い、現実由来の属性（長さ・重量域・ドラッグ力など）は
 * Content に置き、ここには「それをゲーム上の性能へ写す係数」だけを置く。
 * 実データを入れ替えても、この係数は調整値として残る。
 */

export type MethodTuning = {
  /** 遠投のしやすさ（0〜1）。 */
  readonly castDistance: number
  /** 主導権の取りやすさ（0〜1）。 */
  readonly control: number
  /** ヒットの出やすさ（倍率）。 */
  readonly biteAffinity: number
}

export type GearTuning = {
  /** ロッドの control（0〜1）をテンションの上がりにくさへ写す強さ。 */
  readonly rodControlStrength: number
  /** ロッドの fightingPower を扱えるテンションへ写す強さ。 */
  readonly rodFightingStrength: number
  /** ロッドの sensitivity を見え方へ写す強さ。 */
  readonly sensitivityStrength: number
  /** ロッドの castingProfile をキャスト性能へ写す強さ。 */
  readonly castingStrength: number
  /** ラインの伸びがテンションを吸収する強さ。 */
  readonly lineStretchRelief: number
  /** ライン強度（kg）を扱えるテンションへ写す範囲。 */
  readonly lineStrengthRangeKg: Range
  readonly lineStrengthMultiplierRange: { readonly min: number; readonly max: number }
  /** ラインの視認されにくさをヒットへ写す強さ。 */
  readonly visibilityStrength: number
  /** リールのドラッグ・滑らかさを効率へ写す強さ。 */
  readonly reelDragStrength: number
  readonly reelSmoothnessStrength: number
  /** 巻き上げトルクを REEL 効率へ写す強さ。 */
  readonly reelTorqueStrength: number
  /** 巻き出しのレスポンスを REEL / GIVE へ写す強さ。 */
  readonly reelResponseStrength: number
  /** ドラッグ初動の滑らかさをテンション抑制へ写す強さ。 */
  readonly reelDragStartupStrength: number
  /** 剛性を「耐えられるテンション」へ写す強さ。 */
  readonly reelRigidityStrength: number
  /**
   * 自重を見た目の重さ（疲労・操作性）として写す強さ。
   * 軽いロッド / リールほど扱いやすい。
   */
  readonly weightControlStrength: number
  /** フックの掛かり・保持を見え方へ写す強さ。 */
  readonly hookPenetrationStrength: number
  readonly hookHoldingStrength: number
  /** 釣法ごとの調整値。 */
  readonly methods: Readonly<Record<string, MethodTuning>>
}

type Range = { readonly min: number; readonly max: number }

export const DEFAULT_GEAR_TUNING: GearTuning = {
  rodControlStrength: 0.25,
  rodFightingStrength: 0.35,
  sensitivityStrength: 0.4,
  castingStrength: 0.45,
  lineStretchRelief: 0.2,
  lineStrengthRangeKg: { min: 2, max: 12 },
  lineStrengthMultiplierRange: { min: 0.9, max: 1.6 },
  visibilityStrength: 0.25,
  reelDragStrength: 0.3,
  reelSmoothnessStrength: 0.25,
  reelTorqueStrength: 0.2,
  reelResponseStrength: 0.15,
  reelDragStartupStrength: 0.1,
  reelRigidityStrength: 0.12,
  weightControlStrength: 0.1,
  hookPenetrationStrength: 0.3,
  hookHoldingStrength: 0.35,
  methods: {
    lure: { castDistance: 0.7, control: 0.6, biteAffinity: 1 },
    light_lure: { castDistance: 0.45, control: 0.75, biteAffinity: 1.05 },
    bait: { castDistance: 0.5, control: 0.5, biteAffinity: 1.1 },
    bottom: { castDistance: 0.4, control: 0.4, biteAffinity: 1.05 },
  },
}
