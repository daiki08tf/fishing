import { describe, expect, it } from 'vitest'
import type { WorldTime } from '../world/WorldTime'
import { createInitialFinanceState, DEFAULT_ECONOMY_TUNING } from './FinanceState'
import { canAfford, formatYen, spendCash } from './finance'
import { settleFinance } from './settlement'
import { canAffordTrip, describeTravelCost, roundTripCostFor } from './travelCost'

const at = (month: number, day: number): WorldTime => ({
  year: 2026,
  month,
  day,
  hour: 6,
  minute: 0,
})

describe('finance', () => {
  it('starts with the provisional balance', () => {
    const finance = createInitialFinanceState()

    expect(finance.cash).toBe(DEFAULT_ECONOMY_TUNING.initialCash)
    expect(finance.lastSettledMonth).toBeNull()
    expect(finance.transactions).toEqual([])
  })

  it('formats yen', () => {
    expect(formatYen(0)).toBe('¥0')
    expect(formatYen(450000)).toBe('¥450,000')
    expect(formatYen(-1200)).toBe('-¥1,200')
    expect(formatYen(Number.NaN)).toBe('¥0')
  })

  it('refuses to spend more than it has', () => {
    const finance = { ...createInitialFinanceState(), cash: 1000 }
    const result = spendCash(finance, {
      kind: 'purchase',
      amount: 5000,
      label: 'test',
      at: '2026-05-01',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('insufficient_cash')
    }
    expect(canAfford(finance, 1000)).toBe(true)
  })

  it('keeps the recent history short', () => {
    let finance = createInitialFinanceState()

    for (let index = 0; index < DEFAULT_ECONOMY_TUNING.maxTransactions + 5; index += 1) {
      const result = spendCash(finance, {
        kind: 'travel',
        amount: 100,
        label: `trip ${String(index)}`,
        at: '2026-05-01',
      })

      if (!result.ok) {
        throw new Error(result.message)
      }

      finance = result.finance
    }

    expect(finance.transactions).toHaveLength(DEFAULT_ECONOMY_TUNING.maxTransactions)
    expect(finance.cash).toBe(
      DEFAULT_ECONOMY_TUNING.initialCash - 100 * (DEFAULT_ECONOMY_TUNING.maxTransactions + 5),
    )
  })
})

describe('monthly settlement', () => {
  it('pays the salary and deducts the living cost', () => {
    const finance = createInitialFinanceState()
    const result = settleFinance({ finance, from: at(5, 1), to: at(6, 1) })

    expect(result.settledMonths).toEqual(['2026-06'])
    expect(result.salaryTotal).toBe(DEFAULT_ECONOMY_TUNING.monthlySalary)
    expect(result.livingCostTotal).toBe(DEFAULT_ECONOMY_TUNING.monthlyLivingCost)
    expect(result.netTotal).toBe(
      DEFAULT_ECONOMY_TUNING.monthlySalary - DEFAULT_ECONOMY_TUNING.monthlyLivingCost,
    )
    expect(result.finance.cash).toBe(DEFAULT_ECONOMY_TUNING.initialCash + result.netTotal)
  })

  it('does not pay twice for the same month', () => {
    const first = settleFinance({
      finance: createInitialFinanceState(),
      from: at(5, 1),
      to: at(6, 1),
    })
    const second = settleFinance({ finance: first.finance, from: at(6, 1), to: at(6, 20) })

    expect(second.settledMonths).toEqual([])
    expect(second.finance.cash).toBe(first.finance.cash)
  })

  it('settles every month when several are skipped', () => {
    const result = settleFinance({
      finance: createInitialFinanceState(),
      from: at(5, 1),
      to: at(8, 3),
    })

    expect(result.settledMonths).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(result.salaryTotal).toBe(DEFAULT_ECONOMY_TUNING.monthlySalary * 3)
    expect(result.finance.cash).toBe(DEFAULT_ECONOMY_TUNING.initialCash + result.netTotal)
  })

  it('never produces NaN', () => {
    const result = settleFinance({
      finance: { ...createInitialFinanceState(), cash: 0 },
      from: at(1, 31),
      to: at(12, 31),
    })

    expect(Number.isFinite(result.finance.cash)).toBe(true)
    expect(Number.isFinite(result.netTotal)).toBe(true)
    expect(result.finance.lastSettledMonth).toBe('2026-12')
  })
})

describe('travel cost', () => {
  it('charges the round trip', () => {
    const option = { transport: 'train' as const, minutes: 45, cost: 420 }

    expect(roundTripCostFor(option)).toBe(840)
    expect(describeTravelCost(option)).toContain('¥840')
  })

  it('keeps walking free', () => {
    const walk = { transport: 'walk' as const, minutes: 20, cost: 0 }
    const finance = createInitialFinanceState()

    expect(roundTripCostFor(walk)).toBe(0)
    expect(canAffordTrip(finance, walk)).toBe(true)
    expect(describeTravelCost(walk)).toBe('交通費なし')
  })
})
