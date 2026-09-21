import type { FishingSpotId, PermitId, RelationshipTargetId } from '../ids'
import type { Month } from '../primitives'

/**
 * Spot へのアクセス条件。DATA_MODEL.md §10 に対応する。
 *
 * 重要（DECISIONS.md §5 / §6、PROGRESSION.md §12）:
 * Angler Level はアクセス条件に含めない。
 * 「Levelが上がったので解禁」ではなく、
 * 「移動手段・装備・Knowledge・Skill・関係性が広がったので行ける」形にする。
 * この制約は tests/architecture と tests/domain で機械的に検査する。
 */
export const ACCESS_REQUIREMENT_KINDS = [
  'transport',
  'knowledge',
  'reputation',
  'permit',
  'relationship',
  'season',
] as const

export type AccessRequirementKind = (typeof ACCESS_REQUIREMENT_KINDS)[number]

export type AccessRequirement =
  | { readonly kind: 'transport'; readonly tag: string }
  /**
   * Knowledge 条件。
   * scope を省略すると「その Spot の知識」、'region' なら「その地域の知識」を要求する。
   */
  | { readonly kind: 'knowledge'; readonly minimum: number; readonly scope?: 'spot' | 'region' }
  | { readonly kind: 'reputation'; readonly minimum: number }
  | { readonly kind: 'permit'; readonly permitId: PermitId }
  | {
      readonly kind: 'relationship'
      readonly targetId: RelationshipTargetId
      readonly minimum: number
    }
  | { readonly kind: 'season'; readonly months: readonly Month[] }

/**
 * Spot のアクセス条件を表す型に Level 由来の必須条件が混入していないことを
 * 型レベルで示すための補助型。テストで使用する。
 */
export type AccessRequirementFields = {
  readonly kind: AccessRequirementKind
  readonly spotId?: FishingSpotId
}
