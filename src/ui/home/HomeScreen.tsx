import { useState } from 'react'
import { recordedSpeciesCount } from '../../domain/codex'
import { formatYen } from '../../domain/economy'
import { remainingExpeditionDays } from '../../domain/expedition'
import {
  pickSummaryEnvironment,
  resolveEnvironment,
  resolveFishingConditions,
} from '../../domain/environment'
import { NEUTRAL_FISHING_MODIFIERS } from '../../domain/fishing/PlayerFishingModifiers'
import { bestFishFinderOf, resolveTackle } from '../../domain/tackle'
import { DAY_OF_WEEK_LABELS, dayOfWeekOf, formatWorldTime, isWeekend } from '../../domain/world'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import { ConditionPanel } from '../world/ConditionPanel'

/**
 * 自宅。釣行の起点。
 *
 * 会社員という設定は世界観として残しているが、仕事は攻略対象ではない。
 * ここに出るのは「毎月の自由資金」だけで、勤務時間や有給は扱わない。
 */

export const HomeScreen = () => {
  const [notice, setNotice] = useState<string | null>(null)
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const world = usePlayerStore((state) => state.world)
  const progression = usePlayerStore((state) => state.progression)
  const codex = usePlayerStore((state) => state.codex)
  const knowledge = usePlayerStore((state) => state.knowledge)
  const evaluateSpot = usePlayerStore((state) => state.evaluateSpot)
  const finance = usePlayerStore((state) => state.finance)
  const sleep = usePlayerStore((state) => state.sleep)
  const expedition = usePlayerStore((state) => state.expedition)
  const loadout = usePlayerStore((state) => state.loadout)
  const inventory = usePlayerStore((state) => state.inventory)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const current = expedition.current
  const localSpots = content.value.spots.filter(
    (spot) => String(spot.regionId) === String(world.currentRegionId),
  )
  const accessible = localSpots.filter(
    (spot) => evaluateSpot(spot, content.value.transports).accessible,
  )
  const currentRegion = content.value.regionById[String(world.currentRegionId)]
  const summarySpot = pickSummaryEnvironment(
    content.value.spots.filter((spot) => String(spot.regionId) === String(world.currentRegionId)),
  )
  const environment =
    summarySpot === undefined || currentRegion === undefined
      ? null
      : resolveEnvironment({
          time: world.time,
          climate: currentRegion.climate,
          regionId: String(currentRegion.id),
          environment: summarySpot.environment,
        })
  const summarySpecies =
    summarySpot === undefined
      ? []
      : summarySpot.fishTable.flatMap((occurrence) => {
          const species = content.value.speciesById[String(occurrence.speciesId)]
          return species === undefined ? [] : [species]
        })
  const tackle = resolveTackle({
    loadout,
    gear: content.value.gear,
    methods: content.value.methods,
  })
  const conditions =
    environment === null
      ? null
      : resolveFishingConditions({
          environment,
          species: summarySpecies,
          tackleModifiers: tackle?.playerModifiers ?? NEUTRAL_FISHING_MODIFIERS,
          hasFishFinder: bestFishFinderOf(inventory, content.value.gear) !== null,
          searchSign: null,
          knowledgeScore:
            summarySpot === undefined
              ? 0
              : Math.round(spotKnowledgeScore(knowledge, String(summarySpot.id))),
        })
  const speciesNames = Object.fromEntries(
    content.value.species.map((species) => [String(species.id), species.japaneseName]),
  )
  const trip = world.trip
  const monthlyFree = finance.salaryIncome - finance.simplifiedLivingCost

  return (
    <div className="fishing">
      <section className="panel">
        <p className="app-shell__eyebrow">
          {current === null
            ? (currentRegion?.base.name ?? 'Tokyo Area Home')
            : `${current.regionName} / ${current.baseName}`}
        </p>
        <h2 className="panel__heading">{formatWorldTime(world.time)}</h2>
        <p className="panel__body">
          {DAY_OF_WEEK_LABELS[dayOfWeekOf(world.time)]}曜日
          {isWeekend(world.time) ? '（休日）' : ''} / Angler Lv {progression.anglerLevel}
          {current === null
            ? ''
            : ` / 遠征中（残り ${String(remainingExpeditionDays(current, world.time))} 日）`}
        </p>
        <p className="fishing__legend">
          今月の自由資金 {formatYen(monthlyFree)}（給与 {formatYen(finance.salaryIncome)} − 生活費{' '}
          {formatYen(finance.simplifiedLivingCost)}）
          {current === null ? '' : ' / 遠征費は出発時に支払い済み'}
        </p>
        <dl className="record">
          <div>
            <dt>所持金</dt>
            <dd>{formatYen(finance.cash)}</dd>
          </div>
          <div>
            <dt>行ける釣り場</dt>
            <dd>
              {accessible.length} / {localSpots.length}（{currentRegion?.name ?? 'この地域'}）
            </dd>
          </div>
          <div>
            <dt>記録した魚種</dt>
            <dd>{recordedSpeciesCount(codex)} 種</dd>
          </div>
          <div>
            <dt>発見した釣り場</dt>
            <dd>{world.discoveredSpotIds.length} 箇所</dd>
          </div>
          <div>
            <dt>地域の知識</dt>
            <dd>{Math.round(knowledge.regions[String(world.currentRegionId)] ?? 0)}%</dd>
          </div>
        </dl>

        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setActiveScreen('map')
          }}
        >
          釣りに行く（釣り場を選ぶ）
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('expedition')
          }}
        >
          {current === null ? '遠征・旅行（EXPEDITION）' : '遠征の状況（EXPEDITION）'}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('tackle')
          }}
        >
          タックルを組む
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('shop')
          }}
        >
          店に行く
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('progression')
          }}
        >
          成長を見る
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            const result = sleep()
            setNotice(result.message)
          }}
        >
          翌朝まで休む
        </button>

        {notice === null ? null : <p className="notice">{notice}</p>}
      </section>

      {environment === null || conditions === null ? null : (
        <ConditionPanel
          time={world.time}
          environment={environment}
          conditions={conditions}
          speciesNames={speciesNames}
        />
      )}

      {trip === null ? null : (
        <section className="panel">
          <h3 className="panel__subheading">前回の釣行</h3>
          <dl className="record">
            <div>
              <dt>釣り場</dt>
              <dd>{trip.spotName}</dd>
            </div>
            <div>
              <dt>到着</dt>
              <dd>{formatWorldTime(trip.arrivedAt)}</dd>
            </div>
            <div>
              <dt>釣り回数</dt>
              <dd>{trip.attempts} 回</dd>
            </div>
            <div>
              <dt>釣果</dt>
              <dd>{trip.catches} 匹</dd>
            </div>
            <div>
              <dt>獲得 XP</dt>
              <dd>{trip.xpGained}</dd>
            </div>
            <div>
              <dt>得た知識</dt>
              <dd>+{Math.round(trip.knowledgeGained)}%</dd>
            </div>
          </dl>
          {trip.largestLengthCm === null ? null : (
            <p className="notice__title">最大 {trip.largestLengthCm} cm</p>
          )}
        </section>
      )}
    </div>
  )
}
