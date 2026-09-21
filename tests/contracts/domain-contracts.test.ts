import { describe, expect, it } from 'vitest'
import {
  asFishIndividualId,
  asFishSpeciesId,
  asFishingSpotId,
  asGearId,
  asJobId,
  asRegionId,
  asRegulationId,
  asSourceRefId,
  asTransportId,
} from '../../src/domain/ids'
import type { AccessRequirement } from '../../src/domain/access/AccessRequirement'
import type { Transport } from '../../src/domain/access/Transport'
import type { CareerState } from '../../src/domain/career/CareerState'
import type { JobDefinition } from '../../src/domain/career/JobDefinition'
import type { FinanceState } from '../../src/domain/economy/FinanceState'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import type { FishSpecies } from '../../src/domain/fish/FishSpecies'
import type { GearItem } from '../../src/domain/gear/Gear'
import type { KnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import type { PlayerProgression } from '../../src/domain/progression/PlayerProgression'
import type { Regulation } from '../../src/domain/regulation/Regulation'
import type { SourceRef } from '../../src/domain/source/SourceRef'
import type { FishingSpot } from '../../src/domain/world/FishingSpot'
import type { Region } from '../../src/domain/world/Region'

/**
 * コア契約が strict TypeScript で成立することを示す。
 *
 * ここで構築するのは構造のサンプルであり、ゲームバランスの値ではない。
 * 型が壊れた場合はコンパイルが失敗する（テストの実行より前に検出される）。
 */

const source: SourceRef = {
  id: asSourceRefId('fixture-source'),
  title: '検証用ダミー出典',
  url: 'https://example.invalid/fixture',
  verifiedAt: '2026-01-01',
}

const region: Region = {
  id: asRegionId('fixture-region'),
  name: '検証用ダミー地域',
  type: 'area',
}

const species: FishSpecies = {
  id: asFishSpeciesId('fixture-species'),
  japaneseName: '検証用ダミー種',
  taxonomy: { family: 'fixture-family' },
  waterTypes: ['salt'],
  distribution: [region.id],
  habitats: ['fixture-habitat'],
  depthRange: { min: 1, max: 20 },
  seasonality: { months: [4, 5, 6] },
  timeActivity: { periods: ['dawn', 'evening'] },
  tidePreference: { preference: 'rising' },
  currentPreference: { preference: 'moderate' },
  lengthModel: { meanCm: 24, standardDeviationCm: 4, minCm: 10, maxCm: 52 },
  weightModel: { lengthWeightA: 0.008, lengthWeightB: 3.02 },
  fightProfile: { strength: 0.4, stamina: 0.35, speed: 0.55 },
  rarity: 1,
  sourceRefs: [source],
}

const individual: FishIndividual = {
  id: asFishIndividualId('fixture-individual'),
  speciesId: species.id,
  lengthCm: 31.5,
  weightKg: 0.42,
  condition: 0.8,
  traits: ['trophy', 'heavy'],
  fightSeed: 'fixture-fight-seed',
  spotId: asFishingSpotId('fixture-spot'),
  percentile: 3.2,
}

const access: readonly AccessRequirement[] = [
  { kind: 'transport', tag: 'train' },
  { kind: 'knowledge', minimum: 20 },
  { kind: 'reputation', minimum: 5 },
]

const spot: FishingSpot = {
  id: asFishingSpotId('fixture-spot'),
  name: '検証用ダミー釣り場',
  regionId: region.id,
  environment: 'fixture-environment',
  access,
  habitatTags: ['fixture-habitat'],
  depth: { depthRangeM: { min: 1, max: 8 } },
  fishTable: [{ speciesId: species.id, basePresence: 1 }],
  regulations: [asRegulationId('fixture-regulation')],
  knowledgeConfig: { reveals: [{ field: 'depth', minKnowledge: 20 }] },
  sourceRefs: [source],
}

const transport: Transport = {
  id: asTransportId('fixture-transport'),
  name: '検証用ダミー移動手段',
  type: 'car',
  purchaseCost: 1_200_000,
  runningCost: 8_000,
  cargoCapacity: 4,
  range: 400,
  accessTags: ['car', 'parking'],
}

const progression: PlayerProgression = {
  anglerLevel: 1,
  anglerXp: 0,
  skillPoints: 0,
  skills: {
    casting: 0,
    lineControl: 0,
    hooking: 0,
    fighting: 0,
    landing: 0,
    detection: 0,
    rigging: 0,
  },
  reputation: 0,
  methodProficiency: { lure: 0 },
}

const knowledge: KnowledgeState = {
  fish: { [species.id]: 10 },
  spots: { [spot.id]: 5 },
  regions: { [region.id]: 1 },
  methods: { lure: 2 },
}

const regulation: Regulation = {
  id: asRegulationId('fixture-regulation'),
  type: 'closed_season',
  regionId: region.id,
  months: [1, 2],
  sourceRefs: [source],
}

const career: CareerState = {
  jobId: asJobId('fixture-job'),
  careerLevel: 1,
  salaryBand: 1,
  workStyle: { remoteDays: 0, flexTime: false, overtimeLoad: 0, commuteMinutes: 45 },
  paidLeave: 0,
  careerXp: 0,
}

const job: JobDefinition = {
  id: asJobId('fixture-job'),
  name: '検証用ダミー職種',
  salaryRange: { min: 200_000, max: 400_000 },
  timeCost: 1,
  overtimeProfile: 0.2,
  commuteProfile: 0.4,
  remoteWork: false,
  flexTime: false,
  paidLeaveProfile: 0.5,
  eventTable: ['fixture-event'],
}

const finance: FinanceState = {
  cash: 0,
  salaryIncome: 0,
  simplifiedLivingCost: 0,
}

const gear: readonly GearItem[] = [
  {
    id: asGearId('fixture-rod'),
    kind: 'rod',
    name: '検証用ダミーロッド',
    spec: {
      lengthCm: 240,
      power: 'fixture-power',
      action: 'fixture-action',
      lureWeightRange: { min: 5, max: 30 },
      lineRating: { min: 4, max: 12 },
      weightG: 130,
      sensitivity: 0.6,
    },
  },
  {
    id: asGearId('fixture-lure'),
    kind: 'lure',
    name: '検証用ダミールアー',
    spec: {
      category: 'fixture-category',
      lengthMm: 90,
      weightG: 18,
      depthRange: { min: 0.5, max: 3 },
      action: 'fixture-action',
      buoyancy: 'sinking',
      targetProfile: ['fixture-profile'],
    },
  },
]

describe('core domain contracts', () => {
  it('holds a consistent sample of domain values', () => {
    expect(species.id).toBe('fixture-species')
    expect(individual.speciesId).toBe(species.id)
    expect(spot.fishTable[0]?.speciesId).toBe(species.id)
    expect(access.map((requirement) => requirement.kind)).toEqual([
      'transport',
      'knowledge',
      'reputation',
    ])
    expect(transport.type).toBe('car')
    expect(progression.anglerLevel).toBe(1)
    expect(knowledge.fish[species.id]).toBe(10)
    expect(regulation.months).toEqual([1, 2])
    expect(career.jobId).toBe(job.id)
    expect(finance.cash).toBe(0)
    expect(gear).toHaveLength(2)
  })

  it('does not allow a level based access requirement', () => {
    // @ts-expect-error level はアクセス条件として存在しない（DECISIONS.md §6）
    const invalid: AccessRequirement = { kind: 'level', minimum: 30 }
    expect(invalid).toBeDefined()
  })
})
