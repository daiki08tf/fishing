import { useState } from 'react'
import { formatYen } from '../../domain/economy'
import {
  GEAR_CATEGORIES,
  GEAR_CATEGORY_LABELS,
  type GearCategory,
  type GearItem,
} from '../../domain/gear/Gear'
import { SHOP_CATEGORY_LABELS } from '../../domain/shop'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { gearFamilyOf, gearSpecsOf } from '../gear/gearDisplay'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

/**
 * Shop（Phase 5 の最小実装 + Phase 6.5 の Gear カタログ）。
 *
 * 目的は「Money → Asset → World Access」の証明。
 * 買うと移動手段が増え、行けなかった釣り場が開く。Gear は所持に入るだけ（自動装備しない）。
 *
 * Phase 6.5 で Gear が数百件になったため、カテゴリとブランドで絞り込めるようにした
 * （「巨大な検索システム」は作らない。絞り込みは 2 つだけ）。
 */

type CategoryFilter = GearCategory | 'all'
type BrandFilter = string | 'all'

const FILTER_LABELS: Readonly<Record<CategoryFilter, string>> = {
  all: 'すべて',
  ...GEAR_CATEGORY_LABELS,
}

export const ShopScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const finance = usePlayerStore((state) => state.finance)
  const purchases = usePlayerStore((state) => state.purchases)
  const inventory = usePlayerStore((state) => state.inventory)
  const purchaseItem = usePlayerStore((state) => state.purchaseItem)
  const purchaseGear = usePlayerStore((state) => state.purchaseGear)
  const [message, setMessage] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('rod')
  const [brandId, setBrandId] = useState<BrandFilter>('all')

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { gear, brands, gearSeries } = content.value

  // Starter gear（price 0）は最初から持っているので店には並べない。
  const forSale = gear.filter((item) => item.price > 0)

  const countIn = (target: CategoryFilter): number =>
    target === 'all' ? forSale.length : forSale.filter((item) => item.category === target).length

  const usedBrandIds = new Set(forSale.map((item) => String(item.brandId ?? '')))
  const brandOptions = [...brands]
    .filter((brand) => usedBrandIds.has(String(brand.id)))
    .sort((left, right) => left.name.localeCompare(right.name))

  const visible = forSale.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (brandId === 'all' || String(item.brandId ?? '') === brandId),
  )

  const owned = (item: GearItem): boolean => inventory.ownedGearIds.includes(item.id)
  const selectedBrandName =
    brandId === 'all' ? '' : (brands.find((brand) => String(brand.id) === brandId)?.name ?? '')

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
        <p className="panel__body">
          装備は {forSale.length} 点。買っても自動では装備されない（タックル画面で選ぶ）。
        </p>
      </section>

      {message === null ? null : <p className="notice">{message}</p>}

      <section className="panel">
        <h3 className="panel__subheading">装備</h3>
        <div className="tabs">
          {(['all', ...GEAR_CATEGORIES] as readonly CategoryFilter[]).map((value) => (
            <button
              key={value}
              className={`tab${category === value ? ' tab--active' : ''}`}
              type="button"
              onClick={() => {
                setCategory(value)
              }}
            >
              {FILTER_LABELS[value]} {countIn(value)}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field__label">ブランド</span>
          <select
            className="field__control"
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value)
            }}
          >
            <option value="all">すべて</option>
            {brandOptions.map((brand) => (
              <option key={String(brand.id)} value={String(brand.id)}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>

        <p className="fishing__legend">
          {visible.length} 点を表示中
          {selectedBrandName === '' ? '' : `（${selectedBrandName}）`}
        </p>

        <ul className="spots">
          {visible.map((item) => {
            const has = owned(item)
            const affordable = finance.cash >= item.price
            const family = gearFamilyOf(item, brands, gearSeries)

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
                  {family.label.length === 0 ? '' : ` / ${family.label}`}
                </p>
                {gearSpecsOf(item).map((line) => (
                  <p className="spot-card__meta" key={line}>
                    {line}
                  </p>
                ))}

                {has ? (
                  <p className="fishing__legend">所持済み（タックル画面で装備できる）</p>
                ) : (
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
            const has = purchases.includes(item.id)
            const affordable = finance.cash >= item.price

            return (
              <li className="spot-card" key={String(item.id)}>
                <div className="spot-card__head">
                  <h4 className="panel__subheading">{item.name}</h4>
                  <span className={`badge${has ? '' : affordable ? ' badge--alert' : ''}`}>
                    {has ? '購入済み' : formatYen(item.price)}
                  </span>
                </div>
                <p className="spot-card__meta">
                  {SHOP_CATEGORY_LABELS[item.category]}
                  {item.grantsTransport === undefined ? '' : ` / 移動手段: ${item.grantsTransport}`}
                </p>
                <p className="spot-card__meta">{item.description}</p>

                {has ? null : (
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
