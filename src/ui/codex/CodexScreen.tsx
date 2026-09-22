import { useMemo, useState } from 'react'
import { WATER_TYPES, type WaterType } from '../../domain/primitives'
import { contentRuntime } from '../../content/runtime/contentRuntime'
import {
  CODEX_PAGE_SIZE,
  filterSpeciesSummaries,
  paginateSummaries,
  SPECIES_CATCH_FILTERS,
  type SpeciesCatchFilter,
} from '../../content/catalog/speciesSearch'
import type { SpeciesSummary } from '../../content/catalog/summary'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { FishSilhouette } from '../components/FishSilhouette'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import './codex.css'

/**
 * CODEX（Phase 14 / Phase 15 で軽量カタログ対応）。
 *
 * Phase 15:
 * - 一覧・検索・絞り込みは **SpeciesSummary（軽量カタログ）** だけで完結させる。
 *   full FishSpecies（生物学の詳細）は読まない（1000 種でも起動コストが増えない）。
 * - 検索は日本語名 / 英語名（Content にある場合）/ scientificName / id。
 * - 1000 件を一度に DOM へ出さないため、60 件ずつ増やす。
 * - 未捕獲種の情報は今までどおり出さない（？？？）。新しい Knowledge ルールは作らない。
 */

const CATCH_FILTER_LABELS: Readonly<Record<SpeciesCatchFilter, string>> = {
  all: 'すべて',
  caught: '捕獲済',
  uncaught: '未捕獲',
}

const WATER_TYPE_LABELS: Readonly<Record<WaterType, string>> = {
  fresh: '淡水',
  brackish: '汽水',
  salt: '海水',
}

export const CodexScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const codex = usePlayerStore((state) => state.codex)
  const [catchFilter, setCatchFilter] = useState<SpeciesCatchFilter>('all')
  const [regionId, setRegionId] = useState<string>('all')
  const [waterType, setWaterType] = useState<'all' | WaterType>('all')
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(CODEX_PAGE_SIZE)

  // 軽量カタログ（起動時に読み込み済み）。
  const summaries: readonly SpeciesSummary[] = contentRuntime.index.species
  const regions = contentRuntime.index.regions
  const caughtIds = useMemo(() => new Set(Object.keys(codex.species)), [codex.species])
  const caughtCount = caughtIds.size
  const regionNameById = useMemo(
    () => new Map(regions.map((region) => [String(region.id), region.name])),
    [regions],
  )
  const playableRegions = useMemo(
    () =>
      regions
        .filter((region) => region.stage === 'playable')
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [regions],
  )

  const visible = useMemo(
    () =>
      filterSpeciesSummaries(summaries, {
        query,
        catchFilter,
        regionId,
        waterType,
        caughtIds,
      }),
    [summaries, query, catchFilter, regionId, waterType, caughtIds],
  )

  /*
   * フィルタが変わったら表示件数を戻す（「さらに表示」の状態を持ち越さない）。
   * hooks の順序を保つため、render 中に前回値と比較して調整する。
   */
  const filterKey = `${query}|${catchFilter}|${regionId}|${waterType}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)

  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey)
    setVisibleCount(CODEX_PAGE_SIZE)
  }

  const page = paginateSummaries(visible, visibleCount)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const updateQuery = (value: string): void => {
    setQuery(value)
    setVisibleCount(CODEX_PAGE_SIZE)
  }

  const updateCatchFilter = (value: SpeciesCatchFilter): void => {
    setCatchFilter(value)
    setVisibleCount(CODEX_PAGE_SIZE)
  }

  const updateRegion = (value: string): void => {
    setRegionId(value)
    setVisibleCount(CODEX_PAGE_SIZE)
  }

  const updateWaterType = (value: 'all' | WaterType): void => {
    setWaterType(value)
    setVisibleCount(CODEX_PAGE_SIZE)
  }

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            setActiveScreen('home')
          }}
        >
          ← 自宅
        </button>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">CODEX</p>
        <h2 className="panel__heading">図鑑</h2>
        <p className="panel__body">
          <span className="pixel-number">{caughtCount}</span> / {summaries.length} 種 記録済み
        </p>

        <label className="codex-search">
          <span className="codex-search__label">名前で探す</span>
          <input
            className="codex-search__input"
            type="search"
            value={query}
            placeholder="例: マアジ / maaji"
            onChange={(event) => {
              updateQuery(event.target.value)
            }}
          />
        </label>

        <div className="tabs">
          {SPECIES_CATCH_FILTERS.map((filter) => (
            <button
              key={filter}
              className={`tab${catchFilter === filter ? ' tab--active' : ''}`}
              type="button"
              onClick={() => {
                updateCatchFilter(filter)
              }}
            >
              {CATCH_FILTER_LABELS[filter]}
            </button>
          ))}
        </div>

        <div className="tabs">
          <button
            className={`tab${regionId === 'all' ? ' tab--active' : ''}`}
            type="button"
            onClick={() => {
              updateRegion('all')
            }}
          >
            全地域
          </button>
          {playableRegions.map((region) => (
            <button
              key={String(region.id)}
              className={`tab${regionId === String(region.id) ? ' tab--active' : ''}`}
              type="button"
              onClick={() => {
                updateRegion(String(region.id))
              }}
            >
              {region.name}
            </button>
          ))}
        </div>

        <div className="tabs">
          <button
            className={`tab${waterType === 'all' ? ' tab--active' : ''}`}
            type="button"
            onClick={() => {
              updateWaterType('all')
            }}
          >
            全水域
          </button>
          {WATER_TYPES.map((type) => (
            <button
              key={type}
              className={`tab${waterType === type ? ' tab--active' : ''}`}
              type="button"
              onClick={() => {
                updateWaterType(type)
              }}
            >
              {WATER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </section>

      <section>
        {visible.length === 0 ? (
          <div className="panel">
            <p className="panel__body">この条件に合う魚種が無い。</p>
          </div>
        ) : (
          <>
            <ul className="codex-grid">
              {page.visible.map((entry) => {
                const record = codex.species[String(entry.id)]
                const caught = record !== undefined
                const regionName =
                  entry.regionIds.length === 0
                    ? undefined
                    : regionNameById.get(String(entry.regionIds[0]))

                return (
                  <li
                    className={`codex-tile${caught ? '' : ' codex-tile--locked'}`}
                    key={String(entry.id)}
                  >
                    <FishSilhouette speciesId={String(entry.id)} unknown={!caught} size={36} />
                    <span className="codex-tile__name">
                      {caught ? entry.japaneseName : '？？？'}
                    </span>
                    {caught ? (
                      <span className="codex-tile__meta">
                        {record.catchCount} 匹 / {record.largestLengthCm} cm
                      </span>
                    ) : (
                      <span className="codex-tile__meta">{regionName ?? '未確認'}</span>
                    )}
                  </li>
                )
              })}
            </ul>

            <p className="codex-count">
              {page.shown} / {page.total} 種を表示中
            </p>

            {page.hasMore ? (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setVisibleCount((current) => current + CODEX_PAGE_SIZE)
                }}
              >
                さらに表示（+{CODEX_PAGE_SIZE}）
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
