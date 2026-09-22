/**
 * ラベル + 数値 + バーの汎用表示（Phase 14）。Trust 等ゲームらしい数値に使う。
 */
export type StatMeterProps = {
  readonly label: string
  readonly value: number
  readonly max: number
  readonly valueText?: string
  readonly tone?: 'default' | 'trust'
}

export const StatMeter = ({ label, value, max, valueText, tone = 'default' }: StatMeterProps) => {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))

  return (
    <div className={`stat-meter${tone === 'trust' ? ' stat-meter--trust' : ''}`}>
      <div className="stat-meter__head">
        <span>{label}</span>
        <span className="stat-meter__value pixel-number">
          {valueText ?? `${String(Math.round(value))} / ${String(max)}`}
        </span>
      </div>
      <div className="stat-meter__track">
        <span className="stat-meter__fill" style={{ width: `${String(ratio * 100)}%` }} />
      </div>
    </div>
  )
}
