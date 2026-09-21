import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import type { GearItem, RodDefinition } from '../src/domain/gear/Gear'
import { FishingEngine } from '../src/domain/fishing'
import { createInitialProgression, resolveFishingModifiers } from '../src/domain/progression'
import { composeFishingModifiers, resolveTackle } from '../src/domain/tackle'
import type { Loadout } from '../src/domain/tackle'
import { runFishingToTerminal } from './simulate-fishing'

/**
 * 大型魚のファイト比較（Phase 9）。
 *
 *   Light / Balanced / Heavy のタックルで Chinook / Halibut を多数回ファイトし、
 *   着地率・ラインブレイク率・フックアウト率・平均 tick を比較する。
 *
 * 期待:
 * - 大型魚では Heavy > Balanced > Light（着地の安定度）
 * - 小型魚では Heavy が万能ではない（軽いタックルの方が掛けて獲れる）
 * - 0% / 100% に張り付かない（理論上は軽くても獲れる）
 *
 * 装備はすべて既存の Gear catalog から実スペックで選ぶ（具体 ID の分岐はしない）。
 */

const ATTEMPTS = 200

export type BigGameCheck = {
  readonly label: string
  readonly ok: boolean
}

export type BigGameResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly BigGameCheck[]
  readonly fingerprint: string
}

type Outcome = 'no_bite' | 'hook_missed' | 'hook_escape' | 'line_break' | 'landed'

type FightRecord = {
  readonly outcome: Outcome
  readonly ticks: number
  readonly lengthCm: number
}

type Setup = {
  readonly label: string
  readonly loadout: Loadout
}

type Stats = {
  readonly label: string
  readonly hooked: number
  readonly landed: number
  readonly lineBreak: number
  readonly hookEscape: number
  readonly hookMissed: number
  readonly noBite: number
  readonly avgTicks: number
  readonly avgLengthCm: number
  readonly landedRateOfHooked: number
  readonly landedPerCast: number
}

const percentile = <T>(items: readonly T[], ratio: number, value: (item: T) => number): T => {
  const sorted = [...items].sort((left, right) => value(left) - value(right))
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))

  return sorted[index] as T
}

