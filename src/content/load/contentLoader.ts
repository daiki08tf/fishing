import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTENT_KINDS,
  isContentKind,
  parseContentRecord,
  type ContentIssue,
  type ContentKind,
} from '../schema'

/**
 * Content ディレクトリの検証。
 *
 * Node 専用（node:fs）。ブラウザ側からは import しないこと。
 * ブラウザで必要なのはスキーマのみ（src/content/schema）。
 *
 * レイアウト:
 *   <root>/<kind>/<name>.json
 *
 * 種別名は src/content/schema/index.ts の CONTENT_SCHEMAS のキーと一致させる。
 */

export type ContentLocation = {
  readonly kind: ContentKind
  readonly filePath: string
  /** スキーマを通った値。Catalog の参照検査に使う。 */
  readonly value: unknown
}

export type ContentDiagnostic = {
  readonly filePath: string
  readonly kind: ContentKind | 'unknown'
  readonly issues: readonly ContentIssue[]
}

export type ContentLoadResult = {
  readonly root: string
  readonly locations: readonly ContentLocation[]
  readonly diagnostics: readonly ContentDiagnostic[]
}

const collectJsonFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(directory, entry.name))
    .sort()

const readJson = (
  filePath: string,
):
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false
      readonly message: string
    } => {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, 'utf8')) as unknown }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `invalid JSON: ${message}` }
  }
}

/**
 * Content ディレクトリを検証する。
 * ファイル I/O の失敗は例外ではなく diagnostic として返す。
 */
export const loadContentDirectory = (root: string): ContentLoadResult => {
  if (!existsSync(root)) {
    return {
      root,
      locations: [],
      diagnostics: [
        {
          filePath: root,
          kind: 'unknown',
          issues: [{ path: '', message: 'content directory does not exist' }],
        },
      ],
    }
  }

  const locations: ContentLocation[] = []
  const diagnostics: ContentDiagnostic[] = []

  const kindDirectories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))

  for (const directory of kindDirectories) {
    const kindDirectory = join(root, directory.name)

    if (!isContentKind(directory.name)) {
      diagnostics.push({
        filePath: kindDirectory,
        kind: 'unknown',
        issues: [
          {
            path: '',
            message: `unknown content kind. expected one of: ${CONTENT_KINDS.join(', ')}`,
          },
        ],
      })
      continue
    }

    const kind = directory.name

    for (const filePath of collectJsonFiles(kindDirectory)) {
      const parsed = readJson(filePath)

      if (!parsed.ok) {
        diagnostics.push({ filePath, kind, issues: [{ path: '', message: parsed.message }] })
        continue
      }

      const result = parseContentRecord(kind, parsed.value)

      if (!result.ok) {
        diagnostics.push({ filePath, kind, issues: result.issues })
        continue
      }

      locations.push({ kind, filePath, value: result.value })
    }
  }

  return { root, locations, diagnostics }
}
