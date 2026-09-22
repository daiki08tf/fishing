import { assembleBuiltInContent, type BuiltInContent, type ContentSource } from './assembleContent'

/**
 * 同梱コンテンツの読み込み（ブラウザ / Vite）。
 *
 * `import.meta.glob` でディレクトリを丸ごと読むため、
 * **JSON を追加するだけで新しい魚種がゲームに登場する**。
 * カタログのコード変更も Fishing Engine の変更も要らない。
 *
 * runtime Content はプレイヤーが実際に遊ぶ魚種・釣り場である。
 * Phase 12 時点では多くの生態値・分布・地形・アクセスを PROVISIONAL として扱い、
 * 検証用の合成魚は tests/fixtures 側へ分離する。
 */

const speciesModules = import.meta.glob<unknown>('../data/fish-species/*.json', {
  eager: true,
  import: 'default',
})

const spotModules = import.meta.glob<unknown>('../data/fishing-spots/*.json', {
  eager: true,
  import: 'default',
})

const shopItemModules = import.meta.glob<unknown>('../data/shop-items/*.json', {
  eager: true,
  import: 'default',
})

const transportModules = import.meta.glob<unknown>('../data/transports/*.json', {
  eager: true,
  import: 'default',
})

const countryModules = import.meta.glob<unknown>('../data/countries/*.json', {
  eager: true,
  import: 'default',
})

const regionModules = import.meta.glob<unknown>('../data/regions/*.json', {
  eager: true,
  import: 'default',
})

const expeditionModules = import.meta.glob<unknown>('../data/expeditions/*.json', {
  eager: true,
  import: 'default',
})

const buyerModules = import.meta.glob<unknown>('../data/buyers/*.json', {
  eager: true,
  import: 'default',
})

const speciesTradeProfileModules = import.meta.glob<unknown>(
  '../data/species-trade-profiles/*.json',
  { eager: true, import: 'default' },
)

const contactRewardModules = import.meta.glob<unknown>('../data/contact-rewards/*.json', {
  eager: true,
  import: 'default',
})

const gearModules = import.meta.glob<unknown>('../data/gear/*.json', {
  eager: true,
  import: 'default',
})

const methodModules = import.meta.glob<unknown>('../data/methods/*.json', {
  eager: true,
  import: 'default',
})

const brandModules = import.meta.glob<unknown>('../data/brands/*.json', {
  eager: true,
  import: 'default',
})

const gearSeriesModules = import.meta.glob<unknown>('../data/gear-series/*.json', {
  eager: true,
  import: 'default',
})

/** glob の順序に依存しないよう、ファイル名で安定させる。 */
const toSources = (modules: Record<string, unknown>): readonly ContentSource[] =>
  Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, value]) => ({ source, value }))

export const loadBuiltInContent = (): BuiltInContent =>
  assembleBuiltInContent({
    species: toSources(speciesModules),
    spots: toSources(spotModules),
    shopItems: toSources(shopItemModules),
    transports: toSources(transportModules),
    countries: toSources(countryModules),
    regions: toSources(regionModules),
    expeditions: toSources(expeditionModules),
    buyers: toSources(buyerModules),
    speciesTradeProfiles: toSources(speciesTradeProfileModules),
    contactRewards: toSources(contactRewardModules),
    gear: toSources(gearModules),
    methods: toSources(methodModules),
    brands: toSources(brandModules),
    gearSeries: toSources(gearSeriesModules),
  })
