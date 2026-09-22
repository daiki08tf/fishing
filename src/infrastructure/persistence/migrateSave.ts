import { totalXpForLevel } from '../../domain/progression/AnglerLevel'
import { emptyRepetitionState } from '../../domain/progression/repetitionDecay'
import { emptyCodexState } from '../../domain/codex'
import { createInitialTransportState, grantOwnedTransport } from '../../domain/access/Transport'
import { createInitialExpeditionState } from '../../domain/expedition'
import {
  asFishSpeciesId,
  asGearId,
  asRegionId,
  asTransportId,
  type FishSpeciesId,
  type TransportId,
} from '../../domain/ids'
import { createStarterLoadout, starterInventoryIds } from '../../domain/tackle/Loadout'
import { createInitialWorld } from '../../domain/world/worldSession'
import { DEFAULT_WORLD_TUNING } from '../../domain/world/WorldTuning'
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION_V1,
  SAVE_SCHEMA_VERSION_V2,
  SAVE_SCHEMA_VERSION_V3,
  SAVE_SCHEMA_VERSION_V4,
  SAVE_SCHEMA_VERSION_V5,
  SAVE_SCHEMA_VERSION_V6,
  SAVE_SCHEMA_VERSION_V7,
  SAVE_SCHEMA_VERSION_V8,
  type CurrentSave,
  type LegacyTransportType,
  type LegacyWorldState,
  type SaveGameV1,
  type SaveGameV2,
  type SaveGameV3,
  type SaveGameV4,
  type SaveGameV5,
  type SaveGameV6,
  type SaveGameV7,
  type SaveGameV8,
} from '../../domain/save/SaveGame'
import {
  currentSaveSchema,
  saveGameV1Schema,
  saveGameV2Schema,
  saveGameV3Schema,
  saveGameV4Schema,
  saveGameV5Schema,
  saveGameV6Schema,
  saveGameV7Schema,
} from './saveSchema'

/**
 * Save の migration 入口。ARCHITECTURE.md §9 に対応する。
 *
 * 原則:
 * - 純粋関数。同じ入力からは常に同じ結果を返す（決定論的）。
 * - 失敗しても例外を投げず、理由を返す。呼び出し側が安全に初期状態へ倒せるようにする。
 * - 未知の（未来の）schemaVersion は読み込まない。壊れた解釈でデータを失わないため。
 *
 * v2 を追加するときは migrateV1ToV2 のような関数を足し、古い順に適用する。
 */

export type SaveMigrationFailureReason =
  | 'not_an_object'
  | 'missing_schema_version'
  | 'unsupported_future_version'
  | 'unsupported_older_version'
  | 'invalid_save'

export type SaveMigrationIssue = {
  readonly path: string
  readonly message: string
}

export type SaveMigrationResult =
  | { readonly ok: true; readonly save: CurrentSave; readonly migratedFrom: number }
  | {
      readonly ok: false
      readonly reason: SaveMigrationFailureReason
      readonly message: string
      readonly issues: readonly SaveMigrationIssue[]
    }

const failure = (
  reason: SaveMigrationFailureReason,
  message: string,
  issues: readonly SaveMigrationIssue[] = [],
): SaveMigrationResult => ({ ok: false, reason, message, issues })

const toIssues = (error: {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]
}): readonly SaveMigrationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))

const readSchemaVersion = (raw: Record<string, unknown>): number | null => {
  const value = raw['schemaVersion']

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  return value
}

/**
 * v1 → v2。
 *
 * v1 は累計 XP を持っていなかったので、レベルカーブから復元する
 * （レベル到達に必要な累計 + 現在レベル内の XP）。
 * Perk と反復状態は新設なので空から始める。
 */
export const migrateV1ToV2 = (v1: SaveGameV1): SaveGameV2 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V2,
  createdAt: v1.createdAt,
  updatedAt: v1.updatedAt,
  knowledge: v1.knowledge,
  career: v1.career,
  finance: v1.finance,
  // v1 は捕獲記録を持っていないので空から始める。
  codex: emptyCodexState(),
  progression: {
    anglerLevel: v1.progression.anglerLevel,
    anglerXp: v1.progression.anglerXp,
    totalXp: totalXpForLevel(v1.progression.anglerLevel) + v1.progression.anglerXp,
    skillPoints: v1.progression.skillPoints,
    skills: v1.progression.skills,
    unlockedPerks: [],
    repetition: emptyRepetitionState(),
    reputation: v1.progression.reputation,
    methodProficiency: v1.progression.methodProficiency,
  },
})

