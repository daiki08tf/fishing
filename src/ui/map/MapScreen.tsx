import { fastestTravelOption } from '../../domain/access/accessEngine'
import { formatDuration } from '../../domain/world'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

/**
 * 釣り場の一覧（Phase 4 の Map）。
 *
 * GIS 地図ではなく、行けるかどうかと所要時間が分かるカード一覧。
 * 行けない場合は理由を出す（Level 不足とは出さない）。
 */

const ENVIRONMENT_LABELS: Readonly<Record<string, string>> = {
  canal: '運河',
  river: '河川',
  estuary: '汽水（河口）',
  bay_shore: '海（岸）',
  lake: '湖',
  managed_pond: '管理釣り場',
}

export const MapScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const world = usePlayerStore((state) => state.world)
  const knowledge = usePlayerStore((state) => state.knowledge)
  const evaluateSpot = usePlayerStore((state) => state.evaluateSpot)
  const travelToSpot = usePlayerStore((state) => state.travelToSpot)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  if (world.phase !== 'HOME') {
    return (
      <section className="panel">
        <h2 className="panel__heading">釣り場にいる</h2>
        <p className="panel__body">釣り場から別の釣り場へは直接移動できない。</p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setActiveScreen('spot')
          }}
        >
          今いる釣り場へ戻る
        </button>
      </section>
    )
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
        <p className="fishing__phase-code">MAP</p>
        <h2 className="panel__heading">東京近郊の釣り場</h2>
        <p className="panel__body">行けない釣り場は理由が出る。移動すると時間が進む。</p>
      </section>

      <section>
        <ul className="spots">
          {content.value.spots.map((spot) => {
            const access = evaluateSpot(spot)
            const fastest = fastestTravelOption(access.travelOptions)
            const score = spotKnowledgeScore(knowledge, String(spot.id))
            const discovered = world.discoveredSpotIds.includes(spot.id)

            return (
              <li className="spot-card" key={String(spot.id)}>
                <div className="spot-card__head">
                  <h3 className="panel__subheading">{spot.name}</h3>
                  <span className={`badge${access.accessible ? '' : ' badge--alert'}`}>
                    {access.accessible
                      ? fastest === null
                        ? '到達手段なし'
                        : `電車・徒歩など ${formatDuration(fastest.minutes)}`
                      : 'アクセス不可'}
                  </span>
                </div>
                <p className="spot-card__meta">
                  {ENVIRONMENT_LABELS[spot.environment] ?? spot.environment}
                  {spot.dataStatus === 'provisional' ? ' / 暫定データ' : ''}
                  {discovered ? ' / 訪問済み' : ''}
                </p>
                <p className="spot-card__meta">
                  この釣り場の知識 {Math.round(score)}% / 魚種 {spot.fishTable.length} 種
                </p>

                {access.accessible ? (
                  <button
                    className="control"
                    type="button"
                    onClick={() => {
                      const result = travelToSpot(spot)

                      if (result.ok) {
                        setActiveScreen('spot')
                      }
                    }}
                  >
                    行く
                  </button>
                ) : (
                  <ul className="blocked">
                    {access.blockedReasons.map((reason) => (
                      <li key={`${reason.kind}-${reason.label}`}>{reason.label}</li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
