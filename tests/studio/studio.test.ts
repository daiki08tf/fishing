import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsonDiff, serializeRecord } from '../../scripts/studio/diff'
import { buildFormSpec, skeletonFor, type JsonSchema } from '../../scripts/studio/formSpec'
import {
  duplicateIdIssues,
  identityFieldOf,
  loadStudioStore,
  recordKey,
} from '../../scripts/studio/model'
import {
  REFERENCE_SPECS,
  referencedBy,
  referencesOf,
  vocabularyValues,
} from '../../scripts/studio/references'
import { writeRecord } from '../../scripts/studio/write'
import { CONTENT_KINDS } from '../../src/content/schema'

/**
 * Content Studio 自体の検証。gameplay ではなく tooling を守る。
 * write 系のテストは tmpdir の部分コピーに対して行い、実 Content を触らない。
 */

const store = loadStudioStore()

describe('model / store', () => {
  it('loads every content kind', () => {
    expect(store.kinds.map((entry) => entry.kind)).toEqual([...CONTENT_KINDS])
    expect(store.records.length).toBeGreaterThan(1000)
    expect(store.diagnostics).toEqual([])
  })

  it('uses speciesId as the identity of species-trade-profiles', () => {
    expect(identityFieldOf('species-trade-profiles')).toBe('speciesId')
    expect(identityFieldOf('brands')).toBe('id')
  })

  it('shares the ContactId space between buyers and contacts', () => {
    expect(recordKey('buyers', 'x')).toBe(recordKey('contacts', 'x'))
    expect(recordKey('gear', 'x')).not.toBe(recordKey('buyers', 'x'))
  })

  it('detects duplicate ids excluding the file being edited', () => {
    const brand = store.records.find((record) => record.kind === 'brands')
    expect(brand).toBeDefined()
    if (brand === undefined) return
    expect(duplicateIdIssues(store, 'brands', brand.id)).not.toEqual([])
    expect(duplicateIdIssues(store, 'brands', brand.id, brand.file)).toEqual([])
  })
})

describe('references', () => {
  it('resolves scalar, array, and record-key references', () => {
    const aigo = store.records.find(
      (record) => record.kind === 'fish-species' && record.id === 'aigo',
    )
    expect(aigo).toBeDefined()
    if (aigo === undefined) return

    const refs = referencesOf(aigo.kind, aigo.raw)
    const paths = refs.map((ref) => ref.path)
    expect(paths).toContain('distribution.0')
    expect(paths).toContain('methodAffinity.lure')
    expect(paths.some((path) => path.startsWith('offeringAffinity.'))).toBe(true)

    const regionRef = refs.find((ref) => ref.path === 'distribution.0')
    expect(regionRef?.targets).toEqual(['regions'])
    const vocabRef = refs.find((ref) => ref.path.startsWith('offeringAffinity.'))
    expect(vocabRef?.vocabulary).toBe('offeringTags')
  })

  it('honours `when` conditions (contact-rewards.targetId)', () => {
    const reward = store.records.find(
      (record) => record.kind === 'contact-rewards' && record.raw['kind'] === 'discover_spot',
    )
    expect(reward).toBeDefined()
    if (reward === undefined) return
    const ref = referencesOf(reward.kind, reward.raw).find((entry) =>
      entry.path.startsWith('targetId'),
    )
    expect(ref?.targets).toEqual(['fishing-spots'])
  })

  it('computes referencedBy across kinds', () => {
    const inbound = referencedBy(store, 'fish-species', 'aigo')
    expect(inbound.length).toBeGreaterThan(0)
    // fishTable（Spot → Species）と species-trade-profiles（Profile → Species）の両方が来る。
    expect(
      inbound.some((entry) => entry.kind === 'fishing-spots' && entry.path.includes('fishTable')),
    ).toBe(true)
    expect(inbound.some((entry) => entry.kind === 'species-trade-profiles')).toBe(true)
  })

  it('collects vocabularies from live content', () => {
    expect(vocabularyValues(store, 'tradeTags').length).toBeGreaterThan(0)
    expect(vocabularyValues(store, 'offeringTags').length).toBeGreaterThan(0)
    expect(vocabularyValues(store, 'transportTypes').length).toBeGreaterThan(0)
  })
})

describe('form spec', () => {
  const collectMarkers = (node: JsonSchema, out: Record<string, unknown>[]): void => {
    for (const key of ['x-ref', 'x-keyRef'] as const) {
      const markers = node[key]
      if (Array.isArray(markers)) {
        out.push(...markers)
      }
    }
    for (const property of Object.values(node.properties ?? {})) {
      collectMarkers(property, out)
    }
    const variants = node.anyOf ?? (node as Record<string, unknown>)['oneOf']
    for (const variant of (variants as readonly JsonSchema[] | undefined) ?? []) {
      collectMarkers(variant, out)
    }
    if (node.items !== undefined) {
      collectMarkers(node.items, out)
    }
  }

  it('builds a spec for every kind and annotates every declared reference', () => {
    for (const kind of CONTENT_KINDS) {
      const spec = buildFormSpec(kind)
      const markers: Record<string, unknown>[] = []
      collectMarkers(spec.schema, markers)

      for (const refSpec of REFERENCE_SPECS[kind]) {
        if (refSpec.targets === undefined && refSpec.vocabulary === undefined) {
          continue
        }
        const found = markers.some(
          (marker) =>
            JSON.stringify(marker.targets) === JSON.stringify(refSpec.targets) &&
            marker.vocabulary === refSpec.vocabulary &&
            JSON.stringify(marker.when) === JSON.stringify(refSpec.when),
        )
        expect(found, `${kind}: ${refSpec.path} did not resolve to a schema node`).toBe(true)
      }
    }
  })

  it('detects the gear discriminated union', () => {
    const spec = buildFormSpec('gear')
    expect(spec.schema['x-discriminator']).toBe('category')
    expect(spec.schema.anyOf?.length).toBe(8)
  })

  it('produces skeletons that carry the discriminator const', () => {
    const spec = buildFormSpec('gear')
    const skeleton = skeletonFor(spec.schema)
    expect(skeleton['category']).toBe('rod')
  })
})

