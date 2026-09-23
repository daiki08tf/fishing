import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadContentDirectory } from './contentLoader'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = (path: string): string => `${repositoryRoot}src/content/fixtures/${path}`

describe('loadContentDirectory', () => {
  it('accepts the valid fixture set', () => {
    const result = loadContentDirectory(fixture('valid'))

    expect(result.diagnostics).toEqual([])
    expect(result.locations.map((location) => location.kind).sort()).toEqual([
      'fish-species',
      'fishing-spots',
      'regulations',
      'transports',
    ])
  })

  it('reports a missing required field', () => {
    const result = loadContentDirectory(fixture('invalid/missing-required'))

    expect(result.diagnostics).toHaveLength(1)
    const issues = result.diagnostics[0]?.issues ?? []
    expect(issues.some((issue) => issue.path === 'lengthModel')).toBe(true)
    expect(result.locations).toEqual([])
  })

  it('reports numeric bounds violations', () => {
    const result = loadContentDirectory(fixture('invalid/invalid-bounds'))

    expect(result.diagnostics).toHaveLength(1)
    const paths = (result.diagnostics[0]?.issues ?? []).map((issue) => issue.path)

    expect(paths).toContain('lengthModel.minCm')
    expect(paths).toContain('fightProfile.strength')
    expect(paths).toContain('rarity')
  })

  it('reports malformed source metadata', () => {
    const result = loadContentDirectory(fixture('invalid/malformed-source'))

    expect(result.diagnostics).toHaveLength(1)
    const paths = (result.diagnostics[0]?.issues ?? []).map((issue) => issue.path)

    expect(paths).toContain('sourceRefs.0.title')
  })

  it('reports invalid JSON', () => {
    const result = loadContentDirectory(fixture('invalid/invalid-json'))

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.issues[0]?.message).toContain('invalid JSON')
  })

  it('reports an unknown content kind directory', () => {
    const result = loadContentDirectory(fixture('invalid/unknown-kind'))

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.kind).toBe('unknown')
    expect(result.diagnostics[0]?.issues[0]?.message).toContain('unknown content kind')
  })

  it('reports a missing content directory', () => {
    const result = loadContentDirectory(`${repositoryRoot}src/content/does-not-exist`)

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.issues[0]?.message).toContain('does not exist')
  })

  it('validates the runtime content that ships with the repository', () => {
    const result = loadContentDirectory(`${repositoryRoot}src/content/data`)

    expect(result.diagnostics).toEqual([])
    const kinds = result.locations.map((location) => location.kind)

    // 件数は Content を増減するたびに変わる（検証の中身は validate:content が見る）。
    // 検証用 fixture（サンプル魚）は src/content/data には置かない。
    expect(kinds.filter((kind) => kind === 'fish-species')).toHaveLength(229)
    expect(kinds.filter((kind) => kind === 'fishing-spots')).toHaveLength(155)
    expect(kinds.filter((kind) => kind === 'transports')).toHaveLength(19)
    expect(kinds.filter((kind) => kind === 'countries')).toHaveLength(9)
    // Phase 19B: 15 playable + 12 planned Japan skeleton
    expect(kinds.filter((kind) => kind === 'regions')).toHaveLength(27)
    expect(kinds.filter((kind) => kind === 'expeditions')).toHaveLength(14)
    expect(kinds.filter((kind) => kind === 'gear')).toHaveLength(473)
    expect(kinds.filter((kind) => kind === 'methods')).toHaveLength(9)
    expect(kinds.filter((kind) => kind === 'brands')).toHaveLength(13)
    expect(kinds.filter((kind) => kind === 'gear-series')).toHaveLength(91)
    expect(kinds.filter((kind) => kind === 'buyers')).toHaveLength(26)
    expect(kinds.filter((kind) => kind === 'contacts')).toHaveLength(6)
    expect(kinds.filter((kind) => kind === 'species-trade-profiles')).toHaveLength(229)
    expect(kinds.filter((kind) => kind === 'contact-rewards')).toHaveLength(92)
  })
})
