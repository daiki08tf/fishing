import { z } from 'zod'
import { asCountryId } from '../../domain/ids'
import { WORLD_DATA_STATUSES } from '../../domain/world/Region'
import { nonEmptyString } from './primitives'

/** Country。Phase 8 の世界階層の最上位。 */
export const countrySchema = z.strictObject({
  id: nonEmptyString.transform(asCountryId),
  name: nonEmptyString,
  /** 日本国内か（国内 / 海外で同じ仕組みを使うための区別）。 */
  domestic: z.boolean(),
  /** 表示用の通貨 metadata。換算はしない。 */
  currency: z
    .strictObject({
      code: nonEmptyString,
      symbol: nonEmptyString,
    })
    .optional(),
  dataStatus: z.enum(WORLD_DATA_STATUSES),
})
