import type { Range } from '../../domain/primitives'

/**
 * 数値を帯で見せるための小さな表示部品。
 * テンションは「良い帯」を重ねて表示する。
 */

export type FishingMeterProps = {
  readonly label: string
  readonly value: number
  readonly max: number
  readonly tone: 'stamina' | 'tension'
  readonly optimal?: Range
  readonly valueText: string
  readonly danger?: boolean
}

const ratio = (value: number, max: number): number => {
  if (max <= 0) {
    return 0
  }

  return Math.min(1, Math.max(0, value / max))
}

export const FishingMeter = (props: FishingMeterProps) => {
  const { label, value, max, tone, optimal, valueText, danger = false } = props
  const fill = ratio(value, max)

  return (
    <div className={`meter meter--${tone}${danger ? ' meter--danger' : ''}`}>
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{valueText}</span>
      </div>
      <div className="meter__track">
        {optimal === undefined ? null : (
          <span
            className="meter__optimal"
            style={{
              left: `${String(ratio(optimal.min, max) * 100)}%`,
              width: `${String((ratio(optimal.max, max) - ratio(optimal.min, max)) * 100)}%`,
            }}
          />
        )}
        <span className="meter__fill" style={{ width: `${String(fill * 100)}%` }} />
      </div>
    </div>
  )
}
