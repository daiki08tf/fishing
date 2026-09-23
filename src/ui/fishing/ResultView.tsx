import type { FishTrait } from '../../domain/fish/FishTrait'
import { ResultBanner } from '../components/ResultBanner'

/**
 * LANDED 直後の Catch Result（Phase 14.1）。
 *
 * Phase 14.1 の最優先事項は「釣った瞬間に、釣果が最初に目に入る」ことである。
 * そのため ResultBanner を CSS で持ち上げるのではなく、
 * **DOM 上も最初に来る 1 枚のカード** として組み立てる。
 *
 * 表示順（この順序がそのまま画面の優先順位）:
 *   釣れた！ → 魚（visual / 名前 / サイズ / NEW バッジ）→ Keep / Release → XP の 1 行
 *
 * Domain の判定（First Catch / Personal Best / XP / 記録）は一切やり直さず、
 * 既に確定した値をそのまま表示するだけである。
 */

export type CatchResult = {
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
  /** 既に確定した XP（未記録なら null）。 */
  readonly xpGained: number | null
  readonly levelUpTo: number | null
  readonly skillPointsGained: number
  /** この魚種の通算捕獲数（Codex 未記録なら null）。 */
  readonly catchCount: number | null
  /**
   * 実際に着水した Zone の名前（Phase 19D）。
   * Zone の無い釣行では null — その場合は行ごと出さない。
   * 観測事実だけを出し、「潮だから釣れた」のような因果は書かない。
   */
  readonly landedZoneName?: string | null
}

export type ResultViewProps = {
  readonly result: CatchResult
  readonly disposed: boolean
  readonly onKeep: () => void
  readonly onRelease: () => void
}

export const ResultView = ({ result, disposed, onKeep, onRelease }: ResultViewProps) => (
  <section className="panel panel--result result-view" aria-label="釣果">
    <p className="result-view__eyebrow pixel-text">釣れた！</p>

    <ResultBanner
      speciesId={result.speciesId}
      speciesName={result.speciesName}
      lengthCm={result.lengthCm}
      weightKg={result.weightKg}
      conditionLabel={result.conditionLabel}
      rarityLabel={result.rarityLabel}
      traits={result.traits}
      traitLabels={result.traitLabels}
      firstCatch={result.firstCatch}
      personalBest={result.personalBest}
    />

    {result.landedZoneName === undefined || result.landedZoneName === null ? null : (
      <p className="result-view__status">{result.landedZoneName}で釣れた</p>
    )}

    <div className="controls controls--result result-view__actions">
      <button
        className="control control--accent"
        type="button"
        disabled={disposed}
        onClick={onKeep}
      >
        持ち帰る（Fish Box へ）
      </button>
      <button className="control" type="button" disabled={disposed} onClick={onRelease}>
        リリース
      </button>
    </div>

    <p className="result-view__status">
      {disposed ? (
        <span className="result-view__done">決定済み</span>
      ) : (
        <span className="result-view__hint">持ち帰るか、逃がすか。</span>
      )}
    </p>

    {result.xpGained === null ? null : (
      <p className="result-view__xp pixel-number">
        +{result.xpGained} XP
        {result.catchCount === null ? '' : ` ・ ${result.speciesName} ${result.catchCount} 匹目`}
        {result.levelUpTo === null
          ? ''
          : ` ・ Lv${result.levelUpTo}（SP +${result.skillPointsGained}）`}
      </p>
    )}
  </section>
)
