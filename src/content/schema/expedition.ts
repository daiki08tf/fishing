import { z } from 'zod'
import { asExpeditionId, asPermitId, asRegionId } from '../../domain/ids'
import { FLIGHT_TYPES } from '../../domain/expedition/Expedition'
import { WORLD_DATA_STATUSES } from '../../domain/world/Region'
import { nonEmptyString } from './primitives'

/**
 * Expedition（遠征計画）。
 *
 * 航空券（往復）・宿泊・許可をまとめた「行き方」であり、便・座席・予約番号は持たない。
 * 現地での移動は Phase 7A の Transport / Access をそのまま使う。
 */
export const expeditionSchema = z
  .strictObject({
    id: nonEmptyString.transform(asExpeditionId),
    regionId: nonEmptyString.transform(asRegionId),
    name: nonEmptyString,
    dataStatus: z.enum(WORLD_DATA_STATUSES),
    flight: z.strictObject({
      transportType: z.enum(FLIGHT_TYPES),
      name: nonEmptyString,
      oneWayCostYen: z.number().int().nonnegative(),
      oneWayMinutes: z.number().int().positive(),
    }),
    nights: z.strictObject({
      default: z.number().int().positive(),
      min: z.number().int().positive(),
      max: z.number().int().positive(),
    }),
    lodgings: z
      .array(
        z.strictObject({
          id: nonEmptyString,
          name: nonEmptyString,
          nightlyCostYen: z.number().int().nonnegative(),
        }),
      )
      .min(1),
    permit: z
      .strictObject({
        permitId: nonEmptyString.transform(asPermitId),
        name: nonEmptyString,
        costYen: z.number().int().nonnegative(),
      })
      .optional(),
  })
  .superRefine((expedition, context) => {
    if (
      expedition.nights.min > expedition.nights.default ||
      expedition.nights.default > expedition.nights.max
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nights'],
        message: 'nights must satisfy min <= default <= max',
      })
    }

    const ids = new Set(expedition.lodgings.map((lodging) => lodging.id))

    if (ids.size !== expedition.lodgings.length) {
      context.addIssue({
        code: 'custom',
        path: ['lodgings'],
        message: 'lodging ids must be unique',
      })
    }
  })
