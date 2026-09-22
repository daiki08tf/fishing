import type { BattleBehaviour } from '../../domain/fishing/battle'
import type { FishingPhase } from '../../domain/fishing'

/**
 * 釣り画面の水面ビジュアル（Phase 14）。
 *
 * 完全リアルタイム演出は作らない。phase / behaviour に応じた
 * 短い CSS variation だけで様子を伝える（画像アセットは使わない）。
 * Text Battle の判定（Domain）には一切関与しない、表現だけの層。
 */
export type WaterSceneProps = {
  readonly phase: FishingPhase
  readonly behaviour: BattleBehaviour | null
  readonly hasFish: boolean
}

const STATE_LABELS: Readonly<Record<string, string>> = {
  idle: '静かな水面',
  cast: '仕掛けが飛んでいる',
  wait: 'アタリを待っている',
  bite: 'アタリ！',
  hooked: '掛かった',
  run: '走っている',
  surge: '突進している',
  head_shake: '首を振っている',
  dive: '潜っている',
  come_toward: 'こちらへ近づいている',
  rest: '休んでいる',
  second_run: '再び走り出した',
  landing: '取り込み中',
  landed: '取り込んだ',
  failed: '逃げられた',
}

/** phase / behaviour から見た目の状態キーを決める（Domain のイベント名では分岐しない）。 */
const sceneKeyOf = (phase: FishingPhase, behaviour: BattleBehaviour | null): string => {
  if (phase === 'LANDED') {
    return 'landed'
  }

  if (phase === 'HOOK_MISSED' || phase === 'HOOK_ESCAPE' || phase === 'LINE_BREAK') {
    return 'failed'
  }

  if (phase === 'LANDING') {
    return 'landing'
  }

  if (phase === 'FIGHTING' && behaviour !== null) {
    return behaviour
  }

  if (phase === 'HOOKED') {
    return 'hooked'
  }

  if (phase === 'BITE' || phase === 'HOOK_WINDOW') {
    return 'bite'
  }

  if (phase === 'WAITING') {
    return 'wait'
  }

  if (phase === 'CASTING') {
    return 'cast'
  }

  return 'idle'
}

export const WaterScene = ({ phase, behaviour, hasFish }: WaterSceneProps) => {
  const sceneKey = sceneKeyOf(phase, behaviour)

  return (
    <div className={`water-scene water-scene--${sceneKey}`} key={sceneKey}>
      <svg
        className="water-scene__surface"
        viewBox="0 0 120 12"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 6 Q10 3 20 6 T40 6 T60 6 T80 6 T100 6 T120 6 V12 H0 Z" />
      </svg>

      {hasFish ? (
        <svg
          className="water-scene__fish"
          viewBox="0 0 32 32"
          aria-hidden="true"
          focusable="false"
          shapeRendering="crispEdges"
        >
          <path
            d="M4 16 C8 8 20 7 27 12 L30 8 V24 L27 20 C20 25 8 24 4 16 Z"
            fill="var(--palette-navy)"
          />
        </svg>
      ) : (
        <span className="water-scene__ripple" aria-hidden="true" />
      )}

      <p className="water-scene__label pixel-text">{STATE_LABELS[sceneKey] ?? sceneKey}</p>
    </div>
  )
}
