import type { WaterType } from '../../domain/primitives'
import { normalizeSearchText, speciesSearchText, type SpeciesSummary } from './summary'

/**
 * 軽量カタログの検索・絞り込み（Phase 15）。
 *
 * Codex などの一覧は full FishSpecies ではなく SpeciesSummary だけを使う。
 * ここは純粋関数なので、1000 件の synthetic data でも同じコードをテストできる。
 *
 * 検索は「日本語名 / 英語名（Content にある場合）/ scientificName / id」に当てる。
 * 実在しない英語名を捏造しないため、Content に無い場合は scientificName と id で引く。
 */

export const SPECIES_CATCH_FILTERS = ['all', 'caught', 'uncaught'] as const
export type SpeciesCatchFilter = (typeof SPECIES_CATCH_FILTERS)[number]

export type SpeciesQuery = {
  readonly query?: string
  readonly catchFilter?: SpeciesCatchFilter
  readonly regionId?: string
  readonly waterType?: WaterType | 'all'
  /** 捕獲済み Species の id（Codex State から渡す）。 */
  readonly caughtIds?: ReadonlySet<string>
  readonly category?: SpeciesSummary['category'] | 'all'
}

const matchesText = (summary: SpeciesSummary, terms: readonly string[]): boolean => {
  if (terms.length === 0) {
    return true
  }

  const haystack = speciesSearchText(summary)

  return terms.every((term) => haystack.includes(term))
}

export const filterSpeciesSummaries = (
  summaries: readonly SpeciesSummary[],
  query: SpeciesQuery = {},
): readonly SpeciesSummary[] => {
  const terms = normalizeSearchText(query.query ?? '')
    .split(/\s+/)
    .filter((term) => term.length > 0)
  const catchFilter = query.catchFilter ?? 'all'
  const category = query.category ?? 'all'
  const waterType = query.waterType ?? 'all'

  return summaries.filter((summary) => {
    if (!matchesText(summary, terms)) {
      return false
    }

    if (catchFilter !== 'all') {
      const caught = query.caughtIds?.has(String(summary.id)) ?? false

      if (catchFilter === 'caught' && !caught) {
        return false
      }

      if (catchFilter === 'uncaught' && caught) {
        return false
      }
    }

    if (query.regionId !== undefined && query.regionId !== 'all') {
      if (!summary.regionIds.some((regionId) => String(regionId) === query.regionId)) {
        return false
      }
    }

    if (waterType !== 'all' && !summary.waterTypes.includes(waterType)) {
      return false
    }

    if (category !== 'all' && summary.category !== category) {
      return false
    }

    return true
  })
}

export type PaginatedResult<T> = {
  readonly visible: readonly T[]
  readonly hasMore: boolean
  readonly shown: number
  readonly total: number
}

/** 一度に描く件数を絞る（1000 件を 1 回の DOM へ出さない）。 */
export const paginateSummaries = <T>(
  items: readonly T[],
  visibleCount: number,
): PaginatedResult<T> => {
  const shown = Math.max(0, Math.min(visibleCount, items.length))

  return {
    visible: items.slice(0, shown),
    hasMore: shown < items.length,
    shown,
    total: items.length,
  }
}

/** Codex の 1 ページ分（スクロール前に出す件数）。 */
export const CODEX_PAGE_SIZE = 60
