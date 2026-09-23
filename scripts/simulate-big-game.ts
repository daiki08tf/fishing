import { pathToFileURL } from 'node:url'
import { loadFixtureContent, SAMPLE_SPECIES } from '../tests/fixtures/content'
import type { BuiltInContent } from '../src/content/catalog/assembleContent'
import type { GearItem, RodDefinition } from '../src/domain/gear/Gear'
import { FishingEngine, resolveFightCapability } from '../src/domain/fishing'
import { createInitialProgression, resolveFishingModifiers } from '../src/domain/progression'
import { composeFishingModifiers, resolveGearForLoadout, resolveTackle } from '../src/domain/tackle'
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

type Outcome = 'no_bite' | 'hook_missed' | 'hook_escape' | 'line_break' | 'spooled' | 'landed'

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
  readonly spooled: number
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

/**
 * ロッドのパワー帯と「装備の価格帯（0〜1）」から Loadout を組む。
 *
 * 具体 ID を書かず、Content の実スペック（価格・maxDragKg・strengthKg・weightG）から選ぶ。
 * simulate:big-game と simulate:text-battle が同じ物差しを使うために共有する。
 */
export const buildTackleLoadout = (input: {
  readonly content: BuiltInContent
  readonly rodPower: RodDefinition['power']
  readonly gearRatio: number
  /** 部品ごとの percentile override（Spool シナリオなど）。 */
  readonly overrides?: Partial<
    Record<'rod' | 'reel' | 'line' | 'leader' | 'hook' | 'offering', number>
  >
  /**
   * Reel の並べ替え指標。'drag'（既定）は maxDragKg、
   * 'capacity' は容量テーブルの最大容量（小容量リールを選ぶ Spool シナリオ用）。
   */
  readonly reelSort?: 'drag' | 'capacity'
}): Loadout => {
  const rods = input.content.gear.filter((item): item is RodDefinition => item.category === 'rod')
  const reels = input.content.gear.filter((item) => item.category === 'reel')
  const lineGear = input.content.gear.filter((item) => item.category === 'line')
  const leaderGear = input.content.gear.filter((item) => item.category === 'leader')
  const hooks = input.content.gear.filter((item) => item.category === 'hook')
  const lures = input.content.gear.filter((item) => item.category === 'lure')
  const pick = (
    items: readonly GearItem[],
    ratio: number,
    value: (item: GearItem) => number,
  ): GearItem => percentile(items, ratio, value)

  const rodCandidates = rods.filter((rod) => rod.power === input.rodPower)
  const rod = pick(
    rodCandidates.length === 0 ? rods : rodCandidates,
    input.overrides?.rod ?? 0.5,
    (item) => item.price,
  ) as RodDefinition
  const reel = pick(reels, input.overrides?.reel ?? input.gearRatio, (item) =>
    item.category === 'reel'
      ? input.reelSort === 'capacity'
        ? Math.max(0, ...item.lineCapacity.map((entry) => entry.capacityM))
        : item.maxDragKg
      : 0,
  )
  const line = pick(lineGear, input.overrides?.line ?? input.gearRatio, (item) =>
    item.category === 'line' ? item.strengthKg : 0,
  )
  const leader = pick(leaderGear, input.overrides?.leader ?? input.gearRatio, (item) =>
    item.category === 'leader' ? item.strengthKg : 0,
  )
  const hook = pick(hooks, input.overrides?.hook ?? input.gearRatio, (item) =>
    item.category === 'hook' ? item.strengthKg : 0,
  )
  const offeringCandidates = lures.filter(
    (lure) => lure.weightG >= rod.minLureWeightG && lure.weightG <= rod.maxLureWeightG,
  )
  const offering = pick(
    offeringCandidates.length === 0 ? lures : offeringCandidates,
    input.overrides?.offering ?? input.gearRatio,
    (item) => (item.category === 'lure' ? item.weightG : 0),
  )

  return {
    rodId: rod.id,
    reelId: reel.id,
    lineId: line.id,
    leaderId: leader.id,
    hookId: hook.id,
    offeringId: offering.id,
    methodId: 'lure',
  }
}

