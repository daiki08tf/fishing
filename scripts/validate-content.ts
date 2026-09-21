import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadContentDirectory } from '../src/content/load/contentLoader'

/**
 * Content 検証 CLI。
 *
 * 異常があれば非ゼロで終了する。CI と `npm run check` から呼ばれる。
 * 出力は機械可読に近いプレーンテキストに留める。
 */

export const DEFAULT_CONTENT_DIR = 'src/content/data'

export type ValidateContentReport = {
  readonly exitCode: number
  readonly lines: readonly string[]
}

const parseDirectoryArgument = (argv: readonly string[]): string => {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--dir') {
      const value = argv[index + 1]
      if (value === undefined || value.length === 0) {
        throw new Error('--dir requires a path')
      }
      return value
    }

    if (argument?.startsWith('--dir=')) {
      return argument.slice('--dir='.length)
    }
  }

  return DEFAULT_CONTENT_DIR
}

export const runValidateContent = (argv: readonly string[], cwd: string): ValidateContentReport => {
  const directoryArgument = parseDirectoryArgument(argv)
  const root = resolve(cwd, directoryArgument)
  const result = loadContentDirectory(root)

  const lines: string[] = [`content root: ${root}`]

  for (const diagnostic of result.diagnostics) {
    if (diagnostic.issues.length === 0) {
      lines.push(`ERROR ${diagnostic.filePath}`)
      continue
    }

    for (const issue of diagnostic.issues) {
      const location = issue.path.length > 0 ? `#${issue.path}` : ''
      lines.push(`ERROR ${diagnostic.filePath}${location} — ${issue.message}`)
    }
  }

  lines.push(`validated ${String(result.locations.length)} record(s)`)

  if (result.locations.length === 0 && result.diagnostics.length === 0) {
    lines.push('note: no content records yet (Phase 0B intentionally ships no real-world data)')
  }

  if (result.diagnostics.length > 0) {
    lines.push(`FAILED with ${String(result.diagnostics.length)} invalid record(s)`)
    return { exitCode: 1, lines }
  }

  lines.push('OK')
  return { exitCode: 0, lines }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const report = runValidateContent(process.argv.slice(2), process.cwd())
    for (const line of report.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = report.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
