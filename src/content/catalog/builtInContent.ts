import { assembleBuiltInContent, type BuiltInContent, type ContentSource } from './assembleContent'

/**
 * 同梱コンテンツの読み込み（ブラウザ / Vite）。
 *
 * `import.meta.glob` でディレクトリを丸ごと読むため、
 * **JSON を追加するだけで新しい魚種がゲームに登場する**。
 * カタログのコード変更も Fishing Engine の変更も要らない。
 *
 * ここに置く魚種・釣り場は**検証用のサンプル**であり、現実の魚や釣り場を
 * 表すものではない（名前もパラメータも暫定）。現実データは Phase 4 以降で投入する。
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
    gear: toSources(gearModules),
    methods: toSources(methodModules),
    brands: toSources(brandModules),
  })
