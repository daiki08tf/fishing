import { useState } from 'react'
import type { BrandDefinition } from '../../domain/gear/Brand'
import { GEAR_CATEGORY_LABELS, type GearItem } from '../../domain/gear/Gear'
import {
  COMPATIBILITY_LABELS,
  LOADOUT_SLOTS,
  SLOT_CATEGORIES,
  evaluateCompatibility,
  ownedGearInCategory,
  resolveGearForLoadout,
  resolveTackle,
  slotGearId,
  withSlot,
  type Loadout,
  type LoadoutSlot,
} from '../../domain/tackle'
import {
  FIGHT_CHALLENGE_LABELS,
  READINESS_ASPECT_LABELS,
  READINESS_ASPECTS,
  READINESS_MARK_SYMBOLS,
  resolveFightCapability,
  resolveFightReadiness,
} from '../../domain/fishing'
import { hasBigGameExperience } from '../../domain/codex'
import { GLOBAL_PACK_KEYS } from '../../content/runtime/contentRuntime'
import { useAppStore } from '../../state/appStore'
import { usePlayerStore } from '../../state/playerStore'
import { gearFamilyOf, gearSpecsOf, gearTitleOf } from '../gear/gearDisplay'
import { ContentErrorPanel } from '../world/ContentErrorPanel'
import { ContentLoadingPanel } from '../content/ContentLoadingPanel'
import { usePack } from '../content/contentRuntimeHooks'
import { useContentOrError } from '../world/useContentOrError'

/**
 * TACKLE 画面（Phase 6 / Phase 6.5）。
 *
 * 「何を使って、どう狙うか」を決める場所。
 * ここは**表示と選択だけ**を行い、互換性の判定は Domain（compatibility /
 * resolveTackle）に任せる。UI でルールを再実装しない。
 *
 * Phase 6.5 で所持 Gear が増えたため、ブランドで絞り込めるようにした。
 */

const SLOT_LABELS: Readonly<Record<LoadoutSlot, string>> = {
  rod: 'ロッド',
  reel: 'リール',
  line: 'ライン',
  leader: 'リーダー',
  hook: 'フック',
  offering: '仕掛け（ルアー / 餌）',
}

const scoreLabel = (value: number): string =>
  `${'■'.repeat(Math.max(1, Math.round(value * 5)))}${'□'.repeat(
    Math.max(0, 5 - Math.round(value * 5)),
  )}`

