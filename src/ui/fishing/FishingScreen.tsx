import type { ConditionBand } from '../../domain/fish/fishCondition'
import type { FishTrait } from '../../domain/fish/FishTrait'
import { PERK_DEFINITIONS } from '../../domain/progression'
import { CONDITION_SUMMARY_LABELS, TIDE_LABELS, WEATHER_LABELS } from '../../domain/environment'
import {
  ALLOWED_COMMANDS,
  isTerminalPhase,
  type FishingCommand,
  type FishingEvent,
  type FishingPhase,
} from '../../domain/fishing'
import { useEffect, useState } from 'react'
import { suggestBattleCommand } from '../../domain/fishing/battle'
import { FishingMeter } from './FishingMeter'
import { useFishingSession } from './useFishingSession'
import { usePlayerStore } from '../../state/playerStore'
import { useAppStore } from '../../state/appStore'
import '../styles/fishing.css'

/**
 * 釣り画面（Phase 2 版）。
 *
 * このコンポーネントが行うのは「コマンドを送る」「状態を描く」だけである。
 * 個体生成・Trait 抽選・記録の更新は Domain 側にある。
 */

const PHASE_LABELS: Readonly<Record<FishingPhase, string>> = {
  IDLE: '待機',
  CASTING: 'キャスト中',
  WAITING: 'アタリ待ち',
  BITE: 'アタリ！',
  HOOK_WINDOW: 'アワセのチャンス',
  HOOKED: 'フッキング',
  FIGHTING: 'ファイト中',
  LANDING: '取り込み中',
  LANDED: '取り込み成功',
  HOOK_MISSED: 'アワセ失敗',
  HOOK_ESCAPE: 'フックが外れた',
  LINE_BREAK: 'ラインブレイク',
}

const PHASE_HINTS: Readonly<Record<FishingPhase, string>> = {
  IDLE: 'キャストして釣りを始める',
  CASTING: '仕掛けが飛んでいる',
  WAITING: 'アタリを待つ',
  BITE: 'アタリが出た',
  HOOK_WINDOW: '今アワセる（HOOK）',
  HOOKED: '乗った。ファイトに入る',
  FIGHTING: '魚の動き（走り / 突進 / 休み）を読み、コマンドを選ぶ',
  LANDING: '暴れているなら待つ。落ち着いたら取り込む',
  LANDED: '釣り上げた',
  HOOK_MISSED: 'アワセが遅れた。もう一度キャストする',
  HOOK_ESCAPE: '糸を緩めすぎた。もう一度キャストする',
  LINE_BREAK: 'テンションを上げすぎた。もう一度キャストする',
}

const BEHAVIOR_LABELS = {
  normal: '普通',
  run: '走っている',
} as const

const CONDITION_LABELS: Readonly<Record<ConditionBand, string>> = {
  thin: '痩せ',
  standard: '標準',
  good: '良好',
  excellent: '非常に良好',
}

const TRAIT_LABELS: Readonly<Record<FishTrait, string>> = {
  trophy: 'Trophy',
  old: 'Old',
  strong_runner: 'Strong Runner',
  heavy: 'Heavy',
  scarred: 'Scarred',
  aggressive: 'Aggressive',
}

const TRAIT_HINTS: Readonly<Record<FishTrait, string>> = {
  trophy: '記録級の大型。スタミナが高い',
  old: '老成個体。動きは鈍いが引きは強い',
  strong_runner: 'よく走る',
  heavy: '同じ体長でも重い',
  scarred: '傷を持つ個体（数値効果はなし）',
  aggressive: '行動が荒い',
}

const EVENT_LABELS: Readonly<Record<FishingEvent, string>> = {
  CAST_STARTED: 'キャストした',
  CAST_COMPLETED: '着水した',
  BITE: 'アタリ',
  NO_BITE: 'アタリがなかった',
  HOOK_SET: 'アワセが決まった',
  HOOK_MISSED: 'アワセが遅れた',
  HOOK_ESCAPE: '糸が緩んでフックが外れた',
  LINE_BREAK: 'テンションが上がりすぎて切れた',
  RUN_STARTED: '魚が走った',
  RUN_ENDED: '魚の走りが止まった',
  FISH_TIRED: '魚が弱った',
  LANDING_STARTED: '取り込みに入った',
  LANDED: '取り込んだ',
  SESSION_RESET: '仕切り直し',
}

