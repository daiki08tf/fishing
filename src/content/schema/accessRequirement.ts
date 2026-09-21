import { z } from 'zod'
import { asPermitId, asRelationshipTargetId } from '../../domain/ids'
import { monthSchema, nonEmptyString } from './primitives'

/**
 * AccessRequirement。DATA_MODEL.md §10 に対応する。
 *
 * Angler Level による解禁条件は定義しない（DECISIONS.md §5）。
 * この制約は tests/domain/no-level-gate.test.ts で機械的に検査する。
 */
export const accessRequirementSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('transport'),
    tag: nonEmptyString,
  }),
  z.strictObject({
    kind: z.literal('knowledge'),
    minimum: z.number().min(0).max(100),
    /** 省略時は「その Spot の知識」、'region' なら「その地域の知識」。 */
    scope: z.enum(['spot', 'region']).optional(),
  }),
  z.strictObject({
    kind: z.literal('reputation'),
    minimum: z.number().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('permit'),
    permitId: nonEmptyString.transform(asPermitId),
  }),
  z.strictObject({
    kind: z.literal('relationship'),
    targetId: nonEmptyString.transform(asRelationshipTargetId),
    minimum: z.number().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('season'),
    months: z.array(monthSchema).min(1),
  }),
])
