import {
  compareMonthKey,
  formatWorldTime,
  monthKeyOf,
  nextMonthKey,
  type WorldTime,
} from '../world/WorldTime'
import { DEFAULT_ECONOMY_TUNING, type EconomyTuning, type FinanceState } from './FinanceState'
import { applyTransaction } from './finance'

/**
 * 月次精算。
 *
 *   給与 - 生活費 = 自由資金
 *
 * - 月を跨いだときに 1 回だけ支給する（`lastSettledMonth` で防止）
 * - 何か月も一気に進んでも、通過した月の分をすべて処理する
 * - 仕事そのものは扱わない（勤務時間の制約だけが別にある）
 */

export type SettlementResult = {
  readonly finance: FinanceState
  /** 精算した月（古い順）。 */
  readonly settledMonths: readonly string[]
  readonly salaryTotal: number
  readonly livingCostTotal: number
  readonly netTotal: number
}

export const settleFinance = (options: {
  readonly finance: FinanceState
  readonly from: WorldTime
  readonly to: WorldTime
  readonly tuning?: EconomyTuning
}): SettlementResult => {
  const tuning = options.tuning ?? DEFAULT_ECONOMY_TUNING
  const fromMonth = monthKeyOf(options.from)
  const toMonth = monthKeyOf(options.to)
  let finance = options.finance
  let lastSettled = finance.lastSettledMonth
  const settledMonths: string[] = []

  if (lastSettled === null) {
    // 初回は「今の月」を記録するだけ。開始月の給与は支給しない。
    finance = { ...finance, lastSettledMonth: fromMonth }
    lastSettled = fromMonth
  }

  if (compareMonthKey(toMonth, lastSettled) > 0) {
    let cursor = nextMonthKey(lastSettled)

    while (compareMonthKey(cursor, toMonth) <= 0) {
      settledMonths.push(cursor)
      cursor = nextMonthKey(cursor)
    }
  }

  const at = formatWorldTime(options.to)

  for (const month of settledMonths) {
    finance = applyTransaction(
      finance,
      { kind: 'salary', amount: finance.salaryIncome, label: `給与（${month}）`, at },
      1,
      tuning,
    )
    finance = applyTransaction(
      finance,
      {
        kind: 'living_cost',
        amount: finance.simplifiedLivingCost,
        label: `生活費（${month}）`,
        at,
      },
      -1,
      tuning,
    )
  }

  const salaryTotal = settledMonths.length * finance.salaryIncome
  const livingCostTotal = settledMonths.length * finance.simplifiedLivingCost

  return {
    finance:
      settledMonths.length === 0
        ? finance
        : { ...finance, lastSettledMonth: settledMonths[settledMonths.length - 1] ?? lastSettled },
    settledMonths,
    salaryTotal,
    livingCostTotal,
    netTotal: salaryTotal - livingCostTotal,
  }
}
