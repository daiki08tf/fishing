import { describe, expect, it } from 'vitest'
import { runSaveCheck } from '../../scripts/dev/saveCheck'
import { runSmoke } from '../../scripts/dev/smoke'

/**
 * save-check / smoke を test 経由でも保証する。
 * ./dev から独立して実行されるため、CI が `vitest run` だけでもカバーされる。
 */

describe('save-check', () => {
  it('all fixture versions migrate cleanly', async () => {
    const { checks } = await runSaveCheck()
    const failures = checks.filter((check) => check.status === 'FAIL')
    expect(failures).toEqual([])
  })

  it('covers every schema version up to current', async () => {
    const { checks } = await runSaveCheck()
    const migrationChecks = checks.filter((check) => check.label.includes('→'))
    // v1..v9 = 9 fixtures。
    expect(migrationChecks.length).toBeGreaterThanOrEqual(9)
  })
})

describe('smoke', () => {
  it('the deterministic gameplay path is healthy', async () => {
    const { checks } = await runSmoke()
    const failures = checks.filter((check) => check.status === 'FAIL')
    expect(failures).toEqual([])
  }, 30_000)
})
