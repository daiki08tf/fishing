import { CURRENT_SAVE_SCHEMA_VERSION, type CurrentSave } from '../../domain/save/SaveGame'
import { currentSaveSchema } from './saveSchema'

/**
 * Save の migration 入口。ARCHITECTURE.md §9 に対応する。
 *
 * 原則:
 * - 純粋関数。同じ入力からは常に同じ結果を返す（決定論的）。
 * - 失敗しても例外を投げず、理由を返す。呼び出し側が安全に初期状態へ倒せるようにする。
 * - 未知の（未来の）schemaVersion は読み込まない。壊れた解釈でデータを失わないため。
 *
 * Phase 0B では v1 しか存在しないため、実質は v1 -> v1 の検証である。
 * v2 を追加するときは migrateV1ToV2 を足し、この関数から順に適用する。
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

const readSchemaVersion = (raw: Record<string, unknown>): number | null => {
  const value = raw['schemaVersion']

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  return value
}

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

  if (schemaVersion < CURRENT_SAVE_SCHEMA_VERSION) {
    // 旧 version はまだ存在しない。将来ここに migration を並べる。
    return failure(
      'unsupported_older_version',
      `no migration path from save schemaVersion ${String(schemaVersion)}`,
    )
  }

  const parsed = currentSaveSchema.safeParse(record)

  if (!parsed.success) {
    return failure(
      'invalid_save',
      'save data failed schema validation',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map((segment) => String(segment)).join('.'),
        message: issue.message,
      })),
    )
  }

  return { ok: true, save: parsed.data, migratedFrom: schemaVersion }
}
