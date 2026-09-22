import type { FishTrait } from '../../domain/fish/FishTrait'
import { calcSaleValueYen, resolveFreshness } from '../../domain/trade'
import { formatYen } from '../../domain/economy'
import { formatWorldTime } from '../../domain/world'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { EmptyState } from '../components/EmptyState'
import { FishSilhouette } from '../components/FishSilhouette'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'
import './fishbox.css'

/**
 * Fish Box（Phase 13 / Phase 14 でカード表示に再構成）。
 *
 * 持ち帰った魚の一覧。表示専用で、売却は TRADE 画面で行う。
 * 「推定売却額」は今いる全 Buyer のうち最も高い査定を暫定表示する（実際の額は TRADE で確定する）。
 */

const TRAIT_LABELS: Readonly<Record<FishTrait, string>> = {
  trophy: 'Trophy',
  old: 'Old',
  strong_runner: 'Strong Runner',
  heavy: 'Heavy',
  scarred: 'Scarred',
  aggressive: 'Aggressive',
}

export const FishBoxScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const trade = usePlayerStore((state) => state.trade)
  const world = usePlayerStore((state) => state.world)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { speciesById, buyers, speciesTradeProfileBySpeciesId } = content.value
  /*
   * Phase 13.1: 推定売却額は「今いる地域の買取先」のうち最も高い査定にする。
   * 実際に売れるのは今いる地域の買取先だけ（Domain 側でも強制している）。
   */
  const localBuyers = buyers.filter(
    (entry) => String(entry.regionId) === String(world.currentRegionId),
  )

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
        <p className="fishing__phase-code">FISH BOX</p>
        <h2 className="panel__heading">持ち帰った魚（{trade.fishBox.length}）</h2>
        <p className="panel__body">売却は「買取先へ売る」から行う。</p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setActiveScreen('trade')
          }}
        >
          買取先へ売る（TRADE）
        </button>
      </section>

      {trade.fishBox.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon="creel"
            title="Fish Box は空"
            body="釣った魚を「持ち帰る」と、ここに入る。"
          />
        </section>
      ) : (
        <ul className="fish-card-list">
          {trade.fishBox.map((entry) => {
            const species = speciesById[String(entry.speciesId)]
            const spot = content.value.spots.find(
              (candidate) => String(candidate.id) === String(entry.sourceSpotId),
            )
            const profile = speciesTradeProfileBySpeciesId[String(entry.speciesId)]
            const freshness = resolveFreshness(entry.caughtAt, world.time)
            const bestValue =
              profile === undefined
                ? 0
                : Math.max(
                    0,
                    ...localBuyers.map((buyer) =>
                      calcSaleValueYen(entry, buyer, profile, freshness),
                    ),
                  )
            const valueLine =
              profile === undefined || profile.tradeStatus !== 'tradable'
                ? 'この魚は取引できない'
                : localBuyers.length === 0
                  ? '今いる地域に買取先が無い'
                  : `推定売却額 最大 ${formatYen(bestValue)}`

            return (
              <li className="fish-card" key={String(entry.catchId)}>
                <div className="fish-card__head">
                  <FishSilhouette speciesId={String(entry.speciesId)} size={40} />
                  <div className="fish-card__title">
                    <h3 className="panel__subheading">
                      {species?.japaneseName ?? String(entry.speciesId)}
                    </h3>
                    <p className="fish-card__facts">
                      {entry.lengthCm} cm / {entry.weightKg.toFixed(3)} kg / 上位{' '}
                      {Math.round(100 - entry.percentile)}%
                    </p>
                  </div>
                  <span className="badge">{Math.round(freshness * 100)}% 鮮度</span>
                </div>

                <p className="fish-card__value">{valueLine}</p>

                <details className="disclosure">
                  <summary className="disclosure__summary">詳しく見る</summary>
                  <div className="disclosure__body">
                    <dl className="record">
                      <div>
                        <dt>釣った場所</dt>
                        <dd>{spot?.name ?? String(entry.sourceSpotId)}</dd>
                      </div>
                      <div>
                        <dt>釣った日時</dt>
                        <dd>{formatWorldTime(entry.caughtAt)}</dd>
                      </div>
                      <div>
                        <dt>コンディション</dt>
                        <dd>{Math.round(entry.condition * 100)}%</dd>
                      </div>
                    </dl>
                    {entry.traits.length === 0 ? null : (
                      <ul className="traits">
                        {entry.traits.map((trait) => (
                          <li className="trait" key={trait}>
                            {TRAIT_LABELS[trait]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
