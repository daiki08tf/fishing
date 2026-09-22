import { useState, type FC } from 'react'
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
import type { FishingSpot } from '../../domain/world/FishingSpot'
import type { TransportId } from '../../domain/ids'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { PixelIcon } from '../components/PixelIcon'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import { buildMapBoard, MAP_BAND_LABELS } from './spotPlacement'
import './map.css'

/**
 * 釣り場の一覧（Phase 4 の Map / Phase 14.1 で「地図 → 詳細」の 2 段に再構成）。
 *
 * Phase 14.1:
 * - 最初に見えるのは **地図ボード**（上流 → 川 → 海 → 沖 の帯に Spot ノードを置く）。
 *   実座標は使わず、Content の environment から決定的に配置する。
 * - ノードを押すと、ボードの直下に Spot summary が出て、そのまま移動できる。
 * - 従来のカード一覧は「釣り場の詳細」として下に残す（移動手段・費用・行けない理由）。
 * - 未発見の Hidden Spot はノードも詳細も出さない（Discovery の規則は変えない）。
 */

const ENVIRONMENT_LABELS: Readonly<Record<string, string>> = {
  canal: '運河',
  river: '河川',
  estuary: '汽水（河口）',
  bay_shore: '海（岸）',
  lake: '湖',
  managed_pond: '管理釣り場',
  nearshore: '近海',
  offshore: '沖',
}

export type MapScreenProps = {
  /**
   * 初期選択の Spot（Phase 14.1）。通常のプレイでは未指定で、地図ノードを押して選ぶ。
   * テスト（SSR）で「ノードを選んだときの summary」を検証できるようにするためだけの入口。
   */
  readonly initialSelectedSpotId?: string
}

