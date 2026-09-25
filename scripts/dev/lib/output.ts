/**
 * 開発ツール共通の出力形式。
 * すべてのチェックは PASS / WARN / FAIL + 理由 + 次の手がかりを出す。
 */

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL'

export type CheckResult = {
  readonly status: CheckStatus
  readonly label: string
  readonly detail?: string
  /** 次に見るべき場所・コマンド。 */
  readonly hint?: string
}

export type CommandResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
}

export const pass = (label: string, detail?: string): CheckResult => ({
  status: 'PASS',
  label,
  ...(detail === undefined ? {} : { detail }),
})

export const warn = (label: string, detail?: string, hint?: string): CheckResult => ({
  status: 'WARN',
  label,
  ...(detail === undefined ? {} : { detail }),
  ...(hint === undefined ? {} : { hint }),
})

export const fail = (label: string, detail?: string, hint?: string): CheckResult => ({
  status: 'FAIL',
  label,
  ...(detail === undefined ? {} : { detail }),
  ...(hint === undefined ? {} : { hint }),
})

export const formatChecks = (checks: readonly CheckResult[]): readonly string[] => {
  const lines: string[] = []
  for (const check of checks) {
    const detail = check.detail === undefined ? '' : ` — ${check.detail}`
    lines.push(`${check.status.padEnd(4)} ${check.label}${detail}`)
    if (check.hint !== undefined) {
      lines.push(`     next: ${check.hint}`)
    }
  }
  return lines
}

export const summarize = (checks: readonly CheckResult[]): CommandResult => {
  const lines = [...formatChecks(checks)]
  const fails = checks.filter((check) => check.status === 'FAIL').length
  const warns = checks.filter((check) => check.status === 'WARN').length
  lines.push('')
  lines.push(`${String(checks.length)} checks: ${String(fails)} FAIL, ${String(warns)} WARN`)
  return { exitCode: fails > 0 ? 1 : 0, lines }
}
