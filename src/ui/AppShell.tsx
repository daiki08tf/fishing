import { useAppStore } from '../state/appStore'
import { usePlayerStore } from '../state/playerStore'
import { FishingScreen } from './fishing/FishingScreen'
import { ProgressionScreen } from './progression/ProgressionScreen'

/**
 * Phase 0B のアプリシェル。
 *
 * ゲームプレイ画面は作らない。ここに表示するのは
 * 「アプリが起動し、層の境界と状態管理が機能している」ことの確認だけである。
 */

const BOUNDARIES = [
  'ui / app → state → domain',
  'domain は React・DOM・Zustand・IndexedDB に依存しない',
  'content は typed schema で検証する',
  '乱数は注入可能な RandomSource 経由',
] as const

export const AppShell = () => {
  const status = useAppStore((state) => state.status)
  const activeScreen = useAppStore((state) => state.activeScreen)
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const diagnosticsVisible = useAppStore((state) => state.diagnosticsVisible)
  const toggleDiagnostics = useAppStore((state) => state.toggleDiagnostics)

  const hydrationStatus = usePlayerStore((state) => state.hydrationStatus)
  const hydrationFailure = usePlayerStore((state) => state.hydrationFailure)
  const startWithoutSave = usePlayerStore((state) => state.completeHydrationWithoutSave)

  // 保存データの確認が終わるまで、ゲームの画面は出さない。
  if (hydrationStatus === 'error') {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <section className="panel">
            <p className="app-shell__eyebrow">Save</p>
            <h2 className="panel__heading">保存データを読み込めなかった</h2>
            <p className="panel__body">
              既存の保存は上書きしていません。新規で始めると、次のプレイから新しい保存になります。
            </p>
            <p className="fishing__legend">理由: {hydrationFailure?.message ?? 'unknown'}</p>
            <button className="button button--primary" type="button" onClick={startWithoutSave}>
              新規で始める
            </button>
          </section>
        </main>
      </div>
    )
  }

  if (hydrationStatus !== 'ready') {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <section className="panel">
            <p className="app-shell__eyebrow">Save</p>
            <h2 className="panel__heading">読み込み中</h2>
            <p className="panel__body">保存データを確認しています。</p>
          </section>
        </main>
      </div>
    )
  }

  if (activeScreen === 'fishing') {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <FishingScreen
            onExit={() => {
              setActiveScreen('home')
            }}
          />
        </main>
      </div>
    )
  }

  if (activeScreen === 'progression') {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <ProgressionScreen
            onExit={() => {
              setActiveScreen('home')
            }}
            onStartFishing={() => {
              setActiveScreen('fishing')
            }}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <header className="app-shell__header">
          <p className="app-shell__eyebrow">Development Foundation</p>
          <h1 className="app-shell__title">Fishing</h1>
          <p className="app-shell__tagline">
            現代日本を舞台にした、リアル志向の釣りハクスラゲーム。
          </p>
        </header>

        <section className="panel" aria-labelledby="phase-heading">
          <h2 className="panel__heading" id="phase-heading">
            Phase 0B
          </h2>
          <p className="panel__body">
            技術基盤のみを実装した段階です。釣り・Encount・成長・経済・交通のゲームプレイはまだ実装していません。
          </p>
          <dl className="status-list">
            <div className="status-list__row">
              <dt>status</dt>
              <dd>{status}</dd>
            </div>
            <div className="status-list__row">
              <dt>distribution</dt>
              <dd>Web + PWA (mobile first)</dd>
            </div>
            <div className="status-list__row">
              <dt>save schema</dt>
              <dd>v1 + migration entry point</dd>
            </div>
          </dl>

          <button className="button" type="button" onClick={toggleDiagnostics}>
            {diagnosticsVisible ? 'Hide' : 'Show'} architecture boundaries
          </button>

          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              setActiveScreen('fishing')
            }}
          >
            釣りに行く
          </button>

          <button
            className="button"
            type="button"
            onClick={() => {
              setActiveScreen('progression')
            }}
          >
            成長を見る（Angler Lv / Skill / Perk）
          </button>

          {diagnosticsVisible ? (
            <ul className="boundary-list">
              {BOUNDARIES.map((boundary) => (
                <li key={boundary}>{boundary}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  )
}