const ACTION_LABELS: Readonly<Record<FishingCommand, string>> = {
  cast: 'CAST',
  hook: 'HOOK',
  reel: '巻く',
  power_reel: '強く巻く',
  hold: '耐える',
  give: 'ラインを送る',
  loosen_drag: 'ドラグ −',
  tighten_drag: 'ドラグ ＋',
  land: '取り込む',
  wait: '待つ',
  reset: 'RESET',
}

const FIGHT_COMMANDS: readonly FishingCommand[] = [
  'reel',
  'power_reel',
  'hold',
  'give',
  'loosen_drag',
  'tighten_drag',
]
const LANDING_COMMANDS: readonly FishingCommand[] = ['land', 'wait']
const PRE_FIGHT_COMMANDS: readonly FishingCommand[] = ['cast', 'hook']

/** 百分位を釣り人の言葉にする。 */
const rarityLabel = (percentile: number): string => {
  const top = 100 - percentile

  if (top <= 0.1) {
    return '記録級'
  }

  if (top <= 1) {
    return `上位 ${top.toFixed(2)}%`
  }

  if (top <= 10) {
    return `上位 ${top.toFixed(1)}%`
  }

  if (top <= 50) {
    return `上位 ${String(Math.round(top))}%`
  }

  return 'よくあるサイズ'
}

export type FishingScreenProps = {
  readonly onExit: () => void
}

