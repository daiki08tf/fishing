/**
 * 小さな pixel landscape ヘッダー（Phase 14）。
 *
 * Region ID の巨大 switch は作らない。Spot Content が既に持っている
 * `environment`（canal / river / estuary / bay_shore / lake / managed_pond ...）
 * という generic な finite set だけで見た目を選ぶ。未知の environment 文字列が
 * 来ても安全な既定にフォールバックする。
 */

export type BiomeSceneProps = {
  readonly environment: string
  readonly title: string
  readonly subtitle?: string
}

type Scene = { readonly sky: string; readonly water: string; readonly label: string }

const SCENES: Readonly<Record<string, Scene>> = {
  canal: { sky: 'var(--palette-sky)', water: 'var(--palette-teal)', label: '都市の運河' },
  river: { sky: 'var(--palette-sky)', water: 'var(--palette-ocean)', label: '川' },
  estuary: { sky: 'var(--palette-sand)', water: 'var(--palette-teal)', label: '汽水の河口' },
  bay_shore: { sky: 'var(--palette-sky)', water: 'var(--palette-ocean)', label: '海岸' },
  lake: { sky: 'var(--palette-sky)', water: 'var(--palette-leaf)', label: '湖' },
  managed_pond: { sky: 'var(--palette-cream-deep)', water: 'var(--palette-teal)', label: '管理釣り場' },
}

const DEFAULT_SCENE: Scene = { sky: 'var(--palette-sky)', water: 'var(--palette-ocean)', label: '釣り場' }

export const BiomeScene = ({ environment, title, subtitle }: BiomeSceneProps) => {
  const scene = SCENES[environment] ?? DEFAULT_SCENE

  return (
    <div
      className="biome-scene"
      style={{ background: `linear-gradient(180deg, ${scene.sky} 0%, ${scene.sky} 55%, ${scene.water} 55%)` }}
    >
      <svg
        className="biome-scene__waves"
        viewBox="0 0 120 10"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M0 5 Q10 2 20 5 T40 5 T60 5 T80 5 T100 5 T120 5 V10 H0 Z"
          fill={scene.water}
          opacity={0.55}
        />
      </svg>
      <div className="biome-scene__label">
        <p className="biome-scene__eyebrow pixel-text">{scene.label}</p>
        <h2 className="biome-scene__title">{title}</h2>
        {subtitle === undefined ? null : <p className="biome-scene__subtitle">{subtitle}</p>}
      </div>
    </div>
  )
}
