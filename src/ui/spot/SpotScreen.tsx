import { revealedFields } from '../../domain/knowledge/spotKnowledge'
import { resolveTackle } from '../../domain/tackle'
import { formatWorldTime } from '../../domain/world'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

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
  const returnHome = usePlayerStore((state) => state.returnHome)

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
            const result = returnHome(spot)

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
