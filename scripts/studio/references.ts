import { TRADE_TAGS } from '../../src/domain/trade/TradeTag'
import { knownOfferingTags } from '../../src/content/catalog/references'
import type { ContentKind } from '../../src/content/schema'
import type { GearItem } from '../../src/domain/gear/Gear'
import { identityFieldOf, recordKey, type StudioStore } from './model'

/**
 * Content 間参照のフィールド地図。
 *
 * 権威は `src/content/catalog/references.ts`（validate:content が実際に検査する規則）。
 * ここはその規則を「フォームが参照選択肢を出せる形」に記述したもので、
 * 新しい参照規則を足す場合はまず catalog/references.ts を更新する。
 *
 * パス記法:
 *   `field`          … スカラー参照
 *   `field[]`        … 配列の各要素が参照
 *   `items[].sub`    … 配列要素オブジェクトのフィールド
 *   `map.*`          … record の**キー**が参照
 *   `items[].map.*`  … 配列要素の record キー
 */

export type VocabularyName = 'tradeTags' | 'offeringTags' | 'transportTypes' | 'permitIds'

export type RefSpec = {
  /** ドットパス。`[]` は配列要素、`*` は record キー。 */
  readonly path: string
  /** 参照先 Content kind。複数 = 共有 ID 空間（Buyer / Contact）。 */
  readonly targets?: readonly ContentKind[]
  /** id ではなく語彙（tradeTag / offeringTag / transportType / permitId）。 */
  readonly vocabulary?: VocabularyName
  /** 条件つき参照（例: contact-rewards.targetId は kind によって参照先が変わる）。 */
  readonly when?: { readonly field: string; readonly is: string }
  readonly note?: string
}

const CONTACT_SPACE: readonly ContentKind[] = ['buyers', 'contacts']

export const REFERENCE_SPECS: Readonly<Record<ContentKind, readonly RefSpec[]>> = {
  'fish-species': [
    { path: 'distribution[]', targets: ['regions'] },
    { path: 'methodAffinity.*', targets: ['methods'], note: 'record キー = method id' },
    { path: 'offeringAffinity.*', vocabulary: 'offeringTags', note: 'record キー = offering tag' },
  ],
  'fishing-spots': [
    { path: 'regionId', targets: ['regions'] },
    {
      path: 'areaId',
      note: 'region.areas 内のローカル id（その Spot の regionId が指す Region の areas）',
    },
    { path: 'access[].permitId', vocabulary: 'permitIds', when: { field: 'kind', is: 'permit' } },
    {
      path: 'access[].targetId',
      targets: CONTACT_SPACE,
      when: { field: 'kind', is: 'relationship' },
    },
    { path: 'travelOptions[].transportTypes[]', vocabulary: 'transportTypes' },
    { path: 'fishTable[].speciesId', targets: ['fish-species'] },
    {
      path: 'fishTable[].zoneAffinity.*',
      note: '同じ Spot の fishingZones[].id を参照するローカル参照',
    },
    { path: 'regulations[]', targets: ['regulations'] },
  ],
  transports: [
    { path: 'serviceRegionIds[]', targets: ['regions'] },
    { path: 'operatorContactId', targets: CONTACT_SPACE },
  ],
  regulations: [
    { path: 'regionId', targets: ['regions'] },
    { path: 'spotId', targets: ['fishing-spots'] },
    { path: 'speciesId', targets: ['fish-species'] },
  ],
  'shop-items': [
    { path: 'grantsTransportId', targets: ['transports'] },
    { path: 'grantsGearId', targets: ['gear'] },
  ],
  brands: [],
  'gear-series': [{ path: 'brandId', targets: ['brands'] }],
  gear: [
    { path: 'brandId', targets: ['brands'] },
    { path: 'seriesId', targets: ['gear-series'] },
  ],
  methods: [{ path: 'offeringTags[]', vocabulary: 'offeringTags' }],
  countries: [],
  regions: [
    { path: 'countryId', targets: ['countries'] },
    { path: 'base.areaId', note: 'この Region 自身の areas[].id を参照するローカル参照' },
  ],
  expeditions: [{ path: 'regionId', targets: ['regions'] }],
  buyers: [
    { path: 'regionId', targets: ['regions'] },
    { path: 'preferences.preferredTags[]', vocabulary: 'tradeTags' },
    { path: 'preferences.neutralTags[]', vocabulary: 'tradeTags' },
  ],
  contacts: [{ path: 'regionId', targets: ['regions'] }],
  'species-trade-profiles': [
    { path: 'speciesId', targets: ['fish-species'] },
    { path: 'tradeTags[]', vocabulary: 'tradeTags' },
  ],
  'contact-rewards': [
    { path: 'contactId', targets: CONTACT_SPACE },
    { path: 'targetId', targets: ['fishing-spots'], when: { field: 'kind', is: 'discover_spot' } },
    {
      path: 'targetId',
      targets: CONTACT_SPACE,
      when: { field: 'kind', is: 'introduce_contact' },
    },
  ],
}

