import { useState } from 'react'
import { revealedFields } from '../../domain/knowledge/spotKnowledge'
import { resolveEnvironment, resolveFishingConditions } from '../../domain/environment'
import { NEUTRAL_FISHING_MODIFIERS } from '../../domain/fishing/PlayerFishingModifiers'
import { bestFishFinderOf, resolveTackle } from '../../domain/tackle'
import { resolveBiteCompatibility } from '../../domain/tackle/biteCompatibility'
import { formatWorldTime } from '../../domain/world'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import { ConditionPanel } from '../world/ConditionPanel'

/**
 * 釣り場。到着後はここを拠点にする。
 *
 * 釣りは既存の Fishing 画面で行い、終わったらここへ戻る。
 * 帰宅は World Domain 経由（時間が進む）。
 */

const ENVIRONMENT_LABELS: Readonly<Record<string, string>> = {
  canal: '運河',
  river: '河川',
  estuary: '汽水（河口）',
  bay_shore: '海（岸）',
  lake: '湖',
  managed_pond: '管理釣り場',
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  main_species: '主な魚種',
  time_pattern: '時間帯の傾向',
  habitat: '地形・ベイト',
  season_pattern: '季節パターン',
  depth: '水深',
}

export const SpotScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const world = usePlayerStore((state) => state.world)
  const knowledge = usePlayerStore((state) => state.knowledge)
  const loadout = usePlayerStore((state) => state.loadout)
  const inventory = usePlayerStore((state) => state.inventory)
  const lastSearch = usePlayerStore((state) => state.lastSearch)
  const searchWater = usePlayerStore((state) => state.searchWater)
  const returnHome = usePlayerStore((state) => state.returnHome)
  const [notice, setNotice] = useState<string | null>(null)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const spotId = world.currentSpotId
  const spot =
    spotId === null ? undefined : content.value.spots.find((entry) => entry.id === spotId)

  if (world.phase !== 'AT_SPOT' || spot === undefined) {
    return (
      <section className="panel">
        <h2 className="panel__heading">釣り場にいない</h2>
        <p className="panel__body">自宅から釣り場を選ぶ。</p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setActiveScreen('home')
          }}
        >
          自宅へ
        </button>
      </section>
    )
  }

  const score = spotKnowledgeScore(knowledge, String(spot.id))
  const fields = revealedFields(spot, score)
  const knownSpecies = fields.includes('main_species')
    ? spot.fishTable
        .map((occurrence) => content.value.speciesById[String(occurrence.speciesId)])
        .filter((species) => species !== undefined)
    : []

  // 今のタックルが何に向いているか（未知の魚種は開示しない）。
  const tackle = resolveTackle({
    loadout,
    gear: content.value.gear,
    methods: content.value.methods,
  })
  const region = content.value.regionById[String(spot.regionId)]
  const environment =
    region === undefined
      ? null
      : resolveEnvironment({
          time: world.time,
          climate: region.climate,
          regionId: String(region.id),
          environment: spot.environment,
        })
  const spotSpecies = spot.fishTable.flatMap((occurrence) => {
    const species = content.value.speciesById[String(occurrence.speciesId)]
    return species === undefined ? [] : [species]
  })
  const finder = bestFishFinderOf(inventory, content.value.gear)
  const searchSign =
    lastSearch !== null && lastSearch.spotId === String(spot.id) ? lastSearch.sign : null
  const conditions =
    environment === null
      ? null
      : resolveFishingConditions({
          environment,
          species: spotSpecies,
          tackleModifiers: tackle?.playerModifiers ?? NEUTRAL_FISHING_MODIFIERS,
          hasFishFinder: finder !== null,
          searchSign,
          knowledgeScore: Math.round(score),
        })
  const speciesNames = Object.fromEntries(
    spotSpecies.map((species) => [String(species.id), species.japaneseName]),
  )
  /*
   * Phase 9.1: 今の仕掛けで「食いつきやすい / 食いつきにくい / ルアーが大きすぎる」を出す。
   * Knowledge が低いときは魚種名を出さない（既存の Knowledge policy）。
   */
  const knowsSpecies = fields.includes('main_species')
  const offering = content.value.gearById[String(loadout.offeringId)] ?? null
  const hook = content.value.gearById[String(loadout.hookId)] ?? null
  const rod = content.value.gearById[String(loadout.rodId)] ?? null
  const biteHints = spotSpecies.map((species, index) => ({
    id: String(species.id),
    name: knowsSpecies ? species.japaneseName : `魚種 ${String(index + 1)}（未確認）`,
    labels: resolveBiteCompatibility({
      species,
      offering,
      hook,
      rod,
      methodId: loadout.methodId,
    }).labels,
  }))

  const ratingWords = (value: number): string =>
    value >= 0.7 ? '高' : value >= 0.45 ? '普通' : '低'

  return (
    <div className="fishing">
      <header className="fishing__header">
        <span className="fishing__seed">{formatWorldTime(world.time)}</span>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">SPOT</p>
        <h2 className="panel__heading">{spot.name}</h2>
        <p className="panel__body">
          {ENVIRONMENT_LABELS[spot.environment] ?? spot.environment}
          {spot.dataStatus === 'provisional' ? ' / 暫定データ（詳細は未検証）' : ''}
        </p>
        <dl className="record">
          <div>
            <dt>知識</dt>
            <dd>{Math.round(score)}%</dd>
          </div>
          <div>
            <dt>魚種</dt>
            <dd>{spot.fishTable.length} 種</dd>
          </div>
        </dl>
      </section>

      {tackle === null ? null : (
        <section className="panel">
          <h3 className="panel__subheading">今のタックル</h3>
          <p className="panel__body">
            {tackle.method.name} / 大型魚への余裕: {ratingWords(tackle.ratings.power)} / 遠投:{' '}
            {ratingWords(tackle.ratings.distance)} / 繊細さ: {ratingWords(tackle.ratings.finesse)}
          </p>
          <p className="fishing__legend">思ったように釣れないときは、タックルを見直してみる。</p>
        </section>
      )}

      {environment === null || conditions === null ? null : (
        <ConditionPanel
          time={world.time}
          environment={environment}
          conditions={conditions}
          speciesNames={speciesNames}
          searchSign={searchSign}
        />
      )}

      <section className="panel">
        <h3 className="panel__subheading">水を探る</h3>
        <p className="panel__body">
          {finder === null
            ? 'Fish Finder は未所持（目視と勘で探る。所持すると反応が詳しくなる）'
            : `Fish Finder: ${finder.name}（精度 ${finder.accuracy.toFixed(2)}）`}
        </p>
        <button
          className="button"
          type="button"
          onClick={() => {
            if (environment === null) {
              return
            }

            const result = searchWater({
              spot,
              species: spotSpecies,
              environment,
              hasFishFinder: finder !== null,
            })
            setNotice(result.message)
          }}
        >
          Search Water（水を探る）
        </button>
        {notice === null ? null : <p className="notice">{notice}</p>}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">食いつき（今の仕掛け）</h3>
        <p className="fishing__legend">
          タックルクラスで釣れる魚は決まらない。食いつき・掛かり・ファイトの難しさが変わる。
        </p>
        <ul className="log">
          {biteHints.map((entry) => (
            <li key={entry.id}>
              {entry.name}: {entry.labels.join(' / ')}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3 className="panel__subheading">分かっていること</h3>
        {fields.length === 0 ? (
          <p className="panel__body">まだ何も分かっていない。釣りをすると知識が増える。</p>
        ) : (
          <ul className="log">
            {fields.map((field) => (
              <li key={field}>{FIELD_LABELS[field] ?? field}</li>
            ))}
          </ul>
        )}

        {knownSpecies.length === 0 ? null : (
          <p className="panel__body">
            主な魚種: {knownSpecies.map((species) => species?.japaneseName).join('、')}
          </p>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">行動</h3>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setActiveScreen('fishing')
          }}
        >
          釣りを始める
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('tackle')
          }}
        >
          タックルを見直す
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            const result = returnHome(spot, content.value.transports)

            if (result.ok) {
              setActiveScreen('home')
            }
          }}
        >
          帰宅する（移動時間が進む）
        </button>
      </section>
    </div>
  )
}