describe('diff', () => {
  it('reports added / removed / changed paths', () => {
    const diff = jsonDiff({ a: 1, b: { c: 2 }, list: [1, 2] }, { a: 2, list: [1, 2, 3], d: 'x' })
    const byPath = new Map(diff.map((entry) => [entry.path, entry.type]))
    expect(byPath.get('a')).toBe('changed')
    expect(byPath.get('b')).toBe('removed')
    expect(byPath.get('d')).toBe('added')
    expect(byPath.get('list.2')).toBe('added')
  })

  it('serializes with the repo JSON convention (2-space + trailing newline)', () => {
    expect(serializeRecord({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  })
})

describe('write pipeline (tmpdir copy)', () => {
  /** brands だけをコピーした最小の Content root を作る。 */
  const makeSandbox = (): string => {
    const sandbox = mkdtempSync(join(tmpdir(), 'studio-test-'))
    const dataDir = join(sandbox, 'src/content/data/brands')
    mkdirSync(dataDir, { recursive: true })
    cpSync('src/content/data/brands', dataDir, { recursive: true })
    return sandbox
  }

  const brandFixture = (id: string): Record<string, unknown> => ({
    id,
    name: 'Studio Test Brand',
    description: 'test fixture — not production content',
    specialties: ['test'],
    countryStyle: 'japan_domestic',
    tagline: 'test',
  })

  it('writes a new record atomically and regenerates artifacts', () => {
    const sandbox = makeSandbox()
    const result = writeRecord(
      { kind: 'brands', value: brandFixture('studio-test-brand'), dryRun: false },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(true)
    expect(result.file).toBe('studio-test-brand.json')

    const written = JSON.parse(
      readFileSync(join(sandbox, 'src/content/data/brands/studio-test-brand.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(written['id']).toBe('studio-test-brand')
    expect(existsSync(join(sandbox, 'src/content/generated/content-index.json'))).toBe(true)
    // postCheck は repo 全体の scale 検査を含むため sandbox では opt-out にしている
  })

  it('dry-run reports the diff but writes nothing', () => {
    const sandbox = makeSandbox()
    const result = writeRecord(
      { kind: 'brands', value: brandFixture('studio-dry-run'), dryRun: true },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.diff.length).toBeGreaterThan(0)
    expect(
      readdirSync(join(sandbox, 'src/content/data/brands')).includes('studio-dry-run.json'),
    ).toBe(false)
  })

  it('rejects schema-invalid records without writing', () => {
    const sandbox = makeSandbox()
    const bad = brandFixture('studio-bad')
    bad['price'] = -1 // strictObject: 未知のキーは拒否される
    const result = writeRecord(
      { kind: 'brands', value: bad, dryRun: false },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('schema:'))).toBe(true)
    expect(readdirSync(join(sandbox, 'src/content/data/brands')).includes('studio-bad.json')).toBe(
      false,
    )
  })

  it('rejects duplicate ids without writing', () => {
    const sandbox = makeSandbox()
    const existing = store.records.find((record) => record.kind === 'brands')
    expect(existing).toBeDefined()
    if (existing === undefined) return
    const result = writeRecord(
      { kind: 'brands', value: brandFixture(existing.id), dryRun: false },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('duplicate id'))).toBe(true)
  })

  it('renames the file when the id changes and the file followed the convention', () => {
    const sandbox = makeSandbox()
    const daiva = brandFixture('daiva')
    writeFileSync(join(sandbox, 'src/content/data/brands/daiva.json'), serializeRecord(daiva))
    const renamed = { ...daiva, id: 'daiva-renamed' }
    const result = writeRecord(
      { kind: 'brands', file: 'daiva.json', value: renamed, dryRun: false },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(true)
    expect(result.renamedFrom).toBe('daiva.json')
    expect(result.file).toBe('daiva-renamed.json')
    const files = readdirSync(join(sandbox, 'src/content/data/brands'))
    expect(files).toContain('daiva-renamed.json')
    expect(files).not.toContain('daiva.json')
  })

  it('rejects edits to a nonexistent file', () => {
    const sandbox = makeSandbox()
    const result = writeRecord(
      { kind: 'brands', file: 'nope.json', value: brandFixture('x'), dryRun: false },
      { cwd: sandbox, postCheck: false },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('no existing'))).toBe(true)
  })
})
