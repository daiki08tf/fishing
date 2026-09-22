import { useState } from 'react'
import { WATER_TYPES, type WaterType } from '../../domain/primitives'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { FishSilhouette } from '../components/FishSilhouette'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import './codex.css'

/**
 * CODEX（Phase 14）。
 *
 * 捕獲済み / 未捕獲を Grid で見せる図鑑。82 種でも、将来 1000 種になっても
 * DOM を無駄に重くしない（1 種 1 小さな Card。仮想化は Phase 15 の対象）。
 * 新しい Knowledge / Codex ルールは作らない。既存 CodexState をそのまま読む。
 */

const CATCH_FILTERS = ['all', 'caught', 'uncaught'] as const
type CatchFilter = (typeof CATCH_FILTERS)[number]

const CATCH_FILTER_LABELS: Readonly<Record<CatchFilter, string>> = {
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
  const [catchFilter, setCatchFilter] = useState<CatchFilter>('all')
  const [regionId, setRegionId] = useState<string>('all')
  const [waterType, setWaterType] = useState<'all' | WaterType>('all')

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { species, regions, regionById } = content.value
  const playableRegions = regions
    .filter((region) => region.stage === 'playable')
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))

  const caughtCount = species.filter((entry) => codex.species[String(entry.id)] !== undefined).length

  const visible = species.filter((entry) => {
    const caught = codex.species[String(entry.id)] !== undefined

    if (catchFilter === 'caught' && !caught) {
      return false
    }

    if (catchFilter === 'uncaught' && caught) {
      return false
    }

    if (regionId !== 'all' && !entry.distribution.some((ref) => String(ref) === regionId)) {
      return false
    }

    if (waterType !== 'all' && !entry.waterTypes.includes(waterType)) {
      return false
    }

    return true
  })

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
          <span className="pixel-number">{caughtCount}</span> / {species.length} 種 記録済み
        </p>

        <div className="tabs">
          {CATCH_FILTERS.map((filter) => (
            <button
              key={filter}
              className={`tab${catchFilter === filter ? ' tab--active' : ''}`}
              type="button"
              onClick={() => {
                setCatchFilter(filter)
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
              setRegionId('all')
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
                setRegionId(String(region.id))
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
              setWaterType('all')
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
                setWaterType(type)
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
          <ul className="codex-grid">
            {visible.map((entry) => {
              const record = codex.species[String(entry.id)]
              const caught = record !== undefined
              const region = regionById[String(entry.distribution[0])]

              return (
                <li
                  className={`codex-tile${caught ? '' : ' codex-tile--locked'}`}
                  key={String(entry.id)}
                >
                  <FishSilhouette speciesId={String(entry.id)} unknown={!caught} size={36} />
                  <span className="codex-tile__name">{caught ? entry.japaneseName : '？？？'}</span>
                  {caught ? (
                    <span className="codex-tile__meta">{record.catchCount} 匹 / {record.largestLengthCm} cm</span>
                  ) : (
                    <span className="codex-tile__meta">
                      {region === undefined ? '未確認' : region.name}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
