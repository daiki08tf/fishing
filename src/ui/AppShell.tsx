import { useAppStore } from '../state/appStore'

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
  const diagnosticsVisible = useAppStore((state) => state.diagnosticsVisible)
  const toggleDiagnostics = useAppStore((state) => state.toggleDiagnostics)

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
