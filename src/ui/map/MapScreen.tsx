import { useState } from 'react'
import {
  defaultTravelOption,
  describeTravelCost,
  describeTravelCostParts,
} from '../../domain/economy'
import { formatDuration } from '../../domain/world'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import {
  resolveEnvironment,
  resolveFishingConditions,
  CONDITION_SUMMARY_LABELS,
} from '../../domain/environment'
import { NEUTRAL_FISHING_MODIFIERS } from '../../domain/fishing/PlayerFishingModifiers'
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
  const evaluateTrip = usePlayerStore((state) => state.evaluateTrip)
  const travelToSpot = usePlayerStore((state) => state.travelToSpot)
  /**
   * Spot ごとに選んだ移動手段。
   * 未選択のときは最も安い候補を既定にする（速いだけの高額な候補を黙って選ばない）。
   */
  const [selectedTransportIds, setSelectedTransportIds] = useState<Record<string, string>>({})
  /** 表示する地域。既定は今いる地域（Phase 8）。 */
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)

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

  const currentRegionId = String(world.currentRegionId)
  const regionId = selectedRegionId ?? currentRegionId
  const regions = content.value.regions
    .filter((region) => region.stage === 'playable' || String(region.id) === currentRegionId)
    .slice()
    .sort(
      (left, right) =>
        left.countryId.localeCompare(right.countryId) || left.name.localeCompare(right.name),
    )
  const region = content.value.regionById[regionId]
  // Phase 13: Hidden Spot は discover 前（world.discoveredSpotIds に無い）は Map に出さない。
  const regionSpots = content.value.spots.filter(
    (spot) =>
      String(spot.regionId) === regionId &&
      (spot.visibility !== 'hidden' || world.discoveredSpotIds.includes(spot.id)),
  )
  const inRegion = regionId === currentRegionId

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
        <h2 className="panel__heading">{region?.name ?? regionId} の釣り場</h2>
        <p className="panel__body">
          行けない釣り場は理由が出る。移動すると時間が進む。
          {inRegion
            ? ''
            : `（今は ${content.value.regionById[currentRegionId]?.name ?? currentRegionId} にいる）`}
        </p>
        <div className="tabs">
          {regions.map((candidate) => {
            const country = content.value.countryById[String(candidate.countryId)]
            const active = String(candidate.id) === regionId

            return (
              <button
                className={`button${active ? ' button--primary' : ' button--ghost'}`}
                key={String(candidate.id)}
                type="button"
                onClick={() => {
                  setSelectedRegionId(String(candidate.id))
                }}
              >
                {country === undefined ? candidate.name : `${country.name} / ${candidate.name}`}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <ul className="spots">
          {regionSpots.map((spot) => {
            const spotId = String(spot.id)
            const access = evaluateSpot(spot, content.value.transports)
            const options = access.travelOptions
            const selected =
              options.find(
                (option) => String(option.transportId) === selectedTransportIds[spotId],
              ) ?? defaultTravelOption(options)
            const readiness =
              selected === null ? null : evaluateTrip(spot, selected, content.value.transports)
            const score = spotKnowledgeScore(knowledge, spotId)
            const discovered = world.discoveredSpotIds.includes(spot.id)
            const area =
              spot.areaId === undefined
                ? undefined
                : region?.areas.find((candidate) => candidate.id === spot.areaId)
            const canGo = inRegion && access.accessible && (readiness?.affordable ?? false)
            const spotRegion = content.value.regionById[String(spot.regionId)]
            const conditions =
              spotRegion === undefined
                ? null
                : resolveFishingConditions({
                    environment: resolveEnvironment({
                      time: world.time,
                      climate: spotRegion.climate,
                      regionId: String(spotRegion.id),
                      environment: spot.environment,
                    }),
                    species: spot.fishTable.flatMap((occurrence) => {
                      const species = content.value.speciesById[String(occurrence.speciesId)]
                      return species === undefined ? [] : [species]
                    }),
                    tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
                    hasFishFinder: false,
                    searchSign: null,
                    knowledgeScore: spotKnowledgeScore(knowledge, spotId),
                  })

            return (
              <li className="spot-card" key={spotId}>
                <div className="spot-card__head">
                  <h3 className="panel__subheading">{spot.name}</h3>
                  <span className={`badge${access.accessible ? '' : ' badge--alert'}`}>
                    {!inRegion
                      ? '遠征が必要'
                      : access.accessible
                        ? selected === null
                          ? '到達手段なし'
                          : `${selected.transportName} ${formatDuration(selected.minutes)}`
                        : 'アクセス不可'}
                  </span>
                </div>
                <p className="spot-card__meta">
                  {ENVIRONMENT_LABELS[spot.environment] ?? spot.environment}
                  {spot.dataStatus === 'provisional' ? ' / 暫定データ' : ''}
                  {area === undefined ? '' : ` / ${area.name}`}
                  {/* Phase 13.1: discoveredSpotIds は「訪問済み」ではなく「発見済み」。
                      Contact から場所を教わっただけの Hidden Spot も含む。 */}
                  {discovered ? ' / 発見済み' : ''}
                </p>
                <p className="spot-card__meta">
                  この釣り場の知識 {Math.round(score)}% / 魚種 {spot.fishTable.length} 種
                </p>
                {conditions === null || !inRegion ? null : (
                  <p className="spot-card__meta">
                    釣況: {CONDITION_SUMMARY_LABELS[conditions.summary]} /{' '}
                    {conditions.activityLabel}
                  </p>
                )}

                {!inRegion || options.length === 0 ? null : (
                  <ul className="travel-options">
                    {options.map((option) => {
                      const optionId = String(option.transportId)
                      const chosen = selected !== null && String(selected.transportId) === optionId
                      const affordable = evaluateTrip(
                        spot,
                        option,
                        content.value.transports,
                      ).affordable
                      const parts = describeTravelCostParts(option)

                      return (
                        <li
                          className={`travel-option${chosen ? ' travel-option--selected' : ''}`}
                          key={optionId}
                        >
                          <button
                            className="travel-option__choice"
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => {
                              setSelectedTransportIds((current) => ({
                                ...current,
                                [spotId]: optionId,
                              }))
                            }}
                          >
                            <span className="travel-option__name">
                              {`${chosen ? '●' : '○'} ${option.transportName}`}
                            </span>
                            <span className="travel-option__meta">
                              {`${formatDuration(option.minutes)} / ${describeTravelCost(option)}`}
                            </span>
                          </button>
                          {parts.length === 0 ? null : (
                            <span className="travel-option__parts">{parts.join(' + ')}</span>
                          )}
                          {affordable ? null : (
                            <span className="travel-option__note">交通費が足りない</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {canGo ? (
                  <button
                    className="control"
                    type="button"
                    onClick={() => {
                      const result = travelToSpot(
                        spot,
                        content.value.transports,
                        selected?.transportId,
                      )

                      if (result.ok) {
                        setActiveScreen('spot')
                      }
                    }}
                  >
                    {selected === null ? '行く' : `${selected.transportName} で行く`}
                  </button>
                ) : (
                  <ul className="blocked">
                    {!inRegion ? (
                      <li key="region">現在この地域にいません（EXPEDITION で遠征する）</li>
                    ) : access.accessible ? (
                      [
                        <li key="cost">
                          交通費が足りない
                          {selected === null ? '' : `（${String(readiness?.roundTripCost)}円）`}
                        </li>,
                      ]
                    ) : (
                      access.blockedReasons.map((reason) => (
                        <li key={`${reason.kind}-${reason.label}`}>{reason.label}</li>
                      ))
                    )}
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