/**
 * v2 → v3。
 *
 * World（時間・位置・発見済み Spot・移動手段・釣行記録）を追加する。
 * それ以外のブロックはそのまま引き継ぐ（Progression / Codex を失わない）。
 * 既存 Save には World が無いので、ゲーム開始時の自宅・時刻から始める。
 */
const createLegacyInitialWorld = (): LegacyWorldState => {
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

export const migrateV2ToV3 = (v2: SaveGameV2): SaveGameV3 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V3,
  createdAt: v2.createdAt,
  updatedAt: v2.updatedAt,
  progression: v2.progression,
  codex: v2.codex,
  world: createLegacyInitialWorld(),
  knowledge: v2.knowledge,
  career: v2.career,
  finance: v2.finance,
})

/**
 * v3 → v4。
 *
 * 資金ブロックに月次精算の状態と履歴を足し、購入済み商品を追加する。
 * progression / codex / world / knowledge はそのまま引き継ぐ。
 */
export const migrateV3ToV4 = (v3: SaveGameV3): SaveGameV4 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V4,
  createdAt: v3.createdAt,
  updatedAt: v3.updatedAt,
  progression: v3.progression,
  codex: v3.codex,
  world: v3.world,
  knowledge: v3.knowledge,
  finance: {
    cash: v3.finance.cash,
    salaryIncome: v3.finance.salaryIncome,
    simplifiedLivingCost: v3.finance.simplifiedLivingCost,
    lastSettledMonth: null,
    transactions: [],
  },
  purchases: [],
})

/**
 * v4 → v5。
 *
 * Tackle（Phase 6）の所持（inventory）と装備（loadout）を追加する。
 * v4 以前のプレイヤーはタックルを持っていないので、
 * **Starter gear 一式と有効な Starter loadout を付与する**
 * （何も買えず釣りが成立しない状態を作らないため）。
 *
 * progression / codex / world / knowledge / finance / purchases はそのまま引き継ぐ。
 */
export const migrateV4ToV5 = (v4: SaveGameV4): SaveGameV5 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V5,
  createdAt: v4.createdAt,
  updatedAt: v4.updatedAt,
  progression: v4.progression,
  codex: v4.codex,
  world: v4.world,
  knowledge: v4.knowledge,
  finance: v4.finance,
  purchases: v4.purchases,
  inventory: { ownedGearIds: starterInventoryIds(asGearId) },
  loadout: createStarterLoadout(asGearId),
})

const LEGACY_TRANSPORT_IDS: Readonly<Record<LegacyTransportType, TransportId>> = {
  walk: asTransportId('walk'),
  train: asTransportId('train'),
  bus: asTransportId('bus'),
  bicycle: asTransportId('city-bicycle'),
  motorcycle: asTransportId('standard-motorcycle'),
  car: asTransportId('used-compact-car'),
  suv: asTransportId('four-wheel-drive-suv'),
  kayak: asTransportId('recreational-kayak'),
  trailer_boat: asTransportId('owned-boat'),
  boat: asTransportId('owned-boat'),
}

const LEGACY_ALWAYS_AVAILABLE = new Set<LegacyTransportType>(['walk', 'train', 'bus'])

/**
 * v5 → v6。
 *
 * World に混在していた旧 enum を data-driven Transport ID へ写し、所有状態を独立させる。
 * Phase 5 の Used Compact Car 購入は purchases からも復元し、古い Save の車アクセスを失わない。
 */
