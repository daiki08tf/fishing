/**
 * 魚の絵が無くても成立させるための汎用 fallback（Phase 14）。
 *
 * simple fish silhouette + species color chip + pixel frame。
 * 著作権のある魚アセットは使わない。1 つの手書き SVG シルエットを、
 * 魚種 ID から決定論的に選んだ色チップで塗り分けるだけにする
 * （魚種ごとに画像を用意しない。Contentが増えても DOM/asset は増えない）。
 */

const CHIP_COLORS = [
  'var(--palette-ocean)',
  'var(--palette-teal)',
  'var(--palette-sky)',
  'var(--palette-leaf)',
  'var(--palette-orange)',
  'var(--palette-sand)',
  'var(--color-danger)',
] as const

/** 文字列から安定したインデックスを作る（暗号強度は不要）。 */
const hashIndex = (value: string, modulo: number): number => {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash % modulo
}

export const fishChipColor = (speciesId: string): string =>
  CHIP_COLORS[hashIndex(speciesId, CHIP_COLORS.length)] ?? CHIP_COLORS[0]

export type FishSilhouetteProps = {
  readonly speciesId: string
  readonly size?: number
  /** ??? のように、まだ見えていない状態で使う。 */
  readonly unknown?: boolean
  readonly className?: string
}

export const FishSilhouette = ({
  speciesId,
  size = 40,
  unknown = false,
  className,
}: FishSilhouetteProps) => {
  const color = unknown ? 'var(--color-text-muted)' : fishChipColor(speciesId)

  return (
    <span
      className={`fish-chip${className === undefined ? '' : ` ${className}`}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        shapeRendering="crispEdges"
      >
        <path
          d="M4 16 C8 8 20 7 27 12 L30 8 V24 L27 20 C20 25 8 24 4 16 Z"
          fill={unknown ? 'color-mix(in srgb, var(--color-text-muted) 30%, transparent)' : color}
          stroke="var(--color-border)"
          strokeWidth={1.4}
        />
        {unknown ? null : <circle cx="23" cy="14.5" r="1.3" fill="var(--palette-navy-deep)" />}
      </svg>
    </span>
  )
}
