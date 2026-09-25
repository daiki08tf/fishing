import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildProjectMap, PROJECT_MAP_PATH, readProjectMap } from './map'
import { fail, pass, warn, type CheckResult } from './lib/output'
import {
  gitBranch,
  gitHead,
  gitRemote,
  gitStatus,
  listFilesRecursive,
  pathExists,
  REPO_ROOT,
} from './lib/repo'

/**
 * `./dev doctor` — リポジトリの健康診断。読み取り専用。
 *
 * 環境・依存・生成物の鮮度・content の構造・authority map の整合を検査する。
 * 何も書き換えない。繰り返し実行してよい。
 */

const REQUIRED_PATHS = [
  'package.json',
  'tsconfig.json',
  'tsconfig.domain.json',
  '.nvmrc',
  'index.html',
  'src/domain',
  'src/content/data',
  'src/content/schema',
  'src/infrastructure/persistence',
  'tests',
  'docs/ARCHITECTURE.md',
  'docs/DATA_MODEL.md',
  'docs/ROADMAP.md',
  'AGENTS.md',
  '.dev/authority-map.json',
  '.dev/systems.json',
]

const checkRuntime = (): CheckResult[] => {
  const checks: CheckResult[] = []

  const nodeVersion = process.version
  const nvmrc = pathExists('.nvmrc') ? readFileSync(`${REPO_ROOT}/.nvmrc`, 'utf8').trim() : null
  const nodeMajor = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  if (nvmrc === null) {
    checks.push(warn('Node version', `${nodeVersion}（.nvmrc なし）`))
  } else if (String(nodeMajor) === nvmrc) {
    checks.push(pass('Node version', `${nodeVersion}（.nvmrc: ${nvmrc}）`))
  } else {
    checks.push(warn('Node version', `現在 ${nodeVersion} / .nvmrc は ${nvmrc}`, 'nvm use を試す'))
  }

  try {
    const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
    checks.push(pass('npm', npmVersion))
  } catch {
    checks.push(fail('npm', '見つからない', 'Node.js をインストールする'))
  }

  checks.push(
    pathExists('node_modules/typescript')
      ? pass('dependencies', 'node_modules あり')
      : fail('dependencies', 'node_modules がない', 'npm ci'),
  )

  return checks
}

const checkRepoShape = (): CheckResult[] => {
  const checks: CheckResult[] = []
  for (const path of REQUIRED_PATHS) {
    checks.push(pathExists(path) ? pass(path) : fail(path, '見つからない'))
  }

  const status = gitStatus()
  if (status.length === 0) {
    checks.push(pass('working tree', 'clean'))
  } else {
    checks.push(
      warn('working tree', `${String(status.length)} 件の未コミット変更`, 'git status で確認'),
    )
  }
  checks.push(pass('branch / HEAD', `${gitBranch()} @ ${gitHead()}`))
  checks.push(pass('remote', gitRemote()))
  return checks
}

const checkGeneratedFreshness = (): CheckResult[] => {
  const checks: CheckResult[] = []

  // content-index.json: 生成物が data より古くないか。
  const indexPath = 'src/content/generated/content-index.json'
  if (!pathExists(indexPath)) {
    checks.push(fail('content index', `${indexPath} がない`, 'npm run content:index'))
  } else {
    const indexMtime = statSync(join(REPO_ROOT, indexPath)).mtimeMs
    const stalest = listFilesRecursive('src/content/data', (name) => name.endsWith('.json'))
      .map((file) => statSync(join(REPO_ROOT, file)).mtimeMs)
      .reduce((a, b) => Math.max(a, b), 0)
    checks.push(
      indexMtime >= stalest
        ? pass('content index', 'fresh')
        : fail('content index', 'src/content/data が index より新しい', 'npm run content:index'),
    )
  }

  // project-map.json: 再生成して一致するか。
  if (!pathExists(PROJECT_MAP_PATH)) {
    checks.push(warn('project map', `${PROJECT_MAP_PATH} がない`, './dev map --write'))
  } else {
    const current = readProjectMap()
    const regenerated = buildProjectMap()
    checks.push(
      JSON.stringify(current) === JSON.stringify(regenerated)
        ? pass('project map', 'fresh')
        : fail(
            'project map',
            `${PROJECT_MAP_PATH} が古い（authority/systems/構造が変わった）`,
            './dev map --write',
          ),
    )
  }

  return checks
}

