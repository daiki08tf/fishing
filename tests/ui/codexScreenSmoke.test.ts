import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { PlayerStoreState } from '../../src/state/playerStore'
import { createPlayerStore } from '../../src/state/playerStore'
import type * as PlayerStoreModule from '../../src/state/playerStore'
import { asFishIndividualId } from '../../src/domain/ids'
import type { CodexState, SpeciesRecord } from '../../src/domain/codex'

/**
 * Phase 14 — CODEX（図鑑）Grid。
 *
 * - 未捕獲の魚種は種名を明かさず「？？？」にする（新しい Knowledge ルールは作らない）。
 * - 捕獲済みの魚種は既存 CodexState（catchCount / largestLengthCm）をそのまま出す。
 */

const holder = vi.hoisted(() => ({ state: null as unknown }))

vi.mock('../../src/state/playerStore', async (importOriginal) => {
  const actual = await importOriginal<typeof PlayerStoreModule>()

  return {
    ...actual,
    usePlayerStore: <TSelected>(selector: (state: PlayerStoreState) => TSelected): TSelected =>
      selector(holder.state as PlayerStoreState),
  }
})

const { CodexScreen } = await import('../../src/ui/codex/CodexScreen')

const content = loadContentFromDirectory()
const firstSpecies = content.species[0]

if (firstSpecies === undefined) {
  throw new Error('no species in content')
}

const withCodex = (codex: CodexState): PlayerStoreState => {
  const base = createPlayerStore().getState()
  return { ...base, codex }
}

describe('codex screen', () => {
  it('hides every species name behind ？？？ when nothing is caught', () => {
    holder.state = withCodex({ species: {} })
    const html = renderToStaticMarkup(createElement(CodexScreen))

    expect(html).toContain('？？？')
    expect(html).toContain(`0</span> / ${String(content.species.length)} 種`)
    expect(html).not.toContain(firstSpecies.japaneseName)
  })

  it('shows the recorded stats for a caught species, others stay hidden', () => {
    const record: SpeciesRecord = {
      speciesId: firstSpecies.id,
      catchCount: 3,
      largestLengthCm: 42,
      heaviestWeightKg: 1.2,
      bestPercentile: 88,
      caughtTraits: [],
      personalBest: {
        individualId: asFishIndividualId('codex-test-1'),
        speciesId: firstSpecies.id,
        lengthCm: 42,
        weightKg: 1.2,
        condition: 0.8,
        percentile: 88,
        traits: [],
      },
    }

    holder.state = withCodex({ species: { [String(firstSpecies.id)]: record } })
    const html = renderToStaticMarkup(createElement(CodexScreen))

    expect(html).toContain(firstSpecies.japaneseName)
    expect(html).toContain('3 匹')
    expect(html).toContain('42 cm')
    expect(html).toContain('？？？')
    expect(html).toContain(`1</span> / ${String(content.species.length)} 種`)
  })
})