export const migrateV5ToV6 = (v5: SaveGameV5): SaveGameV6 => {
  const { availableTransports, ...legacyWorld } = v5.world
  let transport = createInitialTransportState(asTransportId)

  for (const legacy of availableTransports) {
    const id = LEGACY_TRANSPORT_IDS[legacy]
    transport = LEGACY_ALWAYS_AVAILABLE.has(legacy)
      ? {
          ...transport,
          availableTransportIds: transport.availableTransportIds.includes(id)
            ? transport.availableTransportIds
            : [...transport.availableTransportIds, id],
        }
      : grantOwnedTransport(transport, id)
  }

  if (v5.purchases.some((id) => String(id) === 'used-compact-car')) {
    transport = grantOwnedTransport(transport, asTransportId('used-compact-car'))
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION_V6,
    createdAt: v5.createdAt,
    updatedAt: v5.updatedAt,
    progression: v5.progression,
    codex: v5.codex,
    world: {
      ...legacyWorld,
      trip: legacyWorld.trip === null ? null : { ...legacyWorld.trip, transportId: null },
    },
    transport,
    knowledge: v5.knowledge,
    finance: v5.finance,
    purchases: v5.purchases,
    inventory: v5.inventory,
    loadout: v5.loadout,
  }
}

/**
 * v6 → v7（Phase 8）。
 *
 * World に今いる地域（currentRegionId）を足し、遠征ブロックを空で作る。
 * Progression / Codex / Transport / Knowledge / Finance / Purchases / Inventory /
 * Loadout はそのまま保持する。
 */
export const migrateV6ToV7 = (v6: SaveGameV6): SaveGameV7 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V7,
  createdAt: v6.createdAt,
  updatedAt: v6.updatedAt,
  progression: v6.progression,
  codex: v6.codex,
  world: {
    ...v6.world,
    currentRegionId: asRegionId(DEFAULT_WORLD_TUNING.homeRegionId),
  },
  transport: v6.transport,
  expedition: createInitialExpeditionState(asRegionId(DEFAULT_WORLD_TUNING.homeRegionId)),
  knowledge: v6.knowledge,
  finance: v6.finance,
  purchases: v6.purchases,
  inventory: v6.inventory,
  loadout: v6.loadout,
})

/**
 * Phase 12: 旧「地域-prefixed」魚種 ID を世界共通 ID へ正規化する。
 *
 * FishSpecies は世界で 1 つ。地域差は FishOccurrence に置く。
 * v8 migration では、プレイヤーの既存記録を失わないよう
 * Codex / Knowledge / repetition の species key を同時に移す。
 */
export const LEGACY_SPECIES_ID_MAP: Readonly<Record<string, string>> = {
  'alaska-arctic-char': 'arctic-char',
  'alaska-chinook-salmon': 'chinook-salmon',
  'alaska-chum-salmon': 'chum-salmon',
  'alaska-coho-salmon': 'coho-salmon',
  'alaska-dolly-varden': 'dolly-varden',
  'alaska-lake-trout': 'lake-trout',
  'alaska-pacific-halibut': 'pacific-halibut',
  'alaska-pink-salmon': 'pink-salmon',
  'alaska-rainbow-trout': 'rainbow-trout',
  'alaska-sockeye-salmon': 'sockeye-salmon',
  'hokkaido-ame-masu': 'amemasu',
  'hokkaido-ito': 'ito',
  'hokkaido-masu-salmon': 'masu-salmon',
  'kanto-bora': 'bora',
  'kanto-buri': 'buri',
  'kanto-funa': 'funa',
  'kanto-haze': 'haze',
  'kanto-koi': 'koi',
  'kanto-kurodai': 'kurodai',
  'kanto-maaji': 'maaji',
  'kanto-namazu': 'namazu',
  'kanto-nijimasu': 'rainbow-trout',
  'kanto-saba': 'saba',
  'kanto-seabass': 'seabass',
  'kanto-shirogisu': 'shirogisu',
  'kanto-ugui': 'ugui',
}

export const canonicalSpeciesId = (id: string): FishSpeciesId =>
  asFishSpeciesId(LEGACY_SPECIES_ID_MAP[id] ?? id)

const remapNumberRecord = (
  input: Readonly<Record<string, number>>,
  merge: (existing: number, incoming: number) => number,
): Readonly<Record<string, number>> => {
  const output: Record<string, number> = {}

  for (const [rawId, value] of Object.entries(input)) {
    const id = String(canonicalSpeciesId(rawId))
    output[id] = output[id] === undefined ? value : merge(output[id] ?? 0, value)
  }

  return output
}

const mergeTraits = <T extends string>(left: readonly T[], right: readonly T[]): readonly T[] => {
  const result = [...left]

  for (const trait of right) {
    if (!result.includes(trait)) {
      result.push(trait)
    }
  }

  return result
}

