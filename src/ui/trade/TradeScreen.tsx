import { useState } from 'react'
import { quoteSale, trustOf, type ContactReward } from '../../domain/trade'
import { formatYen } from '../../domain/economy'
import { asFishIndividualId } from '../../domain/ids'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { EmptyState } from '../components/EmptyState'
import { StatMeter } from '../components/StatMeter'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { ContentLoadingPanel } from '../content/ContentLoadingPanel'
import { useRegionPack, useSpeciesDetail } from '../content/contentRuntimeHooks'
import { useContentOrError } from '../world/useContentOrError'
import { buyerPreferenceChips, buyerRoleLabel, describeBuyerRole } from './buyerPresentation'
import './trade.css'

/**
 * TRADE（Phase 13 / Phase 14 で Buyer カード表示に再構成）。
 *
 * Fish Box から売る魚を選び、1 つの買取先へまとめて売る。
 * 価格・Trust 上昇は deterministic（domain/trade/sellCatches）。
 *
 * Phase 13.1:
 * - **今いる地域の買取先だけ**を出す（魚は今いる地域の店 / 卸 / 市場へ持ち込む）。
 *   Domain 側（sellCatches）でも同じ規則で拒否するので、UI は防壁ではない。
 * - プレビューは実際の売却と **同じ `quoteSale`** を呼ぶ（volume bonus 込みで一致する）。
 * - Trust 表示は計算値ではなく実際に入った差分（actualTrustGain）を使う。
 *
 * Phase 14:
 * - Buyer は具体的な ID で分岐しない。名前・タイプ・Trust は Content からそのまま出し、
 *   短い役割文と好みのタグは BuyerDefinition の数値 / preferences から組み立てる
 *   （Phase 14.1: 長文 description は画面に出さない）。
 * - 魚を選んだあとは、同じ `quoteSale` を今いる地域の Buyer 分だけ呼び、査定の比較を出す。
 */
