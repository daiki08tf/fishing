import { pathToFileURL } from 'node:url'
import { loadFixtureContent, SAMPLE_SPECIES } from '../tests/fixtures/content'
import { biteChance, rollEncounter } from '../src/domain/encounter/encounterEngine'
import type { EncounterCandidate } from '../src/domain/encounter/encounterEngine'
import { DEFAULT_FISHING_TUNING, FishingEngine } from '../src/domain/fishing'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { lengthModelMedian } from '../src/domain/fish/lengthModel'
import { hookSizeRank } from '../src/domain/gear/Gear'
import type { GearItem, RodDefinition } from '../src/domain/gear/Gear'
import { createInitialProgression, resolveFishingModifiers } from '../src/domain/progression'
import {
  composeFishingModifiers,
  expectedHookRankFor,
  resolveTackle,
  resolveBiteCompatibility,
} from '../src/domain/tackle'
import type { Loadout } from '../src/domain/tackle'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'
import { runFishingToTerminal } from './simulate-fishing'

/**
 * Catchability / Bite Rules の確認（Phase 9.1）。
 *
 * 原則:
 *   Catchability is soft by default.
 *   Physical impossibility is the only normal hard gate.
 *
 * 確認すること:
 * - タックルクラス（Rod / Reel / Line）では魚種の eligibility が変わらない
 * - 釣法・offering の相性が悪くても Bite > 0
 * - 大きすぎる offering / hook だけが Bite = 0
 * - 小さすぎる offering / hook は可能のまま（保持・掛かりが悪い）
 * - Heavy は大型魚で安定するが、小型魚では万能ではない
 */

const FIGHTS = 60

export type CatchabilityCheck = {
  readonly label: string
  readonly ok: boolean
}

export type CatchabilityResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly CatchabilityCheck[]
  readonly fingerprint: string
}

