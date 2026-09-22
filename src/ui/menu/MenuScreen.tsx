import { useState } from 'react'
import { clearDevelopmentSave } from '../../app/persistence/developmentReset'
import { useAppStore } from '../../state/appStore'
import { PixelIcon, type PixelIconName } from '../components/PixelIcon'
import type { AppScreen } from '../../state/appStore'
import './menu.css'

/**
 * MENU（Phase 14）。
 *
 * Bottom Nav の 5 番目。HOME に置き切れない二次的な画面（タックル・店・遠征・
 * 成長・人脈）をまとめる。ゲームルールは持たない、単なる導線の一覧。
 */

type MenuEntry = {
  readonly screen: AppScreen
  readonly label: string
  readonly hint: string
  readonly icon: PixelIconName
}

const ENTRIES: readonly MenuEntry[] = [
  { screen: 'tackle', label: 'タックル', hint: 'ロッド・リール・仕掛けを組む', icon: 'creel' },
  { screen: 'shop', label: 'ショップ', hint: '道具・移動手段を買う', icon: 'coin' },
  { screen: 'expedition', label: '遠征・旅行', hint: '国内・海外の釣り場へ行く', icon: 'map' },
  { screen: 'contacts', label: '人脈', hint: '買取先との Trust・噂・報酬', icon: 'person' },
  { screen: 'progression', label: '成長', hint: 'レベル・スキル・Perk', icon: 'trophy' },
]

export const MenuScreen = () => {
  const setActiveScreen = useAppStore((state) => state.setActiveScreen)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="fishing">
      <section className="panel">
        <p className="fishing__phase-code">MENU</p>
        <h2 className="panel__heading">メニュー</h2>
        <p className="panel__body">タックル・お店・遠征・人脈・成長はここから。</p>
      </section>

      <section>
        <ul className="menu-list">
          {ENTRIES.map((entry) => (
            <li key={entry.screen}>
              <button
                className="menu-list__item"
                type="button"
                onClick={() => {
                  setActiveScreen(entry.screen)
                }}
              >
                <span className="menu-list__icon">
                  <PixelIcon name={entry.icon} />
                </span>
                <span className="menu-list__text">
                  <span className="menu-list__label">{entry.label}</span>
                  <span className="menu-list__hint">{entry.hint}</span>
                </span>
                <span className="menu-list__chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/*
        開発用（`npm run dev` / `vite dev` のみ）。production build では出ない。
      */}
      {import.meta.env.DEV ? (
        <section className="panel">
          <h3 className="panel__subheading">開発用</h3>
          <p className="panel__body">
            保存（Codex / 成長 / 所持金 / 釣り場 / Fish Box / Trade）を初期化して、
            最初からやり直す。
          </p>
          {confirming ? (
            <div className="controls controls--result">
              <button
                className="control control--accent"
                type="button"
                onClick={() => {
                  void (async () => {
                    await clearDevelopmentSave()
                    window.location.reload()
                  })()
                }}
              >
                本当に初期化する
              </button>
              <button
                className="control"
                type="button"
                onClick={() => {
                  setConfirming(false)
                }}
              >
                やめる
              </button>
            </div>
          ) : (
            <button
              className="button"
              type="button"
              onClick={() => {
                setConfirming(true)
              }}
            >
              セーブデータを初期化
            </button>
          )}
        </section>
      ) : null}
    </div>
  )
}
