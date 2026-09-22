import type { RegionId, FishSpeciesId } from '../../domain/ids'
import type { WaterType } from '../../domain/primitives'

/**
 * Content Scale Foundation（Phase 15）— 軽量カタログ。
 *
 * 起動時に必要なのは「一覧・検索・絞り込みに使う小さな索引」だけである。
 * 生物学の詳細（lengthModel / fightProfile / environmentAffinity …）、
 * Spot の地形・access、Trade の tuning は **含めない**（それは Content Pack 側）。
 *
 * この型は browser / node の両方で使う（環境依存の処理は持たない）。
 * 実データは `scripts/build-content-index.ts` が `src/content/data` から生成する
 * （Content 定義を二重管理しないため、手で書かない）。
 */

/** 魚種の大まかな水域カテゴリ（表示・絞り込み用。ゲームルールではない）。 */
export const SPECIES_CATEGORIES = ['freshwater', 'saltwater', 'brackish', 'mixed'] as const
export type SpeciesCategory = (typeof SPECIES_CATEGORIES)[number]

/** 希少度の帯（表示用。FishSpecies.rarity から派生させるだけで、新しい判定はしない）。 */
export const RARITY_BANDS = ['common', 'uncommon', 'rare'] as const
export type RarityBand = (typeof RARITY_BANDS)[number]

/**
 * 魚種の軽量サマリ。
 * Codex の一覧・検索・絞り込みはこれだけで完結させる（full FishSpecies を読まない）。
 */
export type SpeciesSummary = {
  readonly id: FishSpeciesId
  readonly japaneseName: string
  readonly scientificName?: string
  /** Content に存在する場合だけ（無くても検索は scientificName / id で引ける）。 */
  readonly englishName?: string
  readonly waterTypes: readonly WaterType[]
  readonly category: SpeciesCategory
  /** 分布している Region（canonical な global Species ID のまま）。 */
  readonly regionIds: readonly RegionId[]
  readonly habitats: readonly string[]
  readonly rarityBand: RarityBand
  /**
   * Phase 15.1: この Species の detail（生物学 + trade profile）を持つ shard の key。
   * Region ごとの shard に分かれているので、Fish Box の別地域の魚も
   * この key から必要分だけ読める。
   */
  readonly detailShard: string
}

/** Region の軽量サマリ。pack を持つかどうかもここで分かる。 */
export type RegionSummary = {
  readonly id: RegionId
  readonly name: string
  readonly countryId: string
  readonly countryName: string
  readonly stage: 'playable' | 'planned'
  /** 遅延ロードする Content Pack の key（planned region は null）。 */
  readonly packKey: string | null
}

/** Pack が内包する Content（kind → ファイル名の一覧）。 */
export type ContentPackManifestEntry = {
  readonly key: string
  /** region: その地域の Spot/Buyer/Reward / species: その地域の Species detail / global: 地域非依存。 */
  readonly kind: 'region' | 'species' | 'global'
  readonly label: string
  readonly regionId?: RegionId
  /**
   * その pack が含む Content の種別（所有ファイルの一覧は生成される pack module が持つ。
   * 初期 chunk を Content 件数に比例させないため、ここには kind だけを置く）。
   */
  readonly kinds?: readonly string[]
}

export type ContentIndex = {
  readonly generatedFrom: string
  readonly counts: Readonly<Record<string, number>>
  readonly species: readonly SpeciesSummary[]
  readonly regions: readonly RegionSummary[]
  readonly packs: readonly ContentPackManifestEntry[]
  /**
   * Phase 15.1: 各 Species shard（`species:<regionId>`）が持つ Species ID。
   * 「その地域を遊ぶのに必要な Species だけを読む」ことを UI / 検証 / レポートから
   * 確認するために置く（生物学の詳細そのものは含まない）。
   */
  readonly speciesShards?: Readonly<Record<string, readonly string[]>>
}

export const findPackForRegion = (
  index: ContentIndex,
  regionId: string,
): ContentPackManifestEntry | null =>
  index.packs.find(
    (pack) => pack.kind === 'region' && String(pack.regionId) === String(regionId),
  ) ?? null

export const findGlobalPack = (index: ContentIndex, key: string): ContentPackManifestEntry | null =>
  index.packs.find((pack) => pack.key === key) ?? null

/** 検索用に正規化する（全角/半角・大文字小文字の差を吸収する）。 */
export const normalizeSearchText = (value: string): string => value.normalize('NFKC').toLowerCase()

/**
 * 検索対象の文字列を作る。
 * Content に英語名が無い場合は scientificName / id でも引けるようにする。
 */
export const speciesSearchText = (summary: SpeciesSummary): string =>
  normalizeSearchText(
    [
      summary.japaneseName,
      summary.englishName ?? '',
      summary.scientificName ?? '',
      String(summary.id),
    ].join(' '),
  )
