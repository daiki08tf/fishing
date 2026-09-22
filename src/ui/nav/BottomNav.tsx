import type { AppScreen } from '../../state/appStore'
import { useAppStore } from '../../state/appStore'
import { PixelIcon, type PixelIconName } from '../components/PixelIcon'
import './bottomNav.css'

/**
 * スマホ下部固定ナビゲーション（Phase 14）。
 *
 * 5 項目: ホーム / マップ / 魚かご / 図鑑 / メニュー。
 * TRADE は Fish Box 配下、CONTACTS は MENU から辿る（既存の直接遷移は残す）。
 * 釣行中（fishing）は隠す。
 */

type NavItem = {
  readonly screen: AppScreen
  readonly label: string
  readonly icon: PixelIconName
  /** この画面にいる間、対応するタブを active 表示する画面群。 */
  readonly activeOn: readonly AppScreen[]
}

const NAV_ITEMS: readonly NavItem[] = [
  { screen: 'home', label: 'ホーム', icon: 'home', activeOn: ['home'] },
  { screen: 'map', label: 'マップ', icon: 'map', activeOn: ['map', 'spot'] },
  { screen: 'fishbox', label: '魚かご', icon: 'creel', activeOn: ['fishbox', 'trade'] },
  { screen: 'codex', label: '図鑑', icon: 'book', activeOn: ['codex'] },
  {
    screen: 'menu',
    label: 'メニュー',
    icon: 'menu',
    activeOn: ['menu', 'progression', 'shop', 'tackle', 'expedition', 'contacts'],
  },
]

const HIDDEN_ON: readonly AppScreen[] = ['fishing']

export const BottomNav = () => {
  const activeScreen = useAppStore((state) => state.activeScreen)
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)

  if (HIDDEN_ON.includes(activeScreen)) {
    return null
  }

  return (
    <nav className="bottom-nav" aria-label="メイン">
      {NAV_ITEMS.map((item) => {
        const active = item.activeOn.includes(activeScreen)

        return (
          <button
            key={item.screen}
            type="button"
            className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => {
              setActiveScreen(item.screen)
            }}
          >
            <PixelIcon name={item.icon} className="bottom-nav__icon" />
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
