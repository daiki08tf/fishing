import type { KnowledgeState } from '../knowledge/KnowledgeState'
import { regionKnowledgeScore } from '../knowledge/regionKnowledge'
import { spotKnowledgeScore } from '../knowledge/spotKnowledge'
import type { FishingSpot, SpotTravelOption } from '../world/FishingSpot'
import type { DayOfWeek } from '../world/WorldTime'
import type { TransportType } from './Transport'
import type { AccessRequirementKind } from './AccessRequirement'

/**
 * Spot へ行けるかどうかを判定する。ARCHITECTURE.md §3 の accessEngine。
 *
 * 重要（DECISIONS.md §5 / §6、PROGRESSION.md §12）:
 * Angler Level は入力にすら存在しない。「Levelが上がったので解禁」ではなく、
 * 「移動手段・Knowledge・許可・関係性が広がったので行ける」形にする。
 *
 * 入力: プレイヤーが使える移動手段 / Knowledge / （将来）Reputation・許可・季節
 * 出力: 行けるか / 行けない理由 / 使える移動手段と所要時間
 */

export type AccessBlockedReason = {
  readonly kind: AccessRequirementKind
  /** UI にそのまま出せる短い説明。 */
  readonly label: string
  /** 必要値（knowledge / reputation）。 */
  readonly required?: number
  /** 現在値（knowledge / reputation）。 */
  readonly current?: number
}

export type AccessEvaluation = {
  readonly spotId: string
  readonly accessible: boolean
  /** 使える移動手段（所要時間つき）。空なら移動手段が足りない。 */
  readonly travelOptions: readonly SpotTravelOption[]
  readonly blockedReasons: readonly AccessBlockedReason[]
  /** 全条件のうち満たしているもの。UI の「あと少し」表示に使う。 */
  readonly satisfiedKinds: readonly AccessRequirementKind[]
}

export type AccessEvaluationInput = {
  readonly spot: FishingSpot
  /** プレイヤーが使える移動手段。 */
  readonly availableTransports: readonly TransportType[]
  readonly knowledge: KnowledgeState
  /** 将来用。Phase 4 では 0 固定。 */
  readonly reputation?: number
  readonly permits?: readonly string[]
  readonly dayOfWeek?: DayOfWeek
  readonly month?: number
  readonly reputationEnabled?: boolean
  readonly permitsEnabled?: boolean
}

const transportLabel = (tag: string): string => {
  switch (tag) {
    case 'walk':
      return '徒歩'
    case 'train':
      return '電車'
    case 'bus':
      return 'バス'
    case 'bicycle':
      return '自転車'
    case 'motorcycle':
      return 'バイク'
    case 'car':
      return '車'
    case 'suv':
      return 'SUV'
    case 'kayak':
      return 'カヤック'
    case 'trailer_boat':
    case 'boat':
      return '船'
    default:
      return tag
  }
}

/** その移動手段でその Spot へ行けるか（accessTags と移動手段の一致）。 */
const transportMatches = (tag: string, available: readonly TransportType[]): boolean =>
  available.some((transport) => transport === tag)

export const evaluateAccess = (input: AccessEvaluationInput): AccessEvaluation => {
  const { spot } = input
  const knowledgeScore = spotKnowledgeScore(input.knowledge, String(spot.id))
  const regionScore = regionKnowledgeScore(input.knowledge, String(spot.regionId))
  const reputation = input.reputation ?? 0
  const permits = input.permits ?? []
  const blockedReasons: AccessBlockedReason[] = []
  const satisfiedKinds: AccessRequirementKind[] = []

  for (const requirement of spot.access) {
    switch (requirement.kind) {
      case 'transport': {
        if (transportMatches(requirement.tag, input.availableTransports)) {
          satisfiedKinds.push('transport')
        } else {
          blockedReasons.push({
            kind: 'transport',
            label: `必要: ${transportLabel(requirement.tag)}`,
          })
        }
        break
      }

      case 'knowledge': {
        const scoped = requirement.scope === 'region' ? regionScore : knowledgeScore

        if (scoped >= requirement.minimum) {
          satisfiedKinds.push('knowledge')
        } else {
          blockedReasons.push({
            kind: 'knowledge',
            label:
              requirement.scope === 'region'
                ? `必要: この水域の知識 ${String(requirement.minimum)}%`
                : `必要: この釣り場の知識 ${String(requirement.minimum)}%`,
            required: requirement.minimum,
            current: Math.round(scoped),
          })
        }
        break
      }

      case 'reputation': {
        if (!input.reputationEnabled || reputation >= requirement.minimum) {
          // Phase 4 では Reputation 未実装のため、条件を課さない。
          satisfiedKinds.push('reputation')
        } else {
          blockedReasons.push({
            kind: 'reputation',
            label: `必要: 名声 ${String(requirement.minimum)}`,
            required: requirement.minimum,
            current: reputation,
          })
        }
        break
      }

      case 'permit': {
        if (!input.permitsEnabled || permits.includes(String(requirement.permitId))) {
          if (input.permitsEnabled) {
            satisfiedKinds.push('permit')
          } else {
            blockedReasons.push({
              kind: 'permit',
              label: '必要: 遊漁券（未実装）',
            })
          }
        } else {
          blockedReasons.push({ kind: 'permit', label: '必要: 遊漁券' })
        }
        break
      }

      case 'relationship': {
        if (input.reputationEnabled) {
          blockedReasons.push({ kind: 'relationship', label: '必要: 人脈（未実装）' })
        } else {
          satisfiedKinds.push('relationship')
        }
        break
      }

      case 'season': {
        if (input.month === undefined || requirement.months.includes(input.month as never)) {
          satisfiedKinds.push('season')
        } else {
          blockedReasons.push({
            kind: 'season',
            label: `季節外（${requirement.months.map((month) => `${String(month)}月`).join('・')}）`,
          })
        }
        break
      }
    }
  }

  const travelOptions = spot.travelOptions.filter((option) =>
    input.availableTransports.includes(option.transport),
  )

  if (travelOptions.length === 0) {
    blockedReasons.push({ kind: 'transport', label: '行き方が分からない（移動手段がない）' })
  }

  return {
    spotId: String(spot.id),
    accessible: blockedReasons.length === 0,
    travelOptions,
    blockedReasons,
    satisfiedKinds,
  }
}

/** 使える移動手段のうち、最も早く着けるもの。 */
export const fastestTravelOption = (
  options: readonly SpotTravelOption[],
): SpotTravelOption | null => {
  let fastest: SpotTravelOption | null = null

  for (const option of options) {
    if (fastest === null || option.minutes < fastest.minutes) {
      fastest = option
    }
  }

  return fastest
}
