import type { FishTrait } from '../../domain/fish/FishTrait'
import { FishSilhouette } from './FishSilhouette'

/**
 * LANDED 後の結果を独立した game result card のように見せる（Phase 14）。
 *
 * 判定（First Catch / Personal Best / Trophy）は Domain（recordCatch / traits）が
 * 既に出した結果をそのまま受け取るだけで、ここでは何も判定しない。
 */
export type ResultBannerProps = {
  readonly speciesId: string
  readonly speciesName: string
  readonly lengthCm: number
  readonly weightKg: number
  readonly conditionLabel: string
  readonly rarityLabel: string
  readonly traits: readonly FishTrait[]
  readonly traitLabels: Readonly<Record<FishTrait, string>>
  readonly firstCatch: boolean
  readonly personalBest: boolean
}

export const ResultBanner = (props: ResultBannerProps) => {
  const isTrophy = props.traits.includes('trophy')
  const intensity = isTrophy ? 'trophy' : props.personalBest ? 'best' : null

  return (
    <div className={`result-banner${intensity === null ? '' : ` result-banner--${intensity}`}`}>
      <FishSilhouette speciesId={props.speciesId} size={56} />
      <h3 className="result-banner__name">{props.speciesName}</h3>

      <dl className="result-banner__facts">
        <div>
          <dt>長さ</dt>
          <dd>{props.lengthCm} cm</dd>
        </div>
        <div>
          <dt>重さ</dt>
          <dd>{props.weightKg.toFixed(3)} kg</dd>
        </div>
        <div>
          <dt>状態</dt>
          <dd>{props.conditionLabel}</dd>
        </div>
        <div>
          <dt>珍しさ</dt>
          <dd>{props.rarityLabel}</dd>
        </div>
      </dl>

      <div className="result-banner__badges">
        {props.firstCatch ? <span className="badge badge--success">NEW SPECIES</span> : null}
        {props.personalBest ? <span className="badge badge--alert">NEW RECORD</span> : null}
        {isTrophy ? <span className="badge badge--alert pixel-text">TROPHY</span> : null}
      </div>

      {props.traits.length === 0 ? null : (
        <ul className="traits">
          {props.traits.map((trait) => (
            <li className="trait" key={trait}>
              {props.traitLabels[trait]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