export const TackleScreen = () => {
  const content = useContentOrError()
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const loadout = usePlayerStore((state) => state.loadout)
  const codex = usePlayerStore((state) => state.codex)
  const tacklePack = usePack(GLOBAL_PACK_KEYS.tackle)
  const inventory = usePlayerStore((state) => state.inventory)
  const equipGear = usePlayerStore((state) => state.equipGear)
  const setMethod = usePlayerStore((state) => state.setMethod)
  const worldPhase = usePlayerStore((state) => state.world.phase)
  const [message, setMessage] = useState<string | null>(null)
  const [brandId, setBrandId] = useState<string | 'all'>('all')

  if (tacklePack.status !== 'ready') {
    return (
      <ContentLoadingPanel
        message="道具の情報を読み込み中…"
        error={tacklePack.error}
        onRetry={tacklePack.retry}
      />
    )
  }

  if (!content.ok) {
    return <ContentErrorPanel message={content.message} />
  }

  const { gear, methods, brands, gearSeries } = content.value
  const catalog = { gear, methods }
  const method = methods.find((entry) => entry.id === loadout.methodId)
  const report = method === undefined ? null : evaluateCompatibility({ loadout, gear, method })
  const setup = resolveTackle({ loadout, gear, methods })
  const familyOf = (item: GearItem) => gearFamilyOf(item, brands, gearSeries)

  // Phase 18C: Big Game への備え。汎用の reference demand に対する readiness。
  // 大型魚の経験が浅いうちはチャレンジ帯（見通し）を隠す（Knowledge masking）。
  const castingGear = resolveGearForLoadout(loadout, gear)
  const readiness =
    castingGear === null
      ? null
      : resolveFightReadiness({
          capability: resolveFightCapability(castingGear),
          revealExpectation: hasBigGameExperience(codex),
        })

  const ownedIds = new Set(inventory.ownedGearIds.map((id) => String(id)))
  const ownedBrandIds = new Set(
    gear.filter((item) => ownedIds.has(String(item.id))).map((item) => String(item.brandId ?? '')),
  )
  const brandOptions: readonly BrandDefinition[] = [...brands]
    .filter((brand) => ownedBrandIds.has(String(brand.id)))
    .sort((left, right) => left.name.localeCompare(right.name))

  const nameOf = (gearId: GearItem['id'] | null): string => {
    if (gearId === null) {
      return 'なし'
    }

    const item = gear.find((entry) => entry.id === gearId)
    return item === undefined ? '不明な装備' : gearTitleOf(item, brands, gearSeries)
  }

  const matchesBrand = (item: GearItem): boolean =>
    brandId === 'all' || String(item.brandId ?? '') === brandId

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            setActiveScreen(worldPhase === 'AT_SPOT' ? 'spot' : 'home')
          }}
        >
          ← {worldPhase === 'AT_SPOT' ? '釣り場' : '自宅'}
        </button>
        <span className="fishing__seed">TACKLE</span>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">CURRENT LOADOUT</p>
        <h2 className="panel__heading">今のタックル</h2>
        {report === null ? (
          <p className="panel__body">釣法が不明である。読み込み直してほしい。</p>
        ) : (
          <p className={`badge${report.fatal ? ' badge--alert' : ''}`}>
            {COMPATIBILITY_LABELS[report.level]}（適合 {report.score.toFixed(2)}）
          </p>
        )}
        <dl className="record">
          {LOADOUT_SLOTS.map((slot) => (
            <div key={slot}>
              <dt>{SLOT_LABELS[slot]}</dt>
              <dd>{nameOf(slotGearId(loadout, slot))}</dd>
            </div>
          ))}
          <div>
            <dt>釣法</dt>
            <dd>{method?.name ?? '不明'}</dd>
          </div>
        </dl>
      </section>

      {report === null ? null : (
        <section className="panel">
          <h3 className="panel__subheading">互換性</h3>
          <ul className="log">
            {report.issues.map((issue) => (
              <li key={`${issue.level}:${issue.message}`}>
                [{COMPATIBILITY_LABELS[issue.level]}] {issue.message}
              </li>
            ))}
          </ul>
          {setup === null ? null : (
            <dl className="record">
              <div>
                <dt>パワー</dt>
                <dd>{scoreLabel(setup.ratings.power)}</dd>
              </div>
              <div>
                <dt>繊細さ</dt>
                <dd>{scoreLabel(setup.ratings.finesse)}</dd>
              </div>
              <div>
                <dt>飛距離</dt>
                <dd>{scoreLabel(setup.ratings.distance)}</dd>
              </div>
              <div>
                <dt>主導権</dt>
                <dd>{scoreLabel(setup.ratings.control)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {readiness === null ? null : (
        <section className="panel">
          <p className="fishing__phase-code">BIG GAME READINESS</p>
          <h3 className="panel__subheading">大型魚への備え</h3>
          <dl className="record">
            {READINESS_ASPECTS.map((aspect) => (
              <div key={aspect}>
                <dt>{READINESS_ASPECT_LABELS[aspect]}</dt>
                <dd>
                  {READINESS_MARK_SYMBOLS[readiness.marks[aspect]]} {readiness.details[aspect]}
                </dd>
              </div>
            ))}
            <div>
              <dt>見通し</dt>
              <dd>
                {readiness.masked || readiness.challenge === null
                  ? '不明（大型魚の経験が浅い）'
                  : FIGHT_CHALLENGE_LABELS[readiness.challenge]}
              </dd>
            </div>
          </dl>
          <ul className="log">
            {readiness.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {message === null ? null : <p className="notice">{message}</p>}

      <section className="panel">
        <h3 className="panel__subheading">釣法</h3>
        <ul className="spots">
          {methods.map((entry) => {
            const candidate: Loadout = { ...loadout, methodId: entry.id }
            const candidateReport = evaluateCompatibility({
              loadout: candidate,
              gear,
              method: entry,
            })
            const current = entry.id === loadout.methodId

            return (
              <li className="spot-card" key={entry.id}>
                <div className="spot-card__head">
                  <h4 className="panel__subheading">{entry.name}</h4>
                  <span className={`badge${candidateReport.fatal ? ' badge--alert' : ''}`}>
                    {current ? '使用中' : COMPATIBILITY_LABELS[candidateReport.level]}
                  </span>
                </div>
                <p className="spot-card__meta">{entry.description}</p>
                <button
                  className="control"
                  type="button"
                  disabled={current || candidateReport.fatal}
                  onClick={() => {
                    const result = setMethod({ ...catalog, methodId: entry.id })
                    setMessage(result.ok ? `${entry.name} に変えた` : result.message)
                  }}
                >
                  {current ? '使用中' : 'この釣法にする'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <label className="field">
          <span className="field__label">所有している装備をブランドで絞る</span>
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
        <p className="fishing__legend">所持している装備だけが選べる。</p>
      </section>

      {LOADOUT_SLOTS.map((slot) => {
        const category = SLOT_CATEGORIES[slot][0]
        const owned =
          category === undefined
            ? []
            : ownedGearInCategory(inventory, gear, category).filter(matchesBrand)
        const currentId = slotGearId(loadout, slot)

        return (
          <section className="panel" key={slot}>
            <h3 className="panel__subheading">{SLOT_LABELS[slot]}</h3>
            <ul className="spots">
              {slot === 'leader' && brandId === 'all' ? (
                <li className="spot-card">
                  <div className="spot-card__head">
                    <h4 className="panel__subheading">リーダーなし</h4>
                    <span className="badge">{currentId === null ? '使用中' : '未使用'}</span>
                  </div>
                  <p className="spot-card__meta">
                    リーダーを外すと根ズレに弱くなるが、結び目は減る。
                  </p>
                  <button
                    className="control"
                    type="button"
                    disabled={currentId === null}
                    onClick={() => {
                      const result = equipGear({ ...catalog, slot, gearId: null })
                      setMessage(result.ok ? 'リーダーを外した' : result.message)
                    }}
                  >
                    リーダーを外す
                  </button>
                </li>
              ) : null}

              {owned.map((item) => {
                const candidate = withSlot(loadout, slot, item.id)
                const candidateMethod = methods.find((entry) => entry.id === candidate.methodId)
                const candidateReport =
                  candidateMethod === undefined
                    ? null
                    : evaluateCompatibility({
                        loadout: candidate,
                        gear,
                        method: candidateMethod,
                      })
                const fatal = candidateReport?.fatal ?? false
                const current = currentId === item.id
                const family = familyOf(item)

                return (
                  <li className="spot-card" key={String(item.id)}>
                    <div className="spot-card__head">
                      <h4 className="panel__subheading">{item.name}</h4>
                      <span className={`badge${fatal ? ' badge--alert' : ''}`}>
                        {current
                          ? '装備中'
                          : fatal
                            ? '使用不可'
                            : candidateReport?.level === undefined
                              ? GEAR_CATEGORY_LABELS[item.category]
                              : COMPATIBILITY_LABELS[candidateReport.level]}
                      </span>
                    </div>
                    <p className="spot-card__meta">
                      {family.label.length === 0
                        ? GEAR_CATEGORY_LABELS[item.category]
                        : family.label}
                    </p>
                    {gearSpecsOf(item).map((line) => (
                      <p className="spot-card__meta" key={line}>
                        {line}
                      </p>
                    ))}
                    {fatal && candidateReport !== null ? (
                      <p className="blocked">
                        {candidateReport.issues.find((issue) => issue.level === 'fatal')?.message}
                      </p>
                    ) : null}
                    <button
                      className="control"
                      type="button"
                      disabled={current || fatal}
                      onClick={() => {
                        const result = equipGear({ ...catalog, slot, gearId: item.id })
                        setMessage(result.ok ? `${item.name} を装備した` : result.message)
                      }}
                    >
                      {current ? '装備中' : 'これを装備'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <section className="panel">
        <button
          className="button"
          type="button"
          onClick={() => {
            setActiveScreen('shop')
          }}
        >
          店で装備を買う
        </button>
      </section>
    </div>
  )
}
