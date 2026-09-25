import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateContentReferences } from '../../src/content/catalog/references'
import { parseContentRecord, type ContentKind } from '../../src/content/schema'
import { runBuildContentIndex } from '../build-content-index'
import { runValidateContent } from '../validate-content'
import { jsonDiff, serializeRecord, type DiffEntry } from './diff'
import { duplicateIdIssues, identityFieldOf, loadStudioStore, type StudioStore } from './model'
import { fileNameForId } from './references'

/**
 * Content の安全な書き込みパイプライン。
 *
 *   schema parse → id 重複 → 参照整合性（メモリ上の仮想 corpus）
 *   → (dry-run はここで停止) → atomic write（必要なら rename）
 *   → generated 再生成 → validate:content の post-check
 *
 * Git 操作はしない。commit は owner / agent の仕事。
 */

export type WritePlan = {
  readonly kind: ContentKind
  /** 既存レコードの編集ならそのファイル名。新規なら undefined。 */
  readonly file?: string
  /** 書き込むレコード（生 JSON。transform 前の値をそのまま保存する）。 */
  readonly value: Record<string, unknown>
  readonly dryRun: boolean
}

export type WriteResult = {
  readonly ok: boolean
  readonly dryRun: boolean
  readonly file: string
  readonly id: string
  readonly renamedFrom?: string
  readonly errors: readonly string[]
  readonly diff: readonly DiffEntry[]
  readonly diffLines: readonly string[]
  readonly postCheck?: { readonly exitCode: number; readonly lines: readonly string[] }
}

type RefInput = Parameters<typeof validateContentReferences>[0]

/*
 * catalog/references の入力キー。regulations は references 検査の入力に無い
 * （spot.regulations は未検査 — validateContentReferences がその規則を持たない）。
 */
const REF_INPUT_KEYS = {
  'fish-species': 'species',
  'fishing-spots': 'spots',
  'shop-items': 'shopItems',
  gear: 'gear',
  methods: 'methods',
  brands: 'brands',
  'gear-series': 'gearSeries',
  transports: 'transports',
  countries: 'countries',
  regions: 'regions',
  expeditions: 'expeditions',
  buyers: 'buyers',
  contacts: 'contacts',
  'species-trade-profiles': 'speciesTradeProfiles',
  'contact-rewards': 'contactRewards',
} as const satisfies Partial<Record<ContentKind, keyof RefInput>>

/**
 * 仮想 corpus で参照整合性を検査する。
 * `pending`（kind+file で既存置き換え、無ければ追加）を反映した状態で
 * catalog/references と同じ検査を走らせる — 書き込んでから壊れるのではなく
 * 書き込む前に壊れることが分かる。
 */
const corpusReferenceIssues = (
  store: StudioStore,
  kind: ContentKind,
  file: string | undefined,
  pending: unknown,
): readonly string[] => {
  const input: Record<string, unknown> = {}

  for (const [kindName, inputKey] of Object.entries(REF_INPUT_KEYS)) {
    const values = store.records
      .filter((record) => record.kind === kindName)
      .map((record) => (record.kind === kind && record.file === file ? pending : record.value))
    if (kindName === kind && file === undefined) {
      values.push(pending)
    }
    input[inputKey] = values
  }

  return validateContentReferences(input as RefInput).map(
    (issue) => `${issue.path} — ${issue.message}`,
  )
}

export const planWrite = (
  store: StudioStore,
  plan: WritePlan,
):
  | {
      readonly ok: true
      readonly file: string
      readonly id: string
      readonly renamedFrom?: string
      readonly diff: readonly DiffEntry[]
    }
  | {
      readonly ok: false
      readonly errors: readonly string[]
      readonly file: string
      readonly id: string
    } => {
  const idField = identityFieldOf(plan.kind)
  const idValue = plan.value[idField]

  if (typeof idValue !== 'string' || idValue.length === 0) {
    return {
      ok: false,
      errors: [`record has no ${idField} (identity field for ${plan.kind})`],
      file: plan.file ?? fileNameForId('untitled'),
      id: '',
    }
  }

  const id = idValue
  const existing = store.records.find(
    (record) => record.kind === plan.kind && record.file === plan.file,
  )

  if (plan.file !== undefined && existing === undefined) {
    return {
      ok: false,
      errors: [`no existing ${plan.kind} record at file ${plan.file}`],
      file: plan.file,
      id,
    }
  }

  // id を変えた編集は、規約どおり `<id>.json` だった場合だけ rename する。
  let file = plan.file ?? fileNameForId(id)
  let renamedFrom: string | undefined
  if (
    existing !== undefined &&
    existing.id !== id &&
    existing.file === fileNameForId(existing.id)
  ) {
    renamedFrom = existing.file
    file = fileNameForId(id)
  }

  if (plan.file === undefined) {
    const collision = store.records.find(
      (record) => record.kind === plan.kind && record.file === file,
    )
    if (collision !== undefined) {
      return {
        ok: false,
        errors: [`file ${file} already exists for ${plan.kind}/${collision.id}`],
        file,
        id,
      }
    }
  }

  const diff = jsonDiff(existing?.raw ?? {}, plan.value)

  return renamedFrom === undefined
    ? { ok: true, file, id, diff }
    : { ok: true, file, id, renamedFrom, diff }
}

