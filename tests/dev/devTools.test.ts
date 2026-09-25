import { describe, expect, it } from 'vitest'
import { runAuthority } from '../../scripts/dev/authority'
import { buildProjectMap } from '../../scripts/dev/map'
import { runContext } from '../../scripts/dev/context'
import { runImpact } from '../../scripts/dev/impact'
import { classifyFile } from '../../scripts/dev/scope'
import { runStatus } from '../../scripts/dev/status'

/**
 * dev ツール自体の検証。 gameplay ではなく infrastructure を守る。
 */

describe('project map', () => {
  it('generates deterministically', () => {
    const first = buildProjectMap()
    const second = buildProjectMap()
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('contains known systems', () => {
    const map = buildProjectMap()
    const ids = map.systems.map((system) => system.id)
    expect(ids).toContain('domain-fishing')
    expect(ids).toContain('domain-save')
    expect(ids).toContain('content')
    expect(ids).toContain('infrastructure')
  })

  it('resolves all authority paths', () => {
    const map = buildProjectMap()
    const missing = map.authorities.flatMap((authority) =>
      authority.missingPaths.map((path) => `${authority.id}: ${path}`),
    )
    expect(missing).toEqual([])
  })
})

describe('authority', () => {
  it('lists authorities without args', () => {
    const result = runAuthority([])
    expect(result.exitCode).toBe(0)
    expect(result.lines.join('\n')).toContain('save')
  })

  it('shows a known authority', () => {
    const result = runAuthority(['save'])
    expect(result.exitCode).toBe(0)
    expect(result.lines.join('\n')).toContain('SaveGame')
  })

  it('rejects unknown concepts', () => {
    const result = runAuthority(['nonexistent-concept'])
    expect(result.exitCode).toBe(1)
  })

  it('--check passes on the current map', () => {
    const result = runAuthority(['--check'])
    expect(result.exitCode).toBe(0)
  })
})

describe('impact', () => {
  it('reports files/tests/consumers for a known concept', () => {
    const result = runImpact(['save'])
    expect(result.exitCode).toBe(0)
    const text = result.lines.join('\n')
    expect(text).toContain('migrateSave')
    expect(text).toContain('## tests')
    expect(text).toContain('## save implications')
  })

  it('rejects unknown concepts', () => {
    expect(runImpact(['nonsense']).exitCode).toBe(1)
  })
})

describe('scope classification', () => {
  it('classifies known paths', () => {
    expect(classifyFile('src/domain/fishing/FishingEngine.ts')).toBe('gameplay-domain')
    expect(classifyFile('src/infrastructure/persistence/migrateSave.ts')).toBe('save')
    expect(classifyFile('src/content/data/fish-species/x.json')).toBe('content')
    expect(classifyFile('src/ui/home/HomeScreen.tsx')).toBe('ui')
    expect(classifyFile('tests/contracts/foo.test.ts')).toBe('tests')
    expect(classifyFile('src/state/playerStore.ts')).toBe('infrastructure')
    expect(classifyFile('scripts/dev/cli.ts')).toBe('devtools')
    expect(classifyFile('docs/ARCHITECTURE.md')).toBe('docs')
  })
})

describe('context', () => {
  it('returns curated context for a known concept', () => {
    const result = runContext(['progression'])
    expect(result.exitCode).toBe(0)
    const text = result.lines.join('\n')
    expect(text).toContain('## authority')
    expect(text).toContain('save.progression')
  })

  it('rejects unknown concepts', () => {
    expect(runContext(['nonsense']).exitCode).toBe(1)
  })
})

describe('status', () => {
  it('emits json when asked', () => {
    const result = runStatus(['--json'])
    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.lines.join('\n')) as { branch: string; remote: string }
    expect(parsed.branch).toBe('main')
    expect(parsed.remote).toContain('fishing')
  })
})
