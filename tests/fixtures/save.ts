import {
  asFishIndividualId,
  asFishSpeciesId,
  asJobId,
  asRegionId,
  asTransportId,
} from '../../src/domain/ids'
import { createInitialTransportState } from '../../src/domain/access/Transport'
import { createInitialExpeditionState } from '../../src/domain/expedition'
import { asGearId } from '../../src/domain/ids'
import { totalXpForLevel } from '../../src/domain/progression/AnglerLevel'
import { emptyAnglerSkills } from '../../src/domain/progression/AnglerSkill'
import { emptyRepetitionState } from '../../src/domain/progression/repetitionDecay'
import type { SaveGameV1 } from '../../src/domain/save/SaveGame'
import {
  SAVE_SCHEMA_VERSION_V2,
  SAVE_SCHEMA_VERSION_V3,
  SAVE_SCHEMA_VERSION_V4,
  SAVE_SCHEMA_VERSION_V5,
  SAVE_SCHEMA_VERSION_V6,
  SAVE_SCHEMA_VERSION_V7,
  SAVE_SCHEMA_VERSION_V8,
  type LegacyWorldState,
  type SaveGameV2,
  type SaveGameV3,
  type SaveGameV4,
  type SaveGameV5,
  type SaveGameV6,
  type SaveGameV7,
  type SaveGameV8,
} from '../../src/domain/save/SaveGame'
import { createStarterInventory, createStarterLoadout } from '../../src/domain/tackle/Loadout'
import { createInitialWorld } from '../../src/domain/world/worldSession'
import { DEFAULT_WORLD_TUNING } from '../../src/domain/world/WorldTuning'

/**
 * 検証用の最小 Save（schema v1）。
 * ゲームプレイ上の初期値ではない。テストで使う構造のサンプルである。
 */
export const createValidSaveV1 = (): SaveGameV1 => ({
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  progression: {
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
    methodProficiency: {},
  },
  knowledge: { fish: {}, spots: {}, regions: {}, methods: {} },
  career: {
    jobId: asJobId('fixture-job'),
    careerLevel: 1,
    salaryBand: 1,
    workStyle: {
      remoteDays: 0,
      flexTime: false,
      overtimeLoad: 0,
      commuteMinutes: 45,
    },
    paidLeave: 0,
    careerXp: 0,
  },
  finance: {
    cash: 0,
    salaryIncome: 0,
    simplifiedLivingCost: 0,
  },
})

/** Phase 3 の現行 Save（schema v2）。 */
export const createValidSaveV2 = (): SaveGameV2 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  progression: {
    anglerLevel: 3,
    anglerXp: 40,
    totalXp: totalXpForLevel(3) + 40,
    skillPoints: 2,
    skills: { ...emptyAnglerSkills(), fighting: 5 },
    unlockedPerks: [],
    repetition: { ...emptyRepetitionState(), species: { 'test-species': 3 } },
    reputation: 0,
    methodProficiency: {},
  },
  codex: {
    species: {
      'test-species': {
        speciesId: asFishSpeciesId('test-species'),
        catchCount: 2,
        largestLengthCm: 31.2,
        heaviestWeightKg: 0.512,
        bestPercentile: 87.5,
        caughtTraits: ['heavy'],
        personalBest: {
          individualId: asFishIndividualId('test-species#best'),
          speciesId: asFishSpeciesId('test-species'),
          lengthCm: 31.2,
          weightKg: 0.512,
          condition: 0.82,
          percentile: 87.5,
          traits: ['heavy'],
          capturedAt: '2026-01-20T00:00:00.000Z',
        },
      },
    },
  },
  knowledge: { fish: {}, spots: {}, regions: {}, methods: {} },
  career: {
    jobId: asJobId('fixture-job'),
    careerLevel: 1,
    salaryBand: 1,
    workStyle: {
      remoteDays: 0,
      flexTime: false,
      overtimeLoad: 0,
      commuteMinutes: 45,
    },
    paidLeave: 0,
    careerXp: 0,
  },
  finance: {
    cash: 0,
    salaryIncome: 0,
    simplifiedLivingCost: 0,
  },
})

