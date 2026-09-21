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

export type FishingMethod = {
  readonly id: string
  readonly name: string
  readonly description: string
  /** この釣法で使える offering。 */
  readonly requiresOffering: RequiredOfferingKind
  /** 使える offering のタグ（lureType / baitType）。空なら制限なし。 */
  readonly offeringTags: readonly string[]
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
