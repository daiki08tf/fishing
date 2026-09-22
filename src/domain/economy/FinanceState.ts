/**
 * 資金状態。DATA_MODEL.md §18 に対応する。
 *
 * 詳細な家計シミュレーターにはしない。生活費はまとめて自動控除する。
 * 資金は「罰」ではなく「次に何を買うか悩むための資源」として扱う。
 *
 * 家賃・税金・食費・水道・電気・通信費……は個別に管理せず、
 * `simplifiedLivingCost` にまとめる（GAME_DESIGN.md §12.3）。
 */

export const TRANSACTION_KINDS = [
  'salary',
  'living_cost',
  'travel',
  'purchase',
  'trade',
  'other',
] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

/** 直近の履歴。詳細な家計簿ではなく「さっき何に使ったか」が分かる程度。 */
export type FinanceTransaction = {
  readonly id: string
  readonly kind: TransactionKind
  /** 符号つき（+ 収入 / - 支出）。 */
  readonly amount: number
  readonly label: string
  /** ゲーム内の日時（表示用）。 */
  readonly at: string
}

export type FinanceState = {
  /** 円単位。生活費の引落しで一時的に負になることは許容する（Game Over は無い）。 */
  readonly cash: number
  readonly salaryIncome: number
  readonly simplifiedLivingCost: number
  /** 最後に月次精算した月（YYYY-MM）。二重支給を防ぐ。 */
  readonly lastSettledMonth: string | null
  readonly transactions: readonly FinanceTransaction[]
}

/**
 * PROVISIONAL — 経済の調整値。
 *
 * 「最初の中古車が、現実時間で延々と遊ばないと買えない額」にならないことを優先する。
 * 数週間〜数か月で手が届く範囲に置く。
 */
export type EconomyTuning = {
  readonly initialCash: number
  readonly monthlySalary: number
  readonly monthlyLivingCost: number
  readonly maxTransactions: number
  /**
   * 車の維持費（構造だけ。Phase 5 では請求しない）。
   * 生活費に混ぜずに済むよう、別枠として用意しておく。
   */
  readonly simpleVehicleMonthlyCost: number
}

export const DEFAULT_ECONOMY_TUNING: EconomyTuning = {
  initialCash: 120_000,
  monthlySalary: 300_000,
  monthlyLivingCost: 180_000,
  maxTransactions: 20,
  simpleVehicleMonthlyCost: 8_000,
}

export const createInitialFinanceState = (
  tuning: EconomyTuning = DEFAULT_ECONOMY_TUNING,
): FinanceState => ({
  cash: tuning.initialCash,
  salaryIncome: tuning.monthlySalary,
  simplifiedLivingCost: tuning.monthlyLivingCost,
  lastSettledMonth: null,
  transactions: [],
})
