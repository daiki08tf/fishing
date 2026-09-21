import { useState } from 'react'
import { recordedSpeciesCount } from '../../domain/codex'
import { formatYen } from '../../domain/economy'
import { DAY_OF_WEEK_LABELS, dayOfWeekOf, formatWorldTime, isWeekend } from '../../domain/world'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

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

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const accessible = content.value.spots.filter(
    (spot) => evaluateSpot(spot, content.value.transports).accessible,
  )
  const trip = world.trip
  const monthlyFree = finance.salaryIncome - finance.simplifiedLivingCost

  return (
    <div className="fishing">
      <section className="panel">
        <p className="app-shell__eyebrow">Tokyo Area Home</p>
        <h2 className="panel__heading">{formatWorldTime(world.time)}</h2>
        <p className="panel__body">
          {DAY_OF_WEEK_LABELS[dayOfWeekOf(world.time)]}曜日
          {isWeekend(world.time) ? '（休日）' : ''} / Angler Lv {progression.anglerLevel}
        </p>
        <p className="fishing__legend">
          今月の自由資金 {formatYen(monthlyFree)}（給与 {formatYen(finance.salaryIncome)} − 生活費{' '}
          {formatYen(finance.simplifiedLivingCost)}）
        </p>
        <dl className="record">
          <div>
            <dt>所持金</dt>
            <dd>{formatYen(finance.cash)}</dd>
          </div>
          <div>
            <dt>行ける釣り場</dt>
            <dd>
              {accessible.length} / {content.value.spots.length}
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
            <dd>{Math.round(knowledge.regions['tokyo-area'] ?? 0)}%</dd>
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
