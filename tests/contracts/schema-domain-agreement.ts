import type { z } from 'zod'
import type { fishingSpotSchema } from '../../src/content/schema/fishingSpot'
import type { fishSpeciesSchema } from '../../src/content/schema/fishSpecies'
import type { regulationSchema } from '../../src/content/schema/regulation'
import type { sourceRefSchema } from '../../src/content/schema/sourceRef'
import type { transportSchema } from '../../src/content/schema/transport'
import type { TransportDefinition } from '../../src/domain/access/Transport'
import type { FishSpecies } from '../../src/domain/fish/FishSpecies'
import type { Regulation } from '../../src/domain/regulation/Regulation'
import type { SourceRef } from '../../src/domain/source/SourceRef'
import type { FishingSpot } from '../../src/domain/world/FishingSpot'

/**
 * 「実行時スキーマの出力」が「Domain の契約」に代入可能であることを、
 * コンパイル時に強制する。
 *
 * どちらかを変更して食い違うと、このファイルが型エラーになる。
 * 実行時テストではなく tsc（npm run typecheck）で検出するのが目的である。
 */

type AssertAssignable<TValue extends TTarget, TTarget> = TValue extends TTarget ? true : never

export type FishSpeciesSchemaMatchesDomain = AssertAssignable<
  z.infer<typeof fishSpeciesSchema>,
  FishSpecies
>

export type FishingSpotSchemaMatchesDomain = AssertAssignable<
  z.infer<typeof fishingSpotSchema>,
  FishingSpot
>

export type TransportSchemaMatchesDomain = AssertAssignable<
  z.infer<typeof transportSchema>,
  TransportDefinition
>

export type RegulationSchemaMatchesDomain = AssertAssignable<
  z.infer<typeof regulationSchema>,
  Regulation
>

export type SourceRefSchemaMatchesDomain = AssertAssignable<
  z.infer<typeof sourceRefSchema>,
  SourceRef
>
