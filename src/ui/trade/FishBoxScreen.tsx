import { calcSaleValueYen, resolveFreshness } from '../../domain/trade'
import { formatWorldTime } from '../../domain/world'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

/**
 * Fish Box（Phase 13）。
 *
 * 持ち帰った魚の一覧。表示専用で、売却は TRADE 画面で行う。
 * 「推定売却額」は今いる全 Buyer のうち最も高い査定を暫定表示する（実際の額は TRADE で確定する）。
 */
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
        <h2 className="panel__heading">持ち帰った魚</h2>
        <p className="panel__body">{trade.fishBox.length} 匹。売却は「買取先へ売る」から行う。</p>
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
          <p className="panel__body">Fish Box は空。釣った魚を「持ち帰る」と、ここに入る。</p>
        </section>
      ) : (
        <section>
          <ul className="spots">
            {trade.fishBox.map((entry) => {
              const species = speciesById[String(entry.speciesId)]
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

              return (
                <li className="spot-card" key={String(entry.catchId)}>
                  <div className="spot-card__head">
                    <h3 className="panel__subheading">
                      {species?.japaneseName ?? String(entry.speciesId)}
                    </h3>
                    <span className="badge">{Math.round(freshness * 100)}% 鮮度</span>
                  </div>
                  <p className="spot-card__meta">
                    {entry.lengthCm} cm / {entry.weightKg.toFixed(3)} kg / コンディション{' '}
                    {Math.round(entry.condition * 100)}% / 上位 {Math.round(100 - entry.percentile)}
                    %
                  </p>
                  <p className="spot-card__meta">釣った日時: {formatWorldTime(entry.caughtAt)}</p>
                  <p className="spot-card__meta">
                    {profile === undefined || profile.tradeStatus !== 'tradable'
                      ? '取引不可（PROVISIONAL）'
                      : localBuyers.length === 0
                        ? '今いる地域に買取先が無い'
                        : `推定売却額: 最大 ¥${bestValue.toLocaleString('ja-JP')}（買取先により変動）`}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
