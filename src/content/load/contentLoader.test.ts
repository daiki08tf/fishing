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

  it('passes on the real content directory, which Phase 0B leaves empty', () => {
    const result = loadContentDirectory(`${repositoryRoot}src/content/data`)

    expect(result.diagnostics).toEqual([])
    expect(result.locations).toEqual([])
  })
})
