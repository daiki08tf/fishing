import {
  CONDITION_SUMMARY_LABELS,
  SEARCH_SIGN_LABELS,
  TIDE_LABELS,
  TIME_OF_DAY_LABELS,
  WATER_FLOW_LABELS,
  WATER_KIND_LABELS,
  WEATHER_LABELS,
  type EnvironmentSnapshot,
  type FishingConditions,
  type SearchSign,
} from '../../domain/environment'
import { formatWorldTime } from '../../domain/world/WorldTime'
import type { WorldTime } from '../../domain/world/WorldTime'

/**
 * 釣況パネル（Phase 9）。
 *
 * 細かい modifier は出さない。プレイヤー向けに
 * 「天候 / 潮 / 水温 / 流れ / 魚の気配 / 狙いやすい魚」だけを見せる。
 * Knowledge が低いときは魚種名を絞って出す（既存の Knowledge policy に従う）。
 */

export const ConditionPanel = (input: {
  readonly title?: string
  readonly time: WorldTime
  readonly environment: EnvironmentSnapshot
  readonly conditions: FishingConditions
  readonly speciesNames: Readonly<Record<string, string>>
  readonly searchSign?: SearchSign | null
}) => {
  const { environment, conditions } = input
  const hints = conditions.speciesHintIds
    .map((id) => input.speciesNames[id])
    .filter((name): name is string => name !== undefined)

  return (
    <section className="panel">
      <h3 className="panel__subheading">{input.title ?? '今日の条件'}</h3>
      <p className="panel__body">
        {formatWorldTime(input.time)} / {TIME_OF_DAY_LABELS[environment.timeOfDay]} /{' '}
        {WEATHER_LABELS[environment.weather]} / {WATER_KIND_LABELS[environment.water.kind]}
      </p>
      <dl className="record">
        <div>
          <dt>潮</dt>
          <dd>{environment.tide === null ? 'なし（淡水）' : TIDE_LABELS[environment.tide]}</dd>
        </div>
        <div>
          <dt>水温</dt>
          <dd>{environment.water.temperatureC}℃</dd>
        </div>
        <div>
          <dt>濁り</dt>
          <dd>
            {environment.water.clarity >= 0.7
              ? '澄んでいる'
              : environment.water.clarity >= 0.45
                ? 'ふつう'
                : '濁り気味'}
          </dd>
        </div>
        <div>
          <dt>流れ</dt>
          <dd>{WATER_FLOW_LABELS[environment.water.flow]}</dd>
        </div>
      </dl>
      <p className="panel__body">釣況: {CONDITION_SUMMARY_LABELS[conditions.summary]}</p>
      <p className="fishing__legend">{conditions.activityLabel}</p>
      {input.searchSign === undefined || input.searchSign === null ? null : (
        <p className="panel__body">Search Water: {SEARCH_SIGN_LABELS[input.searchSign]}</p>
      )}
      {hints.length === 0 ? null : <p className="panel__body">狙いやすい: {hints.join('、')}</p>}
    </section>
  )
}
