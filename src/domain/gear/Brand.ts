import type { BrandId } from '../ids'

/**
 * 釣具ブランド（架空）。DECISIONS.md §1 のとおり、初期は架空ブランドだけを使う。
 *
 * 重要（Phase 6）:
 * **ブランド自体に性能倍率を持たせない。**
 * ブランドは「製品を整理して語るための属性」であり、
 * 性能差は各 Gear 製品の現実由来スペック（長さ・重量域・ドラッグ力など）で表現する。
 * これにより、ブランドを増やしても Engine は変わらない。
 *
 * Product Family は `Brand → Series → Model` の階層で表現する。
 * Series は UI / Content 上の整理概念であり、FishingEngine は Series 名を知らない。
 */

export type BrandDefinition = {
  readonly id: BrandId
  readonly name: string
  readonly description: string
  /** 得意分野（表示用。性能には影響しない）。 */
  readonly specialties: readonly string[]
  /** 雰囲気の分類（表示用。例: 'japan_domestic'）。 */
  readonly countryStyle: string
  readonly tagline: string
}

export const brandById = (
  brands: readonly BrandDefinition[],
  id: BrandId | string | undefined,
): BrandDefinition | undefined =>
  id === undefined ? undefined : brands.find((brand) => brand.id === id)
