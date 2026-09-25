import {
  createValidSaveV1,
  createValidSaveV2,
  createValidSaveV3,
  createValidSaveV4,
  createValidSaveV5,
  createValidSaveV6,
  createValidSaveV7,
  createValidSaveV8,
  createValidSaveV9,
} from '../../tests/fixtures/save'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { currentSaveSchema } from '../../src/infrastructure/persistence/saveSchema'
import { CURRENT_SAVE_SCHEMA_VERSION } from '../../src/domain/save/SaveGame'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { fail, pass, type CheckResult } from './lib/output'
import { canonicalJson } from './lib/repo'

/**
 * `./dev save-check` — save 互換性の検証。
 *
 * 各 schema version の fixture について:
 *   fixture → JSON serialize/parse（IndexedDB 相当の境界）→ migrateSave
 *   → current schema 検証 → 再 serialize → 再 migrate（冪等性）
 *
 * fixture は tests/fixtures/save.ts が source of truth。
 * ここは検証のみ。save schema の再設計はしない。
 */

const FIXTURES: readonly { readonly version: number; readonly make: () => unknown }[] = [
  { version: 1, make: createValidSaveV1 },
  { version: 2, make: createValidSaveV2 },
  { version: 3, make: createValidSaveV3 },
  { version: 4, make: createValidSaveV4 },
  { version: 5, make: createValidSaveV5 },
  { version: 6, make: createValidSaveV6 },
  { version: 7, make: createValidSaveV7 },
  { version: 8, make: createValidSaveV8 },
  { version: 9, make: createValidSaveV9 },
]

export const runSaveCheck = async (): Promise<{ readonly checks: readonly CheckResult[] }> => {
  const checks: CheckResult[] = []

  checks.push(pass('current schema', `v${String(CURRENT_SAVE_SCHEMA_VERSION)}`))

  for (const fixture of FIXTURES) {
    const label = `v${String(fixture.version)} → v${String(CURRENT_SAVE_SCHEMA_VERSION)}`

    // JSON 境界を越える（IndexedDB / ファイル保存と同等）。
    const raw = JSON.parse(JSON.stringify(fixture.make()))
    const migrated = migrateSave(raw)

    if (!migrated.ok) {
      checks.push(
        fail(
          label,
          `migrate failed: ${migrated.message}`,
          'src/infrastructure/persistence/migrateSave.ts',
        ),
      )
      continue
    }

    // 現在 schema で検証。
    const validated = currentSaveSchema.safeParse(migrated.save)
    if (!validated.success) {
      checks.push(fail(label, 'migrated save が current schema を通らない', 'saveSchema.ts'))
      continue
    }

    // 再 migrate（冪等性）。
    const again = migrateSave(JSON.parse(JSON.stringify(migrated.save)))
    if (!again.ok) {
      checks.push(fail(label, 'migrate 結果を再度 migrate できない（冪等でない）'))
      continue
    }

    checks.push(pass(label, `migratedFrom=${String(migrated.migratedFrom)}`))
  }

  // repository round-trip（current version）。
  const repository = new InMemorySaveRepository()
  const current = createValidSaveV9()
  await repository.save(current)
  const raw = await repository.loadRaw()
  const back = migrateSave(raw)
  checks.push(
    back.ok && canonicalJson(back.save) === canonicalJson(current)
      ? pass('repository round-trip', 'save → loadRaw → migrate が等しい')
      : fail('repository round-trip', 'repository 経由で値が変わった'),
  )

  // 未来 version は拒否されること。
  const future = { ...current, schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1 }
  const futureResult = migrateSave(future)
  checks.push(
    !futureResult.ok && futureResult.reason === 'unsupported_future_version'
      ? pass('future version', '未知の未来 version を拒否')
      : fail('future version', '未来 version を読み込んでしまった', 'migrateSave.ts'),
  )

  // 壊れたデータは例外ではなく理由つきで失敗すること。
  const broken = migrateSave('not an object')
  checks.push(
    !broken.ok
      ? pass('broken input', `理由: ${broken.reason}`)
      : fail('broken input', '壊れた入力を受理した'),
  )

  return { checks }
}
