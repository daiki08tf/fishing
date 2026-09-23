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
import { knowledgeTierFor, spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { knownContactIdsOf } from '../../domain/trade'
import { contentRuntime } from '../../content/runtime/contentRuntime'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { BiomeScene } from '../components/BiomeScene'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { ContentLoadingPanel } from '../content/ContentLoadingPanel'
import { useRegionPack } from '../content/contentRuntimeHooks'
import { useContentOrError } from '../world/useContentOrError'
import { ConditionPanel } from '../world/ConditionPanel'
import './home.css'

/**
 * 自宅。釣行の起点。
 *
 * dashboard ではなく「今日どこへ釣りに行くか」を考える画面にする（Phase 14）。
 * 会社員という設定は世界観として残しているが、仕事は攻略対象ではない。
 * ここに出るのは「毎月の自由資金」だけで、勤務時間や有給は扱わない。
 */

export const HomeScreen = () => {
  const [notice, setNotice] = useState<string | null>(null)
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const world = usePlayerStore((state) => state.world)
  const regionPack = useRegionPack(String(world.currentRegionId))
  const progression = usePlayerStore((state) => state.progression)
  const codex = usePlayerStore((state) => state.codex)
  const knowledge = usePlayerStore((state) => state.knowledge)
  const evaluateSpot = usePlayerStore((state) => state.evaluateSpot)
  const finance = usePlayerStore((state) => state.finance)
  const sleep = usePlayerStore((state) => state.sleep)
  const expedition = usePlayerStore((state) => state.expedition)
  const loadout = usePlayerStore((state) => state.loadout)
  const inventory = usePlayerStore((state) => state.inventory)
  const trade = usePlayerStore((state) => state.trade)

  if (regionPack.status !== 'ready') {
    return (
      <ContentLoadingPanel
        message="地域情報を読み込み中…"
        error={regionPack.error}
        onRetry={regionPack.retry}
      />
    )
  }

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const current = expedition.current

  /*
   * Phase 13.1: Map と同じ visibility / discovery 規則で数える。
   * 未発見の Hidden Spot を分母に含めると、存在しない釣り場の数が漏れる。
   */
  const visibleSpots = content.value.spots.filter(
    (spot) => spot.visibility !== 'hidden' || world.discoveredSpotIds.includes(spot.id),
  )
  const localSpots = visibleSpots.filter(
    (spot) => String(spot.regionId) === String(world.currentRegionId),
  )
  const knownContactIds = knownContactIdsOf(
    content.value.buyers,
    content.value.contacts,
    content.value.contactRewards,
    trade.claimedRewardIds,
  )
  const accessible = localSpots.filter(
    (spot) => evaluateSpot(spot, content.value.transports, knownContactIds).accessible,
  )
  const discoveredSpots = visibleSpots.filter((spot) => world.discoveredSpotIds.includes(spot.id))
  const currentRegion = content.value.regionById[String(world.currentRegionId)]
  const summarySpot = pickSummaryEnvironment(
    visibleSpots.filter((spot) => String(spot.regionId) === String(world.currentRegionId)),
  )
  const environment =
    summarySpot === undefined || currentRegion === undefined
      ? null
      : resolveEnvironment({
          time: world.time,
          climate: currentRegion.climate,
          regionId: String(currentRegion.id),
          environment: summarySpot.environment,
          tideDrivenFlow: summarySpot.tideDrivenFlow,
        })
  /*
   * 釣況の計算には Species の環境嗜好（生物学）が要る。
   * これは今いる地域の Species shard に含まれている（Phase 15.1 の起動 pack）。
   */
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
    contentRuntime.index.species.map((summary) => [String(summary.id), summary.japaneseName]),
  )

  /*
   * 古い Save に、今の Content に無い魚種 id が残っていることがある
   * （Content の入れ替え・削除）。記録数は「今いる魚種」だけを数える。
   */
  const knownSpeciesIds = new Set(contentRuntime.index.species.map((summary) => String(summary.id)))
  const trip = world.trip
  const monthlyFree = finance.salaryIncome - finance.simplifiedLivingCost
  const regionKnowledgeScore = knowledge.regions[String(world.currentRegionId)] ?? 0
  const regionKnowledgeTier = knowledgeTierFor(regionKnowledgeScore)

  /*
   * Phase 14: HOME に「新しい噂 / Contact 情報」のティーザーを出す。
   * Trust の中身や正確な Spot は出さない（TRADE / CONTACTS で見る）。件数だけ見せる。
   * 未発見の Hidden Spot 数は漏らさない（噂の件数と Hidden Spot の総数は別物）。
   */
  const rumorCount = trade.knownRumorIds.length

  return (
    <div className="fishing">
      <BiomeScene
        environment={summarySpot?.environment ?? 'bay_shore'}
        title={
          current === null ? (currentRegion?.base.name ?? 'Tokyo Area Home') : current.baseName
        }
        subtitle={
          current === null
            ? undefined
            : `${current.regionName} / 遠征中（残り ${String(remainingExpeditionDays(current, world.time))} 日）`
        }
      />

      <section className="panel">
        <p className="app-shell__eyebrow">{formatWorldTime(world.time)}</p>
        <h2 className="panel__heading">
          {DAY_OF_WEEK_LABELS[dayOfWeekOf(world.time)]}曜日
          {isWeekend(world.time) ? '（休日）' : ''}
        </h2>
        <p className="fishing__legend">
          Lv <span className="pixel-number">{progression.anglerLevel}</span> ・ 今月の自由資金{' '}
          <span className="pixel-number">{formatYen(monthlyFree)}</span>
        </p>

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

      {rumorCount === 0 ? null : (
        <section className="panel panel--rumor">
          <p className="fishing__phase-code">CONTACT</p>
          <p className="panel__body">
            人脈から <span className="pixel-number">{rumorCount}</span> 件の噂を聞いている。
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setActiveScreen('contacts')
            }}
          >
            人脈で確認する
          </button>
        </section>
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

      <section className="panel">
        <h3 className="panel__subheading">この地域について</h3>
        <details className="disclosure">
          <summary className="disclosure__summary">くわしい家計</summary>
          <div className="disclosure__body">
            <dl className="record">
              <div>
                <dt>給与（月）</dt>
                <dd>{formatYen(finance.salaryIncome)}</dd>
              </div>
              <div>
                <dt>生活費（月）</dt>
                <dd>{formatYen(finance.simplifiedLivingCost)}</dd>
              </div>
              <div>
                <dt>自由資金（月）</dt>
                <dd>{formatYen(monthlyFree)}</dd>
              </div>
            </dl>
            {current === null ? null : (
              <p className="fishing__legend">遠征費は出発時に支払い済み。</p>
            )}
          </div>
        </details>
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
            <dd>{recordedSpeciesCount(codex, knownSpeciesIds)} 種</dd>
          </div>
          <div>
            <dt>発見した釣り場</dt>
            <dd>{discoveredSpots.length} 箇所</dd>
          </div>
        </dl>
        <p className="fishing__legend">
          地域の知識 {Math.round(regionKnowledgeScore)}% — {regionKnowledgeTier.label}
        </p>
      </section>

      <section className="panel">
        <h3 className="panel__subheading">もっと見る</h3>
        <div className="home-quick-links">
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
              setActiveScreen('fishbox')
            }}
          >
            Fish Box（{trade.fishBox.length}）
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setActiveScreen('contacts')
            }}
          >
            人脈（CONTACTS）
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
        </div>
      </section>
    </div>
  )
}
