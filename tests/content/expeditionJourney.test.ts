import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { expeditionSchema } from '../../src/content/schema/expedition'
import { JOURNEY_KINDS, planExpedition } from '../../src/domain/expedition/Expedition'
import { asCountryId } from '../../src/domain/ids'

/**
 * Phase 19A — Expedition flight → journey 一般化の契約テスト。
 *
 * - schema は `journey` を受理し、旧 `flight` キーを拒否する（strictObject）
 * - 既存 13 Expedition は全て有効な journey を持ち、cost/minutes の形が不変
 * - ferry / rail / drive kind が受理される（multi-leg は作らない）
 */

const content = loadContentFromDirectory()

const baseExpedition = {
  id: 'test-journey-expedition',
  regionId: 'izu-peninsula',
  name: 'テスト遠征',
  dataStatus: 'provisional',
  journey: {
    kind: 'domestic_flight',
    name: '国内線',
    oneWayCostYen: 10_000,
    oneWayMinutes: 60,
  },
  nights: { default: 2, min: 1, max: 4 },
  lodgings: [{ id: 'inn', name: 'Inn', nightlyCostYen: 5_000 }],
}

describe('journey schema', () => {
  it('accepts a journey object', () => {
    const result = expeditionSchema.safeParse(baseExpedition)

    expect(result.success).toBe(true)
    expect(result.success ? result.data.journey.kind : null).toBe('domestic_flight')
  })

  it.each(['ferry', 'rail', 'drive', 'international_flight'] as const)(
    'accepts journey kind %s',
    (kind) => {
      const result = expeditionSchema.safeParse({
        ...baseExpedition,
        journey: { ...baseExpedition.journey, kind },
      })

      expect(result.success).toBe(true)
    },
  )

  it('rejects the legacy flight key', () => {
    const legacy = {
      ...baseExpedition,
      flight: {
        transportType: 'domestic_flight',
        name: '国内線',
        oneWayCostYen: 10_000,
        oneWayMinutes: 60,
      },
    }
    delete (legacy as Record<string, unknown>)['journey']

    expect(expeditionSchema.safeParse(legacy).success).toBe(false)
  })

  it('rejects an unknown journey kind', () => {
    const result = expeditionSchema.safeParse({
      ...baseExpedition,
      journey: { ...baseExpedition.journey, kind: 'helicopter' },
    })

    expect(result.success).toBe(false)
  })
})

describe('existing expedition compatibility', () => {
  it('every expedition has a valid journey kind', () => {
    expect(content.expeditions.length).toBe(14)

    for (const expedition of content.expeditions) {
      expect(JOURNEY_KINDS, String(expedition.id)).toContain(expedition.journey.kind)
    }
  })

  it('plans real expeditions with the declared cost and travel time', () => {
    for (const expedition of content.expeditions) {
      const region = content.regions.find(
        (entry) => String(entry.id) === String(expedition.regionId),
      )
      const country = content.countries.find(
        (entry) => String(entry.id) === String(region?.countryId),
      )

      expect(region, String(expedition.regionId)).toBeDefined()
      expect(country).toBeDefined()

      const cheapest = [...expedition.lodgings].sort(
        (left, right) => left.nightlyCostYen - right.nightlyCostYen,
      )[0]
      const plan = planExpedition({
        definition: expedition,
        countryId: asCountryId(String(country?.id)),
        countryName: String(country?.name),
        regionName: String(region?.name),
        baseId: String(region?.base.id),
        baseName: String(region?.base.name),
        domestic: String(country?.id) === 'japan',
      })

      const expectedCost =
        expedition.journey.oneWayCostYen * 2 +
        (cheapest?.nightlyCostYen ?? 0) * expedition.nights.default +
        (expedition.permit?.costYen ?? 0)

      expect(plan?.totalCostYen, String(expedition.id)).toBe(expectedCost)
      expect(plan?.outboundMinutes).toBe(expedition.journey.oneWayMinutes)
      expect(plan?.returnMinutes).toBe(expedition.journey.oneWayMinutes)
      expect(plan?.nights).toBe(expedition.nights.default)
    }
  })
})
