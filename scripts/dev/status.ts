import { readProjectMap } from './map'
import { git, gitBranch, gitHead, gitRemote, gitStatus } from './lib/repo'
import type { CommandResult } from './lib/output'

/**
 * `./dev status` — リポジトリの即時サマリ。
 */

export const runStatus = (args: readonly string[]): CommandResult => {
  const json = args.includes('--json')
  const status = gitStatus()
  const ahead = git(['rev-list', '--count', 'origin/main..HEAD'])
  const map = readProjectMap()

  const facts = {
    branch: gitBranch(),
    head: gitHead(),
    remote: gitRemote(),
    uncommitted: status.length,
    aheadOfOriginMain: ahead ?? 'unknown',
    projectMapGenerated: map !== null,
    systems: map?.systems.length ?? null,
    authorities: map?.authorities.length ?? null,
  }

  if (json) {
    return { exitCode: 0, lines: [JSON.stringify(facts, null, 2)] }
  }

  const lines = [
    `branch:    ${facts.branch}`,
    `HEAD:      ${facts.head}`,
    `remote:    ${facts.remote}`,
    `uncommitted: ${String(facts.uncommitted)} 件`,
    `ahead of origin/main: ${String(facts.aheadOfOriginMain)}`,
    `project map: ${facts.projectMapGenerated ? `${String(facts.systems)} systems / ${String(facts.authorities)} authorities` : 'not generated (./dev map --write)'}`,
  ]
  if (status.length > 0 && status.length <= 20) {
    lines.push('', 'changed files:')
    for (const line of status) {
      lines.push(`  ${line}`)
    }
  }
  return { exitCode: 0, lines }
}
