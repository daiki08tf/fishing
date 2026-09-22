import { useState } from 'react'
import { calcSaleValueYen, resolveFreshness, trustOf, type ContactReward } from '../../domain/trade'
import { formatYen } from '../../domain/economy'
import { asFishIndividualId } from '../../domain/ids'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { useContentOrError } from '../world/useContentOrError'

const BUYER_TYPE_LABELS: Readonly<Record<string, string>> = {
  izakaya: '居酒屋',
  wholesaler: '卸',
  market: '市場',
}

/**
 * TRADE（Phase 13）。
 *
 * Fish Box から売る魚を選び、1 つの買取先へまとめて売る。
 * 価格・Trust 上昇は deterministic（domain/trade/sellCatches）。
 */
export const TradeScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const trade = usePlayerStore((state) => state.trade)
  const world = usePlayerStore((state) => state.world)
  const sellToBuyer = usePlayerStore((state) => state.sellToBuyer)
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null)
  const [selectedCatchIds, setSelectedCatchIds] = useState<readonly string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { speciesById, buyers, speciesTradeProfileBySpeciesId, contactRewards } = content.value
  const buyer = buyers.find((entry) => String(entry.id) === selectedBuyerId) ?? buyers[0]
  const rewardsForBuyer: readonly ContactReward[] =
    buyer === undefined
      ? []
      : contactRewards.filter((reward) => String(reward.contactId) === String(buyer.id))

  const tradableCatches = trade.fishBox.filter((entry) => {
    const profile = speciesTradeProfileBySpeciesId[String(entry.speciesId)]
    return profile !== undefined && profile.tradeStatus === 'tradable'
  })

  const previewLines =
    buyer === undefined
      ? []
      : selectedCatchIds.flatMap((catchId) => {
          const entry = trade.fishBox.find((candidate) => String(candidate.catchId) === catchId)
          const profile =
            entry === undefined
              ? undefined
              : speciesTradeProfileBySpeciesId[String(entry.speciesId)]

          if (entry === undefined || profile === undefined) {
            return []
          }

          const freshness = resolveFreshness(entry.caughtAt, world.time)
          const valueYen = calcSaleValueYen(entry, buyer, profile, freshness)

          return [
            {
              catchId,
              speciesName: speciesById[String(entry.speciesId)]?.japaneseName ?? '',
              valueYen,
            },
          ]
        })
  const previewTotal = previewLines.reduce((sum, line) => sum + line.valueYen, 0)

  const toggleCatch = (catchId: string): void => {
    setSelectedCatchIds((current) =>
      current.includes(catchId) ? current.filter((id) => id !== catchId) : [...current, catchId],
    )
  }

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            setActiveScreen('fishbox')
          }}
        >
          ← Fish Box
        </button>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">TRADE</p>
        <h2 className="panel__heading">買取先へ売る</h2>
        <div className="tabs">
          {buyers.map((candidate) => {
            const active = String(candidate.id) === String(buyer?.id)

            return (
              <button
                className={`button${active ? ' button--primary' : ' button--ghost'}`}
                key={String(candidate.id)}
                type="button"
                onClick={() => {
                  setSelectedBuyerId(String(candidate.id))
                }}
              >
                {candidate.name}（{BUYER_TYPE_LABELS[candidate.buyerType] ?? candidate.buyerType}）
              </button>
            )
          })}
        </div>
        {buyer === undefined ? null : (
          <>
            <p className="panel__body">{buyer.description}</p>
            <p className="fishing__legend">Trust {Math.round(trustOf(trade, buyer.id))} / 100</p>
          </>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">売る魚を選ぶ</h3>
        {tradableCatches.length === 0 ? (
          <p className="panel__body">売れる魚が Fish Box に無い。</p>
        ) : (
          <ul className="spots">
            {tradableCatches.map((entry) => {
              const catchId = String(entry.catchId)
              const checked = selectedCatchIds.includes(catchId)

              return (
                <li className="spot-card" key={catchId}>
                  <label className="spot-card__head">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        toggleCatch(catchId)
                      }}
                    />
                    <h3 className="panel__subheading">
                      {speciesById[String(entry.speciesId)]?.japaneseName ??
                        String(entry.speciesId)}
                    </h3>
                  </label>
                  <p className="spot-card__meta">
                    {entry.lengthCm} cm / {entry.weightKg.toFixed(3)} kg
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {buyer === undefined ? null : (
        <section className="panel">
          <h3 className="panel__subheading">売却プレビュー</h3>
          {previewLines.length === 0 ? (
            <p className="panel__body">売る魚を選ぶと、売却額のプレビューが出る。</p>
          ) : (
            <>
              <ul className="log">
                {previewLines.map((line) => (
                  <li key={line.catchId}>
                    {line.speciesName} — {formatYen(line.valueYen)}
                  </li>
                ))}
              </ul>
              <p className="notice__title">合計 {formatYen(previewTotal)}</p>
            </>
          )}
          <button
            className="control control--accent"
            type="button"
            disabled={buyer === undefined || selectedCatchIds.length === 0}
            onClick={() => {
              if (buyer === undefined) {
                return
              }

              const result = sellToBuyer({
                buyer,
                catchIds: selectedCatchIds.map(asFishIndividualId),
                tradeProfileBySpeciesId: speciesTradeProfileBySpeciesId,
                rewards: rewardsForBuyer,
              })

              if (!result.ok) {
                setNotice('売却できなかった。')
                return
              }

              const rewardText =
                result.newlyClaimedRewards.length === 0
                  ? ''
                  : ` / 新しい情報: ${result.newlyClaimedRewards.map((reward) => reward.message).join(' / ')}`

              setNotice(
                `${formatYen(result.totalValueYen)} で売却（Trust +${result.trustGain}）${rewardText}`,
              )
              setSelectedCatchIds([])
            }}
          >
            売る
          </button>
        </section>
      )}

      {notice === null ? null : <p className="notice">{notice}</p>}
    </div>
  )
}
