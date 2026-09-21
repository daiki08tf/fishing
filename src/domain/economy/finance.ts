import {
  DEFAULT_ECONOMY_TUNING,
  type EconomyTuning,
  type FinanceState,
  type TransactionKind,
} from './FinanceState'

/**
 * 資金の増減。円単位。
 *
 * - 支出は残高チェックをする（買えないものは買えない）
 * - 給与・生活費は必ず適用する（赤字でも破綻させない。設計上、軽微な赤字は許容）
 */

/** 3 桁区切りで `¥123,456` の形にする。 */
export const formatYen = (amount: number): string => {
  if (!Number.isFinite(amount)) {
    return '¥0'
  }

  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  const digits = String(Math.abs(rounded))

  return `${sign}¥${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** 表示用の短い形。例: `12万3,000円` → 使わず `¥123,000` に統一する。 */
export const describeCash = (finance: FinanceState): string => formatYen(finance.cash)

export const canAfford = (finance: FinanceState, amount: number): boolean =>
  amount <= 0 || finance.cash >= amount

export type TransactionRequest = {
  readonly kind: TransactionKind
  /** 符号なしの金額。 */
  readonly amount: number
  readonly label: string
  readonly at: string
}

const toTransaction = (
  request: TransactionRequest,
  direction: 1 | -1,
  index: number,
): {
  readonly amount: number
  readonly label: string
  readonly kind: TransactionKind
  readonly at: string
  readonly id: string
} => ({
  id: `${request.kind}-${String(index)}-${request.at}`,
  kind: request.kind,
  amount: direction * Math.round(Math.abs(request.amount)),
  label: request.label,
  at: request.at,
})

const push = (
  finance: FinanceState,
  transaction: FinanceState['transactions'][number],
  tuning: EconomyTuning,
): FinanceState => ({
  ...finance,
  cash: finance.cash + transaction.amount,
  transactions: [transaction, ...finance.transactions].slice(0, tuning.maxTransactions),
})

/** 残高チェックなしで適用する（給与・生活費）。 */
export const applyTransaction = (
  finance: FinanceState,
  request: TransactionRequest,
  direction: 1 | -1,
  tuning: EconomyTuning = DEFAULT_ECONOMY_TUNING,
): FinanceState =>
  push(finance, toTransaction(request, direction, finance.transactions.length), tuning)

export type SpendResult =
  | { readonly ok: true; readonly finance: FinanceState }
  | { readonly ok: false; readonly reason: 'insufficient_cash'; readonly message: string }

/** 残高チェックつきの支出（買い物・交通費）。 */
export const spendCash = (
  finance: FinanceState,
  request: TransactionRequest,
  tuning: EconomyTuning = DEFAULT_ECONOMY_TUNING,
): SpendResult => {
  if (!canAfford(finance, request.amount)) {
    return {
      ok: false,
      reason: 'insufficient_cash',
      message: `${formatYen(request.amount)} 必要（所持 ${formatYen(finance.cash)}）`,
    }
  }

  return { ok: true, finance: applyTransaction(finance, request, -1, tuning) }
}

/** 収入（給与・売却など）。 */
export const earnCash = (
  finance: FinanceState,
  request: TransactionRequest,
  tuning: EconomyTuning = DEFAULT_ECONOMY_TUNING,
): FinanceState => applyTransaction(finance, request, 1, tuning)

/** 直近の履歴（新しい順）。 */
export const recentTransactions = (
  finance: FinanceState,
  limit = 5,
): readonly FinanceState['transactions'][number][] => finance.transactions.slice(0, limit)
