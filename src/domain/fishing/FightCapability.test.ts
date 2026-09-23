import { describe, expect, it } from 'vitest'
import type {
  HookDefinition,
  LeaderDefinition,
  LineDefinition,
  ReelDefinition,
  RodDefinition,
} from '../gear/Gear'
import { resolveFightCapability } from './FightCapability'
import { resolveFightDemand } from './FightDemand'
import { resolveFightChallenge } from './fightChallenge'
import type { FishBattleProfile } from './battle/BattleStep'
import type { GearId } from '../ids'

const rod = (over: Partial<RodDefinition> = {}): RodDefinition => ({
  id: 'rod' as GearId,
  category: 'rod',
  name: 'rod',
  price: 1000,
  lengthM: 2.4,
  power: 'M',
  action: 'fast',
  minLureWeightG: 5,
  maxLureWeightG: 30,
  recommendedLineMinKg: 2,
  recommendedLineMaxKg: 10,
  weightG: 150,
  sensitivity: 0.5,
  control: 0.5,
  fightingPower: 0.5,
  castingProfile: 0.5,
  ...over,
})

const reel = (over: Partial<ReelDefinition> = {}): ReelDefinition => ({
  id: 'reel' as GearId,
  category: 'reel',
  name: 'reel',
  price: 1000,
  reelType: 'spinning',
  size: 3000,
  gearRatio: 5.6,
  maxDragKg: 8,
  lineCapacity: [
    { lineStrengthKg: 4, capacityM: 200 },
    { lineStrengthKg: 8, capacityM: 150 },
    { lineStrengthKg: 30, capacityM: 300 },
  ],
  retrieveCmPerTurn: 80,
  weightG: 250,
  smoothness: 0.6,
  control: 0.5,
  windingTorque: 0.5,
  ...over,
})

const line = (over: Partial<LineDefinition> = {}): LineDefinition => ({
  id: 'line' as GearId,
  category: 'line',
  name: 'line',
  price: 1000,
  lineType: 'pe',
  strengthKg: 8,
  diameterMm: 0.2,
  stretch: 0.1,
  abrasionResistance: 0.5,
  visibility: 0.6,
  sensitivity: 0.8,
  ...over,
})

const leader = (over: Partial<LeaderDefinition> = {}): LeaderDefinition => ({
  id: 'leader' as GearId,
  category: 'leader',
  name: 'leader',
  price: 1000,
  material: 'fluoro',
  strengthKg: 12,
  diameterMm: 0.4,
  abrasionResistance: 0.8,
  visibility: 0.7,
  lengthM: 2,
  ...over,
})

const hook = (over: Partial<HookDefinition> = {}): HookDefinition => ({
  id: 'hook' as GearId,
  category: 'hook',
  name: 'hook',
  price: 100,
  size: -2,
  strengthKg: 15,
  hookType: 'single',
  penetration: 0.7,
  holdingPower: 0.7,
  ...over,
})

const battleProfile = (over: Partial<FishBattleProfile> = {}): FishBattleProfile => ({
  sizeFactor: 1,
  runTendency: 0.5,
  aggression: 0.5,
  diveTendency: 0.5,
  headShakeTendency: 0.5,
  burstPower: 1,
  endurance: 1,
  hookHoldCapacity: 1,
  ...over,
})