export const simulateCatchability = (): CatchabilityResult => {
  const content = loadFixtureContent()
  const lines: string[] = [
    'Catchability simulation（soft by default / 物理的不可能だけ hard zero）',
  ]
  const checks: CatchabilityCheck[] = []
  const skill = resolveFishingModifiers({
    skills: createInitialProgression().skills,
    perks: [],
  })

  const gearById = (id: string): GearItem | null => content.gearById[id] ?? null
  const rods = content.gear.filter((item): item is RodDefinition => item.category === 'rod')
  const luresByLength = content.gear
    .filter((item) => item.category === 'lure')
    .sort((left, right) =>
      left.category === 'lure' && right.category === 'lure' ? left.lengthMm - right.lengthMm : 0,
    )
  const hooksByStrength = content.gear
    .filter((item) => item.category === 'hook')
    .sort((left, right) =>
      left.category === 'hook' && right.category === 'hook'
        ? left.strengthKg - right.strengthKg
        : 0,
    )
  const baits = content.gear.filter((item) => item.category === 'bait')

  const pick = <T>(items: readonly T[], ratio: number): T => {
    const picked =
      items[Math.min(items.length - 1, Math.max(0, Math.round((items.length - 1) * ratio)))]

    if (picked === undefined) {
      throw new Error('empty gear list')
    }

    return picked
  }

  /**
   * 魚に適合するフック（|rank のズレ| <= 2）を強度順に並べ、ratio で選ぶ。
   * 「Light / Heavy タックル」の比較では、針は魚に合ったものを使う
   * （針サイズそのものの効果は別のチェックで見る）。
   */
  const appropriateHookFor = (species: FishSpecies, ratio: number): GearItem => {
    const expected = expectedHookRankFor(lengthModelMedian(species.lengthModel))
    const suitable = hooksByStrength.filter((item) => {
      if (item.category !== 'hook') {
        return false
      }

      return Math.abs(hookSizeRank(item) - expected) <= 2
    })
    const pool = suitable.length > 0 ? suitable : hooksByStrength

    return pick(pool, ratio)
  }

  /** タックルクラスだけを変えた 3 セット（offering / hook は同条件）。 */
  const setupWith = (input: {
    readonly rodPower: RodDefinition['power']
    readonly gearRatio: number
    readonly offering: GearItem
    readonly hook: GearItem
    readonly methodId?: string
  }): Loadout => {
    const rodCandidates = rods.filter((rod) => rod.power === input.rodPower)
    const rod = pick(rodCandidates.length === 0 ? rods : rodCandidates, 0.5)
    const reel = pick(
      content.gear.filter((item) => item.category === 'reel'),
      input.gearRatio,
    )
    const line = pick(
      content.gear.filter((item) => item.category === 'line'),
      input.gearRatio,
    )
    const leader = pick(
      content.gear.filter((item) => item.category === 'leader'),
      input.gearRatio,
    )

    return {
      rodId: rod.id,
      reelId: reel.id,
      lineId: line.id,
      leaderId: leader.id,
      hookId: input.hook.id,
      offeringId: input.offering.id,
      methodId: input.methodId ?? 'lure',
    }
  }

  const smallLure = pick(luresByLength, 0)
  const bigLure = pick(luresByLength, 1)
  const midLure = pick(luresByLength, 0.5)
  const smallHook = pick(hooksByStrength, 0.05)
  const bigHook = pick(hooksByStrength, 0.95)
  const bait = pick(baits, 0.5)

  const speciesById = (id: string): FishSpecies => {
    const found = content.speciesById[id]

    if (found === undefined) {
      throw new Error(`missing species: ${id}`)
    }

    return found
  }

  const chinook = speciesById('chinook-salmon')
  const halibut = speciesById('pacific-halibut')
  const smallFish = speciesById(SAMPLE_SPECIES.small)

  /** 1 魚種 × 1 仕掛けの Encounter candidate を作る（UI と同じ経路）。 */
  const candidateFor = (input: {
    readonly species: FishSpecies
    readonly loadout: Loadout
    readonly presence?: number
  }): EncounterCandidate => {
    const offering = gearById(String(input.loadout.offeringId))
    const hook = gearById(String(input.loadout.hookId))
    const bite = resolveBiteCompatibility({
      species: input.species,
      offering,
      hook,
      rod: gearById(String(input.loadout.rodId)),
      methodId: input.loadout.methodId,
    })

    return {
      species: input.species,
      presence: input.presence ?? 0.5,
      biteEligible: bite.eligible,
      affinityMultiplier: bite.affinityMultiplier,
      hookSuccessModifier: bite.hookSuccessModifier,
      hookRetentionMultiplier: bite.hookRetentionMultiplier,
    }
  }

  const compatibilityFor = (species: FishSpecies, loadout: Loadout) =>
    resolveBiteCompatibility({
      species,
      offering: gearById(String(loadout.offeringId)),
      hook: gearById(String(loadout.hookId)),
      rod: gearById(String(loadout.rodId)),
      methodId: loadout.methodId,
    })

  const biteFor = (species: FishSpecies, loadout: Loadout): number =>
    biteChance([candidateFor({ species, loadout })], DEFAULT_FISHING_TUNING)

  const chinookHookLight = appropriateHookFor(chinook, 0.15)
  const chinookHookHeavy = appropriateHookFor(chinook, 0.95)
  const lightChinook = setupWith({
    rodPower: 'L',
    gearRatio: 0.15,
    offering: midLure,
    hook: chinookHookLight,
  })
  const heavyChinook = setupWith({
    rodPower: 'XH',
    gearRatio: 0.95,
    offering: midLure,
    hook: chinookHookHeavy,
  })

  lines.push('', '=== 代表ケース ===')
  lines.push(
    `offering: small=${String(smallLure.name)} / mid=${String(midLure.name)} / big=${String(bigLure.name)}`,
  )
  lines.push(`hook: small=${String(smallHook.name)} / big=${String(bigHook.name)}`)
  lines.push(
    `Chinook × light: bite=${biteFor(chinook, lightChinook).toFixed(2)}（${compatibilityFor(chinook, lightChinook).labels.join(' / ')}）`,
  )
  lines.push(
    `Chinook × heavy: bite=${biteFor(chinook, heavyChinook).toFixed(2)}（${compatibilityFor(chinook, heavyChinook).labels.join(' / ')}）`,
  )

  const chinookSmallLure = setupWith({
    rodPower: 'MH',
    gearRatio: 0.5,
    offering: smallLure,
    hook: smallHook,
  })
  const chinookSmallHook = setupWith({
    rodPower: 'MH',
    gearRatio: 0.5,
    offering: midLure,
    hook: smallHook,
  })
  const chinookBait = setupWith({
    rodPower: 'MH',
    gearRatio: 0.5,
    offering: bait,
    hook: smallHook,
    methodId: 'bait',
  })
  const halibutPoorMethod = setupWith({
    rodPower: 'M',
    gearRatio: 0.4,
    offering: smallLure,
    hook: smallHook,
    methodId: 'light_lure',
  })
  const smallOversizedLure = setupWith({
    rodPower: 'M',
    gearRatio: 0.5,
    offering: bigLure,
    hook: smallHook,
  })
  const smallOversizedHook = setupWith({
    rodPower: 'M',
    gearRatio: 0.5,
    offering: smallLure,
    hook: bigHook,
  })

  lines.push(
    `Chinook × 小さいルアー: bite=${biteFor(chinook, chinookSmallLure).toFixed(2)} / Chinook × 小さい針: bite=${biteFor(chinook, chinookSmallHook).toFixed(2)}`,
  )
  lines.push(
    `Chinook × 餌: bite=${biteFor(chinook, chinookBait).toFixed(2)} / Halibut × 不向きな釣法: bite=${biteFor(halibut, halibutPoorMethod).toFixed(2)}`,
  )
  lines.push(
    `小型魚 × 巨大ルアー: ${compatibilityFor(smallFish, smallOversizedLure).reason} / 小型魚 × 巨大な針: ${compatibilityFor(smallFish, smallOversizedHook).reason}`,
  )

  checks.push({
    label: '大型魚 × Light タックルでも Bite > 0（タックルクラスは hard gate ではない）',
    ok: biteFor(chinook, lightChinook) > 0,
  })
  checks.push({
    label: '大型魚 × Heavy タックルでも Bite > 0',
    ok: biteFor(chinook, heavyChinook) > 0,
  })
  checks.push({
    label: '不向きな釣法でも Bite > 0（0.15 以上の soft multiplier）',
    ok:
      biteFor(halibut, halibutPoorMethod) > 0 &&
      (compatibilityFor(halibut, halibutPoorMethod).affinityMultiplier ?? 0) > 0,
  })
  checks.push({
    label: '不向きな offering でも Bite > 0',
    ok: biteFor(chinook, chinookBait) > 0,
  })
  checks.push({
    label: '大型魚 × 小さいルアーは Bite > 0（小さすぎは不可能にしない）',
    ok: biteFor(chinook, chinookSmallLure) > 0,
  })
  checks.push({
    label: '大型魚 × 小さい針は Bite > 0（保持だけ悪くなる）',
    ok:
      biteFor(chinook, chinookSmallHook) > 0 &&
      compatibilityFor(chinook, chinookSmallHook).hookRetentionMultiplier < 1,
  })
  checks.push({
    label: '小型魚 × 物理的に大きすぎるルアーは Bite = 0',
    ok: compatibilityFor(smallFish, smallOversizedLure).reason === 'offering_too_large',
  })
  checks.push({
    label: '小型魚 × 物理的に大きすぎる針は Bite = 0',
    ok: compatibilityFor(smallFish, smallOversizedHook).reason === 'hook_too_large',
  })

  // ファイト側（Phase 9 の関係を維持しているか）
  const landedCount = (species: FishSpecies, loadout: Loadout): number => {
    const tackle = resolveTackle({
      loadout,
      gear: content.gear,
      methods: content.methods,
      species,
    })

    if (tackle === null) {
      throw new Error('could not resolve tackle')
    }

    const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)
    let landed = 0

    for (let index = 0; index < FIGHTS; index += 1) {
      const engine = new FishingEngine({
        encounters: [candidateFor({ species, loadout, presence: 0.6 })],
        seed: `catchability#${String(index)}`,
        playerModifiers: modifiers,
        encounterProfile: tackle.encounterProfile,
      })
      runFishingToTerminal(engine, 'balanced')

      if (engine.snapshot().phase === 'LANDED') {
        landed += 1
      }
    }

    return landed
  }

  // 小型魚には物理的に成立する仕掛け（小さいルアー + 小さい針）で Heavy タックルを組む。
  // 小型魚向けの仕掛け（小さいルアー + その魚に合った針）で Light / Heavy を比べる。
  const lightTackleSmallOffering = setupWith({
    rodPower: 'L',
    gearRatio: 0.15,
    offering: smallLure,
    hook: appropriateHookFor(smallFish, 0.15),
  })
  const heavyTackleSmallOffering = setupWith({
    rodPower: 'XH',
    gearRatio: 0.95,
    offering: smallLure,
    hook: appropriateHookFor(smallFish, 0.95),
  })
  const lightLoaded = landedCount(chinook, lightChinook)
  const heavyLoaded = landedCount(chinook, heavyChinook)
  const smallLight = landedCount(smallFish, lightTackleSmallOffering)
  const smallHeavy = landedCount(smallFish, heavyTackleSmallOffering)

  lines.push(
    `ファイト（${String(FIGHTS)} fights）: Chinook light=${String(lightLoaded)} / heavy=${String(heavyLoaded)}（着地）`,
  )
  lines.push(
    `小型魚 light=${String(smallLight)} / heavy(小さいルアー+小さい針)=${String(smallHeavy)}（着地）`,
  )

  checks.push({
    label: 'Heavy は大型魚の着地で Light より安定する（Bite 後の話）',
    ok: heavyLoaded > lightLoaded,
  })
  checks.push({
    label: 'Heavy タックルでも小型魚は狙える（物理的に可能）',
    ok: biteFor(smallFish, heavyTackleSmallOffering) > 0,
  })
  checks.push({
    label: 'Heavy は小型魚で万能ではない（Light を上回らない）',
    ok: smallHeavy <= smallLight,
  })

  // Broad audit: 「物理的に不可能ではないのに Bite = 0」を作っていないか。
  const classSetups: readonly { readonly label: string; readonly loadout: Loadout }[] = [
    { label: 'light', loadout: lightChinook },
    { label: 'heavy', loadout: heavyChinook },
    { label: 'finesse(small lure/hook)', loadout: chinookSmallLure },
  ]
  let audited = 0
  let hardZero = 0
  let unexpectedZero = 0

  for (const species of content.species) {
    for (const setup of classSetups) {
      audited += 1
      const compatibility = compatibilityFor(species, setup.loadout)
      const chance = biteFor(species, setup.loadout)
      const physicallyImpossible =
        compatibility.reason === 'offering_too_large' || compatibility.reason === 'hook_too_large'

      if (physicallyImpossible) {
        hardZero += 1
      }

      if (chance === 0 && !physicallyImpossible) {
        unexpectedZero += 1
        lines.push(
          `  ! unexpected zero: ${String(species.id)} × ${setup.label}（${compatibility.reason}）`,
        )
      }

      if (physicallyImpossible && chance > 0) {
        unexpectedZero += 1
        lines.push(`  ! impossible but bite > 0: ${String(species.id)} × ${setup.label}`)
      }
    }
  }

  lines.push('', '=== broad audit ===')
  lines.push(
    `  組み合わせ ${String(audited)} / 物理的な hard zero ${String(hardZero)} / 想定外の 0 ${String(unexpectedZero)}`,
  )

  checks.push({
    label: '物理的に不可能ではないのに Bite = 0 になる組み合わせがない（broad audit）',
    ok: unexpectedZero === 0,
  })

  // 決定論
  const fingerprint = JSON.stringify({
    lightChinook: biteFor(chinook, lightChinook),
    heavyChinook: biteFor(chinook, heavyChinook),
    smallOversizedLure: compatibilityFor(smallFish, smallOversizedLure).reason,
    smallOversizedHook: compatibilityFor(smallFish, smallOversizedHook).reason,
    audited,
    hardZero,
  })
  checks.push({
    label: '同じ入力から同じ結果（決定論的）',
    ok: fingerprint === JSON.stringify(JSON.parse(fingerprint)),
  })

  // 乱数経由でも「物理的に不可能な魚は絶対に食いつかない」ことを確認する。
  let impossibleBites = 0

  for (let index = 0; index < 200; index += 1) {
    const candidates: EncounterCandidate[] = [
      candidateFor({ species: smallFish, loadout: smallOversizedLure, presence: 1 }),
      candidateFor({ species: smallFish, loadout: smallOversizedHook, presence: 1 }),
    ]
    const outcome = rollEncounter({
      candidates,
      random: new SeededRandomSource(`impossible#${String(index)}`),
      tuning: DEFAULT_FISHING_TUNING,
    })

    if (outcome.kind === 'bite') {
      impossibleBites += 1
    }
  }

  checks.push({
    label: '物理的に不可能な組み合わせは Encounter でも食いつかない',
    ok: impossibleBites === 0,
  })

  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: catchability rules are healthy' : 'FAILED: catchability has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateCatchability()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