const checkAuthorityMap = (): CheckResult[] => {
  const checks: CheckResult[] = []
  const map = readProjectMap() ?? buildProjectMap()
  const missing = map.authorities.flatMap((authority) =>
    authority.missingPaths.map((path) => `${authority.id}: ${path}`),
  )
  if (missing.length === 0) {
    checks.push(
      pass('authority map', `${String(map.authorities.length)} 件の authority、全パス存在`),
    )
  } else {
    checks.push(
      fail(
        'authority map',
        `${String(missing.length)} 件の壊れたパス（例: ${missing.slice(0, 3).join(', ')}）`,
        '.dev/authority-map.json を修正',
      ),
    )
  }

  // UI 層にある authority を明示的に警告する（ui 概念自身は除外）。
  const uiAuthorities = map.authorities.filter(
    (authority) =>
      authority.id !== 'ui' && authority.authority.some((path) => path.startsWith('src/ui/')),
  )
  for (const authority of uiAuthorities) {
    checks.push(
      warn(
        `authority in UI layer: ${authority.id}`,
        authority.authority.filter((path) => path.startsWith('src/ui/')).join(', '),
        'domain 層への移設を検討（既知の設計判断なら notes に理由を書く）',
      ),
    )
  }
  return checks
}

const checkContentStructure = (): CheckResult[] => {
  const checks: CheckResult[] = []
  const contentRoot = 'src/content/data'
  const kinds = listFilesRecursive(contentRoot, (name) => name.endsWith('.json'))
  checks.push(pass('content files', `${String(kinds.length)} 件の JSON`))

  // duplicate id の軽量チェック（内容まで読まず、ファイル名の一意性を見る）。
  const basenames = new Map<string, string[]>()
  for (const file of kinds) {
    const base = file.split('/').pop() ?? file
    basenames.set(base, [...(basenames.get(base) ?? []), file])
  }
  const dupes = [...basenames.entries()].filter(([, files]) => files.length > 1)
  if (dupes.length === 0) {
    checks.push(pass('content filenames', '同一ファイル名の衝突なし'))
  } else {
    checks.push(
      warn(
        'content filenames',
        `${String(dupes.length)} 件の同名ファイル（異 kind 間なら問題ないが id 衝突は別途 validate:content が検査）`,
        'npm run validate:content',
      ),
    )
  }

  // generated ディレクトリが gitignore でなく src/content/generated に置かれていることを確認。
  checks.push(
    pathExists('src/content/generated')
      ? pass('generated dir', 'src/content/generated あり')
      : warn('generated dir', 'src/content/generated がない', 'npm run content:index'),
  )
  return checks
}

const checkSaveTooling = (): CheckResult[] => {
  const checks: CheckResult[] = []
  checks.push(
    pathExists('src/infrastructure/persistence/migrateSave.ts')
      ? pass('save migration', 'migrateSave.ts あり')
      : fail('save migration', 'migrateSave.ts がない'),
  )
  checks.push(
    pathExists('tests/fixtures/save.ts')
      ? pass('save fixtures', 'tests/fixtures/save.ts あり')
      : warn('save fixtures', 'tests/fixtures/save.ts がない', './dev save-check で検証'),
  )

  const saveGame = readFileSync(join(REPO_ROOT, 'src/domain/save/SaveGame.ts'), 'utf8')
  const versionMatch = /CURRENT_SAVE_SCHEMA_VERSION = SAVE_SCHEMA_VERSION_V(\d+)/.exec(saveGame)
  checks.push(
    versionMatch === null
      ? warn('save schema version', 'CURRENT_SAVE_SCHEMA_VERSION を解析できない')
      : pass('save schema version', `v${versionMatch[1]}`),
  )
  return checks
}

const checkDocsVsCode = (): CheckResult[] => {
  const checks: CheckResult[] = []
  // AGENTS.md が参照する ./dev コマンドが cli.ts に存在するか。
  const cliPath = 'scripts/dev/cli.ts'
  if (pathExists(cliPath) && pathExists('AGENTS.md')) {
    const cliSource = readFileSync(join(REPO_ROOT, cliPath), 'utf8')
    const agents = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8')
    const referenced = [...agents.matchAll(/\.\/dev\s+([a-z-]+)/g)].map((match) => match[1])
    const missing = [...new Set(referenced)].filter(
      (command) => !new RegExp(`'${command}'`).test(cliSource),
    )
    checks.push(
      missing.length === 0
        ? pass(
            'docs vs code',
            `AGENTS.md の ./dev 参照 ${String(new Set(referenced).size)} 件すべて実在`,
          )
        : fail(
            'docs vs code',
            `AGENTS.md が存在しないコマンドを参照: ${missing.join(', ')}`,
            'AGENTS.md か scripts/dev/cli.ts を修正',
          ),
    )
  }
  return checks
}

export const runDoctor = (): { readonly checks: readonly CheckResult[] } => ({
  checks: [
    ...checkRuntime(),
    ...checkRepoShape(),
    ...checkGeneratedFreshness(),
    ...checkAuthorityMap(),
    ...checkContentStructure(),
    ...checkSaveTooling(),
    ...checkDocsVsCode(),
  ],
})
