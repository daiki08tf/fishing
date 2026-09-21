import { totalXpForLevel } from '../../domain/progression/AnglerLevel'
import { emptyRepetitionState } from '../../domain/progression/repetitionDecay'
import { emptyCodexState } from '../../domain/codex'
import { asGearId } from '../../domain/ids'
import { createStarterLoadout, starterInventoryIds } from '../../domain/tackle/Loadout'
import { createInitialWorld } from '../../domain/world/worldSession'
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION_V1,
  SAVE_SCHEMA_VERSION_V2,
  SAVE_SCHEMA_VERSION_V3,
  SAVE_SCHEMA_VERSION_V4,
  type CurrentSave,
  type SaveGameV1,
  type SaveGameV2,
  type SaveGameV3,
  type SaveGameV4,
  type SaveGameV5,
} from '../../domain/save/SaveGame'
import {
  currentSaveSchema,
  saveGameV1Schema,
  saveGameV2Schema,
  saveGameV3Schema,
  saveGameV4Schema,
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
export const migrateV2ToV3 = (v2: SaveGameV2): SaveGameV3 => ({
  schemaVersion: SAVE_SCHEMA_VERSION_V3,
  createdAt: v2.createdAt,
  updatedAt: v2.updatedAt,
  progression: v2.progression,
  codex: v2.codex,
  world: createInitialWorld(),
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
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
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

const toCurrent = (save: SaveGameV4): SaveGameV5 => migrateV4ToV5(save)

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

    const migrated = currentSaveSchema.safeParse(migrateV4ToV5(parsed.data))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V4 }
  }

  const parsed = currentSaveSchema.safeParse(record)

  if (!parsed.success) {
    return failure('invalid_save', 'save data failed schema validation', toIssues(parsed.error))
  }

  return { ok: true, save: parsed.data, migratedFrom: CURRENT_SAVE_SCHEMA_VERSION }
}
