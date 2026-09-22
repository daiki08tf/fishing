import { lazy, Suspense, useEffect } from 'react'
import { bootPackKeys, contentRuntime } from '../content/runtime/contentRuntime'
import { bootContentFor } from './content/bootContent'
import { useAppStore } from '../state/appStore'
import { usePlayerStore } from '../state/playerStore'
import { FishingScreen } from './fishing/FishingScreen'
import { HomeScreen } from './home/HomeScreen'
import { MapScreen } from './map/MapScreen'
import { SpotScreen } from './spot/SpotScreen'
import { BottomNav } from './nav/BottomNav'

/*
 * Phase 15.1: 二次的な画面は dynamic import にする（初期 chunk へ入れない）。
 * HOME / MAP / SPOT / FISHING は最初の導線なので eager のまま。
 */
const ProgressionScreen = lazy(async () => ({
  default: (await import('./progression/ProgressionScreen')).ProgressionScreen,
}))
const ShopScreen = lazy(async () => ({ default: (await import('./shop/ShopScreen')).ShopScreen }))
const TackleScreen = lazy(async () => ({
  default: (await import('./tackle/TackleScreen')).TackleScreen,
}))
const ExpeditionScreen = lazy(async () => ({
  default: (await import('./expedition/ExpeditionScreen')).ExpeditionScreen,
}))
const FishBoxScreen = lazy(async () => ({
  default: (await import('./trade/FishBoxScreen')).FishBoxScreen,
}))
const TradeScreen = lazy(async () => ({
  default: (await import('./trade/TradeScreen')).TradeScreen,
}))
const ContactsScreen = lazy(async () => ({
  default: (await import('./contacts/ContactsScreen')).ContactsScreen,
}))
const CodexScreen = lazy(async () => ({
  default: (await import('./codex/CodexScreen')).CodexScreen,
}))
const MenuScreen = lazy(async () => ({ default: (await import('./menu/MenuScreen')).MenuScreen }))
import { ContentLoadingPanel } from './content/ContentLoadingPanel'
import { useContentRuntimeState } from './content/contentRuntimeHooks'
import { installScreenScrollReset } from './nav/scrollReset'
import './styles/world.css'
import './components/components.css'

/*
 * Phase 14.1: top-level screen が変わったら scroll を先頭へ戻す。
 * 購読はアプリで 1 箇所だけ（このファイル）に置き、各画面では呼ばない。
 * 釣り中の phase 遷移は screen が変わらないため影響しない。
 */
installScreenScrollReset(useAppStore)

/**
 * 画面の切り替えだけを行う。
 *
 * 位置や時間は World Domain が持つ。ここは
 * 「今どの画面を見ているか」だけを扱い、瞬間移動はさせない
 * （釣り場への移動・帰宅は World Domain のアクションを通す）。
 */

export const AppShell = () => {
  const activeScreen = useAppStore((state) => state.activeScreen)
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)

  const hydrationStatus = usePlayerStore((state) => state.hydrationStatus)
  const hydrationFailure = usePlayerStore((state) => state.hydrationFailure)
  const startWithoutSave = usePlayerStore((state) => state.completeHydrationWithoutSave)
  const currentRegionId = String(usePlayerStore((state) => state.world.currentRegionId))

  /*
   * Phase 15.1: 起動 critical path は
   * 「軽量カタログ（同梱）+ world + 今いる地域 + その地域の Species shard」だけ。
   * Tackle（装備カタログ）は HOME の表示を block しない（必要画面で ensure し、
   * ここでは background preload だけ行う）。他の地域・全 Species は起動で読まない。
   */
  const runtime = useContentRuntimeState()
  const requiredPackKeys = bootPackKeys(currentRegionId)
  const failedPackKey = requiredPackKeys.find((key) => runtime.packStatus[key] === 'error') ?? null
  const contentReady = requiredPackKeys.every((key) => runtime.packStatus[key] === 'ready')

  useEffect(() => {
    /*
     * 起動で読むのは bootPackKeys だけ（world + 今いる地域 + Species shard）。
     * tackle / 他地域は「実際に必要になった画面」で読む（Phase 15.2）。
     */
    void bootContentFor(currentRegionId).catch(() => undefined)
  }, [currentRegionId])

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

  if (!contentReady) {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <ContentLoadingPanel
            message="地域情報を読み込み中…"
            error={failedPackKey === null ? null : runtime.packError[failedPackKey]}
            onRetry={
              failedPackKey === null
                ? undefined
                : () => {
                    void contentRuntime.retryPack(failedPackKey).catch(() => undefined)
                  }
            }
          />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <Suspense fallback={<ContentLoadingPanel message="読み込み中…" />}>
          {activeScreen === 'home' ? <HomeScreen /> : null}
          {activeScreen === 'map' ? <MapScreen /> : null}
          {activeScreen === 'spot' ? <SpotScreen /> : null}
          {activeScreen === 'fishing' ? (
            <FishingScreen
              onExit={() => {
                // 釣り場にいるなら釣り場へ、いなければ自宅へ。
                setActiveScreen(
                  usePlayerStore.getState().world.phase === 'AT_SPOT' ? 'spot' : 'home',
                )
              }}
            />
          ) : null}
          {activeScreen === 'progression' ? (
            <ProgressionScreen
              onExit={() => {
                setActiveScreen('home')
              }}
              onStartFishing={() => {
                setActiveScreen('map')
              }}
            />
          ) : null}
          {activeScreen === 'shop' ? <ShopScreen /> : null}
          {activeScreen === 'tackle' ? <TackleScreen /> : null}
          {activeScreen === 'expedition' ? <ExpeditionScreen /> : null}
          {activeScreen === 'fishbox' ? <FishBoxScreen /> : null}
          {activeScreen === 'trade' ? <TradeScreen /> : null}
          {activeScreen === 'contacts' ? <ContactsScreen /> : null}
          {activeScreen === 'codex' ? <CodexScreen /> : null}
          {activeScreen === 'menu' ? <MenuScreen /> : null}
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}
