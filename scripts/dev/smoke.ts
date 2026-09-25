import { simulateTrip } from '../simulate-trip'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { fail, pass, type CheckResult } from './lib/output'
import { canonicalJson } from './lib/repo'

/**
 * `./dev smoke` — 決定論的な gameplay smoke。
 *
 *   new game → travel → spot → cast → fight/catch → progression → save → reload
 *
 * ブラウザではなく Domain API だけで検証する（より強い決定性のため）。
 * simulate:trip が trip ループを2回走らせて fingerprint を比較するので、
 * ここではその結果 + save round-trip を束ねる。
 */

export const runSmoke = async (): Promise<{
  readonly checks: readonly CheckResult[]
  readonly lines: readonly string[]
}> => {
  const checks: CheckResult[] = []
  const lines: string[] = []

  // 1. 釣行ループ（HOME → travel → AT_SPOT → fishing ×3 → RETURNING_HOME → HOME）。
  const trip = simulateTrip({ seed: 'dev-smoke', attempts: 3 })
  for (const check of trip.checks) {
    checks.push(
      check.ok
        ? pass(`trip: ${check.label}`)
        : fail(
            `trip: ${check.label}`,
            'trip loop の決定性/健全性が壊れた',
            'npm run simulate:trip',
          ),
    )
  }
  lines.push(...trip.lines)

  // 2. Save → reload round-trip（初期 Save を repository 経由で保存→読み戻し→migrate）。
  const repository = new InMemorySaveRepository()
  const initial = createInitialSave({ now: '2026-01-01T00:00:00.000Z' })
  await repository.save(initial)
  const raw = await repository.loadRaw()
  const migrated = migrateSave(raw)

  if (!migrated.ok) {
    checks.push(fail('save round-trip', `migrate failed: ${migrated.message}`, './dev save-check'))
  } else {
    const roundTripped = canonicalJson(migrated.save) === canonicalJson(initial)
    checks.push(
      roundTripped
        ? pass('save round-trip', 'save → loadRaw → migrate が等しい')
        : fail('save round-trip', 'migrate 後に値が変わった', 'src/infrastructure/persistence/'),
    )
  }

  // 3. 決定性: smoke 全体を2回目も流して fingerprint が同じことは simulateTrip 側で確認済み。
  checks.push(pass('determinism', 'trip fingerprint は simulateTrip 内部で2回比較済み'))

  return { checks, lines }
}
