import type { ConditionBand } from '../../domain/fish/fishCondition'
import type { FishTrait } from '../../domain/fish/FishTrait'
import {
  ALLOWED_COMMANDS,
  isTerminalPhase,
  type FishingCommand,
  type FishingEvent,
  type FishingPhase,
} from '../../domain/fishing'
import { FishingMeter } from './FishingMeter'
import { useFishingSession } from './useFishingSession'
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
  FIGHTING: 'テンションを見ながら REEL と GIVE を切り替える',
  LANDING: '取り込み中',
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
  reel: 'REEL',
  give: 'GIVE',
  reset: 'RESET',
}

const FIGHT_COMMANDS: readonly FishingCommand[] = ['cast', 'hook', 'reel', 'give']

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
  const { contentError, snapshot, seed, codex, lastCatch, send, restart } = useFishingSession()

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
        <span className="fishing__seed">seed: {seed}</span>
      </header>

      <section className="panel">
        <p className="fishing__phase-code">{snapshot.phase}</p>
        <h2 className="panel__heading">{PHASE_LABELS[snapshot.phase]}</h2>
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
              <span className={`badge${fish.behavior === 'run' ? ' badge--alert' : ''}`}>
                {BEHAVIOR_LABELS[fish.behavior]}
              </span>
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

      <section className="panel">
        <h3 className="panel__subheading">操作</h3>
        <div className="controls">
          {FIGHT_COMMANDS.map((command) => (
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
                send('reset')
              }}
            >
              RESET
            </button>
            <button
              className="control"
              type="button"
              onClick={() => {
                restart(seed)
              }}
            >
              同じSeedで再挑戦
            </button>
            <button
              className="control"
              type="button"
              onClick={() => {
                restart()
              }}
            >
              新しいSeedで再挑戦
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h3 className="panel__subheading">自己記録</h3>

        {lastCatch === null ? null : (
          <p className="notice">
            {lastCatch.isFirstCatchOfSpecies ? '初記録' : null}
            {lastCatch.isFirstCatchOfSpecies ? ' / ' : null}
            {lastCatch.isPersonalBest ? '自己記録更新' : '記録更新なし'}
            {lastCatch.newTraits.length === 0
              ? null
              : ` / 新Trait: ${lastCatch.newTraits.map((trait) => TRAIT_LABELS[trait]).join(', ')}`}
          </p>
        )}

        {record === undefined ? (
          <p className="panel__body">この魚種の記録はまだない</p>
        ) : (
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
        <p className="fishing__ticks">
          tick {snapshot.totalTicks} / この状態 {snapshot.ticksInPhase}
        </p>
      </section>
    </div>
  )
}
