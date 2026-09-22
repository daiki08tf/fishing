/**
 * MAP の「地図らしい」配置（Phase 14.1）。
 *
 * 実座標や地図 API は使わない。Content（environment）だけから
 * 「上流 → 川 → 海 → 沖」の帯（band）へ決定的に割り当てる。
 *
 * 方針:
 * - Spot ID や Content の並び順で分岐しない（巨大 switch を作らない）。
 * - 同じ入力からは必ず同じ配置になる（乱数を使わない）。
 * - 未知の environment は 'coast' に倒す。ただし runtime Content が使う
 *   environment はすべて明示的に定義されていることをテストで検査する。
 */

export const MAP_BANDS = ['inland', 'waterway', 'coast', 'offshore'] as const
export type MapBand = (typeof MAP_BANDS)[number]

export const MAP_BAND_LABELS: Readonly<Record<MapBand, string>> = {
  inland: '上流・湖',
  waterway: '川・運河・河口',
  coast: '海・磯',
  offshore: '沖',
}

/** environment（Content の語彙）→ 帯。Spot 名や ID では分岐しない。 */
const BAND_BY_ENVIRONMENT: Readonly<Record<string, MapBand>> = {
  river: 'inland',
  lake: 'inland',
  managed_pond: 'inland',
  canal: 'waterway',
  estuary: 'waterway',
  bay_shore: 'coast',
  nearshore: 'coast',
  offshore: 'offshore',
}

export const mappedEnvironments = (): readonly string[] => Object.keys(BAND_BY_ENVIRONMENT).sort()

/** 未知の environment は沿岸として扱う（表示は崩さない）。 */
export const bandOfEnvironment = (environment: string): MapBand =>
  BAND_BY_ENVIRONMENT[environment] ?? 'coast'

/** 地図ノードに出す短い名前（長い補足は詳細カード側で見せる）。 */
export const shortSpotLabel = (name: string, maxLength = 9): string => {
  const base = name.split('（')[0]?.trim() ?? name

  return base.length <= maxLength ? base : `${base.slice(0, maxLength - 1)}…`
}

export type MapBoardNode<T> = {
  readonly spot: T
  readonly band: MapBand
  readonly label: string
}

export type MapBoardBand<T> = {
  readonly band: MapBand
  readonly label: string
  readonly nodes: readonly MapBoardNode<T>[]
}

type BoardSpot = {
  readonly name: string
  readonly environment: string
}

/**
 * 表示対象の Spot を帯ごとに並べる。
 * 帯の中は名前順（Content の並び順に依存しない）。
 */
export const buildMapBoard = <T extends BoardSpot>(
  spots: readonly T[],
): readonly MapBoardBand<T>[] =>
  MAP_BANDS.map((band) => ({
    band,
    label: MAP_BAND_LABELS[band],
    nodes: spots
      .filter((spot) => bandOfEnvironment(spot.environment) === band)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'))
      .map((spot) => ({ spot, band, label: shortSpotLabel(spot.name) })),
  })).filter((group) => group.nodes.length > 0)