export const FishingScreen = ({ onExit }: FishingScreenProps) => {
  const { contentError, snapshot, spotName, environment, conditions, seed, send, restart } =
    useFishingSession()
  const codex = usePlayerStore((state) => state.codex)
  const lastCatch = usePlayerStore((state) => state.lastCatch)
  const progression = usePlayerStore((state) => state.progression)
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const [auto, setAuto] = useState(false)

  /*
   * AUTO（おまかせ）: trivial な相手を早く進めるための補助。
   * 1 回の待ち時間で 1 step だけ進む（連打で有利にならない設計は変えない）。
   * Large / Trophy では手動の方が有利（AUTO は最適解ではない）。
   */
  useEffect(() => {
    if (!auto || snapshot === null) {
      return
    }

    if (snapshot.phase !== 'FIGHTING' && snapshot.phase !== 'LANDING') {
      return
    }

    const timer = window.setTimeout(() => {
      send(
        suggestBattleCommand({
          phase: snapshot.phase,
          tension: snapshot.tension,
          maxTension: snapshot.maxTension,
          behaviour: snapshot.battle?.behaviour ?? null,
          hookHold: snapshot.battle?.hookHold ?? 0,
        }),
      )
    }, 260)

    return () => {
      window.clearTimeout(timer)
    }
  }, [auto, snapshot, send])

  if (contentError !== null) {
    return (
      <section className="panel">
        <h2 className="panel__heading">コンテンツの検証に失敗した</h2>
        <p className="panel__body">{contentError}</p>
      </section>
    )
  }

  if (snapshot === null) {
    return (
      <section className="panel">
        <h2 className="panel__heading">読み込み中</h2>
      </section>
    )
  }

  const fish = snapshot.fish
  const tensionRatio = snapshot.tension / snapshot.maxTension
  const tensionDanger = tensionRatio >= 0.9
  const finished = isTerminalPhase(snapshot.phase)
  const allowed = ALLOWED_COMMANDS[snapshot.phase]
  const record = fish === null ? undefined : codex.species[String(fish.individual.speciesId)]

  return (
    <div className="fishing">
      <header className="fishing__header">
        <button className="button button--ghost" type="button" onClick={onExit}>
          ← 戻る
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            setActiveScreen('progression')
          }}
        >
          成長 Lv{progression.anglerLevel} / SP {progression.skillPoints}
        </button>
        {/* 通常プレイの画面には seed や内部 state 名を出さない（開発情報は表示しない）。 */}
        <span className="fishing__seed">{spotName ?? '釣り場未選択'}</span>
      </header>

      <section className="panel">
        <h2 className="panel__heading">{PHASE_LABELS[snapshot.phase]}</h2>
        {environment === null || conditions === null ? null : (
          <p className="fishing__legend">
            {WEATHER_LABELS[environment.weather]} /{' '}
            {environment.tide === null ? '潮なし' : TIDE_LABELS[environment.tide]} / 水温{' '}
            {environment.water.temperatureC}℃ / 釣況 {CONDITION_SUMMARY_LABELS[conditions.summary]}
          </p>
        )}
        <p className="panel__body">{PHASE_HINTS[snapshot.phase]}</p>
      </section>

      <section className="panel">
        {fish === null ? (
          <>
            <h3 className="panel__subheading">魚</h3>
            <p className="panel__body">まだ姿は見えていない</p>
          </>
        ) : (
          <>
            <div className="fish__head">
              <h3 className="panel__subheading">{fish.speciesName}</h3>
              {/*
                Phase 10: ファイト中は Battle 側の行動（走り / 突進 / 休み …）が
                今の魚の状態である。battle が無いときは従来の表示。
              */}
              {snapshot.battle === null ? (
                <span className={`badge${fish.behavior === 'run' ? ' badge--alert' : ''}`}>
                  {BEHAVIOR_LABELS[fish.behavior]}
                </span>
              ) : (
                <span
                  className={`badge${
                    snapshot.battle.behaviour === 'run' ||
                    snapshot.battle.behaviour === 'surge' ||
                    snapshot.battle.behaviour === 'second_run'
                      ? ' badge--alert'
                      : ''
                  }`}
                >
                  {snapshot.battle.behaviourLabel}
                </span>
              )}
            </div>

            <dl className="fish__facts">
              <div>
                <dt>Length</dt>
                <dd>{fish.individual.lengthCm} cm</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{fish.individual.weightKg.toFixed(3)} kg</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>
                  {CONDITION_LABELS[fish.conditionBand]}（{fish.individual.condition.toFixed(2)}）
                </dd>
              </div>
              <div>
                <dt>Rarity</dt>
                <dd>
                  {rarityLabel(fish.individual.percentile ?? 0)}（
                  {(fish.individual.percentile ?? 0).toFixed(2)}）
                </dd>
              </div>
            </dl>

            {fish.individual.traits.length === 0 ? (
              <p className="panel__body">Trait なし</p>
            ) : (
              <ul className="traits">
                {fish.individual.traits.map((trait) => (
                  <li className="trait" key={trait} title={TRAIT_HINTS[trait]}>
                    {TRAIT_LABELS[trait]}
                  </li>
                ))}
              </ul>
            )}

            <FishingMeter
              label="Fish stamina"
              value={fish.stamina}
              max={fish.staminaMax}
              tone="stamina"
              valueText={`${Math.round((fish.stamina / fish.staminaMax) * 100)}%`}
            />
          </>
        )}

        <FishingMeter
          label="Tension"
          value={snapshot.tension}
          max={snapshot.maxTension}
          tone="tension"
          optimal={snapshot.optimalTension}
          danger={tensionDanger}
          valueText={`${Math.round(tensionRatio * 100)}%`}
        />
        <p className="fishing__legend">
          帯の明るい部分が「効率よく寄せられるテンション」。上げすぎると切れ、緩めすぎるとフックが外れる。
        </p>
      </section>

      {snapshot.battle === null ? null : (
        <section className="panel">
          <p className="fishing__phase-code">魚の様子: {snapshot.battle.behaviourLabel}</p>
          <h3 className="panel__subheading">
            {snapshot.phase === 'LANDING' ? '取り込みの体勢' : 'ファイト'}
          </h3>

          <FishingMeter
            label="Hook hold"
            value={snapshot.battle.hookHold}
            max={1}
            tone="stamina"
            valueText={`${Math.round(snapshot.battle.hookHold * 100)}%`}
          />
          <dl className="record">
            <div>
              <dt>Distance</dt>
              <dd>{snapshot.battle.distanceM} m</dd>
            </div>
            <div>
              <dt>Drag</dt>
              <dd>
                {snapshot.battle.drag <= 0.35
                  ? 'Loose'
                  : snapshot.battle.drag >= 0.7
                    ? 'Tight'
                    : 'Normal'}{' '}
                ({Math.round(snapshot.battle.drag * 100)}%)
              </dd>
            </div>
            <div>
              <dt>Step</dt>
              <dd>{snapshot.battle.step}</dd>
            </div>
          </dl>

          <ul className="log">
            {snapshot.battle.log.slice(-8).map((line, index) => (
              <li key={`${String(index)}-${line}`}>{line}</li>
            ))}
          </ul>

          <div className="controls">
            {(snapshot.phase === 'LANDING' ? LANDING_COMMANDS : FIGHT_COMMANDS).map((command) => (
              <button
                className={`control${command === 'land' ? ' control--accent' : ''}`}
                key={command}
                type="button"
                disabled={!allowed.includes(command)}
                onClick={() => {
                  send(command)
                }}
              >
                {ACTION_LABELS[command]}
              </button>
            ))}
          </div>

          <button
            className="control"
            type="button"
            onClick={() => {
              setAuto((current) => !current)
            }}
          >
            AUTO（おまかせ）: {auto ? 'ON' : 'OFF'}
          </button>
        </section>
      )}

      <section className="panel">
        <h3 className="panel__subheading">操作</h3>
        <div className="controls">
          {PRE_FIGHT_COMMANDS.map((command) => (
            <button
              className={`control${command === 'hook' ? ' control--accent' : ''}`}
              key={command}
              type="button"
              disabled={!allowed.includes(command)}
              onClick={() => {
                send(command)
              }}
            >
              {ACTION_LABELS[command]}
            </button>
          ))}
        </div>

        {finished ? (
          <div className="controls controls--result">
            <button
              className="control"
              type="button"
              onClick={() => {
                restart()
              }}
            >
              もう一度釣る
            </button>
            <button
              className="control"
              type="button"
              onClick={() => {
                restart(seed)
              }}
            >
              同じ展開でもう一度
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">釣果と記録</h3>

        {lastCatch === null ? null : (
          <div className="notice">
            <p className="notice__eyebrow">直近の釣果</p>
            <p className="notice__title">
              {lastCatch.speciesName} — +{lastCatch.xpGained} XP
            </p>
            <ul className="log">
              <li>
                サイズ帯 {lastCatch.sizeBand}（Base {lastCatch.baseXp} XP）
              </li>
              {lastCatch.decayMultiplier === 1 ? null : (
                <li>反復減衰 ×{lastCatch.decayMultiplier.toFixed(2)}</li>
              )}
              {lastCatch.factors.map((factor) => (
                <li key={factor.label}>
                  {factor.label} +{factor.value} XP
                </li>
              ))}
            </ul>
            <p className="notice__tags">
              {lastCatch.firstCatch ? <span className="badge badge--alert">初記録</span> : null}
              {lastCatch.personalBest ? (
                <span className="badge badge--alert">自己記録更新</span>
              ) : null}
              {lastCatch.unlockedPerks.length > 0 ? (
                <span className="badge badge--alert">
                  Perk:{' '}
                  {lastCatch.unlockedPerks.map((perk) => PERK_DEFINITIONS[perk].name).join(', ')}
                </span>
              ) : null}
            </p>
            {lastCatch.levelsGained.length === 0 ? null : (
              <p className="notice__level">
                LEVEL UP → Lv{lastCatch.levelsGained[lastCatch.levelsGained.length - 1]}（Skill
                Point +{lastCatch.skillPointsGained}）
              </p>
            )}
          </div>
        )}

        {fish === null ? (
          <p className="panel__body">魚が掛かると、この魚種の記録が出る。</p>
        ) : record === undefined ? (
          <p className="panel__body">{fish.speciesName} の記録はまだない。</p>
        ) : (
          <>
            <p className="notice__eyebrow">{fish.speciesName} の記録</p>
            <dl className="record">
              <div>
                <dt>Catch</dt>
                <dd>{record.catchCount} 匹</dd>
              </div>
              <div>
                <dt>Largest</dt>
                <dd>{record.largestLengthCm} cm</dd>
              </div>
              <div>
                <dt>Heaviest</dt>
                <dd>{record.heaviestWeightKg.toFixed(3)} kg</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>
                  {record.personalBest.lengthCm} cm / {rarityLabel(record.bestPercentile)}
                </dd>
              </div>
              <div>
                <dt>Traits</dt>
                <dd>
                  {record.caughtTraits.length === 0
                    ? '—'
                    : record.caughtTraits.map((trait) => TRAIT_LABELS[trait]).join(', ')}
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">ログ</h3>
        {snapshot.lastEvents.length === 0 ? (
          <p className="panel__body">—</p>
        ) : (
          <ul className="log">
            {snapshot.lastEvents.map((event) => (
              <li key={event}>{EVENT_LABELS[event]}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
