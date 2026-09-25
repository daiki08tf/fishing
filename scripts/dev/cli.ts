import { pathToFileURL } from 'node:url'
import { runAuthority } from './authority'
import { runCheck } from './check'
import { runContext } from './context'
import { runDoctor } from './doctor'
import { runHandoff } from './handoff'
import { runImpact } from './impact'
import { buildProjectMap, readProjectMap, writeProjectMap } from './map'
import { runSaveCheck } from './saveCheck'
import { runScope } from './scope'
import { runSmoke } from './smoke'
import { runStatus } from './status'
import { summarize } from './lib/output'
import { REPO_ROOT } from './lib/repo'

/**
 * `./dev` — Fishing Game 開発インフラの front door。
 *
 *   ./dev doctor           リポジトリ健康診断（read-only）
 *   ./dev status           git/branch/map の即時サマリ（--json 可）
 *   ./dev map              project map を表示 / --write で再生成 / --check で鮮度確認
 *   ./dev authority [id]   authority map の閲覧 / --check で整合検証
 *   ./dev impact <id>      変更影響分析
 *   ./dev scope            git diff の範囲分類（--staged / --base <ref>）
 *   ./dev context <id>     AI agent 用の軽量コンテキスト
 *   ./dev handoff          handoff テンプレート生成（auto-detected + 記入欄）
 *   ./dev save-check       save migration round-trip（v1〜current）
 *   ./dev smoke            決定論的 gameplay smoke（trip + save round-trip）
 *   ./dev content-check    content validation（npm run validate:content と同じ）
 *   ./dev studio <args>    Content Studio（serve / list / get / schema / refs / validate / diff / write）
 *   ./dev check [--full]   統合検証（quick=編集時 / full=merge・handoff 前）
 *
 * `studio` 以外のコマンドは read-only か、生成物（.dev/project-map.json）だけを書く。
 * `studio write` は Content JSON を変更する（dry-run / diff / post-check つき）。
 */

const USAGE = `dev — Fishing Game developer infrastructure

  ./dev doctor           リポジトリ健康診断（read-only）
  ./dev status           git/branch/map の即時サマリ（--json 可）
  ./dev map              project map を表示 / --write / --check
  ./dev authority [id]   authority map の閲覧 / --check
  ./dev impact <id>      変更影響分析
  ./dev scope            git diff の範囲分類（--staged / --base <ref>）
  ./dev context <id>     AI agent 用の軽量コンテキスト
  ./dev handoff          handoff テンプレート生成
  ./dev save-check       save migration round-trip
  ./dev smoke            決定論的 gameplay smoke
  ./dev content-check    content validation
  ./dev studio <args>    Content Studio（serve で Web UI / list, get, diff, write…）
  ./dev check [--full]   統合検証（quick / --full）
`

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

const runAsync = async (): Promise<number> => {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(USAGE)
      return 0

    case 'doctor': {
      const { checks } = runDoctor()
      const result = summarize(checks)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'status': {
      const result = runStatus(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'map': {
      if (args.includes('--check')) {
        const current = readProjectMap()
        const regenerated = buildProjectMap()
        const fresh = current !== null && JSON.stringify(current) === JSON.stringify(regenerated)
        process.stdout.write(
          fresh ? 'OK: project-map.json is fresh\n' : 'STALE: run ./dev map --write\n',
        )
        return fresh ? 0 : 1
      }
      const map = buildProjectMap()
      if (args.includes('--write')) {
        await writeProjectMap(map)
        process.stdout.write(
          `wrote .dev/project-map.json (${String(map.systems.length)} systems, ${String(map.authorities.length)} authorities)\n`,
        )
        return 0
      }
      for (const system of map.systems) {
        process.stdout.write(
          `${system.id.padEnd(20)} ${String(system.files.length).padStart(4)} files  ${String(system.tests.length).padStart(3)} tests  ${system.title}\n`,
        )
      }
      return 0
    }

    case 'authority': {
      const result = runAuthority(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'impact': {
      const result = runImpact(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'scope': {
      const result = runScope(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'context': {
      const result = runContext(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'handoff': {
      const result = runHandoff(args)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'save-check': {
      const { checks } = await runSaveCheck()
      const result = summarize(checks)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'smoke': {
      const { checks, lines } = await runSmoke()
      for (const line of lines) process.stdout.write(`${line}\n`)
      const result = summarize(checks)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'content-check': {
      const { runValidateContent } = await import('../validate-content')
      const result = runValidateContent([], REPO_ROOT)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'studio': {
      const { runStudioCli } = await import('../studio/cli')
      const result = await runStudioCli(args, REPO_ROOT)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    case 'check': {
      const { checks, lines } = await runCheck(args)
      for (const line of lines) process.stdout.write(`${line}\n`)
      const result = summarize(checks)
      for (const line of result.lines) process.stdout.write(`${line}\n`)
      return result.exitCode
    }

    default:
      process.stdout.write(`unknown command: ${command}\n\n${USAGE}`)
      return 1
  }
}

if (isMainModule()) {
  runAsync()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(`dev: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
