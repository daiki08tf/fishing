import { formatYen } from '../../domain/economy'
import { GEAR_CATEGORY_LABELS, brandLabelOf, type GearItem } from '../../domain/gear/Gear'
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
  const inventory = usePlayerStore((state) => state.inventory)
  const purchaseItem = usePlayerStore((state) => state.purchaseItem)
  const purchaseGear = usePlayerStore((state) => state.purchaseGear)
  const [message, setMessage] = useState<string | null>(null)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const owned = (item: GearItem): boolean => inventory.ownedGearIds.includes(item.id)

  // 店に並ぶ装備。Starter gear（price 0）は最初から持っているので並べない。
  const forSale = content.value.gear.filter((item) => item.price > 0)

  const specOf = (item: GearItem): string => {
    switch (item.category) {
      case 'rod':
        return `${String(item.lengthM)}m / ${item.power} / ${item.action} / ${String(
          item.minLureWeightG,
        )}–${String(item.maxLureWeightG)}g`
      case 'reel':
        return `${String(item.sizeClass ?? item.size)}番 ${item.variant ?? ''} / ドラッグ ${String(
          item.maxDragKg,
        )}kg`
      case 'line':
        return `${item.lineType} / ${String(item.strengthKg)}kg / ${String(item.diameterMm)}mm`
      case 'leader':
        return `${item.material} / ${String(item.strengthKg)}kg / 耐摩耗 ${String(
          item.abrasionResistance,
        )}`
      case 'hook':
        return `${String(item.size)}番 / ${item.hookType} / 保持 ${String(item.holdingPower)}`
      case 'lure':
        return `${String(item.weightG)}g / ${item.lureType} / ${item.action}`
      case 'bait':
        return `${item.baitType} / ${item.presentation}`
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
        <span className="fishing__seed">所持金 {formatYen(finance.cash)}</span>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">SHOP</p>
        <h2 className="panel__heading">店</h2>
        <p className="panel__body">買った道具は、行ける釣り場を広げる。</p>
      </section>

      {message === null ? null : <p className="notice">{message}</p>}

      <section>
        <h3 className="panel__subheading">装備</h3>
        <p className="fishing__legend">買った装備は自動では装備されない。タックル画面で選ぶ。</p>
        <ul className="spots">
          {forSale.map((item) => {
            const has = owned(item)
            const affordable = finance.cash >= item.price
            const brand = brandLabelOf(item, content.value.brands)
            const series = 'series' in item && typeof item.series === 'string' ? item.series : ''
            const family = [brand, series].filter((part) => part.length > 0).join(' ')

            return (
              <li className="spot-card" key={String(item.id)}>
                <div className="spot-card__head">
                  <h4 className="panel__subheading">{item.name}</h4>
                  <span className={`badge${has ? '' : affordable ? ' badge--alert' : ''}`}>
                    {has ? '所持済み' : formatYen(item.price)}
                  </span>
                </div>
                <p className="spot-card__meta">
                  {GEAR_CATEGORY_LABELS[item.category]}
                  {family.length === 0 ? '' : ` / ${family}`}
                </p>
                <p className="spot-card__meta">{specOf(item)}</p>

                {has ? null : (
                  <button
                    className="control"
                    type="button"
                    disabled={!affordable}
                    onClick={() => {
                      const result = purchaseGear({ item })
                      setMessage(
                        result.ok
                          ? `${item.name} を買った。タックル画面で装備できる。`
                          : result.message,
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

      <section>
        <h3 className="panel__subheading">移動手段</h3>
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