export const writeRecord = (
  plan: WritePlan,
  options: { readonly cwd?: string; readonly regen?: boolean; readonly postCheck?: boolean } = {},
): WriteResult => {
  const cwd = options.cwd ?? process.cwd()
  const regen = options.regen ?? true
  const postCheckEnabled = options.postCheck ?? true
  const store = loadStudioStore(cwd)

  const errors: string[] = []

  // 1. schema
  const parsed = parseContentRecord(plan.kind, plan.value)
  if (!parsed.ok) {
    errors.push(
      ...parsed.issues.map(
        (issue) => `schema: ${issue.path.length > 0 ? `${issue.path}: ` : ''}${issue.message}`,
      ),
    )
  }

  const planned = planWrite(store, plan)
  const file = planned.file
  const id = planned.id

  if (!planned.ok) {
    errors.push(...planned.errors)
  }

  // id 空間の重複は file 衝突とは独立に報告する（新規作成で既存 id を使うミスを拾う）。
  if (parsed.ok && id.length > 0) {
    errors.push(
      ...duplicateIdIssues(
        store,
        plan.kind,
        id,
        planned.ok ? (planned.renamedFrom ?? plan.file) : undefined,
      ),
    )
  }

  // 2. 参照整合性（schema を通った値を corpus に差し込む）
  if (parsed.ok && planned.ok) {
    errors.push(
      ...corpusReferenceIssues(store, plan.kind, plan.file, parsed.value).map(
        (issue) => `reference: ${issue}`,
      ),
    )
  }

  const diff = 'diff' in planned ? planned.diff : []
  const diffLines = diff.map((entry) => {
    const marker = entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : '~'
    return `${marker} ${entry.path}`
  })

  if (errors.length > 0 || !planned.ok || plan.dryRun) {
    return {
      ok: errors.length === 0 && planned.ok,
      dryRun: true,
      file,
      id,
      ...(planned.ok && planned.renamedFrom !== undefined
        ? { renamedFrom: planned.renamedFrom }
        : {}),
      errors,
      diff,
      diffLines,
    }
  }

  // 3. atomic write（tmp → rename）。id 変更による rename は新規書き込み + 旧ファイル削除。
  const directory = join(store.root, plan.kind)
  mkdirSync(directory, { recursive: true })
  const target = join(directory, file)
  const tmp = `${target}.tmp-${String(process.pid)}`
  writeFileSync(tmp, serializeRecord(plan.value))
  renameSync(tmp, target)

  if (planned.renamedFrom !== undefined) {
    unlinkSync(join(directory, planned.renamedFrom))
  }

  // 4. generated 再生成 + post-check（失敗しても書き込みは残す — 結果で報告する）
  let postCheck: WriteResult['postCheck']
  try {
    if (regen) {
      runBuildContentIndex([], cwd)
    }
    if (postCheckEnabled) {
      const report = runValidateContent([], cwd)
      postCheck = { exitCode: report.exitCode, lines: report.lines }
    }
  } catch (error) {
    postCheck = {
      exitCode: 1,
      lines: [`post-write check failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  return {
    ok: postCheck === undefined || postCheck.exitCode === 0,
    dryRun: false,
    file,
    id,
    ...(planned.renamedFrom !== undefined ? { renamedFrom: planned.renamedFrom } : {}),
    errors,
    diff,
    diffLines,
    postCheck,
  }
}
