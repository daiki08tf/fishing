import { z } from 'zod'
import {
  ACCESS_CAPABILITIES,
  BOAT_CAPABILITIES,
  LAUNCH_CAPABILITIES,
  ROUTE_FEATURES,
  TRANSPORT_OWNERSHIP_MODELS,
  TRANSPORT_TYPES,
} from '../../domain/access/Transport'
import { asTransportId } from '../../domain/ids'
import { nonEmptyString } from './primitives'

export const transportTypeSchema = z.enum(TRANSPORT_TYPES)
export const accessCapabilitySchema = z.enum(ACCESS_CAPABILITIES)
export const routeFeatureSchema = z.enum(ROUTE_FEATURES)

const travelCostModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('route_fare') }),
  z.strictObject({ kind: z.literal('free') }),
  z.strictObject({
    kind: z.literal('per_km'),
    yenPerKm: z.number().nonnegative(),
    minimumOneWayCost: z.number().int().nonnegative(),
  }),
])

export const transportSchema = z
  .strictObject({
    id: nonEmptyString.transform(asTransportId),
    name: nonEmptyString,
    transportType: transportTypeSchema,
    ownershipModel: z.enum(TRANSPORT_OWNERSHIP_MODELS),
    purchasePrice: z.number().int().nonnegative().optional(),
    rentalCost: z.number().int().nonnegative().optional(),
    travelCostModel: travelCostModelSchema,
    travelTimeModifier: z.number().positive(),
    maxRangeKm: z.number().positive().optional(),
    cargo: z.strictObject({
      gearUnits: z.number().int().nonnegative(),
      maxWeightKg: z.number().nonnegative(),
    }),
    capabilities: z.array(accessCapabilitySchema),
    requiredRouteFeatures: z.array(routeFeatureSchema),
    launchCapability: z.enum(LAUNCH_CAPABILITIES),
    boatCapability: z.enum(BOAT_CAPABILITIES),
    passengerCapacity: z.number().int().nonnegative(),
  })
  .superRefine((definition, context) => {
    if (definition.ownershipModel === 'owned' && definition.purchasePrice === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['purchasePrice'],
        message: 'owned transport requires purchasePrice',
      })
    }

    if (definition.ownershipModel === 'rental' && definition.rentalCost === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rentalCost'],
        message: 'rental transport requires rentalCost',
      })
    }
  })