export const TradeScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const trade = usePlayerStore((state) => state.trade)
  const world = usePlayerStore((state) => state.world)
  const regionPack = useRegionPack(String(world.currentRegionId))
  /* Phase 15.1: Fish Box の魚は別地域の Species かもしれない（必要分だけ追加で読む）。 */
  const speciesDetail = useSpeciesDetail(trade.fishBox.map((entry) => String(entry.speciesId)))
  const sellToBuyer = usePlayerStore((state) => state.sellToBuyer)
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null)
  const [selectedCatchIds, setSelectedCatchIds] = useState<readonly string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  if (speciesDetail.status === 'error') {
    return (
      <ContentLoadingPanel
        message="魚の情報を読み込み中…"
        error={speciesDetail.error}
        onRetry={speciesDetail.retry}
      />
    )
  }

  if (regionPack.status !== 'ready') {
    return (
      <ContentLoadingPanel
        message="地域情報を読み込み中…"
        error={regionPack.error}
        onRetry={regionPack.retry}
      />
    )
  }

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { speciesById, buyers, speciesTradeProfileBySpeciesId, contactRewards } = content.value
  const currentRegionId = String(world.currentRegionId)
  const localBuyers = buyers
    .filter((entry) => String(entry.regionId) === currentRegionId)
    .slice()
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
  const buyer = localBuyers.find((entry) => String(entry.id) === selectedBuyerId) ?? localBuyers[0]
  const rewardsForBuyer: readonly ContactReward[] =
    buyer === undefined
      ? []
      : contactRewards.filter((reward) => String(reward.contactId) === String(buyer.id))

  const tradableCatches = trade.fishBox.filter((entry) => {
    const profile = speciesTradeProfileBySpeciesId[String(entry.speciesId)]
    return profile !== undefined && profile.tradeStatus === 'tradable'
  })

  /*
   * プレビューと実売却が同じ関数を通る（= ここで出た合計が実際の受け取り額）。
   * volume bonus は tradable が確定した後に掛かるので、取引不可の魚が混ざっても変わらない。
   */
  const preview =
    buyer === undefined
      ? null
      : quoteSale({
          fishBox: trade.fishBox,
          catchIds: selectedCatchIds.map(asFishIndividualId),
          buyer,
          tradeProfileBySpeciesId: speciesTradeProfileBySpeciesId,
          now: world.time,
        })
  const previewLines = (preview?.lines ?? []).map((line) => ({
    catchId: String(line.catchId),
    speciesName: speciesById[line.speciesId]?.japaneseName ?? line.speciesId,
    valueYen: line.valueYen,
  }))
  const previewTotal = preview?.totalValueYen ?? 0
  const previewExcluded = preview?.excluded ?? []

  // 今いる地域の Buyer だけで査定を比較する（他地域の Buyer は持ち込めないので比較にも出さない）。
  const buyerComparisons =
    selectedCatchIds.length === 0
      ? []
      : localBuyers.map((candidate) => ({
          id: String(candidate.id),
          name: candidate.name,
          totalValueYen: quoteSale({
            fishBox: trade.fishBox,
            catchIds: selectedCatchIds.map(asFishIndividualId),
            buyer: candidate,
            tradeProfileBySpeciesId: speciesTradeProfileBySpeciesId,
            now: world.time,
          }).totalValueYen,
        }))

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
        {localBuyers.length === 0 ? (
          <EmptyState
            icon="coin"
            title="この地域に買取先が無い"
            body="釣った魚は今いる地域の店・卸・市場にしか持ち込めない。（自宅のある地域へ戻るか、遠征先で買取先を探す）"
          />
        ) : (
          <ul className="buyer-card-list">
            {localBuyers.map((candidate) => {
              const active = String(candidate.id) === String(buyer?.id)

              return (
                <li key={String(candidate.id)}>
                  <button
                    className={`buyer-card${active ? ' buyer-card--active' : ''}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedBuyerId(String(candidate.id))
                    }}
                  >
                    <div className="buyer-card__head">
                      <h3 className="panel__subheading">{candidate.name}</h3>
                      <span className="badge">{buyerRoleLabel(candidate)}</span>
                    </div>
                    <StatMeter
                      label="Trust"
                      value={trustOf(trade, candidate.id)}
                      max={100}
                      tone="trust"
                    />
                    <p className="buyer-card__desc">{describeBuyerRole(candidate)}</p>
                    <ul className="buyer-card__tags">
                      {buyerPreferenceChips(candidate).map((chip) => (
                        <li className="buyer-chip" key={chip}>
                          {chip}
                        </li>
                      ))}
                    </ul>
                  </button>
                </li>
              )
            })}
          </ul>
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
              {preview === null || preview.volumeBonus <= 0 ? null : (
                <p className="fishing__legend">
                  まとめ売り +{Math.round(preview.volumeBonus * 100)}%（
                  {preview.tradableCount} 匹分）
                </p>
              )}
            </>
          )}
          {previewExcluded.length === 0 ? null : (
            <p className="fishing__legend">
              取引できない魚を {previewExcluded.length} 匹除外した（合計額には入らない）。
            </p>
          )}

          {buyerComparisons.length <= 1 ? null : (
            <div className="quote-compare">
              <p className="fishing__legend">今いる地域の買取先で比べる:</p>
              <ul className="log">
                {buyerComparisons.map((entry) => (
                  <li key={entry.id}>
                    {entry.name}: {formatYen(entry.totalValueYen)}
                    {entry.id === String(buyer.id) ? '（選択中）' : ''}
                  </li>
                ))}
              </ul>
            </div>
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
                setNotice(
                  result.reason === 'buyer_region_mismatch'
                    ? '今いる地域の買取先にしか売れない。'
                    : '売却できなかった。',
                )
                return
              }

              const rewardText =
                result.newlyClaimedRewards.length === 0
                  ? ''
                  : ` / 新しい情報: ${result.newlyClaimedRewards.map((reward) => reward.message).join(' / ')}`
              // Trust 100 では「+0」。計算値ではなく実際に入った差分を出す。
              const trustText =
                result.actualTrustGain > 0
                  ? `Trust +${String(result.actualTrustGain)}`
                  : 'Trust 上限（+0）'

              setNotice(`${formatYen(result.totalValueYen)} で売却（${trustText}）${rewardText}`)
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