export const simulateBigGame = (): BigGameResult => {
  const content = loadContentFromDirectory()
  const lines: string[] = []
  const skill = resolveFishingModifiers({
    skills: createInitialProgression().skills,
    perks: [],
  })

  const rods = content.gear.filter((item): item is RodDefinition => item.category === 'rod')
  const reels = content.gear.filter((item) => item.category === 'reel')
  const lineGear = content.gear.filter((item) => item.category === 'line')
  const leaderGear = content.gear.filter((item) => item.category === 'leader')
  const hooks = content.gear.filter((item) => item.category === 'hook')
  const lures = content.gear.filter((item) => item.category === 'lure')
  const pick = (
    items: readonly GearItem[],
    ratio: number,
    value: (item: GearItem) => number,
  ): GearItem => percentile(items, ratio, value)

  const rodFor = (power: RodDefinition['power']): RodDefinition => {
    const candidates = rods.filter((rod) => rod.power === power)
    return pick(
      candidates.length === 0 ? rods : candidates,
      0.5,
      (item) => item.price,
    ) as RodDefinition
  }
  const offeringFor = (rod: RodDefinition, ratio: number): GearItem => {
    const candidates = lures.filter(
      (lure) => lure.weightG >= rod.minLureWeightG && lure.weightG <= rod.maxLureWeightG,
    )
    const pool = candidates.length === 0 ? lures : candidates
    return pick(pool, ratio, (item) => (item.category === 'lure' ? item.weightG : 0))
  }

  const buildSetup = (
    label: string,
    rodPower: RodDefinition['power'],
    gearRatio: number,
  ): Setup => {
    const rod = rodFor(rodPower)
    const reel = pick(reels, gearRatio, (item) => (item.category === 'reel' ? item.maxDragKg : 0))
    const line = pick(lineGear, gearRatio, (item) =>
      item.category === 'line' ? item.strengthKg : 0,
    )
    const leader = pick(leaderGear, gearRatio, (item) =>
      item.category === 'leader' ? item.strengthKg : 0,
    )
    const hook = pick(hooks, gearRatio, (item) => (item.category === 'hook' ? item.strengthKg : 0))
    const offering = offeringFor(rod, gearRatio)

    return {
      label,
      loadout: {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: offering.id,
        methodId: 'lure',
      },
    }
  }

  const setups: readonly Setup[] = [
    buildSetup('Light', 'L', 0.15),
    buildSetup('Balanced', 'MH', 0.5),
    buildSetup('Heavy', 'XH', 0.95),
  ]

  lines.push('Big Game simulation（Light / Balanced / Heavy）')

  const runSpecies = (speciesId: string): Readonly<Record<string, Stats>> => {
    const species = content.speciesById[speciesId]

    if (species === undefined) {
      throw new Error(`missing species: ${speciesId}`)
    }

    const result: Record<string, Stats> = {}

    for (const setup of setups) {
      const tackle = resolveTackle({
        loadout: setup.loadout,
        gear: content.gear,
        methods: content.methods,
        species,
      })

      if (tackle === null) {
        throw new Error(`could not resolve tackle for ${setup.label}`)
      }

      const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)
      const records: FightRecord[] = []

      for (let index = 0; index < ATTEMPTS; index += 1) {
        const engine = new FishingEngine({
          // Spot の basePresence 相当（1.0 にすると必ずアタルため、現実的な値にする）。
          encounters: [{ species, presence: 0.5 }],
          seed: `${speciesId}#${setup.label}#${String(index)}`,
          playerModifiers: modifiers,
          // バイト（Encounter）も装備の影響を受ける（ラインの太さ・offering の相性）。
          encounterProfile: tackle.encounterProfile,
        })
        runFishingToTerminal(engine, 'balanced')

        const snapshot = engine.snapshot()
        const individual = snapshot.fish?.individual
        const outcome: Outcome =
          snapshot.phase === 'LINE_BREAK'
            ? 'line_break'
            : snapshot.phase === 'LANDED'
              ? 'landed'
              : snapshot.phase === 'HOOK_ESCAPE'
                ? 'hook_escape'
                : snapshot.phase === 'HOOK_MISSED'
                  ? 'hook_missed'
                  : 'no_bite'

        records.push({
          outcome,
          ticks: snapshot.totalTicks,
          lengthCm: individual?.lengthCm ?? 0,
        })
      }

      const hooked = records.filter((record) => record.outcome !== 'no_bite').length
      const landed = records.filter((record) => record.outcome === 'landed').length
      const lineBreak = records.filter((record) => record.outcome === 'line_break').length
      const hookEscape = records.filter((record) => record.outcome === 'hook_escape').length
      const hookMissed = records.filter((record) => record.outcome === 'hook_missed').length
      const noBite = records.filter((record) => record.outcome === 'no_bite').length
      const landedRecords = records.filter((record) => record.outcome === 'landed')

      result[setup.label] = {
        label: setup.label,
        hooked,
        landed,
        lineBreak,
        hookEscape,
        hookMissed,
        noBite,
        avgTicks:
          records.length === 0
            ? 0
            : Math.round(records.reduce((sum, record) => sum + record.ticks, 0) / records.length),
        avgLengthCm:
          landedRecords.length === 0
            ? 0
            : Math.round(
                (landedRecords.reduce((sum, record) => sum + record.lengthCm, 0) /
                  landedRecords.length) *
                  10,
              ) / 10,
        landedRateOfHooked: hooked === 0 ? 0 : Math.round((landed / hooked) * 1000) / 1000,
        landedPerCast: Math.round((landed / ATTEMPTS) * 1000) / 1000,
      }
    }

    return result
  }

  const chinook = runSpecies('alaska-chinook-salmon')
  const halibut = runSpecies('alaska-pacific-halibut')
  const small = runSpecies('phase1-sample-fish')

  const report = (title: string, stats: Readonly<Record<string, Stats>>): void => {
    lines.push('', `=== ${title} ===`)
    lines.push(
      'setup     hook  landed  lineBreak  escape  missed  noBite  land%(hook)  land/cast  avgTicks  avgLen',
    )

    for (const setup of ['Light', 'Balanced', 'Heavy']) {
      const entry = stats[setup]

      if (entry === undefined) {
        continue
      }

      lines.push(
        `${setup.padEnd(9)} ${String(entry.hooked).padStart(4)} ${String(entry.landed).padStart(7)} ` +
          `${String(entry.lineBreak).padStart(10)} ${String(entry.hookEscape).padStart(7)} ` +
          `${String(entry.hookMissed).padStart(7)} ${String(entry.noBite).padStart(7)} ` +
          `${(entry.landedRateOfHooked * 100).toFixed(1).padStart(11)}% ` +
          `${(entry.landedPerCast * 100).toFixed(1).padStart(9)}% ${String(entry.avgTicks).padStart(9)} ` +
          `${String(entry.avgLengthCm).padStart(7)}`,
      )
    }
  }

  report(`Chinook Salmon（${String(ATTEMPTS)} fights / setup）`, chinook)
  report(`Pacific Halibut（${String(ATTEMPTS)} fights / setup）`, halibut)
  report(`Small fish（${String(ATTEMPTS)} fights / setup）`, small)

  const lightC = chinook['Light'] as Stats
  const balancedC = chinook['Balanced'] as Stats
  const heavyC = chinook['Heavy'] as Stats
  const lightH = halibut['Light'] as Stats
  const balancedH = halibut['Balanced'] as Stats
  const heavyH = halibut['Heavy'] as Stats
  const lightS = small['Light'] as Stats
  const heavyS = small['Heavy'] as Stats

  const checks: BigGameCheck[] = [
    {
      label: 'Chinook: Heavy は Light より明確に着地率が高い（+15pt 以上）',
      ok: heavyC.landedRateOfHooked >= lightC.landedRateOfHooked + 0.15,
    },
    {
      label: 'Chinook: Light は Heavy よりラインブレイクが多い',
      ok: lightC.lineBreak > heavyC.lineBreak,
    },
    {
      label: 'Chinook: Balanced は Light と Heavy の間にある',
      ok:
        balancedC.landedRateOfHooked >= lightC.landedRateOfHooked &&
        balancedC.landedRateOfHooked <= heavyC.landedRateOfHooked + 0.05,
    },
    {
      label: 'Halibut: Heavy は Light より明確に着地率が高い',
      ok: heavyH.landedRateOfHooked >= lightH.landedRateOfHooked + 0.15,
    },
    {
      label: 'Halibut: Light は Heavy よりラインブレイクが多い',
      ok: lightH.lineBreak > heavyH.lineBreak,
    },
    {
      label: 'Halibut: Balanced は Light と Heavy の間にある',
      ok:
        balancedH.landedRateOfHooked >= lightH.landedRateOfHooked &&
        balancedH.landedRateOfHooked <= heavyH.landedRateOfHooked + 0.05,
    },
    {
      label: '小型魚: Heavy は万能ではない（Light の land/cast 以上にはならない）',
      ok: heavyS.landedPerCast <= lightS.landedPerCast,
    },
    {
      label: '0% / 100% に張り付かない（Light でも大型を獲れる余地がある）',
      ok: lightC.landed > 0 && heavyC.landed < ATTEMPTS,
    },
  ]

  const again = runSpecies('alaska-chinook-salmon')
  const fingerprint = JSON.stringify(chinook)
  const deterministic = fingerprint === JSON.stringify(again)

  checks.push({
    label: '同じ入力から同じ結果（決定論的）',
    ok: deterministic,
  })

  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push(
    '',
    allOk ? 'OK: big game balance is healthy' : 'FAILED: big game balance has problems',
  )

  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateBigGame()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
