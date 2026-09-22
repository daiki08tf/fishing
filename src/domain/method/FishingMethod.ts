/**
 * 釣法。DATA_MODEL の methods に対応する（Phase 6 で導入）。
 *
 * 釣法は「何を使って、どう狙うか」の単位である。
 * 追加しても FishingEngine を書き換えなくてよい（Engine は釣法を知らない）。
 *
 * Phase 6 では 4 種類だけ。将来 Ajing / Eging / Surf / Rock / Trout / Bass /
 * Fly / Jigging / Trolling / Big Game を追加できる形にしておく。
 */

export const REQUIRED_OFFERING_KINDS = ['lure', 'bait', 'either'] as const
export type RequiredOfferingKind = (typeof REQUIRED_OFFERING_KINDS)[number]

/**
 * 提示方式（Phase 17B）。
 *
 * どう仕掛けを出すか、の分類。FishingEngine の状態機械は増やさない
 * （CAST コマンド・phase はそのまま。ラベルだけ presentation で変える）。
 */
export const PRESENTATION_MODES = ['cast', 'vertical', 'drift', 'troll'] as const
export type PresentationMode = (typeof PRESENTATION_MODES)[number]

export const PRESENTATION_LABELS: Readonly<Record<PresentationMode, string>> = {
  cast: '投げる',
  vertical: '落とす',
  drift: '流す',
  troll: '曳き始める',
}

export type MethodPresentation = {
  readonly mode: PresentationMode
  /**
   * 物理的に成立する Platform（'shore' | 'kayak' | 'nearshore_boat' | 'offshore_boat'）。
   * 空配列なら制限なし。FishingMethod は Depth Domain の型を知らない
   * （open string のタグとして持つ。既存の offeringTags / habitatTags と同じ考え方）。
   */
  readonly supportedPlatforms: readonly string[]
}

export const DEFAULT_PRESENTATION: MethodPresentation = { mode: 'cast', supportedPlatforms: [] }

export type FishingMethod = {
  readonly id: string
  readonly name: string
  readonly description: string
  /** この釣法で使える offering。 */
  readonly requiresOffering: RequiredOfferingKind
  /** 使える offering のタグ（lureType / baitType）。空なら制限なし。 */
  readonly offeringTags: readonly string[]
  /** 省略時は cast・Platform 制限なし（既存 Content は挙動が変わらない）。 */
  readonly presentation?: MethodPresentation
}

export const presentationOf = (method: FishingMethod): MethodPresentation =>
  method.presentation ?? DEFAULT_PRESENTATION

/** 今の Platform でこの釣法が物理的に成立するか。Method ID / Platform ID の分岐ではない。 */
export const methodSupportsPlatform = (method: FishingMethod, platform: string): boolean => {
  const supported = presentationOf(method).supportedPlatforms
  return supported.length === 0 || supported.includes(platform)
}

export const methodById = (
  methods: readonly FishingMethod[],
  id: string,
): FishingMethod | undefined => methods.find((method) => method.id === id)

export const methodAcceptsOffering = (
  method: FishingMethod,
  offering: {
    readonly category: 'lure' | 'bait'
    readonly lureType?: string
    readonly baitType?: string
  },
): boolean => {
  if (method.requiresOffering !== 'either' && method.requiresOffering !== offering.category) {
    return false
  }

  if (method.offeringTags.length === 0) {
    return true
  }

  const tag = offering.category === 'lure' ? offering.lureType : offering.baitType

  return tag !== undefined && method.offeringTags.includes(tag)
}
