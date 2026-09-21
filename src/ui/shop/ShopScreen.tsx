import { formatYen } from '../../domain/economy'
import { SHOP_CATEGORY_LABELS } from '../../domain/shop'
import { useState } from 'react'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

/**
 * Shop（Phase 5 の最小実装）。
 *
 * 目的は「Money → Asset → World Access」の証明。
 * 買うと移動手段が増え、行けなかった釣り場が開く。
 */

export const ShopScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const finance = usePlayerStore((state) => state.finance)
  const purchases = usePlayerStore((state) => state.purchases)
  const purchaseItem = usePlayerStore((state) => state.purchaseItem)
  const [message, setMessage] = useState<string | null>(null)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
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
        <span className="fishing__seed">所持金 {formatYen(finance.cash)}</span>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">SHOP</p>
        <h2 className="panel__heading">店</h2>
        <p className="panel__body">買った道具は、行ける釣り場を広げる。</p>
      </section>

      {message === null ? null : <p className="notice">{message}</p>}

      <section>
        <ul className="spots">
          {content.value.shopItems.map((item) => {
            const owned = purchases.includes(item.id)
            const affordable = finance.cash >= item.price

            return (
              <li className="spot-card" key={String(item.id)}>
                <div className="spot-card__head">
                  <h3 className="panel__subheading">{item.name}</h3>
                  <span className={`badge${owned ? '' : affordable ? ' badge--alert' : ''}`}>
                    {owned ? '購入済み' : formatYen(item.price)}
                  </span>
                </div>
                <p className="spot-card__meta">
                  {SHOP_CATEGORY_LABELS[item.category]}
                  {item.grantsTransport === undefined ? '' : ` / 移動手段: ${item.grantsTransport}`}
                </p>
                <p className="spot-card__meta">{item.description}</p>

                {owned ? null : (
                  <button
                    className="control"
                    type="button"
                    disabled={!affordable}
                    onClick={() => {
                      const result = purchaseItem(item)
                      setMessage(
                        result.ok
                          ? `${item.name} を買った。行ける釣り場が広がった。`
                          : (result.message ?? '購入できなかった'),
                      )
                    }}
                  >
                    {affordable
                      ? '購入する'
                      : `不足（あと ${formatYen(item.price - finance.cash)}）`}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
