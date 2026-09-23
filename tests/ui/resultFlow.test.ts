import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NEUTRAL_FISHING_MODIFIERS, type FishingPhase } from '../../src/domain/fishing'
import { asFishIndividualId, asFishSpeciesId } from '../../src/domain/ids'
import {
  isFightUiVisible,
  isFishingFinished,
  isResultFirstPhase,
} from '../../src/ui/fishing/resultFlow'
import { ResultView } from '../../src/ui/fishing/ResultView'

/**
 * Phase 14.1 — LANDED の Catch Result が最優先で見えること。
 *
 * ここでの保証は 2 つ:
 * 1. 表示順・出し分けの判定（純粋関数）
 * 2. **DOM 順** として結果が先に来ること（CSS の position ではなく構造で保証する）
 *
 * renderToStaticMarkup は effect を実行しないので、useFishingSession を差し替えて
 * phase ごとの markup を直接検証する（jsdom を足さない）。
 */

const holder = vi.hoisted(() => ({ session: null as unknown }))

vi.mock('../../src/ui/fishing/useFishingSession', () => ({
  useFishingSession: () => holder.session,
}))

const { FishingScreen } = await import('../../src/ui/fishing/FishingScreen')

const phaseSnapshot = (phase: FishingPhase) => ({
  phase,
  tension: 3,
  maxTension: 10,
  optimalTension: { min: 3, max: 6 },
  fish: {
    individual: {
      id: asFishIndividualId('maaji-1'),
      speciesId: asFishSpeciesId('maaji'),
      lengthCm: 32,
      weightKg: 0.45,
      condition: 0.7,
      traits: ['trophy'],
      fightSeed: 'maaji-1',
      percentile: 88,
    },
    speciesName: 'マアジ',
    conditionBand: 'good' as const,
    stamina: 5,
    staminaMax: 10,
    behavior: 'normal' as const,
    power: 0.5,
    speed: 0.5,
    modifiers: {},
  },
  ticksInPhase: 2,
  totalTicks: 30,
  lastEvents: ['LANDED'],
  playerModifiers: NEUTRAL_FISHING_MODIFIERS,
  effectiveHookWindowTicks: 5,
  biteForecastTicks: null,
  battle: {
    behaviour: 'rest' as const,
    behaviourLabel: '休んでいる',
    distanceM: 12,
    hookHold: 0.5,
    drag: 0.5,
    step: 7,
    log: ['巻いた', '休んでいる'],
    landingReady: false,
  },
})

const sessionFor = (phase: FishingPhase) => ({
  contentError: null,
  snapshot: phaseSnapshot(phase),
  spot: { id: 'arakawa-lower', name: '荒川 下流' },
  spotName: '荒川 下流',
  environment: null,
  conditions: null,
  seed: 'seed-1',
  fishingZones: [],
  targetZoneId: null,
  castCapability: null,
  resolvedCast: null,
  canCast: false,
  selectTargetZone: () => undefined,
  send: () => undefined,
  restart: () => undefined,
})

const render = (phase: FishingPhase): string => {
  holder.session = sessionFor(phase)
  return renderToStaticMarkup(createElement(FishingScreen, { onExit: () => undefined }))
}

describe('result flow decisions', () => {
  it('treats every outcome phase as finished', () => {
    for (const phase of ['LANDED', 'HOOK_MISSED', 'HOOK_ESCAPE', 'LINE_BREAK'] as const) {
      expect(isFishingFinished(phase)).toBe(true)
    }

    for (const phase of [
      'IDLE',
      'CASTING',
      'WAITING',
      'BITE',
      'HOOK_WINDOW',
      'HOOKED',
      'FIGHTING',
      'LANDING',
    ] as const) {
      expect(isFishingFinished(phase)).toBe(false)
    }
  })

  it('hides the fight UI exactly when the fishing is over', () => {
    expect(isFightUiVisible('FIGHTING')).toBe(true)
    expect(isFightUiVisible('LANDING')).toBe(true)
    expect(isFightUiVisible('LANDED')).toBe(false)
    expect(isFightUiVisible('HOOK_ESCAPE')).toBe(false)
  })

  it('only LANDED is result-first', () => {
    expect(isResultFirstPhase('LANDED')).toBe(true)
    expect(isResultFirstPhase('FIGHTING')).toBe(false)
    expect(isResultFirstPhase('HOOK_MISSED')).toBe(false)
  })
})