export const migrateV7ToV8 = (v7: SaveGameV7): SaveGameV8 => {
  const species: Record<string, SaveGameV7['codex']['species'][string]> = {}

  for (const [rawId, record] of Object.entries(v7.codex.species)) {
    const id = canonicalSpeciesId(rawId)
    const key = String(id)
    const personalBest = {
      ...record.personalBest,
      speciesId: id,
    }
    const incoming = {
      ...record,
      speciesId: id,
      personalBest,
    }
    const existing = species[key]

    if (existing === undefined) {
      species[key] = incoming
      continue
    }

    const useIncomingBest = incoming.bestPercentile > existing.bestPercentile
    species[key] = {
      speciesId: id,
      catchCount: existing.catchCount + incoming.catchCount,
      largestLengthCm: Math.max(existing.largestLengthCm, incoming.largestLengthCm),
      heaviestWeightKg: Math.max(existing.heaviestWeightKg, incoming.heaviestWeightKg),
      bestPercentile: Math.max(existing.bestPercentile, incoming.bestPercentile),
      caughtTraits: mergeTraits(existing.caughtTraits, incoming.caughtTraits),
      personalBest: useIncomingBest ? incoming.personalBest : existing.personalBest,
    }
  }

  return {
    ...v7,
    schemaVersion: SAVE_SCHEMA_VERSION_V8,
    codex: { species },
    progression: {
      ...v7.progression,
      repetition: {
        ...v7.progression.repetition,
        species: remapNumberRecord(
          v7.progression.repetition.species,
          (existing, incoming) => existing + incoming,
        ),
      },
    },
    knowledge: {
      ...v7.knowledge,
      fish: remapNumberRecord(v7.knowledge.fish, (existing, incoming) =>
        Math.max(existing, incoming),
      ),
    },
  }
}

const toCurrent = (save: SaveGameV4): SaveGameV8 =>
  migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(save))))

export const migrateSave = (raw: unknown): SaveMigrationResult => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return failure('not_an_object', 'save data must be a JSON object')
  }

  const record = raw as Record<string, unknown>
  const schemaVersion = readSchemaVersion(record)

  if (schemaVersion === null) {
    return failure('missing_schema_version', 'save data must contain an integer schemaVersion')
  }

  if (schemaVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    return failure(
      'unsupported_future_version',
      `save schemaVersion ${String(schemaVersion)} is newer than supported version ${String(
        CURRENT_SAVE_SCHEMA_VERSION,
      )}`,
    )
  }

  if (schemaVersion < SAVE_SCHEMA_VERSION_V1) {
    return failure(
      'unsupported_older_version',
      `no migration path from save schemaVersion ${String(schemaVersion)}`,
    )
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V1) {
    const parsed = saveGameV1Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v1 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(
      toCurrent(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(parsed.data)))),
    )

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V1 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V2) {
    const parsed = saveGameV2Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v2 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(
      toCurrent(migrateV3ToV4(migrateV2ToV3(parsed.data))),
    )

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V2 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V3) {
    const parsed = saveGameV3Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v3 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(toCurrent(migrateV3ToV4(parsed.data)))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V3 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V4) {
    const parsed = saveGameV4Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v4 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(toCurrent(parsed.data))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V4 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V5) {
    const parsed = saveGameV5Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v5 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(
      migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(parsed.data))),
    )

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V5 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V6) {
    const parsed = saveGameV6Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v6 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(migrateV7ToV8(migrateV6ToV7(parsed.data)))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V6 }
  }

  if (schemaVersion === SAVE_SCHEMA_VERSION_V7) {
    const parsed = saveGameV7Schema.safeParse(record)

    if (!parsed.success) {
      return failure(
        'invalid_save',
        'save data failed v7 schema validation',
        toIssues(parsed.error),
      )
    }

    const migrated = currentSaveSchema.safeParse(migrateV7ToV8(parsed.data))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V7 }
  }

  const parsed = currentSaveSchema.safeParse(record)

  if (!parsed.success) {
    return failure('invalid_save', 'save data failed schema validation', toIssues(parsed.error))
  }

  return { ok: true, save: parsed.data, migratedFrom: CURRENT_SAVE_SCHEMA_VERSION }
}