describe('resolveFightCapability', () => {
  it('resolves effective line capacity from the shared resolver', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel(),
      line: line({ strengthKg: 30 }),
      leader: leader({ strengthKg: 40 }),
      hook: hook({ strengthKg: 40 }),
    })

    expect(cap.effectiveLineCapacityM).toBe(300)
    expect(cap.reserveLineM).toBe(30)
  })

  it('reports null capacity when the reel has no capacity table', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel({ lineCapacity: [] }),
      line: line(),
      leader: leader(),
      hook: hook(),
    })

    expect(cap.effectiveLineCapacityM).toBeNull()
  })

  it('weak link is line when line is weakest', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel(),
      line: line({ strengthKg: 3 }),
      leader: leader({ strengthKg: 8 }),
      hook: hook({ strengthKg: 10 }),
    })

    expect(cap.weakLink).toBe('line')
    expect(cap.weakLinkStrengthKg).toBe(3)
    // ラインが最弱点なら margin 削りなし（既存の強度モデルが既に効いている）。
    expect(cap.tensionMarginMultiplier).toBe(1)
  })

  it('weak link is leader when leader is weaker than line', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel(),
      line: line({ strengthKg: 20 }),
      leader: leader({ strengthKg: 8 }),
      hook: hook({ strengthKg: 30 }),
    })

    expect(cap.weakLink).toBe('leader')
    expect(cap.tensionMarginMultiplier).toBeLessThan(1)
    expect(cap.tensionMarginMultiplier).toBeGreaterThanOrEqual(0.7)
  })

  it('weak link is hook when hook is weakest', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel(),
      line: line({ strengthKg: 30 }),
      leader: leader({ strengthKg: 40 }),
      hook: hook({ strengthKg: 6 }),
    })

    expect(cap.weakLink).toBe('hook')
    expect(cap.tensionMarginMultiplier).toBeLessThan(1)
  })

  it('falls back to line abrasion resistance when no leader', () => {
    const cap = resolveFightCapability({
      rod: rod(),
      reel: reel(),
      line: line({ abrasionResistance: 0.4 }),
      leader: null,
      hook: hook(),
    })

    expect(cap.leaderStrengthKg).toBeNull()
    expect(cap.leaderAbrasionResistance).toBe(0.4)
  })
})

describe('resolveFightDemand + resolveFightChallenge', () => {
  const demand = (weightKg: number, over: Partial<FishBattleProfile> = {}) =>
    resolveFightDemand({
      weightKg,
      power: 0.7,
      speed: 0.7,
      staminaMax: 0.8,
      battleProfile: battleProfile(over),
    })

  const lightSetup = resolveFightCapability({
    rod: rod({ fightingPower: 0.3, control: 0.4 }),
    reel: reel({ maxDragKg: 4, windingTorque: 0.3 }),
    line: line({ strengthKg: 3 }),
    leader: leader({ strengthKg: 5 }),
    hook: hook({ strengthKg: 6 }),
  })

  const heavySetup = resolveFightCapability({
    rod: rod({ fightingPower: 0.9, control: 0.8 }),
    reel: reel({ maxDragKg: 25, windingTorque: 0.9, retrieveCmPerTurn: 110 }),
    line: line({ strengthKg: 30 }),
    leader: leader({ strengthKg: 40 }),
    hook: hook({ strengthKg: 35 }),
  })

  it('small fish on a medium setup is easy/manageable', () => {
    const challenge = resolveFightChallenge(demand(2), lightSetup)

    expect(['easy', 'manageable']).toContain(challenge)
  })

  it('30kg fish on light tackle is extreme (not hard-rejected)', () => {
    const challenge = resolveFightChallenge(demand(30), lightSetup)

    expect(challenge).toBe('extreme')
  })

  it('30kg fish on heavy tackle is demanding', () => {
    const challenge = resolveFightChallenge(demand(30), heavySetup)

    expect(challenge).toBe('demanding')
  })

  it('a huge individual on heavy tackle stays extreme', () => {
    const challenge = resolveFightChallenge(
      demand(150, { burstPower: 2.5, endurance: 2, aggression: 0.9 }),
      heavySetup,
    )

    expect(challenge).toBe('extreme')
  })

  it('demand scales sublinearly in massLoad but linearly in demandKg', () => {
    const small = demand(2)
    const big = demand(150)

    expect(big.massLoad / small.massLoad).toBeLessThan(150 / 2)
    expect(big.demandKg).toBeGreaterThan(small.demandKg * 30)
  })
})
