import { execFileSync } from 'node:child_process'
import { fail, pass, type CheckResult } from './lib/output'
import { REPO_ROOT } from './lib/repo'

/**
 * `./dev check [--quick|--full]` — 統合検証コマンド。
 *
 * QUICK（編集のたびに回す）:
 *   typecheck / lint / format / content validation / authority map / project map
 *   freshness / save-check / smoke / unit tests
 *
 * FULL（merge / handoff 前）:
 *   QUICK + 全 simulation + build + content-scale 分析
 *
 * 実行時間の目安は docs/TESTING.md に記載。
 */

type Step = {
  readonly name: string
  readonly tier: 'quick' | 'full'
} & ({ readonly command: readonly string[] } | { readonly run: () => Promise<CheckResult[]> })

const STEPS: readonly Step[] = [
  { name: 'typecheck', command: ['npm', 'run', 'typecheck'], tier: 'quick' },
  { name: 'lint', command: ['npm', 'run', 'lint'], tier: 'quick' },
  { name: 'format:check', command: ['npm', 'run', 'format:check'], tier: 'quick' },
  { name: 'validate:content', command: ['npm', 'run', 'validate:content'], tier: 'quick' },
  {
    name: 'authority map',
    run: async () => {
      const { runAuthority } = await import('./authority')
      const result = runAuthority(['--check'])
      return [
        result.exitCode === 0
          ? pass('authority map', result.lines[0])
          : fail('authority map', result.lines.slice(0, 3).join(' / '), '.dev/authority-map.json'),
      ]
    },
    tier: 'quick',
  },
  {
    name: 'project map',
    run: async () => {
      const { buildProjectMap, readProjectMap } = await import('./map')
      const current = readProjectMap()
      const regenerated = buildProjectMap()
      const fresh = current !== null && JSON.stringify(current) === JSON.stringify(regenerated)
      return [
        fresh
          ? pass('project map', 'fresh')
          : fail('project map', 'stale or missing', './dev map --write'),
      ]
    },
    tier: 'quick',
  },
  {
    name: 'save-check',
    run: async () => {
      const { runSaveCheck } = await import('./saveCheck')
      const { checks } = await runSaveCheck()
      const failures = checks.filter((check) => check.status === 'FAIL')
      return failures.length === 0
        ? [pass('save-check', `${String(checks.length)} checks`)]
        : failures
    },
    tier: 'quick',
  },
  {
    name: 'smoke',
    run: async () => {
      const { runSmoke } = await import('./smoke')
      const { checks } = await runSmoke()
      const failures = checks.filter((check) => check.status === 'FAIL')
      return failures.length === 0 ? [pass('smoke', `${String(checks.length)} checks`)] : failures
    },
    tier: 'quick',
  },
  { name: 'unit tests', command: ['npm', 'run', 'test:run'], tier: 'quick' },
  { name: 'simulate:fishing', command: ['npm', 'run', 'simulate:fishing'], tier: 'full' },
  { name: 'simulate:progression', command: ['npm', 'run', 'simulate:progression'], tier: 'full' },
  { name: 'simulate:trip', command: ['npm', 'run', 'simulate:trip'], tier: 'full' },
  { name: 'simulate:day', command: ['npm', 'run', 'simulate:day'], tier: 'full' },
  { name: 'simulate:tackle', command: ['npm', 'run', 'simulate:tackle'], tier: 'full' },
  { name: 'simulate:catalog', command: ['npm', 'run', 'simulate:catalog'], tier: 'full' },
  { name: 'simulate:transport', command: ['npm', 'run', 'simulate:transport'], tier: 'full' },
  { name: 'simulate:expedition', command: ['npm', 'run', 'simulate:expedition'], tier: 'full' },
  { name: 'simulate:environment', command: ['npm', 'run', 'simulate:environment'], tier: 'full' },
  { name: 'simulate:big-game', command: ['npm', 'run', 'simulate:big-game'], tier: 'full' },
  { name: 'simulate:catchability', command: ['npm', 'run', 'simulate:catchability'], tier: 'full' },
  { name: 'simulate:text-battle', command: ['npm', 'run', 'simulate:text-battle'], tier: 'full' },
  {
    name: 'simulate:regional-content',
    command: ['npm', 'run', 'simulate:regional-content'],
    tier: 'full',
  },
  {
    name: 'simulate:world-expansion',
    command: ['npm', 'run', 'simulate:world-expansion'],
    tier: 'full',
  },
  {
    name: 'simulate:trade-network',
    command: ['npm', 'run', 'simulate:trade-network'],
    tier: 'full',
  },
  {
    name: 'simulate:content-scale',
    command: ['npm', 'run', 'simulate:content-scale'],
    tier: 'full',
  },
  { name: 'simulate:offshore', command: ['npm', 'run', 'simulate:offshore'], tier: 'full' },
  { name: 'analyze:content-scale', command: ['npm', 'run', 'analyze:content-scale'], tier: 'full' },
  { name: 'build', command: ['npm', 'run', 'build'], tier: 'full' },
]

const runCommandStep = (
  command: readonly string[],
): { readonly ok: boolean; readonly output: string; readonly seconds: number } => {
  const started = Date.now()
  try {
    const output = execFileSync(command[0]!, [...command.slice(1)], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    return { ok: true, output, seconds: (Date.now() - started) / 1000 }
  } catch (error) {
    const output =
      error instanceof Error && 'stdout' in error
        ? String((error as { stdout?: unknown }).stdout) +
          String((error as { stderr?: unknown }).stderr ?? '')
        : String(error)
    return { ok: false, output, seconds: (Date.now() - started) / 1000 }
  }
}

export const runCheck = async (
  args: readonly string[],
): Promise<{ readonly checks: readonly CheckResult[]; readonly lines: readonly string[] }> => {
  const full = args.includes('--full') || args.includes('-f')
  const tier = full ? 'full' : 'quick'
  const steps = STEPS.filter((step) => tier === 'full' || step.tier === 'quick')

  const checks: CheckResult[] = []
  const lines: string[] = [`check tier: ${tier}`, '']

  for (const step of steps) {
    if ('run' in step) {
      try {
        const stepChecks = await step.run()
        checks.push(...stepChecks)
        if (stepChecks.some((check) => check.status === 'FAIL')) {
          lines.push(`FAIL ${step.name} — stopped early`)
          break
        }
      } catch (error) {
        checks.push(fail(step.name, error instanceof Error ? error.message : String(error)))
        lines.push(`FAIL ${step.name} — stopped early`)
        break
      }
    } else {
      const result = runCommandStep(step.command)
      const lastLines = result.output
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(-3)
      checks.push(
        result.ok
          ? pass(step.name, `${result.seconds.toFixed(1)}s`)
          : fail(
              step.name,
              lastLines.join(' / ').slice(0, 300),
              `npm run ${step.name.replace(/\s.*/, '')} で詳細`,
            ),
      )
      if (!result.ok) {
        lines.push(`FAIL ${step.name} — stopped early`)
        break
      }
    }
  }

  return { checks, lines }
}
