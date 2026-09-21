import { describe, expect, it } from 'vitest'
import {
  collectImportSpecifiers,
  findForbiddenImports,
  findForbiddenPatterns,
} from './sourceScanner'
import { readProjectSources } from './testProjectFiles'

/**
 * 層の境界の検査。
 *
 * DECISIONS.md §6 の「機械判定可能な制約」のうち、
 * 「Domain layerはReact / UIに依存しない」「禁止layer dependencyをlint / testで検知する」
 * を担当する。eslint.config.js の no-restricted-imports と同じ規則を、
 * ここでは allowlist としてより強く検査する。
 */

const isDomain = (path: string): boolean => path.startsWith('src/domain/')

/**
 * 本番コードとしての Domain。
 * 配置テスト（*.test.ts）は vitest を import するため、
 * 「外部パッケージを import しない」規則の対象から外す。
 */
const isDomainProduction = (path: string): boolean => isDomain(path) && !path.endsWith('.test.ts')

const isInsideDomain = (specifier: string, filePath: string): boolean => {
  if (!specifier.startsWith('.')) {
    return false
  }

  // 相対指定子を解決し、src/domain の外へ出ていないか確認する。
  const segments = filePath.split('/').slice(0, -1)

  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') {
      continue
    }
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return segments.join('/').startsWith('src/domain/')
}

describe('layer boundaries', () => {
  const sources = readProjectSources()

  it('reads the project sources', () => {
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.some((file) => file.path === 'src/domain/rng/RandomSource.ts')).toBe(true)
  })

  it('keeps src/domain free of external packages and outer layers', () => {
    const violations = findForbiddenImports(sources, {
      matches: isDomainProduction,
      isAllowed: isInsideDomain,
      reason: 'domain may only import from src/domain',
    })

    expect(violations).toEqual([])
  })

  it('keeps src/domain free of React, browser globals and Math.random', () => {
    const patterns: readonly { pattern: RegExp; reason: string }[] = [
      { pattern: /\bMath\s*\.\s*random\b/, reason: 'use an injected RandomSource' },
      { pattern: /\bdocument\b/, reason: 'domain must not touch the DOM' },
      { pattern: /\bwindow\b/, reason: 'domain must not touch the DOM' },
      { pattern: /\bindexedDB\b/, reason: 'domain must not touch browser storage' },
      { pattern: /\blocalStorage\b/, reason: 'domain must not touch browser storage' },
    ]

    for (const { pattern, reason } of patterns) {
      const violations = findForbiddenPatterns(sources, {
        matches: isDomainProduction,
        pattern,
        reason,
      })
      expect(violations).toEqual([])
    }
  })

  it('keeps src/content free of React and UI dependencies', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/content/'),
      isAllowed: (specifier) =>
        !/^(react|react-dom|zustand)(\/|$)/.test(specifier) && !specifier.includes('/ui/'),
      reason: 'content validation must be independent of React and UI',
    })

    expect(violations).toEqual([])
  })

  it('keeps src/ui free of infrastructure and node builtins', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/ui/'),
      isAllowed: (specifier) =>
        !specifier.includes('infrastructure') && !specifier.startsWith('node:'),
      reason: 'ui must not reach infrastructure or the file system directly',
    })

    expect(violations).toEqual([])
  })

  it('keeps src/state free of react-dom and ui', () => {
    const violations = findForbiddenImports(sources, {
      matches: (path) => path.startsWith('src/state/'),
      isAllowed: (specifier) => !/^react-dom(\/|$)/.test(specifier) && !specifier.includes('/ui/'),
      reason: 'application state must not depend on rendering',
    })

    expect(violations).toEqual([])
  })

  it('detects prohibited dependencies when they exist', () => {
    // 検査そのものの妥当性（偽陰性が無いこと）を確認する。
    const synthetic = [
      { path: 'src/domain/fish/Cheating.ts', source: "import React from 'react'\n" },
      { path: 'src/domain/fish/Random.ts', source: 'export const r = () => Math.random()\n' },
      { path: 'src/domain/fish/Store.ts', source: "import { create } from 'zustand'\n" },
    ]

    const importViolations = findForbiddenImports(synthetic, {
      matches: isDomainProduction,
      isAllowed: isInsideDomain,
      reason: 'domain may only import from src/domain',
    })

    expect(importViolations.map((violation) => violation.detail).sort()).toEqual([
      'react',
      'zustand',
    ])

    const randomViolations = findForbiddenPatterns(synthetic, {
      matches: isDomainProduction,
      pattern: /\bMath\s*\.\s*random\b/,
      reason: 'use an injected RandomSource',
    })

    expect(randomViolations).toHaveLength(1)
    expect(randomViolations[0]?.filePath).toBe('src/domain/fish/Random.ts')
  })

  it('collects specifiers from multi-line import statements', () => {
    // 複数行 import を取りこぼすと allowlist 検査が偽陰性になるため、明示的に確認する。
    const source = [
      'import type {',
      '  Something,',
      "} from 'react'",
      '',
      "export type { Thing } from 'react-dom'",
      '',
      "const lazy = () => import('zustand')",
      '',
      "const legacy = require('react')",
      '',
    ].join('\n')

    expect([...collectImportSpecifiers(source)].sort()).toEqual(['react', 'react-dom', 'zustand'])
  })
})
