/**
 * 層の境界を機械的に検査するための小さなスキャナ。
 *
 * テスト専用であり、製品コードからは使わない。
 * 完全なパーサではないが、禁止依存の検出には十分であり、
 * 「検出できること」自体をテストで確認する（偽陰性の無いチェックを保証するため）。
 */

export type SourceFile = {
  readonly path: string
  readonly source: string
}

export type Violation = {
  readonly filePath: string
  readonly detail: string
  readonly reason: string
}

/**
 * コメントを除去する。
 *
 * 設計判断を説明するコメント（例: 「Math.random() を散在させない」）が
 * 違反として誤検知されるのを避けるため。
 *
 * 行頭コメントのみを対象にする保守的な実装である。
 * `//` を行末に置いた場合は対象外だが、偽陰性（違反の見逃し）より
 * 偽陽性（正しいコードを違反扱い）を避ける方を優先している。
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const IMPORT_PATTERNS: readonly RegExp[] = [
  // `from '...'` 節は import / export / 複数行の import すべてを拾う。
  /\bfrom\s+['"]([^'"\n]+)['"]/g,
  /(?:^|\n)\s*import\s+['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

/** ソース中の import/export/require 指定子をすべて集める。 */
export const collectImportSpecifiers = (source: string): readonly string[] => {
  const specifiers = new Set<string>()
  const code = stripComments(source)

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(code)

    while (match !== null) {
      const specifier = match[1]
      if (specifier !== undefined) {
        specifiers.add(specifier)
      }
      match = pattern.exec(code)
    }
  }

  return [...specifiers]
}

/** 対象ファイルの import 指定子が許可されない場合に違反として返す。 */
export const findForbiddenImports = (
  files: readonly SourceFile[],
  options: {
    readonly matches: (filePath: string) => boolean
    readonly isAllowed: (specifier: string, filePath: string) => boolean
    readonly reason: string
  },
): readonly Violation[] => {
  const violations: Violation[] = []

  for (const file of files) {
    if (!options.matches(file.path)) {
      continue
    }

    for (const specifier of collectImportSpecifiers(file.source)) {
      if (!options.isAllowed(specifier, file.path)) {
        violations.push({ filePath: file.path, detail: specifier, reason: options.reason })
      }
    }
  }

  return violations
}

/** 対象ファイルに禁止パターンが現れた場合に違反として返す。 */
export const findForbiddenPatterns = (
  files: readonly SourceFile[],
  options: {
    readonly matches: (filePath: string) => boolean
    readonly pattern: RegExp
    readonly reason: string
  },
): readonly Violation[] => {
  const violations: Violation[] = []

  for (const file of files) {
    if (!options.matches(file.path)) {
      continue
    }

    const code = stripComments(file.source)

    // 入力の RegExp に g が無いと lastIndex が進まず無限ループになる。
    // 呼び出し側の指定に依存しないよう、ここで必ず g を付ける。
    const flags = options.pattern.flags.includes('g')
      ? options.pattern.flags
      : `${options.pattern.flags}g`
    const pattern = new RegExp(options.pattern.source, flags)
    let match = pattern.exec(code)

    while (match !== null) {
      violations.push({ filePath: file.path, detail: match[0], reason: options.reason })

      if (match[0].length === 0) {
        // 空マッチは lastIndex を進めないため、明示的に前進させる。
        pattern.lastIndex += 1
      }

      match = pattern.exec(code)
    }
  }

  return violations
}
