import { describe, expect, it } from 'vitest'
import { asCountryId, asExpeditionId, asPermitId, asRegionId } from '../ids'
import { createInitialExpeditionState, planExpedition, remainingExpeditionDays } from './Expedition'

// 遠征の規則（Phase 8）。費用は既存 Economy の円だけで数える。
// 便・座席・予約番号は扱わない（意図的に対象外）。

const definition = {
  id: asExpeditionId('test-expedition'),
  regionId: asRegionId('test-region'),
  name: 'テスト遠征',
  dataStatus: 'provisional' as const,
  flight: {
    transportType: 'international_flight' as const,
    name: '国際線',
    oneWayCostYen: 100_000,
    oneWayMinutes: 600,
  },
  nights: { default: 4, min: 2, max: 6 },
  lodgings: [
    { id: 'budget', name: 'Budget', nightlyCostYen: 5_000 },
    { id: 'lodge', name: 'Lodge', nightlyCostYen: 15_000 },
  ],
  permit: { permitId: asPermitId('test-permit'), name: 'テスト許可', costYen: 3_000 },
}

const plan = (options: { readonly nights?: number; readonly lodgingId?: string } = {}) =>
  planExpedition({
    definition,
    countryId: asCountryId('test-country'),
    countryName: 'テスト国',
    regionName: 'テスト地域',
    baseId: 'test-base',
    baseName: 'Test Base',
    domestic: false,
    ...options,
  })

describe('expedition planning', () => {
  it('prices the round trip as flight + lodging + permit', () => {
    const result = plan({ nights: 4, lodgingId: 'budget' })

    expect(result).not.toBeNull()
    expect(result?.totalCostYen).toBe(200_000 + 20_000 + 3_000)
    expect(result?.costComponents.map((component) => component.kind)).toEqual([
      'flight',
      'lodging',
      'permit',
    ])
    expect(result?.permitId).toBe('test-permit')
  })

  it('uses the cheapest lodging by default and clamps the nights', () => {
    expect(plan()?.lodging.id).toBe('budget')
    expect(plan()?.nights).toBe(4)
    expect(plan({ nights: 1 })?.nights).toBe(2)
    expect(plan({ nights: 99 })?.nights).toBe(6)
    expect(plan({ nights: 3, lodgingId: 'lodge' })?.totalCostYen).toBe(200_000 + 45_000 + 3_000)
  })

  it('counts the travel time as round-trip flight plus the stay', () => {
    const result = plan({ nights: 4 })

    expect(result?.outboundMinutes).toBe(600)
    expect(result?.returnMinutes).toBe(600)
    expect(result?.totalMinutes).toBe(600 * 2 + 4 * 24 * 60)
  })

  it('reports the remaining days from the planned return', () => {
    const state = createInitialExpeditionState(asRegionId('test-region'))
    const active = {
      definitionId: definition.id,
      regionId: definition.regionId,
      countryId: asCountryId('test-country'),
      regionName: 'テスト地域',
      baseId: 'test-base',
      baseName: 'Test Base',
      startedAt: { year: 2026, month: 5, day: 1, hour: 6, minute: 0 },
      arriveAt: { year: 2026, month: 5, day: 2, hour: 0, minute: 0 },
      plannedReturnAt: { year: 2026, month: 5, day: 5, hour: 0, minute: 0 },
      returnMinutes: 600,
      nights: 3,
      lodgingName: 'Budget',
      totalCostYen: 100,
    }

    expect(state.current).toBeNull()
    expect(remainingExpeditionDays(active, active.arriveAt)).toBe(3)
    expect(
      remainingExpeditionDays(active, { year: 2026, month: 5, day: 4, hour: 23, minute: 0 }),
    ).toBe(1)
    expect(
      remainingExpeditionDays(active, { year: 2026, month: 5, day: 9, hour: 0, minute: 0 }),
    ).toBe(0)
  })
})
