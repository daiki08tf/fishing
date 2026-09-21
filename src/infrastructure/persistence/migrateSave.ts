import { totalXpForLevel } from '../../domain/progression/AnglerLevel'
import { emptyRepetitionState } from '../../domain/progression/repetitionDecay'
import { emptyCodexState } from '../../domain/codex'
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION_V1,
  type CurrentSave,
  type SaveGameV1,
  type SaveGameV2,
} from '../../domain/save/SaveGame'
import { currentSaveSchema, saveGameV1Schema } from './saveSchema'

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
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
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

    const migrated = currentSaveSchema.safeParse(migrateV1ToV2(parsed.data))

    if (!migrated.success) {
      return failure(
        'invalid_save',
        'migrated save failed current schema validation',
        toIssues(migrated.error),
      )
    }

    return { ok: true, save: migrated.data, migratedFrom: SAVE_SCHEMA_VERSION_V1 }
  }

  const parsed = currentSaveSchema.safeParse(record)

  if (!parsed.success) {
    return failure('invalid_save', 'save data failed schema validation', toIssues(parsed.error))
  }

  return { ok: true, save: parsed.data, migratedFrom: CURRENT_SAVE_SCHEMA_VERSION }
}
