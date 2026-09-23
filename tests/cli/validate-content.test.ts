import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTENT_DIR, runValidateContent } from '../../scripts/validate-content'
import { projectRoot } from '../architecture/testProjectFiles'

/**
 * CLI の契約: 不正なコンテンツがあれば非ゼロで終了する。
 * プロセスを起動せずに関数を直接呼ぶ（決定論的で速い）。
 */

describe('validate:content CLI', () => {
  const root = projectRoot()

  it('exits 0 for the valid fixture set', () => {
    const report = runValidateContent(['--dir', 'src/content/fixtures/valid'], root)

    expect(report.exitCode).toBe(0)
    expect(report.lines.join('\n')).toContain('validated 4 record(s)')
  })

  it('exits non-zero for every invalid fixture set', () => {
    const invalidDirectories = [
      'invalid/missing-required',
      'invalid/invalid-bounds',
      'invalid/malformed-source',
      'invalid/invalid-json',
      'invalid/unknown-kind',
    ]

    for (const directory of invalidDirectories) {
      const report = runValidateContent(['--dir', `src/content/fixtures/${directory}`], root)

      expect(report.exitCode, `${directory} must fail`).toBe(1)
      expect(report.lines.some((line) => line.startsWith('ERROR '))).toBe(true)
    }
  })

  it('uses the repository content directory by default', () => {
    const report = runValidateContent([], root)

    expect(report.exitCode).toBe(0)
    expect(report.lines[0]).toContain(DEFAULT_CONTENT_DIR)
    // 件数は Content を増減するたびに変わる（記録そのものは validate:content が見る）。
    expect(report.lines.join('\n')).toContain('validated 1368 record(s)')
  })

  it('rejects a missing --dir value', () => {
    expect(() => runValidateContent(['--dir'], root)).toThrow('--dir requires a path')
  })
})
