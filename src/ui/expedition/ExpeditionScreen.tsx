import { useState } from 'react'
import { formatYen } from '../../domain/economy'
import { planExpedition, remainingExpeditionDays } from '../../domain/expedition'
import { formatDuration } from '../../domain/world'
import { DEFAULT_WORLD_TUNING } from '../../domain/world/WorldTuning'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { contentRuntime } from '../../content/runtime/contentRuntime'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { ContentLoadingPanel } from '../content/ContentLoadingPanel'
import { useRegionPack } from '../content/contentRuntimeHooks'
import { useContentOrError } from '../world/useContentOrError'

/**
 * 遠征（Phase 8）。EXPEDITION / TRAVEL 画面。
 *
 * 表示するのは Content（country / region / expedition）と Domain の計画結果だけである。
 * 費用の規則は `planExpedition`、支払いと時間送りは Store の action が持つ。
 */

export const ExpeditionScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const world = usePlayerStore((state) => state.world)
  const finance = usePlayerStore((state) => state.finance)
  const expedition = usePlayerStore((state) => state.expedition)
  const startExpedition = usePlayerStore((state) => state.startExpedition)
  const endExpedition = usePlayerStore((state) => state.endExpedition)
  const [notice, setNotice] = useState<string | null>(null)
  const [nightsByExpedition, setNightsByExpedition] = useState<Record<string, number>>({})
  const [lodgingByExpedition, setLodgingByExpedition] = useState<Record<string, string>>({})
  const regionPack = useRegionPack(String(world.currentRegionId))

  /*
   * Phase 15.1: EXPEDITION を開いただけでは、どの地域の Content も読まない。
   * 目的地のカードを触った / 出発する時に、その地域の pack だけを先読みする
   * （ensureRegion は region pack + その地域の Species shard のみ）。
   */
  const preloadRegion = (regionId: string): void => {
    void contentRuntime.ensureRegion(String(regionId)).catch(() => undefined)
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

  const homeRegionId = DEFAULT_WORLD_TUNING.homeRegionId
  const current = expedition.current

  if (current !== null) {
    const remaining = remainingExpeditionDays(current, world.time)
    const nearby = content.value.spots.filter(
      (spot) => String(spot.regionId) === String(current.regionId),
    )

    return (
      <div className="fishing">
        <header className="fishing__header" />
        <section className="panel">
          <p className="fishing__phase-code">EXPEDITION</p>
          <h2 className="panel__heading">遠征中: {current.regionName}</h2>
          <p className="panel__body">
            拠点 {current.baseName} / 残り {remaining} 日 / {current.nights} 泊（
            {current.lodgingName}）
          </p>
          <p className="fishing__legend">
            支払い済み {formatYen(current.totalCostYen)}（航空券・宿泊・許可を含む）
          </p>
          <p className="panel__body">この地域の釣り場 {nearby.length} 箇所</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              setActiveScreen('map')
            }}
          >
            現地の釣り場を見る（MAP）
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              const result = endExpedition()

              if (result.ok) {
                setActiveScreen('home')
                return
              }

              setNotice(result.message)
            }}
          >
            東京へ帰る（航空移動）
          </button>
          {notice === null ? null : <p className="notice">{notice}</p>}
        </section>
      </div>
    )
  }

  const destinations = content.value.expeditions.flatMap((definition) => {
    const region = content.value.regionById[String(definition.regionId)]
    const country =
      region === undefined ? undefined : content.value.countryById[String(region.countryId)]

    if (region === undefined || country === undefined) {
      return []
    }

    const plan = planExpedition({
      definition,
      countryId: region.countryId,
      countryName: country.name,
      regionName: region.name,
      baseId: region.base.id,
      baseName: region.base.name,
      domestic: country.domestic,
      ...(nightsByExpedition[definition.id] === undefined
        ? {}
        : { nights: nightsByExpedition[definition.id] }),
      ...(lodgingByExpedition[definition.id] === undefined
        ? {}
        : { lodgingId: lodgingByExpedition[definition.id] }),
    })

    return plan === null ? [] : [{ definition, region, country, plan }]
  })

  /* Phase 16 Part 2b: 目的地を国内 / 海外にグループ化する（カードは既存のまま）。 */
  const groups = (
    [
      {
        key: 'domestic',
        label: '国内',
        entries: destinations.filter((entry) => entry.country.domestic),
      },
      {
        key: 'overseas',
        label: '海外',
        entries: destinations.filter((entry) => !entry.country.domestic),
      },
    ] as const
  ).filter((group) => group.entries.length > 0)

  const visitedRegionIds = new Set(expedition.visitedRegionIds.map(String))
  const currentRegionId = String(world.currentRegionId)

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
        <p className="fishing__phase-code">EXPEDITION</p>
        <h2 className="panel__heading">遠征・旅行</h2>
        <p className="panel__body">
          航空券・宿泊・許可をまとめて予約する。現地での移動は到着後に選ぶ。
        </p>
        <p className="fishing__legend">
          今いる地域:{' '}
          {content.value.regionById[String(world.currentRegionId)]?.name ??
            String(world.currentRegionId)}
          {' / '}
          自宅: {content.value.regionById[homeRegionId]?.base.name ?? homeRegionId}
        </p>
      </section>

      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="panel__subheading expedition-group__title">
            {group.label}
            <span className="expedition-group__count">{group.entries.length} 件</span>
          </h3>
          <ul className="spots">
            {group.entries.map(({ definition, region, country, plan }) => {
              const affordable = finance.cash >= plan.totalCostYen
              const selectedLodgingId = plan.lodging.id

              return (
                <li
                  className="spot-card"
                  key={String(definition.id)}
                  onFocusCapture={() => {
                    preloadRegion(String(definition.regionId))
                  }}
                  onPointerEnter={() => {
                    preloadRegion(String(definition.regionId))
                  }}
                >
                  <div className="spot-card__head">
                    <h3 className="panel__subheading">{plan.name}</h3>
                    <span className="spot-card__badges">
                      {String(region.id) === currentRegionId ? (
                        <span className="badge">いま ここ</span>
                      ) : visitedRegionIds.has(String(region.id)) ? (
                        <span className="badge">訪問済み</span>
                      ) : null}
                      <span className={`badge${affordable ? '' : ' badge--alert'}`}>
                        {country.domestic ? '国内' : '海外'}
                      </span>
                    </span>
                  </div>
                  <p className="spot-card__meta">
                    {country.name} / {region.name} / 拠点 {region.base.name}
                  </p>
                  <p className="spot-card__meta">
                    {definition.flight.name} 往復 {formatYen(definition.flight.oneWayCostYen * 2)} /
                    移動 {formatDuration(definition.flight.oneWayMinutes * 2)}（往復）
                  </p>

                  <div className="field">
                    <span className="field__label">泊数</span>
                    <span className="control-row">
                      <button
                        className="control control--compact"
                        type="button"
                        onClick={() => {
                          setNightsByExpedition((currentNights) => ({
                            ...currentNights,
                            [definition.id]: Math.max(definition.nights.min, plan.nights - 1),
                          }))
                        }}
                      >
                        −
                      </button>
                      <span>{plan.nights} 泊</span>
                      <button
                        className="control control--compact"
                        type="button"
                        onClick={() => {
                          setNightsByExpedition((currentNights) => ({
                            ...currentNights,
                            [definition.id]: Math.min(definition.nights.max, plan.nights + 1),
                          }))
                        }}
                      >
                        ＋
                      </button>
                    </span>
                  </div>

                  <ul className="travel-options">
                    {definition.lodgings.map((lodging) => {
                      const chosen = lodging.id === selectedLodgingId
                      const nightlyPlan = planExpedition({
                        definition,
                        countryId: region.countryId,
                        countryName: country.name,
                        regionName: region.name,
                        baseId: region.base.id,
                        baseName: region.base.name,
                        domestic: country.domestic,
                        nights: plan.nights,
                        lodgingId: lodging.id,
                      })

                      return (
                        <li
                          className={`travel-option${chosen ? ' travel-option--selected' : ''}`}
                          key={lodging.id}
                        >
                          <button
                            className="travel-option__choice"
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => {
                              setLodgingByExpedition((currentLodging) => ({
                                ...currentLodging,
                                [definition.id]: lodging.id,
                              }))
                            }}
                          >
                            <span className="travel-option__name">{`${chosen ? '●' : '○'} ${lodging.name}`}</span>
                            <span className="travel-option__meta">
                              {`1泊 ${formatYen(lodging.nightlyCostYen)} / 合計 ${formatYen(
                                nightlyPlan?.totalCostYen ?? 0,
                              )}`}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  <p className="spot-card__meta">
                    {plan.costComponents
                      .map((component) => `${component.label} ${formatYen(component.amount)}`)
                      .join(' / ')}
                  </p>
                  <p className="panel__body">
                    総額 {formatYen(plan.totalCostYen)}
                    {plan.permitName === null ? '' : ` / 許可: ${plan.permitName}`}
                  </p>

                  {affordable ? (
                    <button
                      className="control"
                      type="button"
                      onClick={() => {
                        // 出発前に目的地の Content を先読み（移動後の待ち時間を減らす）。
                        void contentRuntime
                          .ensureRegion(String(definition.regionId))
                          .catch(() => undefined)
                        const result = startExpedition(plan)

                        if (result.ok) {
                          setActiveScreen('home')
                          return
                        }

                        setNotice(result.message)
                      }}
                    >
                      {plan.name} を開始する
                    </button>
                  ) : (
                    <ul className="blocked">
                      <li>資金が足りない（あと {formatYen(plan.totalCostYen - finance.cash)}）</li>
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {notice === null ? null : <p className="notice">{notice}</p>}
    </div>
  )
}