/** Phase 4 の現行 Save（schema v3）。World が加わった。 */
const createLegacyWorld = (): LegacyWorldState => {
  const world = createInitialWorld()

  return {
    time: world.time,
    phase: world.phase,
    homeLocationId: world.homeLocationId,
    currentSpotId: world.currentSpotId,
    arrivalTime: world.arrivalTime,
    trip: null,
    discoveredSpotIds: world.discoveredSpotIds,
    availableTransports: ['walk', 'train', 'bus'],
  }
}

export const createValidSaveV3 = (): SaveGameV3 => ({
  ...createValidSaveV2(),
  schemaVersion: SAVE_SCHEMA_VERSION_V3,
  world: createLegacyWorld(),
})

/** Phase 5 の現行 Save（schema v4）。資金の詳細と購入済み商品が加わった。 */
export const createValidSaveV4 = (): SaveGameV4 => {
  const v3 = createValidSaveV3()

  return {
    schemaVersion: SAVE_SCHEMA_VERSION_V4,
    createdAt: v3.createdAt,
    updatedAt: v3.updatedAt,
    progression: v3.progression,
    codex: v3.codex,
    world: v3.world,
    knowledge: v3.knowledge,
    // Career ブロックはゲームシステムではないので保存しない。
    finance: { ...v3.finance, lastSettledMonth: null, transactions: [] },
    purchases: [],
  }
}

/** Phase 6 の現行 Save（schema v5）。所持 Gear と装備が加わった。 */
export const createValidSaveV5 = (): SaveGameV5 => {
  const v4 = createValidSaveV4()

  return {
    schemaVersion: SAVE_SCHEMA_VERSION_V5,
    createdAt: v4.createdAt,
    updatedAt: v4.updatedAt,
    progression: v4.progression,
    codex: v4.codex,
    world: v4.world,
    knowledge: v4.knowledge,
    finance: v4.finance,
    purchases: v4.purchases,
    inventory: createStarterInventory(asGearId),
    loadout: createStarterLoadout(asGearId),
  }
}

/** Phase 7A の Save（schema v6）。Transport ownership が独立した。 */
export const createValidSaveV6 = (): SaveGameV6 => {
  const v5 = createValidSaveV5()
  // v6 の World は currentRegionId を持たない（Phase 8 で増えた）。
  const { currentRegionId: _currentRegionId, ...legacyWorld } = createInitialWorld()

  return {
    schemaVersion: SAVE_SCHEMA_VERSION_V6,
    createdAt: v5.createdAt,
    updatedAt: v5.updatedAt,
    progression: v5.progression,
    codex: v5.codex,
    world: legacyWorld,
    transport: createInitialTransportState(asTransportId),
    knowledge: v5.knowledge,
    finance: v5.finance,
    purchases: v5.purchases,
    inventory: v5.inventory,
    loadout: v5.loadout,
  }
}

/** Phase 8 の現行 Save（schema v7）。World が地域を持ち、遠征ブロックが加わった。 */
export const createValidSaveV7 = (): SaveGameV7 => {
  const v6 = createValidSaveV6()

  return {
    schemaVersion: SAVE_SCHEMA_VERSION_V7,
    createdAt: v6.createdAt,
    updatedAt: v6.updatedAt,
    progression: v6.progression,
    codex: v6.codex,
    world: createInitialWorld(),
    transport: v6.transport,
    expedition: createInitialExpeditionState(asRegionId(DEFAULT_WORLD_TUNING.homeRegionId)),
    knowledge: v6.knowledge,
    finance: v6.finance,
    purchases: v6.purchases,
    inventory: v6.inventory,
    loadout: v6.loadout,
  }
}


/** Phase 12 の現行 Save（schema v8）。構造は v7 と同じで species ID を canonical 化する。 */
export const createValidSaveV8 = (): SaveGameV8 => {
  const v7 = createValidSaveV7()

  return {
    ...v7,
    schemaVersion: SAVE_SCHEMA_VERSION_V8,
  }
}
