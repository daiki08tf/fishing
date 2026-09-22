import { useAppStore } from '../state/appStore'
import { usePlayerStore } from '../state/playerStore'
import { FishingScreen } from './fishing/FishingScreen'
import { HomeScreen } from './home/HomeScreen'
import { MapScreen } from './map/MapScreen'
import { ProgressionScreen } from './progression/ProgressionScreen'
import { SpotScreen } from './spot/SpotScreen'
import { ShopScreen } from './shop/ShopScreen'
import { TackleScreen } from './tackle/TackleScreen'
import { ExpeditionScreen } from './expedition/ExpeditionScreen'
import { FishBoxScreen } from './trade/FishBoxScreen'
import { TradeScreen } from './trade/TradeScreen'
import { ContactsScreen } from './contacts/ContactsScreen'
import './styles/world.css'

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

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        {activeScreen === 'home' ? <HomeScreen /> : null}
        {activeScreen === 'map' ? <MapScreen /> : null}
        {activeScreen === 'spot' ? <SpotScreen /> : null}
        {activeScreen === 'fishing' ? (
          <FishingScreen
            onExit={() => {
              // 釣り場にいるなら釣り場へ、いなければ自宅へ。
              setActiveScreen(usePlayerStore.getState().world.phase === 'AT_SPOT' ? 'spot' : 'home')
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
      </main>
    </div>
  )
}