export const MapScreen: FC<MapScreenProps> = ({ initialSelectedSpotId }) => {
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
  /** 地図ボードで選んだ Spot（詳細と summary を出す）。 */
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(initialSelectedSpotId ?? null)

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

  /*
   * 各 Spot の派生値（access / 移動手段 / 費用 / 知識 / 釣況）は 1 回だけ解決し、
   * 地図ノード・summary・詳細カードで同じ値を使い回す（3 か所で別々に計算しない）。
   */
  const spotRows = regionSpots.map((spot) => {
    const spotId = String(spot.id)
    const access = evaluateSpot(spot, content.value.transports)
    const options = access.travelOptions
    const selected =
      options.find((option) => String(option.transportId) === selectedTransportIds[spotId]) ??
      defaultTravelOption(options)
    const readiness =
      selected === null ? null : evaluateTrip(spot, selected, content.value.transports)
    const score = spotKnowledgeScore(knowledge, spotId)
    const discovered = world.discoveredSpotIds.includes(spot.id)
    const area =
      spot.areaId === undefined ? undefined : region?.areas.find((c) => c.id === spot.areaId)
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

    return {
      spot,
      spotId,
      access,
      options,
      selected,
      readiness,
      score,
      discovered,
      area,
      canGo,
      conditions,
    }
  })

  const board = buildMapBoard(regionSpots)
  const rowById = new Map(spotRows.map((row) => [row.spotId, row]))
  const selectedRow = spotRows.find((row) => row.spotId === selectedSpotId) ?? null
  const goToSpot = (spot: FishingSpot, transportId: TransportId | undefined): void => {
    const result = travelToSpot(spot, content.value.transports, transportId)

    if (result.ok) {
      setActiveScreen('spot')
    }
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
                className={`tab${active ? ' tab--active' : ''}`}
                key={String(candidate.id)}
                type="button"
                onClick={() => {
                  setSelectedRegionId(String(candidate.id))
                  setSelectedSpotId(null)
                }}
              >
                {country === undefined ? candidate.name : `${country.name} / ${candidate.name}`}
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel map-panel">
        <h3 className="panel__subheading">釣り場マップ</h3>
        <div className="map-board" role="group" aria-label="釣り場マップ">
          {board.map((group) => (
            <div className={`map-board__band map-board__band--${group.band}`} key={group.band}>
              <p className="map-board__band-label">{MAP_BAND_LABELS[group.band]}</p>
              <ul className="map-board__nodes">
                {group.nodes.map((node) => {
                  const row = rowById.get(String(node.spot.id))

                  if (row === undefined) {
                    return null
                  }

                  const selected = row.spotId === selectedSpotId
                  const hidden = row.spot.visibility === 'hidden'
                  const status = row.canGo
                    ? 'ok'
                    : !inRegion
                      ? 'far'
                      : row.access.accessible
                        ? 'cost'
                        : 'locked'

                  return (
                    <li key={row.spotId}>
                      <button
                        type="button"
                        className={`map-node map-node--${status}${
                          hidden ? ' map-node--rumor' : ''
                        }${selected ? ' map-node--selected' : ''}`}
                        aria-pressed={selected}
                        aria-label={row.spot.name}
                        onClick={() => {
                          setSelectedSpotId(selected ? null : row.spotId)
                        }}
                      >
                        <PixelIcon
                          name={hidden ? 'star' : 'drop'}
                          size={16}
                          className="map-node__icon"
                        />
                        <span className="map-node__label">{node.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <ul className="map-legend">
          <li>
            <span className="map-node__marker map-node__marker--ok" aria-hidden="true" />
            行ける
          </li>
          <li>
            <span className="map-node__marker map-node__marker--locked" aria-hidden="true" />
            準備が必要（道具・交通費・遠征）
          </li>
          <li>
            <span className="map-node__marker map-node__marker--rumor" aria-hidden="true">
              ★
            </span>
            情報で見つけた場所
          </li>
        </ul>
        <p className="fishing__legend">
          ノードをえらぶと、下にこの釣り場の要点が出る。地図は位置関係ではなく
          「上流から沖へ」の並びで見せている。
        </p>
      </section>

      {selectedRow === null ? null : (
        <section className="panel panel--node-summary">
          <div className="spot-card__head">
            <span className="spot-card__node-title">
              <PixelIcon
                name={selectedRow.spot.visibility === 'hidden' ? 'star' : 'drop'}
                size={18}
                className="spot-card__node-icon"
              />
              <h3 className="panel__subheading">{selectedRow.spot.name}</h3>
            </span>
            <span className={`badge${selectedRow.access.accessible ? '' : ' badge--alert'}`}>
              {!inRegion
                ? '遠征が必要'
                : selectedRow.access.accessible
                  ? selectedRow.selected === null
                    ? '到達手段なし'
                    : `${selectedRow.selected.transportName} ${formatDuration(selectedRow.selected.minutes)}`
                  : 'アクセス不可'}
            </span>
          </div>
          <p className="spot-card__meta">
            {ENVIRONMENT_LABELS[selectedRow.spot.environment] ?? selectedRow.spot.environment}
            {selectedRow.area === undefined ? '' : ` / ${selectedRow.area.name}`}
            {` / 知識 ${String(Math.round(selectedRow.score))}% / 魚種 ${String(selectedRow.spot.fishTable.length)} 種`}
            {selectedRow.discovered ? ' / 発見済み' : ''}
          </p>
          {selectedRow.conditions === null || !inRegion ? null : (
            <p className="spot-card__meta">
              釣況: {CONDITION_SUMMARY_LABELS[selectedRow.conditions.summary]} /{' '}
              {selectedRow.conditions.activityLabel}
            </p>
          )}

          {selectedRow.canGo ? (
            <button
              className="control control--accent"
              type="button"
              onClick={() => {
                goToSpot(selectedRow.spot, selectedRow.selected?.transportId)
              }}
            >
              {selectedRow.selected === null
                ? '行く'
                : `${selectedRow.selected.transportName} で行く`}
            </button>
          ) : (
            <ul className="blocked">
              {!inRegion ? (
                <li key="region">現在この地域にいません（EXPEDITION で遠征する）</li>
              ) : selectedRow.access.accessible ? (
                <li key="cost">
                  交通費が足りない
                  {selectedRow.selected === null
                    ? ''
                    : `（${String(selectedRow.readiness?.roundTripCost)}円）`}
                </li>
              ) : (
                selectedRow.access.blockedReasons.map((reason) => (
                  <li key={`${reason.kind}-${reason.label}`}>{reason.label}</li>
                ))
              )}
            </ul>
          )}
        </section>
      )}

      <section>
        <h3 className="panel__subheading panel__subheading--section">釣り場の詳細</h3>
        <ul className="spots map-list">
          {spotRows.map((row) => (
            <li
              className={`spot-card spot-card--node${
                row.spot.visibility === 'hidden' ? ' spot-card--rumor' : ''
              }${row.canGo ? '' : ' spot-card--locked'}${
                row.spotId === selectedSpotId ? ' spot-card--selected' : ''
              }`}
              key={row.spotId}
            >
              <div className="spot-card__head">
                <span className="spot-card__node-title">
                  <PixelIcon
                    name={row.spot.visibility === 'hidden' ? 'star' : 'drop'}
                    size={18}
                    className="spot-card__node-icon"
                  />
                  <h3 className="panel__subheading">{row.spot.name}</h3>
                </span>
                <span className={`badge${row.access.accessible ? '' : ' badge--alert'}`}>
                  {!inRegion
                    ? '遠征が必要'
                    : row.access.accessible
                      ? row.selected === null
                        ? '到達手段なし'
                        : `${row.selected.transportName} ${formatDuration(row.selected.minutes)}`
                      : 'アクセス不可'}
                </span>
              </div>
              <p className="spot-card__meta">
                {ENVIRONMENT_LABELS[row.spot.environment] ?? row.spot.environment}
                {row.spot.dataStatus === 'provisional' ? ' / 暫定データ' : ''}
                {row.area === undefined ? '' : ` / ${row.area.name}`}
                {/* Phase 13.1: discoveredSpotIds は「訪問済み」ではなく「発見済み」。
                    Contact から場所を教わっただけの Hidden Spot も含む。 */}
                {row.discovered ? ' / 発見済み' : ''}
              </p>
              <p className="spot-card__meta">
                この釣り場の知識 {Math.round(row.score)}% / 魚種 {row.spot.fishTable.length} 種
              </p>
              {row.conditions === null || !inRegion ? null : (
                <p className="spot-card__meta">
                  釣況: {CONDITION_SUMMARY_LABELS[row.conditions.summary]} /{' '}
                  {row.conditions.activityLabel}
                </p>
              )}

              {!inRegion || row.options.length === 0 ? null : (
                <details className="disclosure">
                  <summary className="disclosure__summary">
                    移動手段を見る（{row.options.length}件）
                  </summary>
                  <ul className="travel-options disclosure__body">
                    {row.options.map((option) => {
                      const optionId = String(option.transportId)
                      const chosen =
                        row.selected !== null && String(row.selected.transportId) === optionId
                      const affordable = evaluateTrip(
                        row.spot,
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
                                [row.spotId]: optionId,
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
                </details>
              )}

              {row.canGo ? (
                <button
                  className="control"
                  type="button"
                  onClick={() => {
                    goToSpot(row.spot, row.selected?.transportId)
                  }}
                >
                  {row.selected === null ? '行く' : `${row.selected.transportName} で行く`}
                </button>
              ) : (
                <ul className="blocked">
                  {!inRegion ? (
                    <li key="region">現在この地域にいません（EXPEDITION で遠征する）</li>
                  ) : row.access.accessible ? (
                    [
                      <li key="cost">
                        交通費が足りない
                        {row.selected === null
                          ? ''
                          : `（${String(row.readiness?.roundTripCost)}円）`}
                      </li>,
                    ]
                  ) : (
                    row.access.blockedReasons.map((reason) => (
                      <li key={`${reason.kind}-${reason.label}`}>{reason.label}</li>
                    ))
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
