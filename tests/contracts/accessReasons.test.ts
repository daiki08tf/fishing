import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import {
  createInitialTransportState,
  grantOwnedTransport,
  type PlayerTransportState,
} from '../../src/domain/access/Transport'
import { asTransportId } from '../../src/domain/ids'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'

/**
 * 行けない理由の正確さ（Phase 7A.1）。
 *
 * 「持っている capability を不足と表示する」状態を禁止する。
 * 理由は Transport 候補のどの段階で落ちたかを表し、Content の全 Spot で成り立つ。
 */

const content = loadContentFromDirectory()
const knowledge = emptyKnowledgeState()

const withOwned = (...ids: readonly string[]): PlayerTransportState =>
  ids.reduce(
    (state, id) => grantOwnedTransport(state, asTransportId(id)),
    createInitialTransportState(asTransportId),
  )

const scenarios: readonly { readonly label: string; readonly state: PlayerTransportState }[] = [
  { label: '初期状態', state: withOwned() },
  { label: '中古車', state: withOwned('used-compact-car') },
  { label: 'SUV', state: withOwned('four-wheel-drive-suv') },
  { label: 'バイク', state: withOwned('standard-motorcycle') },
  { label: '自転車', state: withOwned('city-bicycle') },
  { label: 'カヤック', state: withOwned('recreational-kayak') },
  { label: '所有船', state: withOwned('owned-boat') },
  {
    label: 'すべて所有',
    state: withOwned(
      'used-compact-car',
      'four-wheel-drive-suv',
      'standard-motorcycle',
      'city-bicycle',
      'recreational-kayak',
      'owned-boat',
    ),
  },
]

describe('access blocked reasons', () => {
  it('never reports a capability the player has as missing', () => {
    for (const scenario of scenarios) {
      const inScope = content.transports.filter(
        (definition) =>
          scenario.state.availableTransportIds.includes(definition.id) ||
          scenario.state.ownedTransportIds.includes(definition.id),
      )

      for (const spot of content.spots) {
        const evaluation = evaluateAccess({
          spot,
          transports: content.transports,
          playerTransports: scenario.state,
          knowledge,
        })

        for (const reason of evaluation.blockedReasons) {
          if (reason.kind !== 'missing_capability' || reason.capability === undefined) {
            continue
          }

          const capability = reason.capability
          const provided = inScope.some((definition) =>
            definition.capabilities.includes(capability),
          )

          expect(
            provided,
            `${scenario.label} / ${String(spot.id)}: ${String(capability)} は手持ちの移動手段が提供している`,
          ).toBe(false)
        }
      }
    }
  })

  it('reports route incompatibility only when the required capabilities exist in hand', () => {
    for (const scenario of scenarios) {
      const inScope = content.transports.filter(
        (definition) =>
          scenario.state.availableTransportIds.includes(definition.id) ||
          scenario.state.ownedTransportIds.includes(definition.id),
      )

      for (const spot of content.spots) {
        const required = spot.access.flatMap((requirement) =>
          requirement.kind === 'capability' ? [requirement.capability] : [],
        )
        const evaluation = evaluateAccess({
          spot,
          transports: content.transports,
          playerTransports: scenario.state,
          knowledge,
        })

        for (const reason of evaluation.blockedReasons) {
          if (reason.kind !== 'no_compatible_transport') {
            continue
          }

          for (const capability of required) {
            expect(
              inScope.some((definition) => definition.capabilities.includes(capability)),
              `${scenario.label} / ${String(spot.id)}: ${capability} を持つ移動手段が無いなら capability 不足として説明する`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('always explains why a spot is inaccessible', () => {
    for (const scenario of scenarios) {
      for (const spot of content.spots) {
        const evaluation = evaluateAccess({
          spot,
          transports: content.transports,
          playerTransports: scenario.state,
          knowledge,
        })

        if (!evaluation.accessible) {
          expect(
            evaluation.blockedReasons.length,
            `${scenario.label} / ${String(spot.id)}: 行けない理由が空`,
          ).toBeGreaterThan(0)
        }
      }
    }
  })

  it('explains the upper lake with ownership, not with a capability the player provides', () => {
    const lake = content.spots.find((spot) => String(spot.id) === 'upstream-lake')

    expect(lake).toBeDefined()

    // 初期状態はレンタカー（road_access）を持つが、上流の湖の route は車両の所有を要する。
    const blocked = evaluateAccess({
      spot: lake!,
      transports: content.transports,
      playerTransports: withOwned(),
      knowledge,
    })

    expect(blocked.accessible).toBe(false)
    expect(blocked.blockedReasons.map((reason) => reason.kind)).toEqual(['ownership_required'])
    expect(blocked.blockedReasons.some((reason) => reason.capability === 'road_access')).toBe(false)

    // バイクは中古車より安い road_access の入手手段として機能する。
    const motorcycle = evaluateAccess({
      spot: lake!,
      transports: content.transports,
      playerTransports: withOwned('standard-motorcycle'),
      knowledge,
    })

    expect(motorcycle.accessible).toBe(true)
    expect(motorcycle.travelOptions.map((option) => String(option.transportId))).toEqual([
      'standard-motorcycle',
    ])
  })
})