describe('ResultView', () => {
  const html = renderToStaticMarkup(
    createElement(ResultView, {
      result: {
        speciesId: 'maaji',
        speciesName: 'マアジ',
        lengthCm: 32,
        weightKg: 0.45,
        conditionLabel: '良好',
        rarityLabel: '上位 12%',
        traits: ['trophy'],
        traitLabels: {
          trophy: 'Trophy',
          old: 'Old',
          strong_runner: 'Strong Runner',
          heavy: 'Heavy',
          scarred: 'Scarred',
          aggressive: 'Aggressive',
        },
        firstCatch: true,
        personalBest: true,
        xpGained: 120,
        levelUpTo: 3,
        skillPointsGained: 1,
        catchCount: 2,
      },
      disposed: false,
      onKeep: () => undefined,
      onRelease: () => undefined,
    }),
  )

  it('shows the catch before anything else and keeps Keep/Release right below', () => {
    const order = [
      '釣れた！',
      'マアジ',
      '32 cm',
      '0.450 kg',
      'NEW SPECIES',
      'NEW RECORD',
      '持ち帰る（Fish Box へ）',
      'リリース',
    ]

    let previous = -1

    for (const needle of order) {
      const index = html.indexOf(needle)
      expect(index, `${needle} must appear`).toBeGreaterThan(-1)
      expect(index, `${needle} must come after the previous item`).toBeGreaterThan(previous)
      previous = index
    }
  })

  it('shows the numbers a player wants (length / weight / XP)', () => {
    expect(html).toContain('32')
    expect(html).toContain('0.450 kg')
    expect(html).toContain('+120 XP')
  })

  const baseResult = {
    speciesId: 'sawara',
    speciesName: 'サワラ',
    lengthCm: 70,
    weightKg: 4.2,
    conditionLabel: '良好',
    rarityLabel: '上位 12%',
    traits: [],
    traitLabels: {
      trophy: 'Trophy',
      old: 'Old',
      strong_runner: 'Strong Runner',
      heavy: 'Heavy',
      scarred: 'Scarred',
      aggressive: 'Aggressive',
    },
    firstCatch: false,
    personalBest: false,
    xpGained: 80,
    levelUpTo: null,
    skillPointsGained: 0,
    catchCount: 1,
  }

  it('shows the actual landed zone name as observed context (Phase 19D)', () => {
    const withZone = renderToStaticMarkup(
      createElement(ResultView, {
        result: { ...baseResult, landedZoneName: '水道本流' },
        disposed: false,
        onKeep: () => undefined,
        onRelease: () => undefined,
      }),
    )
    expect(withZone).toContain('水道本流で釣れた')
    // 観測事実のみ — 「潮だから釣れた」のような因果断定は出さない。
    expect(withZone).not.toContain('潮が良かった')
  })

  it('falls back to the plain result when no zone was landed', () => {
    for (const landedZoneName of [null, undefined]) {
      const html = renderToStaticMarkup(
        createElement(ResultView, {
          result: { ...baseResult, landedZoneName },
          disposed: false,
          onKeep: () => undefined,
          onRelease: () => undefined,
        }),
      )
      expect(html).toContain('釣れた！')
      expect(html).not.toContain('で釣れた</p>')
      expect(html).not.toContain('undefined')
    }
  })
})

describe('FishingScreen LANDED layout', () => {
  it('puts the catch result above the battle/supplement content', () => {
    /*
     * 注: SSR（renderToStaticMarkup）では Store の初期状態が使われるため、
     * lastCatch に依存するバッジ（NEW SPECIES 等）は ResultView のテストで確認する。
     * ここでは「DOM 順」と「戦闘 UI が残っていないこと」を見る。
     */
    const html = render('LANDED')

    const resultIndex = html.indexOf('釣れた！')
    const keepIndex = html.indexOf('持ち帰る（Fish Box へ）')
    const recordIndex = html.indexOf('釣果と記録')

    expect(resultIndex).toBeGreaterThan(-1)
    expect(keepIndex).toBeGreaterThan(resultIndex)
    expect(recordIndex).toBeGreaterThan(keepIndex)
    // 魚の名前・サイズが結果カードの中にある。
    expect(html.indexOf('マアジ')).toBeGreaterThan(resultIndex)
    expect(html.indexOf('32 cm')).toBeGreaterThan(resultIndex)
    expect(html.indexOf('リリース')).toBeGreaterThan(resultIndex)
  })

  it('passes the actual landed zone name into the catch result', () => {
    holder.session = {
      ...sessionFor('LANDED'),
      fishingZones: [{ id: 'seam', name: '潮目' }],
      landedZoneName: '潮目',
    }
    const html = renderToStaticMarkup(createElement(FishingScreen, { onExit: () => undefined }))
    expect(html).toContain('潮目で釣れた')
  })

  it('omits the zone line when the session has no landed zone', () => {
    holder.session = { ...sessionFor('LANDED'), landedZoneName: null }
    const html = renderToStaticMarkup(createElement(FishingScreen, { onExit: () => undefined }))
    expect(html).toContain('釣れた！')
    expect(html).not.toContain('で釣れた</p>')
  })

  it('removes the finished battle UI so it cannot cover the result', () => {
    const html = render('LANDED')

    for (const battleText of [
      'Fish stamina',
      'Hook hold',
      'Distance',
      'Drag',
      'AUTO（おまかせ）',
      '強く巻く',
      'ドラグ ＋',
      '魚の様子',
    ]) {
      expect(html, `${battleText} must not be rendered after LANDED`).not.toContain(battleText)
    }

    // 終了後の操作は「もう一度釣る」だけ。
    expect(html).toContain('もう一度釣る')
  })

  it('still shows the fight UI while fighting', () => {
    const html = render('FIGHTING')

    expect(html).toContain('Fish stamina')
    expect(html).toContain('Hook hold')
    expect(html).toContain('AUTO（おまかせ）')
    expect(html).not.toContain('釣れた！')
    expect(html).not.toContain('持ち帰る（Fish Box へ）')
  })

  it('does not leave the fight UI on the failed phases either', () => {
    const html = render('HOOK_MISSED')

    expect(html).toContain('もう一度釣る')
    expect(html).not.toContain('Fish stamina')
    expect(html).not.toContain('Hook hold')
    expect(html).not.toContain('狙う場所')
  })
})