export type ResolvedRef = {
  /** 具体化されたパス（例: fishTable.0.speciesId / methodAffinity.lure）。 */
  readonly path: string
  readonly value: string
  readonly targets?: readonly ContentKind[]
  readonly vocabulary?: VocabularyName
  readonly note?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * パス記法を値に適用して {concretePath, value} を列挙する。
 * `*` は record のキーを拾う（参照値はキー自身）。
 */
const walkPath = (
  value: unknown,
  segments: readonly string[],
  base: string,
  out: { path: string; value: string }[],
): void => {
  const [segment, ...rest] = segments

  if (segment === undefined) {
    if (typeof value === 'string') {
      out.push({ path: base.slice(0, -1), value })
    }
    return
  }

  if (segment.endsWith('[]')) {
    const field = segment.slice(0, -2)
    const next = isRecord(value) ? value[field] : value
    if (!Array.isArray(next)) {
      return
    }
    next.forEach((item, index) => walkPath(item, rest, `${base}${field}.${index}.`, out))
    return
  }

  if (segment === '*') {
    // record のキーが参照値（例: methodAffinity.<methodId>）。
    if (!isRecord(value)) {
      return
    }
    if (rest.length === 0) {
      for (const key of Object.keys(value)) {
        out.push({ path: `${base}${key}`, value: key })
      }
      return
    }
    for (const [key, item] of Object.entries(value)) {
      walkPath(item, rest, `${base}${key}.`, out)
    }
    return
  }

  const next = isRecord(value) ? value[segment] : undefined
  walkPath(next, rest, `${base}${segment}.`, out)
}

const parentObject = (
  value: unknown,
  concretePath: string,
): Record<string, unknown> | undefined => {
  const segments = concretePath.split('.').slice(0, -1)
  let current: unknown = value
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)]
    } else if (isRecord(current)) {
      current = current[segment]
    } else {
      return undefined
    }
  }
  return isRecord(current) ? current : undefined
}

/** レコードが実際に持っている参照を列挙する（when 条件つきも評価する）。 */
export const referencesOf = (
  kind: ContentKind,
  value: Record<string, unknown>,
): readonly ResolvedRef[] => {
  const out: ResolvedRef[] = []

  for (const spec of REFERENCE_SPECS[kind]) {
    if (spec.targets === undefined && spec.vocabulary === undefined) {
      continue
    }
    const hits: { path: string; value: string }[] = []
    walkPath(value, spec.path.split('.'), '', hits)

    for (const hit of hits) {
      if (spec.when !== undefined) {
        const owner = parentObject(value, hit.path)
        if (owner?.[spec.when.field] !== spec.when.is) {
          continue
        }
      }
      out.push({
        path: hit.path,
        value: hit.value,
        ...(spec.targets !== undefined ? { targets: spec.targets } : {}),
        ...(spec.vocabulary !== undefined ? { vocabulary: spec.vocabulary } : {}),
        ...(spec.note !== undefined ? { note: spec.note } : {}),
      })
    }
  }

  return out
}

export type ReferencedByEntry = {
  readonly kind: ContentKind
  readonly id: string
  readonly file: string
  readonly path: string
}

/** この id を参照しているレコードを列挙する（逆引き）。 */
export const referencedBy = (
  store: StudioStore,
  kind: ContentKind,
  id: string,
): readonly ReferencedByEntry[] => {
  const key = recordKey(kind, id)
  const out: ReferencedByEntry[] = []

  for (const record of store.records) {
    for (const ref of referencesOf(record.kind, record.raw)) {
      if (ref.targets === undefined) {
        continue
      }
      for (const target of ref.targets) {
        if (recordKey(target, ref.value) === key) {
          out.push({ kind: record.kind, id: record.id, file: record.file, path: ref.path })
        }
      }
    }
  }

  return out
}

export type Vocabulary = {
  readonly name: VocabularyName
  readonly values: readonly string[]
}

/** 語彙の選択肢。offeringTags / transportTypes / permitIds は現在の Content から集める。 */
export const vocabularyValues = (store: StudioStore, name: VocabularyName): readonly string[] => {
  switch (name) {
    case 'tradeTags':
      return [...TRADE_TAGS]
    case 'offeringTags': {
      const gear = store.records
        .filter((record) => record.kind === 'gear')
        .map((record) => record.value as GearItem)
      return [...knownOfferingTags(gear)].sort()
    }
    case 'transportTypes': {
      const types = new Set<string>()
      for (const record of store.records) {
        if (record.kind !== 'transports') {
          continue
        }
        const type = record.raw['transportType']
        if (typeof type === 'string') {
          types.add(type)
        }
      }
      return [...types].sort()
    }
    case 'permitIds': {
      const ids = new Set<string>()
      for (const record of store.records) {
        for (const ref of referencesOf(record.kind, record.raw)) {
          if (ref.vocabulary === 'permitIds') {
            ids.add(ref.value)
          }
        }
      }
      return [...ids].sort()
    }
  }
}

/** 参照選択肢（id + 表示ラベル）。共有 ID 空間はまとめて返す。 */
export const referenceOptions = (
  store: StudioStore,
  targets: readonly ContentKind[],
): readonly { id: string; label: string; kind: ContentKind }[] =>
  store.records
    .filter((record) => targets.includes(record.kind))
    .map((record) => ({ id: record.id, label: record.label, kind: record.kind }))
    .sort((left, right) => left.id.localeCompare(right.id))

/** 新規レコード用のファイル名。`<id>.json` が規約だが、実装上は一致を強制しない。 */
export const fileNameForId = (id: string): string => `${id.replaceAll(/[^a-z0-9-]/g, '-')}.json`

export { identityFieldOf }
