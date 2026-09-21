import { describe, expect, it } from 'vitest'
import { simulateTransport } from '../../scripts/simulate-transport'

describe('simulate:transport', () => {
  it('passes every Phase 7A transport check', () => {
    const result = simulateTransport()

    expect(result.exitCode).toBe(0)
    expect(result.checks.every((check) => check.ok)).toBe(true)
    expect(result.lines.some((line) => line.includes('FAIL'))).toBe(false)
  })

  it('is deterministic for identical content and state', () => {
    expect(simulateTransport().fingerprint).toBe(simulateTransport().fingerprint)
  })
})