export const simulateBigGame = (): BigGameResult => {
  const content = loadFixtureContent()
  const lines: string[] = []
  const skill = resolveFishingModifiers({
    skills: createInitialProgression().skills,
    perks: [],
  })

  const buildSetup = (
    label: string,
    rodPower: RodDefinition['power'],
    gearRatio: number,
  ): Setup => {
    return {
      label,
      loadout: buildTackleLoadout({ content, rodPower, gearRatio }),
    }
  }

  const setups: readonly Setup[] = [
    buildSetup('Light', 'L', 0.15),
    buildSetup('Balanced', 'MH', 0.5),
    buildSetup('Heavy', 'XH', 0.95),
    buildSetup('Monster', 'XH', 1),
    {
      // Phase 18: 太いライン（切れにくい）を小容量リールに巻くと
      // ラインを出し尽くす SPOOLED になりやすい構成。
      label: 'Spool',
      loadout: buildTackleLoadout({
        content,
        rodPower: 'XH',
        gearRatio: 0.5,
        reelSort: 'capacity',
        overrides: { reel: 0, line: 1, leader: 0.6, hook: 0.9 },
      }),
    },
  ]

  lines.push('Big Game simulation（Light / Balanced / Heavy / Monster / Spool）')

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
            : snapshot.phase === 'SPOOLED'
              ? 'spooled'
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
      const spooled = records.filter((record) => record.outcome === 'spooled').length
      const hookEscape = records.filter((record) => record.outcome === 'hook_escape').length
      const hookMissed = records.filter((record) => record.outcome === 'hook_missed').length
      const noBite = records.filter((record) => record.outcome === 'no_bite').length
      const landedRecords = records.filter((record) => record.outcome === 'landed')

      result[setup.label] = {
        label: setup.label,
        hooked,
        landed,
        lineBreak,
        spooled,
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

  const SETUP_LABELS = ['Light', 'Balanced', 'Heavy', 'Monster', 'Spool'] as const

  const chinook = runSpecies('chinook-salmon')
  const halibut = runSpecies('pacific-halibut')
  const trevally = runSpecies('giant-trevally')
  const arapaima = runSpecies('arapaima')
  const small = runSpecies(SAMPLE_SPECIES.small)

  const report = (title: string, stats: Readonly<Record<string, Stats>>): void => {
    lines.push('', `=== ${title} ===`)
    lines.push(
      'setup     hook  landed  lineBreak  spooled  escape  missed  noBite  land%(hook)  land/cast  avgTicks  avgLen',
    )

    for (const setup of SETUP_LABELS) {
      const entry = stats[setup]

      if (entry === undefined) {
        continue
      }

      lines.push(
        `${setup.padEnd(9)} ${String(entry.hooked).padStart(4)} ${String(entry.landed).padStart(7)} ` +
          `${String(entry.lineBreak).padStart(10)} ${String(entry.spooled).padStart(8)} ` +
          `${String(entry.hookEscape).padStart(7)} ${String(entry.hookMissed).padStart(7)} ` +
          `${String(entry.noBite).padStart(7)} ` +
          `${(entry.landedRateOfHooked * 100).toFixed(1).padStart(11)}% ` +
          `${(entry.landedPerCast * 100).toFixed(1).padStart(9)}% ${String(entry.avgTicks).padStart(9)} ` +
          `${String(entry.avgLengthCm).padStart(7)}`,
      )
    }
  }

  report(`Chinook Salmon（${String(ATTEMPTS)} fights / setup）`, chinook)
  report(`Pacific Halibut（${String(ATTEMPTS)} fights / setup）`, halibut)
  report(`Giant Trevally（${String(ATTEMPTS)} fights / setup）`, trevally)
  report(`Arapaima / extreme（${String(ATTEMPTS)} fights / setup）`, arapaima)
  report(`Small fish（${String(ATTEMPTS)} fights / setup）`, small)

  /*
   * Phase 18: 容量制約のスプールシナリオ。
   * 実在する最小容量リール（約 150m）では強タックルのファイトが先に終わるため、
   * 物理ライン管理の終端（SPOOLED）は「小容量の FightCapability を与えた
   * 強タックル」で検証する。強いライン/リーダー/フックのまま
   * 容量だけを絞るので、LINE_BREAK ではなく SPOOLED で終わるはず。
   */
  const SPOOL_ATTEMPTS = 40
  const SPOOL_CAPACITY_M = 45

  const runSpoolScenario = (
    speciesId: string,
  ): { readonly spooled: number; readonly other: number } => {
    const species = content.speciesById[speciesId]

    if (species === undefined) {
      throw new Error(`missing species: ${speciesId}`)
    }

    const loadout = buildTackleLoadout({ content, rodPower: 'XH', gearRatio: 1 })
    const castingGear = resolveGearForLoadout(loadout, content.gear)
    const tackle = resolveTackle({ loadout, gear: content.gear, methods: content.methods, species })

    if (castingGear === null || tackle === null) {
      throw new Error(`could not resolve spool-scenario tackle for ${speciesId}`)
    }

    const capability = {
      ...resolveFightCapability(castingGear),
      effectiveLineCapacityM: SPOOL_CAPACITY_M,
      reserveLineM: 10,
    }
    const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)

    let spooled = 0
    let other = 0

    for (let index = 0; index < SPOOL_ATTEMPTS; index += 1) {
      const engine = new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: `spool#${speciesId}#${String(index)}`,
        playerModifiers: modifiers,
        encounterProfile: tackle.encounterProfile,
        fightCapability: capability,
      })
      runFishingToTerminal(engine, 'balanced')

      if (engine.snapshot().phase === 'SPOOLED') {
        spooled += 1
      } else {
        other += 1
      }
    }

    return { spooled, other }
  }

  const spoolHalibut = runSpoolScenario('pacific-halibut')
  const spoolArapaima = runSpoolScenario('arapaima')

  lines.push(
    '',
    `=== Spool scenario（容量 ${String(SPOOL_CAPACITY_M)}m / ${String(SPOOL_ATTEMPTS)} fights each） ===`,
  )
  lines.push(
    `  halibut : spooled=${String(spoolHalibut.spooled)} other=${String(spoolHalibut.other)}`,
  )
  lines.push(
    `  arapaima: spooled=${String(spoolArapaima.spooled)} other=${String(spoolArapaima.other)}`,
  )

  const lightC = chinook['Light'] as Stats
  const balancedC = chinook['Balanced'] as Stats
  const heavyC = chinook['Heavy'] as Stats
  const lightH = halibut['Light'] as Stats
  const balancedH = halibut['Balanced'] as Stats
  const heavyH = halibut['Heavy'] as Stats
  const lightT = trevally['Light'] as Stats
  const monsterT = trevally['Monster'] as Stats
  const lightA = arapaima['Light'] as Stats
  const monsterA = arapaima['Monster'] as Stats
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
      label: 'Giant Trevally: Monster は Light より着地率が高い',
      ok: monsterT.landedRateOfHooked >= lightT.landedRateOfHooked + 0.1,
    },
    {
      label: 'Extreme（Arapaima）: Monster でも 100% にはならない',
      ok: monsterA.landed < ATTEMPTS,
    },
    {
      label: 'Extreme（Arapaima）: Light は Monster より失敗が多い',
      ok: lightA.landedRateOfHooked <= monsterA.landedRateOfHooked,
    },
    {
      label: 'SPOOLED は独立した負け筋として発生する（容量制約シナリオ）',
      ok: spoolHalibut.spooled + spoolArapaima.spooled > 0,
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

  const again = runSpecies('chinook-salmon')
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
